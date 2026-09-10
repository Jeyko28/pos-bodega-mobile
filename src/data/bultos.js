// Presentaciones del mayorista: cómo llega el bulto del proveedor.
// Leche Gloria UHT x12, tarro x24/x48, aceite x12, azúcar x15,
// gaseosa/agua 1.5L x6, arroz en saco de ~50kg (datos de distribuidoras
// peruanas). La venta siempre es por unidad; el bulto solo existe al comprar.
export const PRESETS_BULTO = [
  { nombre: 'caja', unidades: 12 },
  { nombre: 'caja', unidades: 20 },
  { nombre: 'caja', unidades: 24 },
  { nombre: 'six-pack', unidades: 6 },
  { nombre: 'paquete', unidades: 6 },
  { nombre: 'paquete', unidades: 10 },
  { nombre: 'fardo', unidades: 12 },
  { nombre: 'saco', unidades: 50 },
]

// Sugerencia inicial según categoría (se puede cambiar con un toque).
// Solo donde el mayorista es consistente; en el resto se elige a mano.
const SUGERENCIA_POR_CATEGORIA = {
  'Lácteos': { nombre: 'caja', unidades: 12 },
  'Bebidas': { nombre: 'six-pack', unidades: 6 },
  'Snacks': { nombre: 'paquete', unidades: 10 },
}

export function sugerirBulto(categoria) {
  return SUGERENCIA_POR_CATEGORIA[categoria] || null
}

// Tercer fragmento del secreto de licencias (ver src/data/licencia.js).
export const FRAG_LIC_3 = '8c05a76475726a87b50042'

// Convierte lo tipeado en unidades reales de stock y costo unitario.
// 2 cajas de 12 a S/ 68 → { unidades: 24, costoUnitario: 5.67 }
export function resolverBulto({ bultos, bultoUnidades, costoBulto }) {
  const n = parseFloat(bultos)
  const u = parseInt(bultoUnidades)
  if (!(n > 0) || !(u > 0)) return null
  const costo = parseFloat(costoBulto)
  return {
    unidades: n * u,
    costoUnitario: costo > 0 ? Math.round((costo / u) * 100) / 100 : null,
  }
}
