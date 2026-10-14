// Carga datos de prueba directo en la base del emulador, sin pasar por la UI.
//
// Por qué no la UI: el JSON pesa 23 MB y el selector de archivos del emulador
// con `adb shell input` es frágil. Y sobre todo, esto no es una prueba del
// flujo de restauración (que se prueba desde Ajustes como lo haría la
// bodeguera) sino una forma rápida de dejar la base con volumen realista.
//
// Qué hace, en orden:
//   1. Crea la base si no existe (el mismo esquema de db.js, sin datos)
//   2. Inserta el setup (negocio + usuario admin) para poder entrar
//   3. Inserta los datos del JSON dentro de una transacción
//
// Uso:
//   node tools/cargar-datos-emulador.js [ruta-al-json]
//
// Requiere el APK de desarrollo instalado (`run-as` solo funciona en builds
// debuggables) y el dispositivo visible en `adb devices`.

const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const PKG = 'com.pos.bodega'
// expo-sqlite guarda en files/SQLite, no en databases/ como haría un
// SQLiteOpenHelper clásico. Por eso la ruta está fija acá y no en un argumento.
const DB_REMOTO = `/data/data/${PKG}/files/SQLite/pos-bodega.db`
const ADB = process.env.ADB || 'adb'
// Credenciales del usuario de prueba que crea el script.
const PASSWORD = 'prueba123'

function adb(args, opts = {}) {
  return execFileSync(ADB, args, { encoding: 'utf8', ...opts })
}

function adbShell(cmd) {
  return adb(['shell', cmd])
}

// run-as ejecuta dentro del sandbox de la app, que es donde vive la base.
function enSandbox(cmd) {
  return adbShell(`run-as ${PKG} sh -c '${cmd}'`)
}

function main() {
  const jsonPath = process.argv[2] || '/tmp/opencode/datos-prueba.json'
  if (!fs.existsSync(jsonPath)) {
    console.error(`No existe ${jsonPath}. Genera los datos primero:`)
    console.error('  node tools/generar-datos-prueba.js 500 20000 60 > ' + jsonPath)
    process.exit(1)
  }

  const datos = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
  console.log(`Datos leídos: ${datos.productos.length} productos · ${datos.ventas.length} ventas · ${datos.detalle_ventas.length} líneas de detalle`)

  // La app no puede estar corriendo: tiene la base abierta y SQLite no tolera
  // que otro proceso escriba encima.
  try { adbShell(`am force-stop ${PKG}`) } catch (e) { /* ya estaba parada */ }
  adb(['shell', 'sleep', '2'])

  // El sandbox no tiene el archivo: se empuja a /data/local/tmp (legible por
  // todos) y de ahí se copia adentro con run-as.
  const remotoTmp = '/data/local/tmp/datos-prueba.json'
  console.log('Subiendo al dispositivo...')
  adb(['push', jsonPath, remotoTmp], { stdio: 'ignore' })

  console.log('Copiando al sandbox de la app...')
  enSandbox(`cp ${remotoTmp} /data/data/${PKG}/datos.json`)

  // El SQL se genera en Node y se ejecuta dentro del sandbox. Se hace por
  // lotes para no tener un argumento de shell de varios megabytes.
  const sql = construirSQL(datos)
  const archivoSQL = path.join(os.tmpdir(), 'carga-datos.sql')
  fs.writeFileSync(archivoSQL, sql)

  console.log(`Ejecutando ${(sql.length / 1024 / 1024).toFixed(1)} MB de SQL...`)
  adb(['push', archivoSQL, remotoTmp + '.sql'], { stdio: 'ignore' })
  enSandbox(`cp ${remotoTmp}.sql /data/data/${PKG}/carga.sql`)

  // sqlite3 no viene en el emulador de fábrica, así que se usa el propio
  // binario que trae Android en /system/bin.
  console.log('Insertando (puede tardar un par de minutos)...')
  try {
    // La app tiene la base abierta con WAL. Con la app corriendo, sqlite3
    // escribiría sobre archivos que ella ya tiene mapeados y el resultado
    // sería una mezcla corrupta: hay que parar la app antes.
    enSandbox(`rm -f ${DB_REMOTO}-wal ${DB_REMOTO}-shm`)
    enSandbox(`sqlite3 ${DB_REMOTO} < /data/data/${PKG}/carga.sql`)
  } catch (e) {
    console.error('Falló la carga:', e.message)
    process.exit(1)
  }

  console.log('Limpiando temporales...')
  enSandbox(`rm -f /data/data/${PKG}/datos.json /data/data/${PKG}/carga.sql`)
  adb(['shell', `rm -f ${remotoTmp} ${remotoTmp}.sql`])

  console.log('Listo. Entra con usuario "admin" y contraseña "' + PASSWORD + '".')
  console.log('Verifica con:')
  console.log(`  adb shell run-as ${PKG} sqlite3 ${DB_REMOTO} "SELECT COUNT(*) FROM ventas"`)
}

const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`)

// El esquema se saca del propio db.js y no de una copia: si mañana se le
// agrega una columna, este script la tiene sin que nadie tenga que acordarse.
function leerEsquema() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'db.js'), 'utf8')
  const m = src.match(/const ESQUEMA = `([\s\S]*?)`/)
  if (!m) throw new Error('No se encontró ESQUEMA en src/data/db.js')
  // Se quita el PRAGMA de WAL: acá se carga todo en una transacción y no
  // interesa el modo de journal hasta que la app vuelva a abrir la base.
  return m[1].replace(/PRAGMA\s+journal_mode\s*=\s*WAL\s*;?/i, '')
}

function construirSQL(d) {
  const out = []
  out.push('PRAGMA synchronous=OFF;')
  out.push(leerEsquema())
  out.push('BEGIN;')

  for (const t of ['detalle_ventas', 'ventas', 'pagos_fiado', 'fiado', 'productos', 'clientes', 'categorias_custom', 'usuarios', 'detalle_ingresos', 'ingresos'])
    out.push(`DELETE FROM ${t};`)

  // Setup: sin esto la app arranca en la pantalla de Welcome y no se puede
  // medir nada.
  //
  // Tres detalles que costaron una vuelta cada uno:
  //
  // 1. La config se guarda con JSON.stringify y se lee con JSON.parse, así que
  //    `setup_completado` va como la cadena "true", no como 1 ni 'true'.
  // 2. La contraseña se guarda con el formato `sha256$<salt>$<hash>`: el
  //    prefijo va dentro, o `passwordCoincide` la toma como texto plano y el
  //    login falla.
  // 3. El salt son 32 hexadecimales de bytes aleatorios, no una cadena
  //    arbitraria.
  const salt = Array.from(require('crypto').randomBytes(16)).map(b => b.toString(16).padStart(2, '0')).join('')
  const hash = require('crypto').createHash('sha256').update(salt + PASSWORD).digest('hex')
  out.push(`INSERT INTO usuarios (id,nombre,username,password,rol,activo,creado_en) VALUES (1,'Dueño','admin',${q(`sha256$${salt}$${hash}`)},'admin',1,${q(new Date().toISOString())});`)
  out.push(`INSERT OR REPLACE INTO config (clave,valor) VALUES ('negocio_nombre',${q(JSON.stringify('Bodega Prueba'))});`)
  out.push(`INSERT OR REPLACE INTO config (clave,valor) VALUES ('setup_completado',${q('true')});`)
  out.push(`INSERT OR REPLACE INTO config (clave,valor) VALUES ('umbral_stock_bajo',${q('5')});`)

  for (const p of d.productos)
    out.push(`INSERT INTO productos (id,nombre,precio,stock,codigo,categoria,tipo_venta,unidad,creado_en,costo) VALUES (${p.id},${q(p.nombre)},${q(p.precio)},${q(p.stock)},${q(p.codigo)},${q(p.categoria)},${q(p.tipo_venta)},${q(p.unidad)},${q(p.creado_en)},${q(p.costo)});`)

  for (const c of d.clientes)
    out.push(`INSERT INTO clientes (id,nombre,telefono,referencia,dni_ruc,creado_en) VALUES (${c.id},${q(c.nombre)},${q(c.telefono)},${q(c.referencia)},NULL,${q(c.creado_en)});`)

  for (const v of d.ventas)
    out.push(`INSERT INTO ventas (id,total,subtotal_bruto,descuento,tipo_descuento,monto_recibido,vuelto,metodo_pago,usuario_id,cliente_id,es_fiado,comprador_nombre,comprador_dni_ruc,fecha) VALUES (${v.id},${q(v.total)},${q(v.subtotal_bruto)},${q(v.descuento)},${q(v.tipo_descuento)},${q(v.monto_recibido)},${q(v.vuelto)},${q(v.metodo_pago)},1,${q(v.cliente_id)},${v.es_fiado},${q(v.comprador_nombre)},NULL,${q(v.fecha)});`)

  d.detalle_ventas.forEach((x, i) =>
    out.push(`INSERT INTO detalle_ventas (id,venta_id,producto_id,nombre_producto,precio_unitario,cantidad,subtotal,tipo_venta,unidad,costo_unitario) VALUES (${i + 1},${x.venta_id},${q(x.producto_id)},${q(x.nombre_producto)},${q(x.precio_unitario)},${q(x.cantidad)},${q(x.subtotal)},${q(x.tipo_venta)},${q(x.unidad)},${q(x.costo_unitario)});`))

  // Los ingresos SÍ se cargan acá, aunque el respaldo de la app no los lleve
  // (ver README: el respaldo excluye ingresos a propósito, son historial del
  // teléfono). Sin ellos el stock derivado no tiene con qué trabajar: sale
  // negativo porque solo ve las ventas.
  for (const i of (d.ingresos || []))
    out.push(`INSERT INTO ingresos (id,g_id,fecha,usuario_id,deshecho) VALUES (${i.id},${q(i.g_id)},${q(i.fecha)},1,${i.deshecho || 0});`)
  for (const x of (d.detalle_ingresos || []))
    out.push(`INSERT INTO detalle_ingresos (id,g_id,ingreso_id,producto_id,nombre_producto,cantidad) VALUES (${x.id},${q(x.g_id)},${x.ingreso_id},${q(x.producto_id)},${q(x.nombre_producto)},${q(x.cantidad)});`)

  for (const f of d.fiado)
    out.push(`INSERT INTO fiado (id,cliente_id,monto_original,saldo,concepto,usuario_id,estado,venta_id,fecha) VALUES (${f.id},${f.cliente_id},${q(f.monto_original)},${q(f.saldo)},${q(f.concepto)},1,${q(f.estado)},${q(f.venta_id)},${q(f.fecha)});`)

  for (const p of d.pagos_fiado)
    out.push(`INSERT INTO pagos_fiado (id,fiado_id,monto,metodo_pago,usuario_id,anulado,fecha) VALUES (${p.id},${p.fiado_id},${q(p.monto)},${q(p.metodo_pago)},1,0,${q(p.fecha)});`)

  for (const c of d.categorias_custom)
    out.push(`INSERT INTO categorias_custom (id,icon) VALUES (${q(c.id)},${q(c.icon)});`)

  out.push('COMMIT;')
  out.push('ANALYZE;')
  return out.join('\n') + '\n'
}

main()
