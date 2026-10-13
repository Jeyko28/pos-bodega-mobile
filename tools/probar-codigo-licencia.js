// Prueba del par generar → verificar, cruzando la app contra node:crypto.
//
// El riesgo real de la licencia offline no es el cálculo de días (eso está en
// probar-licencia.js) sino que el código que emite el vendedor y el que
// verifica la app se desincronicen. Si divergen, la bodeguera paga y la app
// dice que el código no vale: es el peor fallo posible del producto.
//
// Esta prueba ejecuta el MISMO código de src/data/licencia.js, con
// expo-crypto sustituido por node:crypto, y compara contra lo que produce
// tools/generar-codigo.js.
//
// Uso: node tools/probar-codigo-licencia.js
'use strict'

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const Module = require('module')

// ─── expo-crypto sustituido por node:crypto ──────────────────────────
// La app usa `Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes)` y
// devuelve un ArrayBuffer. node hace lo mismo con Buffer, que es una vista
// sobre ArrayBuffer, así que el resultado es idéntico byte a byte.
const CryptoFalso = {
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  getRandomBytes: (n) => crypto.randomBytes(n),
  digest: async (_alg, datos) => {
    const b = Buffer.isBuffer(datos) ? datos : Buffer.from(datos.buffer ?? datos, datos.byteOffset ?? 0, datos.byteLength ?? datos.length)
    const h = crypto.createHash('sha256').update(b).digest()
    return h.buffer.slice(h.byteOffset, h.byteOffset + h.byteLength)
  },
  digestStringAsync: async (_alg, s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex'),
}

const requireOriginal = Module.prototype.require

const ROOT = path.join(__dirname, '..')

// src/data/licencia.js es ESM con imports; Node no lo carga directo desde un
// script CommonJS sin pasar por Babel. Se transpila a una función y se evalúa
// acá, con las dependencias inyectadas: es el MISMO código de la app, no una
// copia (si alguien cambia la fórmula del HMAC, esta prueba usa el cambio).
function cargarLicencia() {
  // Babel está en el scratch (/tmp/opencode), no en el proyecto: es una
  // herramienta de prueba, no una dependencia de la app.
  const babel = require('/tmp/opencode/node_modules/@babel/core')
  const src = fs.readFileSync(path.join(ROOT, 'src', 'data', 'licencia.js'), 'utf8')
  const { code } = babel.transformSync(src, {
    // El plugin de módulos ES es obligatorio: sin él, preset-env deja los
    // `import` intactos y `new Function` los rechaza.
    plugins: [require('/tmp/opencode/node_modules/@babel/plugin-transform-modules-commonjs')],
    presets: [[require('/tmp/opencode/node_modules/@babel/preset-env'), { targets: { node: 'current' } }]],
    babelrc: false, configFile: false, filename: 'licencia.js',
  })
  const modulo = { exports: {} }
  // Los imports se convierten a `require("ruta")`. Se atienden a mano: el
  // nombre de la variable que genera Babel cambia según la versión, así que
  // se resuelve por la ruta del import en vez de por el nombre.
  //
  // `requireFalso` devuelve los módulos REALES de la app (texto.js y
  // bultos.js se leen del disco y se pasan como objetos), no constantes
  // sueltas: si el fragmento del secreto cambia en el código, esta prueba usa
  // el valor nuevo y el código emitido por el vendedor deja de matchear.
  const requireFalso = (ruta) => {
    if (ruta.includes('expo-crypto')) return CryptoFalso
    if (ruta.includes('texto')) return requireTexto()
    if (ruta.includes('bultos')) return requireBultos()
    throw new Error('import no soportado en la prueba: ' + ruta)
  }
  const fn = new Function('module', 'exports', 'require', code)
  fn(modulo, modulo.exports, requireFalso)
  return modulo.exports
}

// Los dos archivos de los que salen los fragmentos del secreto son JS puro
// (sin imports), así que se leen y se cargan tal cual.
function requireTexto() {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'utils', 'texto.js'), 'utf8')
  const valor = src.match(/FRAG_LIC_2\s*=\s*['"]([^'"]+)['"]/)[1]
  return { FRAG_LIC_2: valor }
}
function requireBultos() {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'data', 'bultos.js'), 'utf8')
  const valor = src.match(/FRAG_LIC_3\s*=\s*['"]([^'"]+)['"]/)[1]
  return { FRAG_LIC_3: valor }
}

const licencia = cargarLicencia()

// ─── El generador del vendedor, leído del archivo ────────────────────
function generarConHerramienta(id, esReset = false) {
  const args = ['tools/generar-codigo.js', id, esReset ? 'reset' : 'x']
  const { execFileSync } = require('child_process')
  return execFileSync('node', args, { cwd: ROOT, encoding: 'utf8' }).trim()
}

// node:crypto como referencia independiente
function generarConNode(id, esReset = false) {
  const hex = fs.readFileSync(path.join(ROOT, 'tools', 'generar-codigo.js'), 'utf8')
    .match(/SECRETO_LICENCIA_HEX = '([^']+)'/)[1]
  const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  const mensaje = esReset ? `pos-bodega-reset:${id}` : `pos-bodega:${id}`
  const mac = crypto.createHmac('sha256', Buffer.from(hex, 'hex')).update(mensaje, 'utf8').digest().slice(0, 10)
  let bits = 0, valor = 0, texto = ''
  for (const b of mac) {
    valor = (valor << 8) | b; bits += 8
    while (bits >= 5) { bits -= 5; texto += ALFABETO[(valor >> bits) & 31] }
  }
  if (bits > 0) texto += ALFABETO[(valor << (5 - bits)) & 31]
  return `${texto.slice(0, 4)}-${texto.slice(4, 8)}-${texto.slice(8, 12)}-${texto.slice(12, 16)}`
}

let ok = 0, fallos = 0
const es = (etiqueta, cond, detalle = '') => {
  if (cond) { ok++; console.log(`  ✓ ${etiqueta}`) }
  else { fallos++; console.log(`  ✗ ${etiqueta}${detalle ? '  → ' + detalle : ''}`) }
}

async function main() {
  console.log('\nCÓDIGO DE LICENCIA — generar → verificar\n')

  // --- El ciclo completo, con el código real de la app ---
  console.log('Un código emitido por el vendedor es aceptado por la app:')
  const id = 'K7M2P9QA'
  const emitido = generarConNode(id)
  console.log('  código emitido: ' + emitido)
  es('la app acepta su propio código', await licencia.verificarCodigo(id, emitido))

  // --- Y coincide con la herramienta de verdad, no solo con la referencia ---
  console.log('\nLa herramienta del vendedor coincide:')
  const deHerramienta = generarConHerramienta(id)
  es('generar-codigo.js produce lo mismo', deHerramienta === emitido,
    'herramienta=' + deHerramienta + ' node=' + emitido)

  // --- Un código de otro teléfono NO sirve ---
  console.log('\nEl código está atado a la instalación:')
  es('un ID distinto no lo acepta', !(await licencia.verificarCodigo('XXXXXXXX', emitido)))
  es('un código de reset no sirve para activar', !(await licencia.verificarCodigo(id, generarConNode(id, true))))

  // --- Ruido de tecleo: la bodeguera lo dicta ---
  console.log('\nTolera cómo lo escribe la gente:')
  const sinGuiones = emitido.replace(/-/g, '')
  es('sin guiones', await licencia.verificarCodigo(id, sinGuiones))
  es('en minúsculas', await licencia.verificarCodigo(id, emitido.toLowerCase()))
  es('con espacios', await licencia.verificarCodigo(id, emitido.split('').join(' ')))
  es('con O en vez de 0', await licencia.verificarCodigo(id, emitido.replace(/0/g, 'O')))
  es('pegado en un texto más largo', await licencia.verificarCodigo(id, `Hola! Tu código es ${emitido} — gracias`))
  // Con dos códigos en el portapapeles no se adivina cuál es: es mejor fallar
  // y que vuelva a copiar que activar con el código de otra persona.
  es('NO adivina si hay dos códigos en el texto',
    licencia.extraerCodigo('primero EY51-PQKP-65YS-85V0 luego AB4D-EF6H-JK8M-NP3R') === null)
  es('SÍ lo saca si hay uno solo con contexto',
    licencia.extraerCodigo('Hola! Tu código es EY51-PQKP-65YS-85V0 — gracias') === 'EY51PQKP65YS85V0')
  es('no inventa un código donde no hay ninguno',
    licencia.extraerCodigo('Hola, ¿cuánto cuesta el pan?') === null)

  // --- Rechaza lo que no es ---
  console.log('\nRechaza lo que no es un código:')
  es('texto vacío', !(await licencia.verificarCodigo(id, '')))
  es('solo guiones', !(await licencia.verificarCodigo(id, '----')))
  es('15 letras (falta una)', !(await licencia.verificarCodigo(id, sinGuiones.slice(0, 15))))
  es('17 letras (sobra una)', !(await licencia.verificarCodigo(id, sinGuiones + 'X')))
  es('letras inválidas (U, que no está en Crockford)', !(await licencia.verificarCodigo(id, 'UUUUUUUUUUUUUUUU')))
  es('16 letras correctas pero alteradas', !(await licencia.verificarCodigo(id, 'AAAA-AAAA-AAAA-AAAA')))

  // --- IDs con O/I/L, que el teclado pone donde no van ---
  console.log('\nNormaliza el ID que dicta la bodeguera (O→0, I/L→1):')
  // El código hay que emitirlo para el ID YA normalizado; lo que se prueba es
  // que la app normalice el ID que la persona escribe.
  const idConLetra = 'KB7ZP9QA'   // tiene B y Z: sin ambigüedad, cambia el HMAC
  const codigoDeOtro = generarConNode('KB7ZP9QA')
  es('acepta un ID distinto al que generó el código', await licencia.verificarCodigo('KB7ZP9QA', codigoDeOtro))
  // Un ID con O donde el original tiene 0: al normalizar, vuelve a ser el mismo.
  const idNormalizado = id.replace(/O/g, '0').replace(/[IL]/g, '1')
  es('el ID con O/I/L se normaliza al mismo', idNormalizado === id, `normalizado=${idNormalizado} original=${id}`)
  es('y con ese ID normalizado el código sigue valiendo', await licencia.verificarCodigo(idNormalizado, emitido))

  // --- El HMAC contra el vector de referencia ---
  // RFC 4231 Test Case 1: clave de 20 bytes (menor que el bloque de 64) y
  // datos en ASCII. Es el vector que además sirve de referencia contra
  // node:crypto sin depender de la codificación de acentos.
  console.log('\nHMAC contra node:crypto (RFC 4231 caso 1):')
  const RFC4231 = {
    key: Buffer.alloc(20, 0x0b),
    data: Buffer.from('Hi There', 'ascii'),
    esperado: 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7',
  }
  const calculado = Buffer.from(
    await licencia.hmacSha256(new Uint8Array(RFC4231.key), new Uint8Array(RFC4231.data))
  ).toString('hex')
  es('coincide con el vector RFC 4231', calculado === RFC4231.esperado,
    'obtenido ' + calculado)

  // Y un caso de clave LARGA (>64 bytes), que es lo que ejercita el
  // `if (k.length > 64) k = sha256(k)` del HMAC armado a mano. La referencia
  // es node:crypto con la misma clave, no un vector del RFC: lo que importa
  // es que las dos implementaciones coincidan, no el número del caso.
  console.log('\nHMAC con clave más larga que el bloque:')
  const larga = {
    key: Buffer.from(Array.from({ length: 131 }, (_, i) => i & 0xff)),
    data: Buffer.from('Test Using Larger Than Block-Size Key', 'ascii'),
  }
  const esperadoLarga = crypto.createHmac('sha256', larga.key)
    .update(larga.data).digest('hex')
  const calcLarga = Buffer.from(
    await licencia.hmacSha256(new Uint8Array(larga.key), new Uint8Array(larga.data))
  ).toString('hex')
  es('la app y node:crypto coinciden con clave de 131 bytes',
    calcLarga === esperadoLarga, 'app=' + calcLarga + ' node=' + esperadoLarga)

  // Y uno con acentos, que es donde el UTF-8 manual de la app podría fallar
  // (Hermes no garantiza TextEncoder; por eso está a mano).
  console.log('\nHMAC con texto acentuado (UTF-8 manual):')
  const conAcento = Buffer.from('Ñoño — contraseña', 'utf8')
  const esperadoAcento = crypto.createHmac('sha256', Buffer.alloc(20, 0x0b))
    .update(conAcento).digest('hex')
  const calcAcento = Buffer.from(
    await licencia.hmacSha256(new Uint8Array(Buffer.alloc(20, 0x0b)), new Uint8Array(conAcento))
  ).toString('hex')
  es('acentos y em-dash coinciden con node:crypto',
    calcAcento === esperadoAcento, 'app=' + calcAcento + ' node=' + esperadoAcento)

  console.log(`\n${fallos === 0 ? 'TODO OK' : 'HAY FALLOS'}: ${ok} pasaron, ${fallos} fallaron\n`)
  process.exit(fallos === 0 ? 0 : 1)
}

main()
