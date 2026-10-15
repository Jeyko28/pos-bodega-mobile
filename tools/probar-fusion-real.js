// Prueba de la fusión contra la base REAL del dispositivo.
//
// Simula dos celulares: se guarda un buzón con ventas propias, se mete en un
// teléfono "limpio" y se comprueba que nada se pierde, que el stock cuadra y
// que sincronizar dos veces no cambia nada.
//
// A diferencia de probar-fusion.js (que es un modelo en memoria del
// algoritmo), esto ejecuta el SQL de verdad sobre la base del emulador.
//
// Uso: node tools/probar-fusion-real.js
'use strict'

const { execFileSync } = require('child_process')

const PKG = 'com.pos.bodega'
const DB = `/data/data/${PKG}/files/SQLite/pos-bodega.db`
const ADB = process.env.ADB || 'adb'

function adb(args) { return execFileSync(ADB, args, { encoding: 'utf8' }).trim() }
function sql(consulta) {
  return execFileSync(ADB, ['shell', `run-as ${PKG} sqlite3 ${DB}`], { input: consulta, encoding: 'utf8' }).trim()
}
// Para consultas de una línea. Van por stdin como las otras: pasar el SQL
// como argumento rompe con las comillas internas ("Leche" se vuelve columna).
function uno(sqlTexto) {
  return execFileSync(ADB, ['shell', `run-as ${PKG} sqlite3 ${DB}`], { input: sqlTexto, encoding: 'utf8' }).trim()
}
const q = (v) => (v === null || v === undefined ? 'NULL'
  : typeof v === 'number' ? String(v)
  : `'${String(v).replace(/'/g, "''")}'`)

let ok = 0, fallos = 0
const es = (etiqueta, cond, detalle = '') => {
  if (cond) { ok++; console.log(`  ✓ ${etiqueta}`) }
  else { fallos++; console.log(`  ✗ ${etiqueta}${detalle ? '  → ' + detalle : ''}`) }
}

function limpiar() {
  sql(`BEGIN;
    DELETE FROM detalle_ventas; DELETE FROM ventas;
    DELETE FROM detalle_ingresos; DELETE FROM ingresos;
    DELETE FROM pagos_fiado; DELETE FROM fiado;
    DELETE FROM productos; DELETE FROM clientes;
    DELETE FROM categorias_custom; DELETE FROM config;
  COMMIT;`)
}

function main() {
  console.log('\nFUSIÓN CONTRA LA BASE REAL\n')

  // ── Telefono "A": su propio catálogo e ingresos ────────────────────
  limpiar()
  console.log('Preparando el celular A (catálogo e ingresos propios):')
  sql(`BEGIN;
    INSERT INTO productos (id,nombre,precio,stock,categoria,tipo_venta,unidad,modificado_en,creado_en) VALUES
      (1,'Pan',2.0,0,'Panadería','unidad','unidad','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z'),
      (2,'Leche',3.5,0,'Lácteos','unidad','unidad','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z');
    INSERT INTO ingresos (id,g_id,fecha,deshecho) VALUES (1,'i_A1','2026-01-02T00:00:00.000Z',0);
    INSERT INTO detalle_ingresos (id,g_id,ingreso_id,producto_id,nombre_producto,cantidad) VALUES
      (1,'di_A1',1,1,'Pan',100),
      (2,'di_A2',1,2,'Leche',100);
  COMMIT;`)
  es('A tiene 2 productos', uno('SELECT COUNT(*) FROM productos') === '2')

  // El stock de A se deriva del historial, como haría la app.
  const derivar = () => {
    for (const id of [1, 2]) {
      const ent = Number(uno(`SELECT COALESCE(SUM(di.cantidad),0) t FROM detalle_ingresos di JOIN ingresos i ON i.id=di.ingreso_id WHERE di.producto_id=${id} AND i.deshecho=0`) || 0)
      const sal = Number(uno(`SELECT COALESCE(SUM(dv.cantidad),0) t FROM detalle_ventas dv JOIN ventas v ON v.id=dv.venta_id WHERE dv.producto_id=${id} AND v.anulada=0`) || 0)
      uno(`UPDATE productos SET stock=${Math.round((ent - sal) * 1000) / 1000} WHERE id=${id}`)
    }
  }

  // A vende 13 panes y 5 leches (suyas, id local 1 y 2).
  sql(`BEGIN;
    INSERT INTO ventas (id,g_id,total,subtotal_bruto,descuento,tipo_descuento,monto_recibido,vuelto,metodo_pago,fecha) VALUES
      (1,'v_A1',45.5,45.5,0,'ninguno',45.5,0,'Efectivo','2026-01-03T10:00:00.000Z'),
      (2,'v_A2',6.0,6.0,0,'ninguno',6.0,0,'Efectivo','2026-01-03T11:00:00.000Z');
    INSERT INTO detalle_ventas (venta_id,producto_id,nombre_producto,precio_unitario,cantidad,subtotal,tipo_venta,unidad) VALUES
      (1,1,'Pan',2.0,10,20.0,'unidad','unidad'),
      (1,2,'Leche',3.5,5,17.5,'unidad','unidad'),
      (2,1,'Pan',2.0,3,6.0,'unidad','unidad');
  COMMIT;`)
  derivar()
  const stockPanA = Number(uno('SELECT stock FROM productos WHERE id=1'))
  const stockLecheA = Number(uno('SELECT stock FROM productos WHERE id=2'))
  es('A: Pan = 100 − 13 = 87', stockPanA === 87, `=${stockPanA}`)
  es('A: Leche = 100 − 5 = 95', stockLecheA === 95, `=${stockLecheA}`)

  // ── El buzón que manda B ───────────────────────────────────────────
  // Ojo: B tiene venta id=1 e id=2 TAMBÉN. Los ids locales chocan; los g_id
  // no. Esa es toda la diferencia entre una fusión que funciona y una que
  // pierde plata.
  const buzon = {
    ventas: [
      { g_id: 'v_B1', id: 1, total: 54.5, subtotal_bruto: 54.5, descuento: 0, tipo_descuento: 'ninguno',
        monto_recibido: 54.5, vuelto: 0, metodo_pago: 'Efectivo', es_fiado: 0,
        fecha: '2026-01-03T12:00:00.000Z' },
      { g_id: 'v_B2', id: 2, total: 16.0, subtotal_bruto: 16.0, descuento: 0, tipo_descuento: 'ninguno',
        monto_recibido: 20.0, vuelto: 4.0, metodo_pago: 'Efectivo', es_fiado: 0,
        fecha: '2026-01-03T13:00:00.000Z' },
    ],
    // El detalle se referencia por venta_g_id, no por el id remoto: es lo que
    // permite remapear al id local.
    detalle_ventas: [
      { venta_g_id: 'v_B1', producto_id: 1, nombre_producto: 'Pan', precio_unitario: 2.0, cantidad: 8, subtotal: 16.0, tipo_venta: 'unidad', unidad: 'unidad' },
      { venta_g_id: 'v_B1', producto_id: 2, nombre_producto: 'Leche', precio_unitario: 3.5, cantidad: 12, subtotal: 42.0, tipo_venta: 'unidad', unidad: 'unidad' },
      { venta_g_id: 'v_B2', producto_id: 2, nombre_producto: 'Leche', precio_unitario: 3.5, cantidad: 4, subtotal: 14.0, tipo_venta: 'unidad', unidad: 'unidad' },
    ],
    ingresos: [],
    detalle_ingresos: [],
    fiados: [],
    pagos_fiado: [],
    productos: [{ nombre: 'Leche', precio: 3.8, categoria: 'Lácteos', tipo_venta: 'unidad', unidad: 'unidad',
                  modificado_en: '2026-01-05T00:00:00.000Z' }],  // B cambió el precio DESPUÉS que A
    clientes: [],
  }

  console.log('\nFusionando el buzón de B (2 ventas, 3 líneas, 1 precio actualizado):')
  // Se ejecuta fusionBuzon compilado: se genera el JS con Babel y se corre
  // acá, contra la base real vía sqlite3.
  const fuente = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'data', 'fusion.js'), 'utf8')
  const stockFuente = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'data', 'stock.js'), 'utf8')
  const babel = require('/tmp/opencode/node_modules/@babel/core')

  const compilar = (src, nombre) => {
    const { code } = babel.transformSync(src, {
      presets: [[require('/tmp/opencode/node_modules/@babel/preset-env'), { targets: { node: 'current' } }]],
      babelrc: false, configFile: false, filename: nombre,
    })
    return code.replace(/export (function|const)/g, '$1')
  }
  const mod = { exports: {} }
  const fn = new Function('module', 'exports',
    compilar(fusionSinExport(stockFuente), 'stock.js') + '\n' + compilar(fusionSinExport(fuente), 'fusion.js') +
    '\n;module.exports={fusionarBuzon:fusionarBuzon, recalcularProductos:recalcularProductos, stockDeProducto:stockDeProducto}')
  fn(mod, mod.exports)


  // ── Aplicar la fusión ──────────────────────────────────────────────
  // Se ejecuta la MISMA función que usará la app (fusionarBuzon de
  // src/data/fusion.js), con un adaptador que habla SQL por adb en vez de
  // expo-sqlite. Así la prueba verifica el código real, no una copia.
  const gidsActuales = new Set(
    sql('SELECT g_id FROM ventas').split('\n').filter(Boolean).map(s => s.trim())
  )
  console.log('  los ids locales chocan: B manda ventas con id remoto 1 y 2, como las de A')
  console.log('  pero los g_id difieren, y eso es lo que decide si se suman o se ignoran')

  // Adaptador con la misma interfaz que expo-sqlite usa dentro de fusion.js.
  // El SELECT puede ocupar varias líneas (fusion.js usa plantillas), así que
  // el `s` es imprescindible: sin él no matchea y `gidsRecibidos` recibe un
  // objeto sin la propiedad g_id, creyendo que no hay ninguna venta.
  const colsDe = (consulta) => {
    const m = consulta.match(/SELECT\s+([\s\S]+?)\s+FROM\s/i)
    return m ? m[1].split(',').map(c => c.trim().split(/\s+/).pop()) : []
  }
  let enTransaccion = false
  const adaptador = {
    getAllSync(consulta, ...args) {
      const filas = uno(consulta.replace(/\?/g, () => q(args.shift())))
      if (!filas) return []
      const nombres = colsDe(consulta)
      return filas.split('\n').filter(Boolean).map(linea => {
        const o = {}
        linea.split('|').forEach((v, i) => { o[nombres[i] || 'col' + i] = v })
        return o
      })
    },
    getFirstSync(consulta, ...args) { return adaptador.getAllSync(consulta, ...args)[0] || null },
    runSync(consulta, ...args) {
      uno(consulta.replace(/\?/g, () => q(args.shift())))
      // Cada llamada a `adb shell sqlite3` abre una conexión nueva, así que
      // `last_insert_rowid()` arranca en 0 y no sirve. Se resuelve con
      // `SELECT max(rowid)` de la tabla: el id recién insertado ES el máximo,
      // porque las tablas usan INTEGER PRIMARY KEY AUTOINCREMENT.
      const tabla = (consulta.match(/INSERT INTO (\w+)/i) || [])[1]
      if (!tabla) return { lastInsertRowId: 0 }
      return { lastInsertRowId: Number(uno(`SELECT IFNULL(MAX(rowid),0) FROM ${tabla}`)) }
    },
    withTransactionSync(fn) {
      // Cada llamada a `adb shell sqlite3` abre una conexión nueva, así que la
      // transacción no sobrevive entre llamadas. Se simula con un flag: la
      // atomicidad real la garantiza expo-sqlite dentro del proceso de la app,
      // que sí mantiene la conexión abierta. Lo que se verifica acá es la
      // LÓGICA de la fusión, no la atomicidad.
      enTransaccion = true
      try { fn() } finally { enTransaccion = false }
    },
  }

  // La app le pasa (sql, ids) — se recibe el mismo par y se ignoran los ids,
  // porque acá se recalcula el stock de los dos productos del catálogo.
  const recalcular = (_sql, ids) => {
    const lista = Array.isArray(ids) && ids.length ? ids : [1, 2]
    let cambiados = 0
    for (const id of lista) {
      const ent = Number(uno(`SELECT COALESCE(SUM(di.cantidad),0) t FROM detalle_ingresos di JOIN ingresos i ON i.id=di.ingreso_id WHERE di.producto_id=${id} AND i.deshecho=0`) || 0)
      const sal = Number(uno(`SELECT COALESCE(SUM(dv.cantidad),0) t FROM detalle_ventas dv JOIN ventas v ON v.id=dv.venta_id WHERE dv.producto_id=${id} AND v.anulada=0`) || 0)
      const correcto = Math.round((ent - sal) * 1000) / 1000
      const antes = Number(uno(`SELECT stock FROM productos WHERE id=${id}`))
      if (Math.abs(antes - correcto) > 0.0001) { uno(`UPDATE productos SET stock=${correcto} WHERE id=${id}`); cambiados++ }
    }
    return { cambiados }
  }

  const resumen = mod.exports.fusionarBuzon(adaptador, buzon, recalcular)
  console.log('  resumen:', JSON.stringify(resumen))

  console.log('\nDespués de fusionar:')
  const totalVentas = Number(uno('SELECT COUNT(*) FROM ventas'))
  es('hay 4 ventas (2 de A + 2 de B)', totalVentas === 4, `${totalVentas}`)
  const gids = sql('SELECT g_id FROM ventas ORDER BY g_id').split('\n').filter(Boolean)
  es('son 4 g_id distintos', new Set(gids.map(s => s.trim())).size === 4, gids.join(', '))
  const totalDetalle = Number(uno('SELECT COUNT(*) FROM detalle_ventas'))
  es('hay 6 líneas de detalle (3 + 3)', totalDetalle === 6, `${totalDetalle}`)

  const pan = Number(uno('SELECT stock FROM productos WHERE id=1'))
  const leche = Number(uno('SELECT stock FROM productos WHERE id=2'))
  es('Pan = 100 − (13+8) = 79', pan === 79, `=${pan}`)
  es('Leche = 100 − (5+12+4) = 79', leche === 79, `=${leche}`)
  es('el precio de Leche tomó el de B (3.8)', Number(uno('SELECT precio FROM productos WHERE nombre="Leche"')) === 3.8)

  console.log('\nContra un celular único que hubiera vendido todo:')
  const vendioPan = Number(uno('SELECT SUM(cantidad) t FROM detalle_ventas WHERE producto_id=1'))
  const vendioLeche = Number(uno('SELECT SUM(cantidad) t FROM detalle_ventas WHERE producto_id=2'))
  es(`Pan: 100 − ${vendioPan} = ${100 - vendioPan} (igual que arriba)`, pan === 100 - vendioPan)
  es(`Leche: 100 − ${vendioLeche} = ${100 - vendioLeche} (igual que arriba)`, leche === 100 - vendioLeche)

  console.log('\nSincronizar otra vez el mismo buzón (idempotente):')
  // Se reejecuta la MISMA fusión. Como ya tengo esos g_id, no debe entrar
  // nada: ni ventas, ni líneas, ni cambio de precio.
  const antesDeRepetir = uno('SELECT COUNT(*) FROM ventas')
  const resumen2 = mod.exports.fusionarBuzon(adaptador, buzon, recalcular)
  const despuesDeRepetir = uno('SELECT COUNT(*) FROM ventas')

  es('ninguna venta se agrega de nuevo', resumen2.ventasAgregadas === 0, `${resumen2.ventasAgregadas}`)
  es('el total de ventas no cambia', Number(antesDeRepetir) === Number(despuesDeRepetir),
    `${antesDeRepetir} → ${despuesDeRepetir}`)
  es('el detalle no se duplica', Number(uno('SELECT COUNT(*) FROM detalle_ventas')) === 6,
    `${uno('SELECT COUNT(*) FROM detalle_ventas')}`)
  es('el stock sigue igual (79 / 79)',
    Number(uno('SELECT stock FROM productos WHERE id=1')) === 79 &&
    Number(uno('SELECT stock FROM productos WHERE id=2')) === 79)

  console.log(`\n${fallos === 0 ? 'TODO OK' : 'HAY FALLOS'}: ${ok} pasaron, ${fallos} fallaron\n`)
  process.exit(fallos === 0 ? 0 : 1)
}

function fusionSinExport(src) {
  return src.replace(/^export /gm, '')
}

main()
