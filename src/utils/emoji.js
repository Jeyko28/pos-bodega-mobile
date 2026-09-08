// Sugiere un emoji para una categoría nueva según palabras clave comunes
// en bodegas peruanas. Si no coincide con nada, usa un ícono genérico.

const PALABRAS_CLAVE = [
  { emoji: '🧂', palabras: ['especia', 'condimento', 'sazonador', 'aji', 'ají'] },
  { emoji: '🥩', palabras: ['carne', 'res', 'chancho', 'cerdo'] },
  { emoji: '🍗', palabras: ['pollo', 'ave'] },
  { emoji: '🐟', palabras: ['pescado', 'marisco', 'mariscos'] },
  { emoji: '🐾', palabras: ['mascota', 'perro', 'gato', 'canino', 'felino'] },
  { emoji: '🍼', palabras: ['bebe', 'bebé', 'pañal', 'panal', 'infantil'] },
  { emoji: '🔧', palabras: ['ferreteria', 'ferretería', 'herramienta', 'tornillo'] },
  { emoji: '📝', palabras: ['papeleria', 'papelería', 'utiles', 'útiles', 'cuaderno', 'oficina'] },
  { emoji: '🔋', palabras: ['electronica', 'electrónica', 'pila', 'bateria', 'batería', 'cargador'] },
  { emoji: '🧸', palabras: ['juguete', 'juguetería', 'jugueteria'] },
  { emoji: '🍷', palabras: ['licor', 'cerveza', 'vino', 'alcohol', 'whisky', 'ron'] },
  { emoji: '🧊', palabras: ['congelado'] },
  { emoji: '🍦', palabras: ['helado', 'heladeria', 'heladería'] },
  { emoji: '🚬', palabras: ['cigarro', 'tabaco'] },
  { emoji: '💊', palabras: ['medicina', 'farmacia', 'salud', 'pastilla'] },
  { emoji: '🥚', palabras: ['huevo'] },
  { emoji: '🍬', palabras: ['dulce', 'caramelo', 'golosina', 'chocolate'] },
  { emoji: '🧀', palabras: ['queso'] },
  { emoji: '💧', palabras: ['agua', 'bebida hidratante'] },
  { emoji: '👕', palabras: ['ropa', 'vestimenta', 'prenda'] },
  { emoji: '🍰', palabras: ['postre', 'reposteria', 'repostería', 'torta', 'pastel'] },
  { emoji: '🌿', palabras: ['hierba', 'aromatica', 'aromática', 'infusion', 'infusión'] },
]

export function sugerirEmoji(nombre) {
  const texto = (nombre || '').toLowerCase().trim()
  if (!texto) return '🏷️'
  for (const grupo of PALABRAS_CLAVE) {
    for (const palabra of grupo.palabras) {
      if (texto.includes(palabra)) return grupo.emoji
    }
  }
  return '🏷️'
}
