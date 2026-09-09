import { Linking, Alert } from 'react-native'

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

// El tono es deliberado: directo pero sin acusar. Un mensaje demasiado suave
// ("cuando pueda, sin apuro") no cobra nada, y uno agresivo le cuesta al
// bodeguero un cliente del barrio. La deuda y los días van como dato, no como
// reproche, y se cierra con una pregunta concreta y la puerta abierta.
export function armarMensajeCobranza({ cliente, deuda, diasMasAntiguo, negocio }) {
  const antiguedad = diasMasAntiguo > 0 ? ` (la más antigua es de hace ${diasMasAntiguo} días)` : ''
  return `Hola ${cliente.nombre}, buenas. Le escribo de ${negocio || 'la bodega'} por su cuenta pendiente de ${fmt(deuda)}${antiguedad}. ` +
    '¿Puede acercarse a cancelar en estos días? Si necesita coordinar algo, me avisa. Gracias.'
}

// El enlace wa.me funciona tenga o no la app instalada (cae a WhatsApp Web),
// así que no hace falta detectar nada.
export async function abrirWhatsApp({ telefono, mensaje }) {
  const numero = aFormatoWhatsApp(telefono)
  if (!numero) {
    Alert.alert('Sin teléfono', 'Este cliente no tiene un número guardado. Agrégalo para poder escribirle.')
    return false
  }
  const url = `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`
  try {
    await Linking.openURL(url)
    return true
  } catch (e) {
    Alert.alert('No se pudo abrir WhatsApp', 'Revisa que el número sea correcto.')
    return false
  }
}
