// Prueba de la lógica de licencia, sin emulador.
//
// La licencia es lo único que puede dejar a una bodeguera sin poder vender, y
// el cálculo de fechas es justamente donde uno se equivoca sin que se note
// (un `>` por un `>=` y el día 30 cobra de más; un `Math.min` mal puesto y
// nunca bloquea). Verificar eso en pantalla exige esperar 30 días o manipular
// la base, así que se prueba acá: son fechas puras, sin nada de nativo.
//
// Uso: node tools/probar-licencia.js
//
// Lo que NO cubre: que el código se pegue bien desde el portapapeles, que
// `realizarVenta` lance el error, ni que la pestaña se reemplace. Eso se ve en
// pantalla.
'use strict'

const path = require('path')

// ─── Copia del cálculo de db.js ──────────────────────────────────────
// Se copia a propósito y no se importa: db.js usa `expo-sqlite` y
// `expo-crypto`, que no existen en Node. Si el cálculo cambia en la app, esta
// copia hay que actualizarla — la comparación de abajo lo detecta solo.
const DIAS_PRUEBA = 30
const AVISO_PRUEBA_DESDE = 7
const DIA_MS = 86400000

function estadoLicencia(config, ahora = Date.now()) {
  const id = config.lic_instal_id ?? null
  if ((config.lic_estado ?? 'prueba') === 'activa') {
    return { modo: 'activa', bloqueado: false, avisar: false, ultimoDia: false, restantes: null, diasUso: null, instalacionId: id }
  }
  const instaladoEn = config.lic_instalado_en ?? null
  if (!instaladoEn) return { modo: 'prueba', bloqueado: false, avisar: false, ultimoDia: false, restantes: DIAS_PRUEBA, diasUso: 1, instalacionId: id }
  const ultimoVisto = config.lic_ultimo_visto ?? null
  const referencia = Math.max(ahora, Date.parse(ultimoVisto || 0), Date.parse(instaladoEn))
  const dias = Math.max(0, Math.floor((referencia - Date.parse(instaladoEn)) / DIA_MS))
  const restantes = DIAS_PRUEBA - dias
  return {
    modo: restantes > 0 ? 'prueba' : 'bloqueada',
    bloqueado: restantes <= 0,
    avisar: restantes <= AVISO_PRUEBA_DESDE && restantes > 1,
    ultimoDia: restantes === 1,
    restantes: Math.max(restantes, 0),
    diasUso: dias + 1,
    instalacionId: id,
  }
}

// ─── El cálculo en db.js, leído del archivo ──────────────────────────
function leerCalculoReal() {
  const src = require('fs').readFileSync(path.join(__dirname, '..', 'src', 'data', 'db.js'), 'utf8')
  const cuerpo = src.match(/function getEstadoLicencia\([\s\S]*?\n}/)
  if (!cuerpo) throw new Error('No se encontró getEstadoLicencia en src/data/db.js')
  // Se evalúa el cuerpo tal cual: si la app cambia la fórmula, esta prueba
  // falla en vez de seguir validando una copia vieja.
  const fn = new Function('DIAS_PRUEBA', 'AVISO_PRUEBA_DESDE', 'leerConfig', cuerpo[0] + '\nreturn getEstadoLicencia')
  return fn(DIAS_PRUEBA, AVISO_PRUEBA_DESDE, (clave, def) => configActual[clave] ?? def)
}
let configActual = {}

// ─── Aserciones ──────────────────────────────────────────────────────
let ok = 0, fallos = 0
function es(etiqueta, condicion, detalle = '') {
  if (condicion) { ok++; console.log(`  ✓ ${etiqueta}`) }
  else { fallos++; console.log(`  ✗ ${etiqueta}${detalle ? '  → ' + detalle : ''}`) }
}

function instalar(diasAtras = 0, ahora = Date.now()) {
  const t0 = ahora - diasAtras * DIA_MS
  configActual = {
    lic_instal_id: 'K7M2P9QA',
    lic_instalado_en: new Date(t0).toISOString(),
    lic_ultimo_visto: new Date(t0).toISOString(),
  }
  return configActual
}

console.log('\nLICENCIA — cálculo de días\n')

// --- El recorrido normal de 30 días ---
console.log('Recorrido de los 30 días:')
// `avisar` (ámbar) y `ultimoDia` (aviso fuerte) son excluyentes a propósito:
// el último día tiene su propio mensaje, más fuerte. Por eso en el día 30
// `avisar` es false y `ultimoDia` es true.
const hitos = [
  [0, 30, false, false, 'día 1: 30 restantes'],
  [1, 29, false, false, 'día 2: 29'],
  [22, 8, false, false, 'día 23: 8, sin aviso todavía'],
  [23, 7, true, false, 'día 24: 7 → aviso ámbar'],
  [29, 1, false, true, 'día 30: último día (aviso fuerte, no ámbar)'],
  [30, 0, false, false, 'día 31: ventas bloqueadas'],
  [45, 0, false, false, 'día 46: sigue bloqueada'],
]
for (const [dias, restantesEsperado, avisarEsperado, ultimoEsperado, etiqueta] of hitos) {
  instalar(dias)
  const e = estadoLicencia(configActual)
  es(etiqueta,
    e.restantes === restantesEsperado && e.avisar === avisarEsperado && e.ultimoDia === ultimoEsperado,
    `obtenido restantes=${e.restantes} avisar=${e.avisar} ultimoDia=${e.ultimoDia}`)
}

// --- Atajar el error más caro: cobrar un día de más ---
console.log('\nFrontera de los 30 días (donde se suele equivocar):')
configActual = { lic_instal_id: 'X', lic_instalado_en: new Date(Date.now() - 29.9 * DIA_MS).toISOString(), lic_ultimo_visto: new Date(Date.now() - 29.9 * DIA_MS).toISOString() }
es('a las 29.9 días todavía NO bloquea', estadoLicencia(configActual).bloqueado === false)
configActual = { lic_instal_id: 'X', lic_instalado_en: new Date(Date.now() - 30.5 * DIA_MS).toISOString(), lic_ultimo_visto: new Date(Date.now() - 30.5 * DIA_MS).toISOString() }
es('a las 30.5 días YA bloquea', estadoLicencia(configActual).bloqueado === true)
es('a las 30.5 días no avisa (ya está bloqueada)', estadoLicencia(configActual).avisar === false)

// --- Anti-trampa de reloj ---
console.log('\nAnti-trampa de reloj:')
const hoy = Date.now()
instalar(20, hoy)
// El usuario atrasa el teléfono 10 días: la prueba no se alarga.
configActual.lic_ultimo_visto = new Date(hoy - 10 * DIA_MS).toISOString()
es('atrasar el reloj NO alarga la prueba', estadoLicencia(configActual, hoy).restantes === 10,
  `restantes=${estadoLicencia(configActual, hoy).restantes} (esperado 10)`)
// Y adelantarlo tampoco la acorta de golpe...
instalar(10, hoy)
configActual.lic_ultimo_visto = new Date(hoy).toISOString()
es('adelantar el reloj SÍ bloquea (es el precio de la trampa)', estadoLicencia(configActual, hoy).restantes === 20)

// --- Licencia activa ---
console.log('\nLicencia activada:')
instalar(100)
configActual.lic_estado = 'activa'
const activa = estadoLicencia(configActual)
es('activa nunca bloquea, aunque pasaron 100 días', activa.bloqueado === false && activa.modo === 'activa')
es('activa no muestra avisos ni último día', activa.avisar === false && activa.ultimoDia === false)

// --- Instalación recién hecha ---
console.log('\nInstalación recién hecha:')
configActual = {}
const nueva = estadoLicencia(configActual)
es('sin fecha de instalación da los 30 días completos', nueva.restantes === 30 && nueva.bloqueado === false)
es('sin ID de instalación no rompe', nueva.instalacionId === null)

// --- Verificación contra el código real de la app ---
console.log('\nLa copia de arriba sigue al código real de la app:')
try {
  instalar(23)
  const real = leerCalculoReal()(Date.now())
  const copia = estadoLicencia(configActual)
  es('getEstadoLicencia de db.js da el mismo resultado',
    real.restantes === copia.restantes && real.avisar === copia.avisar && real.ultimoDia === copia.ultimoDia,
    `real=${JSON.stringify({ r: real.restantes, a: real.avisar, u: real.ultimoDia })} copia=${JSON.stringify({ r: copia.restantes, a: copia.avisar, u: copia.ultimoDia })}`)
} catch (e) {
  es('se pudo leer getEstadoLicencia de db.js', false, e.message)
}

console.log(`\n${fallos === 0 ? 'TODO OK' : 'HAY FALLOS'}: ${ok} pasaron, ${fallos} fallaron\n`)
process.exit(fallos === 0 ? 0 : 1)
