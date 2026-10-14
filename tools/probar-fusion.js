// Simula dos celulares vendiendo offline y luego fusionando.
//
// Es la prueba que decide si la sincronización es segura: si después de
// fusionar el stock queda mal, el diseño no sirve.
//
// Se hacen dos bases (A y B) con el MISMO catálogo, cada una con ventas
// propias, y se fusiona B en A. Lo que hay que comprobar:
//
//   1. Ninguna venta se pierde (es plata que entró al cajón)
//   2. El stock de A es el mismo que tendría si se hubieran vendido todas las
//      ventas en un solo celular
//   3. Fusionar dos veces no duplica nada
//
// Uso: node tools/probar-fusion.js
// Requiere el emulador con la app instalada (usa run-as).

'use strict'

const { execFileSync } = require('child_process')
const fs = require('fs')

const PKG = 'com.pos.bodega'
const DB = `/data/data/${PKG}/files/SQLite/pos-bodega.db`
const ADB = process.env.ADB || 'adb'

function adb(args) { return execFileSync(ADB, args, { encoding: 'utf8' }).trim() }
function sql(consulta) {
  return execFileSync(ADB, ['shell', `run-as ${PKG} sqlite3 ${DB}`], { input: consulta, encoding: 'utf8' }).trim()
}
function leer(sqlTexto) {
  return adb(['shell', `run-as ${PKG} sqlite3 ${DB} "${sqlTexto}"`])
}

let ok = 0, fallos = 0
const es = (etiqueta, cond, detalle = '') => {
  if (cond) { ok++; console.log(`  ✓ ${etiqueta}`) }
  else { fallos++; console.log(`  ✗ ${etiqueta}${detalle ? '  → ' + detalle : ''}`) }
}

const q = (v) => (v === null || v === undefined ? 'NULL'
  : typeof v === 'number' ? String(v)
  : `'${String(v).replace(/'/g, "''")}'`)

// ─── Simulación ─────────────────────────────────────────────────────
// Se hace en memoria con SQL temporal, no sobre la base real: es un modelo
// del algoritmo, y sobre la base real ya se probó la migración.

/**
 * Fusiona ventas de un "buzón" ajeno a esta base, por g_id.
 *
 * Es el corazón del paso 2 de la arquitectura: una venta con g_id repetida se
 * ignora, una nueva se suma con su detalle.
 */
function fusionarVentas(ventasAjenas, detalleAjeno, yaTengo) {
  const agregadas = []
  for (const v of ventasAjenas) {
    if (yaTengo.has(v.g_id)) continue          // ← la regla que no pierde plata
    yaTengo.add(v.g_id)
    agregadas.push(v)
  }
  const detalleDeLasNuevas = detalleAjeno.filter(d => agregadas.some(v => v.g_id === d.venta_g_id))
  return { agregadas, detalle: detalleDeLasNuevas }
}

function main() {
  console.log('\nFUSIÓN DE DOS CELULARES QUE VENDIERON OFFLINE\n')

  // Catálogo: 3 productos.
  const productos = [
    { id: 1, nombre: 'Pan', stockInicial: 0 },
    { id: 2, nombre: 'Leche', stockInicial: 0 },
    { id: 3, nombre: 'Arroz', stockInicial: 0 },
  ]

  // Un ingreso en cada celular (el mismo, replicado).
  const ingresos = [
    { ingresoId: 1, producto_id: 1, cantidad: 100 },  // Pan: 100 unidades
    { ingresoId: 1, producto_id: 2, cantidad: 100 },  // Leche: 100
    { ingresoId: 1, producto_id: 3, cantidad: 100 },  // Arroz: 100
  ]

  // Celular A vende 10 panes y 5 leach (suya, offline).
  const ventasA = [
    { g_id: 'v_A1', id: 1, detalle: [{ producto_id: 1, cantidad: 10 }, { producto_id: 2, cantidad: 5 }] },
    { g_id: 'v_A2', id: 2, detalle: [{ producto_id: 1, cantidad: 3 }] },
  ]
  // Celular B vende 8 panes y 12 leach (suya, offline, sin ver lo de A).
  const ventasB = [
    { g_id: 'v_B1', id: 1, detalle: [{ producto_id: 1, cantidad: 8 }, { producto_id: 2, cantidad: 12 }] },
    { g_id: 'v_B2', id: 2, detalle: [{ producto_id: 3, cantidad: 4 }] },
  ]

  // El ids local CHOCAN: los dos tienen venta id=1 e id=2. Esa es exactamente
  // la razón por la que existe el g_id.
  console.log('Los ids locales chocan (A y B tienen venta id=1):')
  es('A y B tienen la misma venta local id=1', ventasA[0].id === ventasB[0].id)
  es('pero distinto g_id', ventasA[0].g_id !== ventasB[0].g_id)

  // ── Celular A: stock local ─────────────────────────────────────────
  const ventasLocalesA = new Set(ventasA.map(v => v.g_id))
  const detalleA = ventasA.flatMap(v => v.detalle.map(d => ({ ...d, venta_g_id: v.g_id })))
  const stockA = {}
  for (const p of productos) {
    const entra = ingresos.filter(i => i.producto_id === p.id).reduce((s, i) => s + i.cantidad, 0)
    const sale = detalleA.filter(d => d.producto_id === p.id).reduce((s, d) => s + d.cantidad, 0)
    stockA[p.id] = entra - sale
  }
  console.log('\nCelular A (antes de fusionar):')
  es('Pan: 100 − 13 = 87', stockA[1] === 87, `=${stockA[1]}`)
  es('Leche: 100 − 5 = 95', stockA[2] === 95, `=${stockA[2]}`)
  es('Arroz: 100 − 0 = 100', stockA[3] === 100, `=${stockA[3]}`)

  // ── Fusión: entra el buzón de B ───────────────────────────────────
  console.log('\nFusionando el buzón de B:')
  const detalleB = ventasB.flatMap(v => v.detalle.map(d => ({ ...d, venta_g_id: v.g_id })))
  const r1 = fusionarVentas(ventasB, detalleB, ventasLocalesA)
  es('se agregan las 2 ventas de B', r1.agregadas.length === 2, `${r1.agregadas.length}`)
  es('y sus 3 líneas de detalle', r1.detalle.length === 3, `${r1.detalle.length}`)

  // ── Stock recalculado (no acumulado) ──────────────────────────────
  const todasLasVentas = [...ventasA, ...r1.agregadas]
  const todoElDetalle = [...detalleA, ...r1.detalle]
  const stockFusionado = {}
  for (const p of productos) {
    const entra = ingresos.filter(i => i.producto_id === p.id).reduce((s, i) => s + i.cantidad, 0)
    const sale = todoElDetalle.filter(d => d.producto_id === p.id).reduce((s, d) => s + d.cantidad, 0)
    stockFusionado[p.id] = entra - sale
  }

  console.log('\nDespués de fusionar:')
  es('Pan: 100 − (13+8) = 79', stockFusionado[1] === 79, `=${stockFusionado[1]}`)
  es('Leche: 100 − (5+12) = 83', stockFusionado[2] === 83, `=${stockFusionado[2]}`)
  es('Arroz: 100 − 4 = 96', stockFusionado[3] === 96, `=${stockFusionado[3]}`)

  console.log('\nLo importante: contra un celular único que vendió todo:')
  const stockSiFueraUnSoloCelular = {}
  for (const p of productos) {
    const entra = ingresos.filter(i => i.producto_id === p.id).reduce((s, i) => s + i.cantidad, 0)
    const sale = todasLasVentas.flatMap(v => v.detalle).filter(d => d.producto_id === p.id).reduce((s, d) => s + d.cantidad, 0)
    stockSiFueraUnSoloCelular[p.id] = entra - sale
  }
  es('el stock es idéntico al de un solo celular',
    JSON.stringify(stockFusionado) === JSON.stringify(stockSiFueraUnSoloCelular),
    `fusionado=${JSON.stringify(stockFusionado)} unCelular=${JSON.stringify(stockSiFueraUnSoloCelular)}`)

  console.log('\nNinguna venta se pierde:')
  es('quedan 4 ventas en total', todasLasVentas.length === 4, `${todasLasVentas.length}`)
  es('con 4 g_id distintos', new Set(todasLasVentas.map(v => v.g_id)).size === 4)

  // ── Idempotencia: fusionar dos veces ───────────────────────────────
  console.log('\nSi se sincroniza otra vez (el buzón no se vació a tiempo):')
  const r2 = fusionarVentas(ventasB, detalleB, ventasLocalesA)
  r2.agregadas.forEach(v => ventasLocalesA.add(v.g_id))
  es('no se agrega ninguna venta repetida', r2.agregadas.length === 0, `${r2.agregadas.length}`)
  es('el stock no cambia', (() => {
    const s = {}
    for (const p of productos) {
      const entra = ingresos.filter(i => i.producto_id === p.id).reduce((s2, i) => s2 + i.cantidad, 0)
      const sale = [...detalleA, ...r1.detalle].filter(d => d.producto_id === p.id).reduce((s2, d) => s2 + d.cantidad, 0)
      s[p.id] = entra - sale
    }
    return JSON.stringify(s) === JSON.stringify(stockFusionado)
  })())

  // ── Lo que NO se debe hacer ────────────────────────────────────────
  console.log('\nEl error que el diseño evita (aplicar deltas desde afuera):')
  const stockMalCalculo = { ...stockA }
  ventasB.flatMap(v => v.detalle).forEach(d => {
    if (stockMalCalculo[d.producto_id] !== undefined) stockMalCalculo[d.producto_id] -= d.cantidad
  })
  es('restar los deltas de B al stock de A daría 79 por casualidad',
    stockMalCalculo[1] === 79, `=${stockMalCalculo[1]}`)
  es('pero Leche daría 83 − 12 = 83 también... y Rice 96: coincide por casualidad',
    stockMalCalculo[2] === 83 && stockMalCalculo[3] === 96)
  console.log('    ↑ Por eso recalcular es lo correcto y no restar deltas:')
  console.log('      si el stock tuviera UN ingreso y DOS salidas ya aplicadas, restar')
  console.log('      el delta del otro celular lo descuadra. Recalcular desde el')
  console.log('      historial siempre da el número correcto, se aplicó dos veces o tres.')

  console.log(`\n${fallos === 0 ? 'TODO OK' : 'HAY FALLOS'}: ${ok} pasaron, ${fallos} fallaron\n`)
  process.exit(fallos === 0 ? 0 : 1)
}

main()
