// Generador de códigos — SOLO EL VENDEDOR.
// La bodeguera te manda su "código de instalación" (8 letras) por WhatsApp
// y tú le devuelves el "código de activación" (16 letras) por el mismo medio.
//
// Uso:  node tools/generar-codigo.js <ID_INSTALACION> ["Nombre del negocio"] [reset]
// Ej:   node tools/generar-codigo.js K7M2P9QA "Bodega El Buen Precio"
//       node tools/generar-codigo.js K7M2P9QA "Bodega El Buen Precio" reset
// Con "reset" genera código de recupero de contraseña en vez de activación
// (no se pueden intercambiar: firman mensajes distintos).
//
// El secreto DEBE ser idéntico al que arma src/data/licencia.js
// (FRAG_LIC_1 + FRAG_LIC_2 + FRAG_LIC_3). Si lo cambias, compila un APK nuevo
// y todos los códigos viejos mueren.
// Cada emisión queda anotada en tools/registro-codigos.jsonl: es tu control
// de a quién le vendiste y cuándo (un ID con dos negocios distintos = código
// prestado dando vueltas).
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const SECRETO_LICENCIA_HEX = 'b88a2ebec55667b87eb0b5266607c75acb05330ccf8c05a76475726a87b50042'
const ALFABETO_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function codificarBase32(bytes) {
  let bits = 0
  let valor = 0
  let texto = ''
  bytes.forEach(b => {
    valor = (valor << 8) | b
    bits += 8
    while (bits >= 5) {
      bits -= 5
      texto += ALFABETO_BASE32[(valor >> bits) & 31]
    }
  })
  if (bits > 0) texto += ALFABETO_BASE32[(valor << (5 - bits)) & 31]
  return texto
}

const id = String(process.argv[2] || '').toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1')
if (!/^[0-9A-Z]{8}$/.test(id)) {
  console.error('Uso: node tools/generar-codigo.js <ID de 8 letras, ej: K7M2P9QA> ["Negocio"] [reset]')
  process.exit(1)
}

const esReset = String(process.argv[process.argv.length - 1] || '').toLowerCase() === 'reset'
const negocio = (() => {
  const resto = process.argv.slice(3, esReset ? -1 : undefined).join(' ').trim()
  return resto || null
})()
const mensaje = esReset ? `pos-bodega-reset:${id}` : `pos-bodega:${id}`
const mac = crypto.createHmac('sha256', Buffer.from(SECRETO_LICENCIA_HEX, 'hex'))
  .update(mensaje, 'utf8')
  .digest()
const crudo = codificarBase32(mac.slice(0, 10))
const codigo = `${crudo.slice(0, 4)}-${crudo.slice(4, 8)}-${crudo.slice(8, 12)}-${crudo.slice(12, 16)}`
console.log(codigo)

const registro = path.join(__dirname, 'registro-codigos.jsonl')
fs.appendFileSync(registro, JSON.stringify({
  fecha: new Date().toISOString(),
  tipo: esReset ? 'reset' : 'activacion',
  instalacion: id,
  negocio,
  codigo,
}) + '\n')
