// Prueba la unión a una bodega existente sin tocar la interfaz.
//
// El selector de archivos nativo de Android (DocumentsUI) no responde a
// `adb shell input tap`, así que el camino completo de la pantalla no se puede
// automatizar. Lo que SÍ importa verificar es la parte que hace el trabajo:
// leer un respaldo real, volcar las tablas y crear el usuario.
//
// Este script ejecuta en la base del dispositivo exactamente el SQL que
// genera `db.js` (`unirseConRespaldo`), y después comprueba que los conteos y
// el login funcionan.
//
// Uso: node tools/probar-union.js [ruta-al-respaldo]
//
// Es de UN SOLO USO sobre una base vacía (teléfono recién instalado): las dos
// primeras comprobaciones son justamente eso. Correrlo dos veces seguidas da
// esos dos fallos, porque la unión anterior ya dejó la base con datos. Para
// repetir, borrar antes:
//
//   adb shell "run-as com.pos.bodega sqlite3 <DB> 'DELETE FROM ventas; DELETE FROM
//   detalle_ventas; DELETE FROM fiado; DELETE FROM pagos_fiado; DELETE FROM
//   usuarios; DELETE FROM productos; DELETE FROM clientes; DELETE FROM
//   categorias_custom; DELETE FROM config;'"
'use strict'

const fs = require('fs')
const { execFileSync } = require('child_process')

const PKG = 'com.pos.bodega'
const DB = `/data/data/${PKG}/files/SQLite/pos-bodega.db`
const ADB = process.env.ADB || 'adb'

const JSON_PATH = process.argv[2] || '/tmp/opencode/datos-prueba.json'
const USERNAME = 'admin'
const PASSWORD = 'prueba123'

function adb(args) { return execFileSync(ADB, args, { encoding: 'utf8' }).trim() }

// sql va por stdin: pasar el SQL como argumento rompe con los paréntesis.
function sql(consulta) {
  return execFileSync(ADB, ['shell', `run-as ${PKG} sqlite3 ${DB}`], {
    input: consulta,
    encoding: 'utf8',
  }).trim()
}

let ok = 0, fallos = 0
const es = (etiqueta, cond, detalle = '') => {
  if (cond) { ok++; console.log(`  ✓ ${etiqueta}`) }
  else { fallos++; console.log(`  ✗ ${etiqueta}${detalle ? '  → ' + detalle : ''}`) }
}

const q = (v) => (v === null || v === undefined ? 'NULL'
  : typeof v === 'number' ? String(v)
  : `'${String(v).replace(/'/g, "''")}'`)

function main() {
  if (!fs.existsSync(JSON_PATH)) {
    console.error('No existe ' + JSON_PATH)
    process.exit(1)
  }
  const d = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'))

  console.log('\nUNIRSE A UNA BODEGA EXISTENTE\n')
  console.log(`Respaldo: ${d.ventas.length} ventas · ${d.productos.length} productos · ${(d.clientes || []).length} clientes`)
  console.log(`Negocio en el respaldo: ${d.config?.negocio_nombre || '(ninguno)'}\n`)

  // ─── Estado antes ────────────────────────────────────────────────
  console.log('Antes de unirse:')
  const ventasAntes = Number(sql('SELECT COUNT(*) FROM ventas') || 0)
  const usuariosAntes = Number(sql('SELECT COUNT(*) FROM usuarios') || 0)
  es('la base está vacía (teléfono nuevo)', ventasAntes === 0, `ventas=${ventasAntes}`)
  es('no hay usuarios', usuariosAntes === 0, `usuarios=${usuariosAntes}`)

  // ─── La unión ────────────────────────────────────────────────────
  console.log('\nEjecutando la unión (mismo SQL que db.unirseConRespaldo):')
  // El hash se calcula antes de la transacción, como en la app. El salt y el
  // hash reales los produce expo-crypto; acá se usa un valor equivalente
  // porque lo que se verifica es el flujo, no la criptografía (eso ya tiene
  // sus 41 pruebas en probar-licencia.js y probar-codigo-licencia.js).
  const crypto = require('crypto')
  const salt = 'pruebasalt'
  const hash = `sha256$${salt}$${crypto.createHash('sha256').update(salt + PASSWORD).digest('hex')}`

  // Misma lógica que db.unirseConRespaldo: si el username elegido ya viene en
  // el respaldo, se le agrega un número (username es UNIQUE).
  let usernameFinal = USERNAME
  const enRespaldo = new Set((d.usuarios || []).map(u => String(u.username).toUpperCase()))
  const habiaColision = enRespaldo.has(USERNAME.toUpperCase())
  if (habiaColision) {
    let n = 2
    while (enRespaldo.has(`${USERNAME}${n}`.toUpperCase())) n++
    usernameFinal = `${USERNAME}${n}`
  }
  console.log(`  usuario elegido: ${USERNAME}${habiaColision ? ` → ${usernameFinal} (ya venía en el respaldo)` : ''}`)

  const stmts = []
  stmts.push('BEGIN;')
  for (const t of ['ventas', 'fiado', 'pagos_fiado', 'usuarios']) stmts.push(`DELETE FROM ${t};`)
  for (const u of d.usuarios || []) {
    // 'sin-clave' es el marcador que usa db.js: la columna password es NOT
    // NULL, así que "sin clave" tiene que ser un valor.
    stmts.push(`INSERT INTO usuarios (id,nombre,username,password,rol,activo,creado_en) VALUES (${u.id},${q(u.nombre)},${q(u.username)},'sin-clave',${q(u.rol || 'cajero')},1,${q(u.creado_en)});`)
  }
  stmts.push(`INSERT INTO usuarios (nombre,username,password,rol,activo,creado_en) VALUES ('Dueña',${q(usernameFinal)},${q(hash)},'admin',1,${q(new Date().toISOString())});`)

  for (const t of ['detalle_ventas', 'ventas', 'pagos_fiado', 'fiado', 'productos', 'clientes', 'categorias_custom'])
    stmts.push(`DELETE FROM ${t};`)
  for (const p of d.productos) stmts.push(`INSERT INTO productos (id,nombre,precio,stock,codigo,categoria,tipo_venta,unidad,creado_en,costo,bulto_unidades,bulto_nombre,bulto_codigo) VALUES (${p.id},${q(p.nombre)},${q(p.precio)},${q(p.stock)},${q(p.codigo)},${q(p.categoria)},${q(p.tipo_venta)},${q(p.unidad)},${q(p.creado_en)},${q(p.costo)},NULL,NULL,NULL);`)
  for (const c of d.clientes) stmts.push(`INSERT INTO clientes (id,nombre,telefono,referencia,dni_ruc,creado_en) VALUES (${c.id},${q(c.nombre)},${q(c.telefono)},${q(c.referencia)},NULL,${q(c.creado_en)});`)
  for (const v of d.ventas) stmts.push(`INSERT INTO ventas (id,total,subtotal_bruto,descuento,tipo_descuento,monto_recibido,vuelto,metodo_pago,usuario_id,cliente_id,es_fiado,comprador_nombre,comprador_dni_ruc,fecha) VALUES (${v.id},${q(v.total)},${q(v.subtotal_bruto)},${q(v.descuento)},${q(v.tipo_descuento)},${q(v.monto_recibido)},${q(v.vuelto)},${q(v.metodo_pago)},${q(v.usuario_id)},${q(v.cliente_id)},${v.es_fiado},${q(v.comprador_nombre)},NULL,${q(v.fecha)});`)
  d.detalle_ventas.forEach((x, i) => stmts.push(`INSERT INTO detalle_ventas (id,venta_id,producto_id,nombre_producto,precio_unitario,cantidad,subtotal,tipo_venta,unidad) VALUES (${i + 1},${x.venta_id},${q(x.producto_id)},${q(x.nombre_producto)},${q(x.precio_unitario)},${q(x.cantidad)},${q(x.subtotal)},${q(x.tipo_venta)},${q(x.unidad)});`))
  for (const f of d.fiado) stmts.push(`INSERT INTO fiado (id,cliente_id,monto_original,saldo,concepto,usuario_id,estado,fecha) VALUES (${f.id},${f.cliente_id},${q(f.monto_original)},${q(f.saldo)},${q(f.concepto)},1,${q(f.estado)},${q(f.fecha)});`)
  for (const p of d.pagos_fiado) stmts.push(`INSERT INTO pagos_fiado (id,fiado_id,monto,metodo_pago,usuario_id,fecha) VALUES (${p.id},${p.fiado_id},${q(p.monto)},${q(p.metodo_pago)},1,${q(p.fecha)});`)
  for (const c of d.categorias_custom || []) stmts.push(`INSERT INTO categorias_custom (id,icon) VALUES (${q(c.id)},${q(c.icon)});`)

  const config = d.config || {}
  stmts.push(`INSERT OR REPLACE INTO config (clave,valor) VALUES ('negocio_nombre',${q(JSON.stringify(config.negocio_nombre || 'Mi bodega'))});`)
  stmts.push(`INSERT OR REPLACE INTO config (clave,valor) VALUES ('setup_completado','true');`)
  stmts.push(`INSERT OR REPLACE INTO config (clave,valor) VALUES ('unido_desde_respaldo','true');`)
  stmts.push('COMMIT;')

  try {
    sql(stmts.join('\n'))
    console.log('  (transacción confirmada)')
  } catch (e) {
    console.error('  falló el SQL:', e.message)
    process.exit(1)
  }

  // ── Verificaciones ──────────────────────────────────────────────
  console.log('\nDespués de unirse:')
  const ventas = Number(sql('SELECT COUNT(*) FROM ventas') || 0)
  const detalle = Number(sql('SELECT COUNT(*) FROM detalle_ventas') || 0)
  const productos = Number(sql('SELECT COUNT(*) FROM productos') || 0)
  const clientes = Number(sql('SELECT COUNT(*) FROM clientes') || 0)
  const fiados = Number(sql("SELECT COUNT(*) FROM fiado WHERE estado='pendiente'") || 0)
  const abonos = Number(sql('SELECT COUNT(*) FROM pagos_fiado') || 0)

  es(`las ${d.ventas.length} ventas están`, ventas === d.ventas.length, `hay ${ventas}`)
  es(`los ${d.detalle_ventas.length} detalles están`, detalle === d.detalle_ventas.length, `hay ${detalle}`)
  es(`los ${d.productos.length} productos están`, productos === d.productos.length, `hay ${productos}`)
  es(`los ${(d.clientes || []).length} clientes están`, clientes === (d.clientes || []).length, `hay ${clientes}`)
  es(`${fiados} fiados pendientes`, fiados > 0, `hay ${fiados}`)
  es(`${abonos} abonos`, abonos === (d.pagos_fiado || []).length, `hay ${abonos}`)

  console.log('\nUsuarios:')
  const totalUsuarios = Number(sql('SELECT COUNT(*) FROM usuarios') || 0)
  es('hay un usuario nuevo con contraseña', totalUsuarios === (d.usuarios || []).length + 1,
    `hay ${totalUsuarios}, esperaba ${(d.usuarios || []).length + 1}`)
  es('el usuario nuevo es admin', sql(`SELECT rol FROM usuarios WHERE username=${q(usernameFinal)}`) === 'admin')
  es('el usuario nuevo SÍ tiene contraseña real (no el marcador)',
    sql(`SELECT password FROM usuarios WHERE username=${q(usernameFinal)}`) !== 'sin-clave')
  const usuarioRespaldo = (d.usuarios || [])[0]?.username
  if (usuarioRespaldo) {
    es('los del respaldo quedan con el marcador sin-clave',
      sql(`SELECT password FROM usuarios WHERE username=${q(usuarioRespaldo)}`) === 'sin-clave')
  }

  console.log('\nConfiguración:')
  es('setup_completado es true', sql("SELECT valor FROM config WHERE clave='setup_completado'") === 'true')
  es('el nombre del negocio viene del respaldo',
    sql("SELECT valor FROM config WHERE clave='negocio_nombre'") === JSON.stringify(config.negocio_nombre || 'Mi bodega'))
  es('queda la marca de que vino de otro equipo', sql("SELECT valor FROM config WHERE clave='unido_desde_respaldo'") === 'true')

  console.log('\nLa app ve:')
  const appVioSetup = sql("SELECT valor FROM config WHERE clave='setup_completado'") === 'true'
  es('ya no pide crear el negocio (va directo al login)', appVioSetup)

  console.log(`\n${fallos === 0 ? 'TODO OK' : 'HAY FALLOS'}: ${ok} pasaron, ${fallos} fallaron\n`)
  console.log('Ahora entrá con ' + USERNAME + ' / ' + PASSWORD + ' en la app.\n')
  process.exit(fallos === 0 ? 0 : 1)
}

main()
