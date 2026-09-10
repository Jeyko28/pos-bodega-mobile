// Generador de códigos de activación — SOLO EL VENDEDOR.
// La bodeguera te manda su "código de instalación" (8 letras) por WhatsApp
// y tú le devuelves el "código de activación" (16 letras) por el mismo medio.
//
// Uso:  node tools/generar-codigo.js <ID_INSTALACION>
// Ej:   node tools/generar-codigo.js K7M2P9QA
//
// El secreto DEBE ser idéntico al de src/data/licencia.js (SECRETO_LICENCIA_HEX).
// Si lo cambias, compila un APK nuevo y todos los códigos viejos mueren.
const crypto = require('crypto')

const SECRETO_LICENCIA_HEX = '3233e3b9fe80259bf182770681e904a6ca969774c0f2a7e3064be47cf88663b2'
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
  console.error('Uso: node tools/generar-codigo.js <ID de 8 letras, ej: K7M2P9QA>')
  process.exit(1)
}

const mac = crypto.createHmac('sha256', Buffer.from(SECRETO_LICENCIA_HEX, 'hex'))
  .update(`pos-bodega:${id}`, 'utf8')
  .digest()
const crudo = codificarBase32(mac.slice(0, 10))
console.log(`${crudo.slice(0, 4)}-${crudo.slice(4, 8)}-${crudo.slice(8, 12)}-${crudo.slice(12, 16)}`)
