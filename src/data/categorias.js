export const CATEGORIAS_BASE = [
  { id: 'Abarrotes', icon: '🌾' }, { id: 'Bebidas', icon: '🥤' }, { id: 'Snacks', icon: '🍿' },
  { id: 'Panadería', icon: '🍞' }, { id: 'Lácteos', icon: '🥛' }, { id: 'Limpieza', icon: '🧹' },
  { id: 'Higiene', icon: '🧴' }, { id: 'Frutas', icon: '🍎' }, { id: 'Verduras', icon: '🥦' },
  { id: 'Otros', icon: '📦' },
]

export function iconoCategoria(categoria, custom = []) {
  return [...CATEGORIAS_BASE, ...custom].find(c => c.id === categoria)?.icon || '📦'
}
