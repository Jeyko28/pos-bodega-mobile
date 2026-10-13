// Poner la app en cualquier estado de licencia, al instante.
//
// Por qué existe: para ver cómo se ve y cómo se comporta la pantalla de
// licencia hacen falta 30 días. Con esta herramienta se llega en un segundo.
//
// Solo funciona en el build de DESARROLLO: necesita `run-as`, que Android
// solo permite en apps debuggables. En un APK de producción la base no se
// puede tocar — y está bien que sea así.
//
// Uso:
//   node tools/licencia-estado.js ver
//   node tools/licencia-estado.js <ID> [dias]      # día N de la prueba
//   node tools/licencia-estado.js <ID> activa      # licencia ya pagada
//   node tools/licencia-estado.js <ID> nuevo       # instalación recién hecha
//   node tools/licencia-estado.js <ID> atrasar 20  # simula que ya se vio
//
// Ejemplos:
//   node tools/licencia-estado.js K7M2P9QA 1     # día 1: 30 días gratis
//   node tools/licencia-estado.js K7M2P9QA 24    # día 24: aviso ámbar
//   node tools/licencia-estado.js K7M2P9QA 30    # día 30: último día
//   node tools/licencia-estado.js K7M2P9QA 31    # bloqueada
//   node tools/licencia-estado.js K7M2P9QA activa

'use strict'

const { execFileSync } = require('child_process')

const PKG = 'com.pos.bodega'
const DB = `/data/data/${PKG}/files/SQLite/pos-bodega.db`
const ADB = process.env.ADB || 'adb'
const DIA_MS = 86400000

function adb(args) {
  return execFileSync(ADB, args, { encoding: 'utf8' }).trim()
}

// sqlite3 con comillas: pasar el SQL como argumento del shell a través de
// execFileSync rompe con los paréntesis, así que va por stdin.
function sql(consulta) {
  return adb(['shell', `run-as ${PKG} sqlite3 ${DB} "${consulta.replace(/"/g, '\\"')}"`])
}

function escribir(clave, valor) {
  // El valor va como JSON, que es lo que espera leerConfig al hacer JSON.parse.
  sql(`INSERT OR REPLACE INTO config (clave,valor) VALUES ('${clave}','${JSON.stringify(valor)}')`)
}

function ver() {
  const filas = sql("SELECT clave||' = '||valor FROM config WHERE clave LIKE 'lic_%' ORDER BY clave")
  console.log('\nESTADO DE LICENCIA\n')
  if (!filas) {
    console.log('  (sin claves de licencia: la app las crea al arrancar)')
    console.log('  -> abrí la app una vez y volvé a ejecutar\n')
    return
  }
  console.log(filas.split('\n').map(l => '  ' + l).join('\n'))

  // Replica el cálculo de db.js para mostrar qué ve el usuario.
  const config = {}
  filas.split('\n').forEach(l => {
    const m = l.match(/^(\S+) = (.*)$/)
    if (m) { try { config[m[1]] = JSON.parse(m[2]) } catch { config[m[1]] = m[2] } }
  })
  console.log('')
  if (config.lic_estado === 'activa') {
    console.log('  -> la app ve: LICENCIA ACTIVA, todo abierto')
  } else if (!config.lic_instalado_en) {
    console.log('  -> la app ve: 30 días completos (recién instalada)')
  } else {
    const ref = Math.max(Date.now(), Date.parse(config.lic_ultimo_visto || 0), Date.parse(config.lic_instalado_en))
    const dias = Math.max(0, Math.floor((ref - Date.parse(config.lic_instalado_en)) / DIA_MS))
    const restantes = 30 - dias
    let que
    if (restantes <= 0) que = 'BLOQUEADA — solo se puede activar'
    else if (restantes === 1) que = 'último día (aviso fuerte)'
    else if (restantes <= 7) que = 'aviso ámbar'
    else que = 'sin aviso'
    console.log(`  -> la app ve: día ${dias + 1}, ${restantes} restantes, ${que}`)
  }
  console.log('')
}

function aplicar(id, estado, arg) {
  const ahora = Date.now()
  escribir('lic_instal_id', id)

  if (estado === 'activa') {
    escribir('lic_estado', 'activa')
    escribir('lic_activada_en', new Date(ahora).toISOString())
    escribir('lic_instalado_en', new Date(ahora - 45 * DIA_MS).toISOString())
    escribir('lic_ultimo_visto', new Date(ahora).toISOString())
    console.log('Licencia marcada como ACTIVA (45 días atrás).')
  } else if (estado === 'nuevo') {
    sql("DELETE FROM config WHERE clave LIKE 'lic_%'")
    escribir('lic_instal_id', id)
    console.log('Licencia reiniciada: la app la volverá a crear al arrancar.')
  } else {
    const dias = parseInt(arg || '1', 10)
    if (Number.isNaN(dias) || dias < 0) {
      console.error('El día debe ser un número >= 0.')
      process.exit(1)
    }
    const instalado = ahora - dias * DIA_MS
    escribir('lic_instalado_en', new Date(instalado).toISOString())
    escribir('lic_ultimo_visto', new Date(instalado).toISOString())
    // Quitar 'activa' si venía de una licencia pagada: si no, el estado
    // activa manda por encima de las fechas y no se ve el bloqueo.
    escribir('lic_estado', 'prueba')
    console.log(`Puesta en el día ${dias + 1} de la prueba (${dias} días desde la instalación).`)
    console.log('ID de instalación: ' + id)
    console.log('Código de activación: ' + generarCodigo(id))
  }
  console.log('Reiniciá la app para que lo vea.')
  console.log('')
}

function generarCodigo(id) {
  const fs = require('fs')
  const crypto = require('crypto')
  const path = require('path')
  const hex = fs.readFileSync(path.join(__dirname, 'generar-codigo.js'), 'utf8')
    .match(/SECRETO_LICENCIA_HEX = '([^']+)'/)[1]
  const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  const mac = crypto.createHmac('sha256', Buffer.from(hex, 'hex')).update('pos-bodega:' + id, 'utf8').digest().slice(0, 10)
  let bits = 0, valor = 0, texto = ''
  for (const b of mac) {
    valor = (valor << 8) | b; bits += 8
    while (bits >= 5) { bits -= 5; texto += A[(valor >> bits) & 31] }
  }
  if (bits > 0) texto += A[(valor << (5 - bits)) & 31]
  return `${texto.slice(0, 4)}-${texto.slice(4, 8)}-${texto.slice(8, 12)}-${texto.slice(12, 16)}`
}

const [id, estado, arg] = process.argv.slice(2)

try {
  if (!id || id === 'ver') ver()
  else if (['activa', 'nuevo'].includes(estado)) aplicar(id, estado, arg)
  else if (/^\d+$/.test(estado)) aplicar(id, estado, estado)
  else {
    console.error('Uso:')
    console.error('  node tools/licencia-estado.js ver')
    console.error('  node tools/licencia-estado.js <ID> <dia 0-31>')
    console.error('  node tools/licencia-estado.js <ID> activa')
    console.error('  node tools/licencia-estado.js <ID> nuevo')
    process.exit(1)
  }
} catch (e) {
  console.error('\nNo se pudo tocar la base: ' + (e.stderr || e.message))
  console.error('\n¿La app está instalada en build de DESARROLLO?')
  console.error('Un APK de producción no permite run-as (no es debuggable).\n')
  process.exit(1)
}
