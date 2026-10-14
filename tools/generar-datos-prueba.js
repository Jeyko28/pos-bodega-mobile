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
      // Stock en 0, como los crea la app (ver db.js addProducto). El stock
      // llega después por ingresos registrados, no por un número puesto a
      // mano: si se inventa un stock inicial sin ingreso que lo justifique, el
      // stock derivado (Σ ingresos − Σ ventas) no lo puede reconstruir y da
      // números negativos que no existen en una bodega real.
      stock: 0,
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

  for (let i = 0; i < nVentas; i++) {
    // Día con peso hacia hoy.
    const diasAtras = Math.floor(Math.pow(r(), 1.6) * DIAS)
    const dia = DIAS - 1 - diasAtras
    const diaMs = ahora - diasAtras * msPorDia
    // Hora con pico en la mañana y la tarde, como una bodega de barrio.
    const hora = r() < 0.35 ? 7 + r() * 3 : r() < 0.75 ? 10 + r() * 5 : 16 + r() * 5
    const fecha = new Date(diaMs - (24 - hora) * 3600000).toISOString()

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
      g_id: `v_prueba${ventaId}`,
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

  // ─── Ingresos de mercadería ────────────────────────────────────────
  // El stock entra por acá, igual que en la app (el producto nace en 0).
  //
  // La cantidad no se tira a ojo: se calcula a partir de lo que realmente se
  // vendió, para que el stock derivado quede en un rango creíble — ni todos en
  // negativo, ni todos con 300 unidades. Se entra un 35% más de lo que sale,
  // que es como funciona una bodega: se repone con margen.
  const vendidoPorProducto = new Map()
  for (const dv of detalle) {
    if (dv.producto_id === null) continue
    vendidoPorProducto.set(dv.producto_id, (vendidoPorProducto.get(dv.producto_id) || 0) + dv.cantidad)
  }

  const ingresos = []
  const detalle_ingresos = []
  let ingresoId = 0
  const nIngresos = Math.max(3, Math.round(nProductos / 10))
  for (let g = 0; g < nIngresos; g++) {
    ingresoId++
    const diasAtras = Math.floor(r() * DIAS)
    ingresos.push({
      g_id: `i_prueba${ingresoId}`,
      id: ingresoId,
      fecha: new Date(ahora - diasAtras * msPorDia).toISOString(),
      usuario_id: 1,
      deshecho: 0,
    })
    // Cada ingreso cubre un grupo de productos.
    const desde = Math.floor((g / nIngresos) * nProductos)
    const hasta = Math.floor(((g + 1) / nIngresos) * nProductos)
    for (let k = desde; k < hasta && k < nProductos; k++) {
      const p = productos[k]
      const vendido = vendidoPorProducto.get(p.id) || 0
      // Se repone lo vendido + un margen, y algo de piso para que los
      // productos que casi no se venden no queden en cero (que en pantalla
      // sale como "Figura sin stock").
      const cantidad = Math.max(Math.round(vendido * 1.35 + 10 + r() * 25), 5)
      detalle_ingresos.push({
        g_id: `di_prueba${detalle_ingresos.length + 1}`,
        id: detalle_ingresos.length + 1,
        ingreso_id: ingresoId,
        producto_id: p.id,
        nombre_producto: p.nombre,
        cantidad,
      })
    }
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

  // El stock que se guarda en cada producto es el derivado del historial, que
  // es el mismo cálculo que hace src/data/stock.js. Se calcula acá para que
  // el JSON quede coherente: si el stock guardado no se corresponde con los
  // ingresos y las ventas, las pruebas del stock derivado dan números raros.
  const entradasPorProducto = new Map()
  for (const di of detalle_ingresos) {
    entradasPorProducto.set(di.producto_id, (entradasPorProducto.get(di.producto_id) || 0) + di.cantidad)
  }
  const salidasPorProducto = new Map()
  for (const dv of detalle) {
    if (dv.producto_id === null) continue
    salidasPorProducto.set(dv.producto_id, (salidasPorProducto.get(dv.producto_id) || 0) + dv.cantidad)
  }
  for (const p of productos) {
    const stock = (entradasPorProducto.get(p.id) || 0) - (salidasPorProducto.get(p.id) || 0)
    p.stock = Math.round(stock * 1000) / 1000
  }

  const salida = {
    productos,
    ventas,
    detalle_ventas: detalle,
    ingresos,
    detalle_ingresos,
    usuarios: [{ id: 1, nombre: 'Dueño', username: 'admin', rol: 'admin', activo: 1, creado_en: new Date(ahora - DIAS * msPorDia).toISOString() }],
    clientes,
    fiado,
    pagos_fiado: pagos,
    categorias_custom: CATEGORIAS.slice(0, 3).map((c, i) => ({ id: c.toLowerCase(), icon: ['📦', '🧃', '🍞'][i] })),
    // `negocio_nombre` va porque es lo primero que ve quien recupera una
    // bodega: "Bodega El Buen Precio" o "Mi bodega". Sin esto la pantalla de
    // confirmación no puede decir de qué bodega se trata.
    config: {
      negocio_nombre: 'Bodega El Buen Precio',
      umbral_stock_bajo: 5,
      respaldo_frecuencia: 'diario',
    },
    setup_completado: true,
  }

  const pendientes = fiado.filter(f => f.estado === 'pendiente').length
  const negativos = productos.filter(p => p.stock < 0).length
  process.stderr.write(
    `Generado: ${productos.length} productos · ${ventas.length} ventas · ${detalle.length} líneas de detalle\n` +
    `          ${ingresos.length} ingresos · ${detalle_ingresos.length} líneas de ingreso\n` +
    `          ${clientes.length} clientes · ${fiado.length} fiados (${pendientes} pendientes) · ${pagos.length} abonos\n`
  )
  process.stderr.write(
    `Stock derivado: ${negativos} productos en negativo (faltan por ingresar), ` +
    `${productos.filter(p => p.stock <= 5).length} en stock bajo\n`
  )
  process.stderr.write(`Promedio ${(detalle.length / ventas.length).toFixed(1)} productos por venta\n`)
  console.log(JSON.stringify(salida))
}

main()
