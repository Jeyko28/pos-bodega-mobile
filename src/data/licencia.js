// Licencia de pago único con activación 100% offline.
//
// Modelo: 30 días gratis desde la instalación. Avisos la última semana.
// Al día 31 se bloquea SOLO la venta (el resto —productos, clientes, fiados,
// historial, respaldos— sigue abierto: los datos nunca son rehenes).
// La activación es un código de 16 letras que el vendedor entrega por
// WhatsApp y que solo sirve en la instalación que lo pidió.
//
// Sin servidor no hay verdad absoluta: esto frena al usuario honesto y al
// curioso, no a quien desarme el APK (ver README "Licencia").
import * as Crypto from 'expo-crypto'

export const DIAS_PRUEBA = 30
// Últimos días de prueba en que el POS muestra el aviso ámbar.
export const AVISO_PRUEBA_DESDE = 7
// WhatsApp del vendedor: solo se usa para armar el enlace wa.me,
// el número nunca se muestra en pantalla.
export const WS_VENTAS = '51981487284'
// Secreto HMAC-SHA256 (32 bytes en hex). Vive acá para verificar offline y
// en tools/generar-codigo.js para firmar. Si se regenera, hay que compilar
// un APK nuevo y todos los códigos viejos dejan de servir.
const SECRETO_LICENCIA_HEX = '3233e3b9fe80259bf182770681e904a6ca969774c0f2a7e3064be47cf88663b2'

// Crockford Base32: sin I, L, O ni U para que no se confundan al dictar.
// La entrada igual se normaliza (O→0, I/L→1) por si la bodeguera las tipea.
const ALFABETO_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function normalizarCodigo(codigo) {
  return String(codigo || '')
    .toUpperCase()
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/[^0-9A-Z]/g, '')
}

// Saca un código válido de cualquier texto (ej: lo copiado del WhatsApp
// con espacios o guiones de más). Devuelve null si no hay 16 letras.
export function extraerCodigo(texto) {
  const limpio = normalizarCodigo(texto)
  return limpio.length === 16 ? limpio : null
}

// UTF-8 manual: Hermes no garantiza TextEncoder y el ID/código son ASCII,
// pero el secreto y los mensajes pueden no serlo.
function aBytesUtf8(texto) {
  const s = String(texto)
  const bytes = []
  for (let i = 0; i < s.length; i++) {
    let cp = s.charCodeAt(i)
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < s.length) {
      const low = s.charCodeAt(i + 1)
      if (low >= 0xdc00 && low <= 0xdfff) {
        cp = 0x10000 + ((cp - 0xd800) << 10) + (low - 0xdc00)
        i++
      }
    }
    if (cp < 0x80) bytes.push(cp)
    else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f))
    else if (cp < 0x10000) bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f))
    else bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f))
  }
  return Uint8Array.from(bytes)
}

function hexABbytes(hex) {
  const limpio = String(hex).replace(/[^0-9a-fA-F]/g, '')
  const out = new Uint8Array(limpio.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(limpio.slice(i * 2, i * 2 + 2), 16)
  return out
}

function concatenar(a, b) {
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}

async function sha256Bytes(datos) {
  const buf = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, datos)
  return new Uint8Array(buf)
}

// HMAC-SHA256 armado a mano porque expo-crypto no trae HMAC.
// Idéntico al de node:crypto (verificado con vectores RFC 4231 en README).
export async function hmacSha256(llaveBytes, mensajeBytes) {
  let k = llaveBytes
  if (k.length > 64) k = await sha256Bytes(k)
  const base = new Uint8Array(64)
  base.set(k.slice(0, 64))
  const ipad = base.map(b => b ^ 0x36)
  const opad = base.map(b => b ^ 0x5c)
  const interno = await sha256Bytes(concatenar(ipad, mensajeBytes))
  return sha256Bytes(concatenar(opad, interno))
}

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

// ID de instalación: 5 bytes aleatorios → 8 letras. No es secreto,
// solo identifica el teléfono para atarle su código.
export function generarIdInstalacion() {
  return codificarBase32(Crypto.getRandomBytes(5))
}

function formatearCodigo(grupos16) {
  return `${grupos16.slice(0, 4)}-${grupos16.slice(4, 8)}-${grupos16.slice(8, 12)}-${grupos16.slice(12, 16)}`
}

// El código son los primeros 80 bits del HMAC(secreto, idInstalación).
export async function generarCodigoPara(idInstalacion) {
  const mac = await hmacSha256(hexABbytes(SECRETO_LICENCIA_HEX), aBytesUtf8(`pos-bodega:${String(idInstalacion).toUpperCase()}`))
  return formatearCodigo(codificarBase32(mac.slice(0, 10)))
}

export async function verificarCodigo(idInstalacion, codigo) {
  const limpio = normalizarCodigo(codigo)
  if (limpio.length !== 16 || !idInstalacion) return false
  const esperado = normalizarCodigo(await generarCodigoPara(idInstalacion))
  let dif = 0
  for (let i = 0; i < 16; i++) dif |= limpio.charCodeAt(i) ^ esperado.charCodeAt(i)
  return dif === 0
}

export function mensajePedirCodigo({ instalacionId, negocio }) {
  return `Hola, buenas. Soy de ${negocio || 'mi bodega'} y quiero activar mi POS Bodega (pago único). Mi código de instalación es ${instalacionId}.`
}

export function mensajeSoporte({ negocio }) {
  return `Hola, buenas. Necesito ayuda con el POS Bodega${negocio ? ` (${negocio})` : ''}.`
}
