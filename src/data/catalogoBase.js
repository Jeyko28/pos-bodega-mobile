// Semilla de productos comunes de bodega peruana. A propósito NO tienen código
// de barras: inventar códigos EAN sería peor que no tenerlos, porque el escáner
// nunca los encontraría. El código real se engancha solo la primera vez que el
// dueño escanea ese producto en su tienda.
//
// Los precios son referencias de mostrador para que el dueño no arranque de
// cero, no verdades: varían por zona y por mes, y la pantalla obliga a
// revisarlos antes de agregar.
export const CATALOGO_BASE = [
  // ─── Bebidas ───
  { nombre: 'Inca Kola 500ml', categoria: 'Bebidas', precio: 3.0 },
  { nombre: 'Inca Kola 1.5L', categoria: 'Bebidas', precio: 7.5 },
  { nombre: 'Coca Cola 500ml', categoria: 'Bebidas', precio: 3.0 },
  { nombre: 'Coca Cola 1.5L', categoria: 'Bebidas', precio: 7.5 },
  { nombre: 'Agua San Luis 625ml', categoria: 'Bebidas', precio: 1.5 },
  { nombre: 'Agua Cielo 625ml', categoria: 'Bebidas', precio: 1.5 },
  { nombre: 'Frugos Durazno 296ml', categoria: 'Bebidas', precio: 2.0 },
  { nombre: 'Pulp Durazno 145ml', categoria: 'Bebidas', precio: 1.0 },
  { nombre: 'Sporade 500ml', categoria: 'Bebidas', precio: 3.0 },
  { nombre: 'Cerveza Pilsen 650ml', categoria: 'Bebidas', precio: 9.0 },
  { nombre: 'Cerveza Cristal 650ml', categoria: 'Bebidas', precio: 9.0 },
  { nombre: 'Cerveza Cusqueña 650ml', categoria: 'Bebidas', precio: 10.5 },
  { nombre: 'Chicha Morada Naturale 1L', categoria: 'Bebidas', precio: 4.5 },

  // ─── Abarrotes ───
  { nombre: 'Arroz Costeño', categoria: 'Abarrotes', precio: 4.5, tipo_venta: 'granel', unidad: 'kg' },
  { nombre: 'Azúcar rubia', categoria: 'Abarrotes', precio: 4.0, tipo_venta: 'granel', unidad: 'kg' },
  { nombre: 'Azúcar blanca', categoria: 'Abarrotes', precio: 4.5, tipo_venta: 'granel', unidad: 'kg' },
  { nombre: 'Lenteja', categoria: 'Abarrotes', precio: 6.0, tipo_venta: 'granel', unidad: 'kg' },
  { nombre: 'Frejol canario', categoria: 'Abarrotes', precio: 9.0, tipo_venta: 'granel', unidad: 'kg' },
  { nombre: 'Aceite Primor 1L', categoria: 'Abarrotes', precio: 11.0 },
  { nombre: 'Aceite Cocinero 1L', categoria: 'Abarrotes', precio: 10.5 },
  { nombre: 'Fideos Don Vittorio 500g', categoria: 'Abarrotes', precio: 4.0 },
  { nombre: 'Fideos Nicolini 500g', categoria: 'Abarrotes', precio: 3.8 },
  { nombre: 'Atún Florida', categoria: 'Abarrotes', precio: 5.5 },
  { nombre: 'Leche Gloria evaporada', categoria: 'Abarrotes', precio: 4.5 },
  { nombre: 'Leche Ideal evaporada', categoria: 'Abarrotes', precio: 4.3 },
  { nombre: 'Sal Marina 1kg', categoria: 'Abarrotes', precio: 2.0 },
  { nombre: 'Harina sin preparar 1kg', categoria: 'Abarrotes', precio: 4.5 },
  { nombre: 'Avena Quaker 170g', categoria: 'Abarrotes', precio: 3.0 },
  { nombre: 'Café Altomayo 50g', categoria: 'Abarrotes', precio: 7.0 },
  { nombre: 'Té Herbi 100 sobres', categoria: 'Abarrotes', precio: 6.0 },
  { nombre: 'Sillao 500ml', categoria: 'Abarrotes', precio: 5.0 },
  { nombre: 'Vinagre 500ml', categoria: 'Abarrotes', precio: 2.5 },
  { nombre: 'Mayonesa Alacena 100g', categoria: 'Abarrotes', precio: 4.5 },
  { nombre: 'Ají Tarí 100g', categoria: 'Abarrotes', precio: 4.0 },
  { nombre: 'Huevo', categoria: 'Abarrotes', precio: 9.0, tipo_venta: 'granel', unidad: 'kg' },

  // ─── Snacks ───
  { nombre: 'Sublime clásico', categoria: 'Snacks', precio: 2.0 },
  { nombre: 'Princesa', categoria: 'Snacks', precio: 2.0 },
  { nombre: 'Casino', categoria: 'Snacks', precio: 1.5 },
  { nombre: 'Margarita', categoria: 'Snacks', precio: 1.5 },
  { nombre: 'Morochas', categoria: 'Snacks', precio: 1.5 },
  { nombre: 'Oreo', categoria: 'Snacks', precio: 2.0 },
  { nombre: 'Soda San Jorge', categoria: 'Snacks', precio: 1.5 },
  { nombre: 'Vainilla Field', categoria: 'Snacks', precio: 1.5 },
  { nombre: 'Chocman', categoria: 'Snacks', precio: 1.5 },
  { nombre: 'Papas Lays clásicas', categoria: 'Snacks', precio: 3.0 },
  { nombre: 'Chizitos', categoria: 'Snacks', precio: 1.5 },
  { nombre: 'Cuates', categoria: 'Snacks', precio: 1.5 },
  { nombre: 'Doritos', categoria: 'Snacks', precio: 3.0 },
  { nombre: 'Chin Chin', categoria: 'Snacks', precio: 1.0 },
  { nombre: 'Halls', categoria: 'Snacks', precio: 1.5 },
  { nombre: 'Trident', categoria: 'Snacks', precio: 1.5 },
  { nombre: 'Chocolate Triángulo', categoria: 'Snacks', precio: 2.5 },

  // ─── Lácteos ───
  { nombre: 'Yogurt Gloria 1L', categoria: 'Lácteos', precio: 8.0 },
  { nombre: 'Yogurt Laive 1L', categoria: 'Lácteos', precio: 8.5 },
  { nombre: 'Queso fresco', categoria: 'Lácteos', precio: 22.0, tipo_venta: 'granel', unidad: 'kg' },
  { nombre: 'Mantequilla Laive 200g', categoria: 'Lácteos', precio: 8.0 },
  { nombre: 'Leche fresca Gloria 1L', categoria: 'Lácteos', precio: 5.5 },

  // ─── Panadería ───
  { nombre: 'Pan francés', categoria: 'Panadería', precio: 0.3 },
  { nombre: 'Pan de yema', categoria: 'Panadería', precio: 0.5 },
  { nombre: 'Pan integral', categoria: 'Panadería', precio: 0.5 },
  { nombre: 'Pan Bimbo grande', categoria: 'Panadería', precio: 7.5 },
  { nombre: 'Panetón Gloria 900g', categoria: 'Panadería', precio: 22.0 },

  // ─── Limpieza ───
  { nombre: 'Detergente Bolívar 780g', categoria: 'Limpieza', precio: 9.0 },
  { nombre: 'Detergente Ariel 800g', categoria: 'Limpieza', precio: 11.0 },
  { nombre: 'Detergente Sapolio 900g', categoria: 'Limpieza', precio: 8.0 },
  { nombre: 'Lejía Clorox 1L', categoria: 'Limpieza', precio: 4.5 },
  { nombre: 'Lavavajilla Ayudín 360g', categoria: 'Limpieza', precio: 5.5 },
  { nombre: 'Jabón Bolívar barra', categoria: 'Limpieza', precio: 3.0 },
  { nombre: 'Papel higiénico Elite x4', categoria: 'Limpieza', precio: 6.0 },
  { nombre: 'Papel toalla', categoria: 'Limpieza', precio: 4.5 },
  { nombre: 'Bolsas de basura x10', categoria: 'Limpieza', precio: 3.5 },
  { nombre: 'Esponja verde', categoria: 'Limpieza', precio: 2.0 },
  { nombre: 'Pinesol / desinfectante 900ml', categoria: 'Limpieza', precio: 7.0 },

  // ─── Higiene ───
  { nombre: 'Shampoo Head & Shoulders sachet', categoria: 'Higiene', precio: 1.5 },
  { nombre: 'Shampoo Pantene 400ml', categoria: 'Higiene', precio: 18.0 },
  { nombre: 'Jabón Protex', categoria: 'Higiene', precio: 3.5 },
  { nombre: 'Jabón Neko', categoria: 'Higiene', precio: 3.0 },
  { nombre: 'Pasta dental Colgate 75ml', categoria: 'Higiene', precio: 6.5 },
  { nombre: 'Cepillo dental', categoria: 'Higiene', precio: 4.0 },
  { nombre: 'Toalla higiénica Nosotras x8', categoria: 'Higiene', precio: 4.5 },
  { nombre: 'Pañal Huggies unidad', categoria: 'Higiene', precio: 1.5 },
  { nombre: 'Desodorante Rexona barra', categoria: 'Higiene', precio: 12.0 },

  // ─── Frutas y verduras ───
  { nombre: 'Papa blanca', categoria: 'Verduras', precio: 3.0, tipo_venta: 'granel', unidad: 'kg' },
  { nombre: 'Cebolla roja', categoria: 'Verduras', precio: 3.5, tipo_venta: 'granel', unidad: 'kg' },
  { nombre: 'Tomate', categoria: 'Verduras', precio: 4.0, tipo_venta: 'granel', unidad: 'kg' },
  { nombre: 'Zanahoria', categoria: 'Verduras', precio: 3.0, tipo_venta: 'granel', unidad: 'kg' },
  { nombre: 'Limón', categoria: 'Verduras', precio: 5.0, tipo_venta: 'granel', unidad: 'kg' },
  { nombre: 'Ajo', categoria: 'Verduras', precio: 12.0, tipo_venta: 'granel', unidad: 'kg' },
  { nombre: 'Plátano de seda', categoria: 'Frutas', precio: 3.5, tipo_venta: 'granel', unidad: 'kg' },
  { nombre: 'Manzana', categoria: 'Frutas', precio: 5.5, tipo_venta: 'granel', unidad: 'kg' },
  { nombre: 'Naranja', categoria: 'Frutas', precio: 3.0, tipo_venta: 'granel', unidad: 'kg' },
  { nombre: 'Palta', categoria: 'Frutas', precio: 8.0, tipo_venta: 'granel', unidad: 'kg' },

  // ─── Otros ───
  { nombre: 'Fósforos', categoria: 'Otros', precio: 1.0 },
  { nombre: 'Velas x2', categoria: 'Otros', precio: 2.0 },
  { nombre: 'Pilas AA x2', categoria: 'Otros', precio: 5.0 },
  { nombre: 'Cigarro unidad', categoria: 'Otros', precio: 1.0 },
  { nombre: 'Gas doméstico (balón 10kg)', categoria: 'Otros', precio: 48.0 },
  { nombre: 'Hielo bolsa', categoria: 'Otros', precio: 3.0 },
  { nombre: 'Recarga celular S/5', categoria: 'Otros', precio: 5.0 },
]

export const CATEGORIAS_DEL_CATALOGO = [...new Set(CATALOGO_BASE.map(p => p.categoria))]
