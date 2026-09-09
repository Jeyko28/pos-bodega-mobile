// Buscar "platano" tiene que encontrar "Plátano". Nadie escribe tildes con la
// cola esperando, y menos en un teclado de celular.
//
// No se usa String.prototype.normalize('NFD') a propósito: Hermes no lo soporta
// de forma consistente entre versiones y fallaría en silencio justo en el
// dispositivo del cliente. Con un mapa explícito basta — el español solo tiene
// estas vocales acentuadas más la ñ y la diéresis.
const SIN_TILDE = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n' }

export function normalizar(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .replace(/[áéíóúüñ]/g, c => SIN_TILDE[c])
    .trim()
}

// Búsqueda parcial insensible a mayúsculas y tildes.
export function coincide(texto, busqueda) {
  const q = normalizar(busqueda)
  return !q || normalizar(texto).includes(q)
}

// Comparación exacta, para detectar duplicados ("Plátano" y "platano" son el
// mismo producto y no deberían convivir en el catálogo).
export function esElMismo(a, b) {
  return normalizar(a) === normalizar(b)
}
