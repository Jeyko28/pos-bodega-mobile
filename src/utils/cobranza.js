import { Linking } from 'react-native'

const fmt = (n) => `S/ ${Number(n).toFixed(2)}`

// Los teléfonos se guardan como el dueño los escriba ("999 888 777", "+51 999...").
// WhatsApp necesita solo dígitos con código de país, así que se limpia acá.
// Perú: 9 dígitos que empiezan en 9 → se les antepone 51.
function aFormatoWhatsApp(telefono) {
  const digitos = String(telefono || '').replace(/\D/g, '')
  if (!digitos) return null
  if (digitos.length === 9 && digitos.startsWith('9')) return `51${digitos}`
  return digitos
}

// Se usa solo el primer nombre: en la libreta la gente queda anotada como
// "Marco el de la esquina" o "Chino casero", y mandar eso textual es un papelón.
function primerNombre(nombre) {
  return String(nombre || '').trim().split(/\s+/)[0] || 'vecino'
}

// El tono es de bodega, no de banco: "lo de la libreta" en vez de "cuenta
// pendiente". No se menciona hace cuántos días debe — eso se lee como
// echárselo en cara. Lo que sí va es el número de Yape y la opción de abonar
// por partes: el sentido de escribir por WhatsApp es que pague sin moverse, y
// pidiendo el total completo mucha gente no contesta.
export function armarMensajeCobranza({ cliente, deuda, negocio, yape }) {
  const partes = [
    `Hola ${primerNombre(cliente.nombre)}, buenas.`,
    `Le escribo de ${negocio || 'la bodega'}.`,
    `Le quedan ${fmt(deuda)} de la libreta.`,
    '¿Me lo puede ir abonando?',
  ]
  if (yape) partes.push(`Si le queda más fácil me yapea al ${yape}, aunque sea una parte.`)
  partes.push('Cualquier cosa me avisa. Gracias.')
  return partes.join(' ')
}

// El enlace wa.me funciona tenga o no la app instalada (cae a WhatsApp Web),
// así que no hace falta detectar nada.
// Para llamar se usa formato internacional (+51...): el marcador lo muestra
// con sus adornos (paréntesis, guiones) pero el número va completo y vale
// igual en roaming. Misma regla Perú que WhatsApp.
export function aFormatoLlamada(telefono) {
  const digitos = String(telefono || '').replace(/\D/g, '')
  if (!digitos) return null
  if (digitos.length === 9 && digitos.startsWith('9')) return `+51${digitos}`
  if (digitos.length === 11 && digitos.startsWith('51')) return `+${digitos}`
  return digitos.startsWith('+') ? digitos : `+${digitos}`
}
export async function abrirWhatsApp({ telefono, mensaje }) {
  // Devuelve el resultado en vez de mostrar popups: cada pantalla muestra
  // sus avisos con su propio estilo (AvisoHoja).
  const numero = aFormatoWhatsApp(telefono)
  if (!numero) {
    return { ok: false, error: 'Este cliente no tiene un número guardado. Agrégalo para poder escribirle.' }
  }
  const url = `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`
  try {
    await Linking.openURL(url)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: 'No se pudo abrir WhatsApp. Revisa que el número sea correcto.' }
  }
}
