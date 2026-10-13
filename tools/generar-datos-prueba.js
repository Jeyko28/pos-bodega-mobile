// Generador de datos de prueba.
//
// Produce un JSON con el mismo formato que produce `db.getBackupJSON()`, para
// poder restaurar con la misma pantalla de "Restaurar respaldo" que usa la
// app. Sirve para dos cosas:
//
//   1. Probar con el volumen que tiene una bodega de verdad al cabo de un año:
//      500 productos y 20.000 ventas. Es donde aparecen los cuellos de botella
//      que no se ven con diez productos de prueba.
//   2. Operar la app como si fuera un mostrador real, sin tener que teclear mil
//      ventas a mano.
//
// Uso:
//   node tools/generar-datos-prueba.js [productos] [ventas] [clientes]
//   node tools/generar-datos-prueba.js 500 20000 60 > datos-prueba.json
//
// No se importa desde la app a propósito: es una herramienta de desarrollo y no
// debe acabar dentro del APK.

const NOMBRES_BASE = [
  'Inca Kola 500ml', 'Coca Cola 500ml', 'Agua San Luis 625ml', 'Frugos Durazno 296ml',
  'Pulp Duruzno 145ml', 'Sporade 500ml', 'Cerveza Pilsen 650ml', 'Cerveza Cristal 650ml',
  'Chicha Morada 1L', 'Arroz Costeño', 'Azúcar rubia', 'Lenteja', 'Frejol canario',
  'Aceite Primor 1L', 'Aceite Cocinero 1L', 'Fideos Don Vittorio 500g', 'Atún Florida',
  'Leche Gloria evaporada', 'Leche Ideal evaporada', 'Sal Marina 1kg', 'Harina sin preparar 1kg',
  'Avena Quaker 170g', 'Café Altomayo 50g', 'Té Herbi 100 sobres', 'Sillao 500ml',
  'Vinagre 500ml', 'Mayonesa Alacena 100g', 'Ají Amarillomolido', 'Pan Tajado', 'Pan French',
  'Leche evaporated La Lechera', 'Yogurt Yami 1L', 'Mantequilla La Victoria', 'Huevos 30u',
  'Pollo entero kg', 'Carne molida kg', 'Bistec kg', 'Chuleta de cerdo kg', 'Pescado tilapia kg',
  'Papa amarilla kg', 'Cebolla roja kg', 'Tomate italiano kg', 'Zanahoria kg', 'Limón kg',
  'Plátano kg', 'Manzana kg', 'Naranja kg', 'Aguacate kg', 'Arveja kg',
  'Papa roja kg', 'Camote kg', 'Ajo molido', 'Pimienta molida', 'Comino molido',
  'Gaseosa 1.5L', 'Café instantáneo Nescafé', 'Galeta Oreo', 'Galleta soda', 'Chocolate Sublime',
  'Chocolates Halls', 'Turrón de maní', 'Bombo Familiar', 'Toalla Higiénica', 'Papel Higiénico',
  'Jabón Liquido Dettol', 'Leja', 'Fósforo', 'Vela', 'Pilas AAA',
  'Cerveza Brahma 650ml', 'Red Bull 250ml', 'Agua Cielo 1.5L', 'Sprite 500ml', 'Fanta 500ml',
  'Atún Open Ocean', 'Pasta spaghetti Don Vittorio', 'Harina Nevada', 'Salsa huacatay',
  'Café molido Altomayo 250g', 'Caramelo Melted', 'Bebida energizante Volt',
]

const CATEGORIAS = ['Bebidas', 'Abarrotes', 'Panadería', 'Carnes', 'Frutas y verduras', 'Limpieza', 'Galletas', 'Aseo']

const CLIENTES = [
  'María Quispe', 'Juan Vargas', 'Rosa Huamán', 'Pedro Sánchez', 'Ana Flores',
  'Luis Mamani', 'Carmen Tito', 'Jorge Ortiz', 'Rosa Paredes', 'Carlos Ramos',
  'Elena Chávez', 'Jorge Ccahuana', 'Sofía Ayme', 'Manuel Rojas', 'Lucía Yupanqui',
  'Carlos Condori', 'Verónica Pilco', 'Franklin Gutiérrez', 'Milagros Huanca', 'Édgar Alarcón',
]

// PRNG con semilla: el mismo comando da siempre el mismo archivo, así una
// medición se puede repetir y comparar.
function prng(semilla) {
  let s = semilla >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

function main() {
  const nProductos = parseInt(process.argv[2] || '500', 10)
  const nVentas = parseInt(process.argv[3] || '20000', 10)
  const nClientes = parseInt(process.argv[4] || '60', 10)
  const r = prng(20260912)

  const ahora = Date.now()
  const DIAS = 365
  const msPorDia = 86400000

  // ─── Productos ────────────────────────────────────────────────────
  const usados = new Set()
  const productos = []
  for (let i = 0; i < nProductos; i++) {
    let nombre = NOMBRES_BASE[i % NOMBRES_BASE.length]
    // Con más productos que nombres en la semilla, se variations el nombre
    // para que no queden 500 filas idénticas en la pantalla.
    const repeticiones = Math.floor(i / NOMBRES_BASE.length)
    if (repeticiones > 0) nombre = `${nombre} ${repeticiones + 1}`
    while (usados.has(nombre)) nombre += ' '
    usados.add(nombre)

    const categoria = CATEGORIAS[i % CATEGORIAS.length]
    const granel = categoria === 'Frutas y verduras' || categoria === 'Carnes'
    // El costo va entre el 55% y el 75% del precio: una bodega gana poco por
    // producto y mucho por volumen.
    const precio = Math.round((1 + r() * 14) * 100) / 100
    const costo = Math.round(precio * (0.55 + r() * 0.2) * 100) / 100

    productos.push({
      id: i + 1,
      nombre,
      categoria,
      precio,
      costo,
      // El stock se deja a veces negativo a propósito: es lo que pasa en la
      // realidad y hay que verlo en pantalla.
      stock: Math.round(r() * 120) - 15,
      codigo: usados.size % 3 === 0 ? `775${String(1000000 + i * 7)}` : null,
      tipo_venta: granel ? 'granel' : 'unidad',
      unidad: granel ? 'kg' : 'unidad',
      activo: 1,
      creado_en: new Date(ahora - DIAS * msPorDia + r() * DIAS * msPorDia).toISOString(),
    })
  }

  // ─── Clientes ─────────────────────────────────────────────────────
  const clientes = []
  for (let i = 0; i < nClientes; i++) {
    const base = CLIENTES[i % CLIENTES.length]
    const sufijo = Math.floor(i / CLIENTES.length)
    clientes.push({
      id: i + 1,
      nombre: sufijo ? `${base} ${sufijo + 1}` : base,
      telefono: `9${String(10000000 + Math.floor(r() * 89999999))}`,
      referencia: i % 5 === 0 ? 'Casa' : null,
      dni_ruc: null,
      // La mayoría.Created en los últimos meses: es una bodega que está creciendo.
      creado_en: new Date(ahora - Math.floor(r() * 300) * msPorDia).toISOString(),
    })
  }

  // ─── Ventas ───────────────────────────────────────────────────────
  // Se reparten en 365 días con más peso en los días recientes: una bodega
  // abierta hace poco tiene más historial reciente que viejo.
  const ventas = []
  const detalle = []
  let ventaId = 0
  const porDia = new Array(DIAS).fill(0)

  for (let i = 0; i < nVentas; i++) {
    // Día con peso hacia hoy.
    const diasAtras = Math.floor(Math.pow(r(), 1.6) * DIAS)
    const dia = DIAS - 1 - diasAtras
    const diaMs = ahora - diasAtras * msPorDia
    // Hora con pico en la mañana y la tarde, como una bodega de barrio.
    const hora = r() < 0.35 ? 7 + r() * 3 : r() < 0.75 ? 10 + r() * 5 : 16 + r() * 5
    const fecha = new Date(diaMs - (24 - hora) * 3600000).toISOString()
    porDia[dia]++

    ventaId++
    const esFiado = r() < 0.12
    const metodo = esFiado ? 'Fiado' : ['Efectivo', 'Efectivo', 'Efectivo', 'Yape', 'Plin'][Math.floor(r() * 5)]
    const cliente = esFiado ? clientes[Math.floor(r() * clientes.length)] : null

    // Entre 1 y 8 productos por venta.
    const nItems = 1 + Math.floor(r() * 8)
    const usadosEnVenta = new Set()
    let subtotal = 0
    const lineas = []
    for (let k = 0; k < nItems; k++) {
      const p = productos[Math.floor(r() * productos.length)]
      if (usadosEnVenta.has(p.id)) continue
      usadosEnVenta.add(p.id)
      const cantidad = p.tipo_venta === 'granel'
        ? Math.round((0.5 + r() * 4) * 100) / 100
        : 1 + Math.floor(r() * 4)
      const sub = Math.round(p.precio * cantidad * 100) / 100
      subtotal += sub
      lineas.push({
        venta_id: ventaId,
        producto_id: p.id,
        nombre_producto: p.nombre,
        precio_unitario: p.precio,
        cantidad,
        subtotal: sub,
        tipo_venta: p.tipo_venta,
        unidad: p.unidad,
        // El costo se congela con la venta: es lo que la app hace en realidad.
        costo_unitario: p.costo,
      })
    }
    if (!lineas.length) continue

    const descuento = r() < 0.08 ? Math.round(subtotal * 0.1 * 100) / 100 : 0
    const total = Math.round((subtotal - descuento) * 100) / 100
    const montoRecibido = metodo === 'Efectivo' ? Math.ceil(total / 10) * 10 : total

    ventas.push({
      id: ventaId,
      total,
      subtotal_bruto: subtotal,
      descuento,
      tipo_descuento: descuento ? 'monto' : 'ninguno',
      monto_recibido: montoRecibido,
      vuelto: metodo === 'Efectivo' ? Math.round((montoRecibido - total) * 100) / 100 : 0,
      metodo_pago: metodo,
      usuario_id: 1,
      cliente_id: cliente ? cliente.id : null,
      es_fiado: esFiado ? 1 : 0,
      comprador_nombre: cliente ? cliente.nombre : (r() < 0.1 ? CLIENTES[Math.floor(r() * CLIENTES.length)] : null),
      comprador_dni_ruc: null,
      fecha,
      anulada: 0,
    })
    detalle.push(...lineas)
  }

  // ─── Fiado y abonos ───────────────────────────────────────────────
  // El fiado sale de las ventas marcadas como tales. Las columnas son las que
  // espera `restaurarBackup`: `monto_original` y `saldo` van separadas porque
  // un abono parcial baja el saldo sin tocar lo que se教版 prestó. Un 60% de
  // los fiados queda pendiente; el resto se salda total o parcialmente.
  const fiado = []
  const pagos = []
  let fiadoId = 0
  for (const v of ventas) {
    if (!v.es_fiado) continue
    fiadoId++
    const pagado = r() < 0.6
    const abono = pagado
      ? (r() < 0.5 ? v.total : Math.round(v.total * (0.3 + r() * 0.5) * 100) / 100)
      : 0
    const saldo = Math.round((v.total - abono) * 100) / 100

    fiado.push({
      id: fiadoId,
      cliente_id: v.cliente_id,
      monto_original: v.total,
      saldo,
      concepto: 'Venta a crédito',
      usuario_id: 1,
      // `pendiente` con saldo > 0 y `pagado` con saldo 0: es lo que decide qué
      // muestra la pantalla de Clientes.
      estado: saldo > 0 ? 'pendiente' : 'pagado',
      venta_id: v.id,
      fecha: v.fecha,
    })

    if (abono > 0) {
      pagos.push({
        id: fiadoId,
        fiado_id: fiadoId,
        monto: abono,
        metodo_pago: ['Efectivo', 'Yape', 'Plin'][Math.floor(r() * 3)],
        usuario_id: 1,
        anulado: 0,
        fecha: new Date(new Date(v.fecha).getTime() + (1 + Math.floor(r() * 20)) * msPorDia).toISOString(),
      })
    }
  }

  const salida = {
    productos,
    ventas,
    detalle_ventas: detalle,
    usuarios: [{ id: 1, nombre: 'Dueño', username: 'admin', rol: 'admin', activo: 1, creado_en: new Date(ahora - DIAS * msPorDia).toISOString() }],
    clientes,
    fiado,
    pagos_fiado: pagos,
    categorias_custom: CATEGORIAS.slice(0, 3).map((c, i) => ({ id: c.toLowerCase(), icon: ['📦', '🧃', '🍞'][i] })),
    config: { umbral_stock_bajo: 5, respaldo_frecuencia: 'diario' },
    setup_completado: true,
  }

  const pendientes = fiado.filter(f => f.estado === 'pendiente').length
  process.stderr.write(
    `Generado: ${productos.length} productos · ${ventas.length} ventas · ${detalle.length} líneas de detalle · ` +
    `${clientes.length} clientes · ${fiado.length} fiados (${pendientes} pendientes) · ${pagos.length} abonos\n`
  )
  process.stderr.write(`Promedio ${(detalle.length / ventas.length).toFixed(1)} productos por venta\n`)
  console.log(JSON.stringify(salida))
}

main()
