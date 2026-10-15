// Fusión de datos que vienen de otro dispositivo.
//
// ─── La regla ───────────────────────────────────────────────────────
//
// Cada venta, abono, ingreso y fiado trae un `g_id` único en el mundo
// (ver generarGId en db.js). La fusión entera se apoya en una línea:
//
//     si ya tengo esa g_id → es la misma, la ignoro
//     si no → es nueva, la sumo
//
// Dos ventas distintas nunca comparten g_id, así que **no hay conflicto
// posible y no se puede perder una venta**. El `id` local (autoincrement)
// NO sirve para esto: dos celulares vendiendo offline crean "venta 500" y son
// ventas distintas.
//
// ─── Qué se fusiona ──────────────────────────────────────────────────
//
// | Dato | Regla | Por qué |
// |---|---|---|
// | ventas + detalle | sumar por g_id | plata que entró al cajón: nunca se pierde |
// | ingresos + detalle | sumar por g_id | el stock depende de esto |
// | fiado, pagos | sumar por g_id | plata que se debe o se pagó |
// | productos | gana el más nuevo (modificado_en) | no es plata; se corrige en un segundo |
// | clientes | gana el más nuevo (modificado_en) | ídem |
//
// El stock NO se fusiona: se recalcula desde el historial (ver stock.js). Es
// el único dato que no se puede sumar, y por eso justamente se deriva.
//
// ─── Los ids del otro celular no valen ───────────────────────────────
//
// `producto_id` y `cliente_id` son autoincrement locales: el Pan del celular
// B puede ser el id 7 y acá ser el 3. Por eso el buzón manda los NOMBRES y
// la fusión los resuelve contra el catálogo local (que es lo que se muestra en
// pantalla de todos modos). Se acepta el id remoto como atajo solo cuando el
// catálogo es idéntico, que es el caso normal.
//
// Ver docs/2026-10-13-arquitectura-sincronizacion.md

/** @returns {Set<string>} */
function gIdsRecibidos(sql, tabla) {
  return new Set(sql.getAllSync(`SELECT g_id FROM ${tabla} WHERE g_id IS NOT NULL`).map(r => r.g_id))
}

const normalizar = (s) => String(s ?? '').trim().toLowerCase()

/**
 * Traduce los nombres que llegan del otro celular a ids de ESTE dispositivo.
 *
 * Se construye una sola vez por buzón (son dos consultas) y se reutiliza en
 * ventas, ingresos y fiados. Un producto que todavía no tengo se inserta
 * primero (ver fusionarProductos, que corre antes que esto), así que para acá
 * todo nombre ya tiene id o queda como huérfano.
 */
function construirResolutor(sql) {
  const porNombreProducto = new Map(
    sql.getAllSync('SELECT id, nombre FROM productos').map(p => [normalizar(p.nombre), p.id])
  )
  const porNombreCliente = new Map(
    sql.getAllSync('SELECT id, nombre FROM clientes').map(c => [normalizar(c.nombre), c.id])
  )
  return {
    producto: (nombre, idRemoto) =>
      porNombreProducto.get(normalizar(nombre)) ??
      (idRemoto != null && porNombreProducto.size ? idRemoto : null),
    cliente: (nombre, idRemoto) =>
      porNombreCliente.get(normalizar(nombre)) ??
      (idRemoto != null && porNombreCliente.size ? idRemoto : null),
  }
}

/**
 * Inserta las ventas que aún no tengo, con su detalle.
 *
 * `venta_id` del detalle apunta al `id` LOCAL de la venta, no al del otro
 * dispositivo: es por eso que se guarda el detalle en una lista de espera y
 * se escribe después de saber qué id local quedó cada venta.
 */
function fusionarVentas(sql, { ventas, detalle_ventas }, resultado, ids) {
  const yaTengo = gIdsRecibidos(sql, 'ventas')
  const nuevosDetalle = []

  for (const v of ventas || []) {
    // Sin g_id no se puede decidir si es nueva: se ignora en vez de arriesgar
    // un duplicado. Nadie genera una venta sin g_id desde la v1.
    if (!v.g_id || yaTengo.has(v.g_id)) continue

    const r = sql.runSync(
      `INSERT INTO ventas (g_id,total,subtotal_bruto,descuento,tipo_descuento,monto_recibido,vuelto,
                           metodo_pago,usuario_id,cliente_id,es_fiado,comprador_nombre,
                           comprador_dni_ruc,fecha,anulada)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      v.g_id, v.total ?? 0, v.subtotal_bruto ?? v.total ?? 0, v.descuento ?? 0,
      v.tipo_descuento || 'ninguno', v.monto_recibido ?? 0, v.vuelto ?? 0,
      v.metodo_pago || 'Efectivo', null,
      ids.cliente(v.cliente_nombre, v.cliente_id),
      v.es_fiado ? 1 : 0, v.comprador_nombre ?? null, v.comprador_dni_ruc ?? null,
      v.fecha || new Date().toISOString(), v.anulada ? 1 : 0
    )
    const idLocal = r.lastInsertRowId
    resultado.ventas.push({ g_id: v.g_id, id_local: idLocal })
    ;(detalle_ventas || []).filter(d => d.venta_g_id === v.g_id).forEach(d => {
      nuevosDetalle.push({ idLocal, d })
    })
  }

  for (const { idLocal, d } of nuevosDetalle) {
    const productoId = ids.producto(d.producto_nombre ?? d.nombre_producto, d.producto_id)
    sql.runSync(
      `INSERT INTO detalle_ventas (venta_id,producto_id,nombre_producto,precio_unitario,
                                   cantidad,subtotal,tipo_venta,unidad,costo_unitario)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      idLocal, productoId,
      // El nombre es lo que se ve en el historial y en los reportes, así que
      // se guarda tal cual vino aunque el producto no exista todavía acá.
      d.nombre_producto ?? d.producto_nombre, d.precio_unitario,
      d.cantidad, d.subtotal, d.tipo_venta || 'unidad', d.unidad || 'unidad',
      d.costo_unitario ?? null
    )
    // Cada producto vendido necesita que se le recalcule el stock. Sin esto
    // el stock de una venta que llegó de otro celular queda sin tocar, que es
    // justo el error que el diseño del stock derivado evita.
    if (productoId != null) resultado.productosTocados.push(productoId)
  }
  return nuevosDetalle.length
}

/** Ingresos de mercadería: el stock depende de estos. */
function fusionarIngresos(sql, { ingresos, detalle_ingresos }, resultado, ids) {
  const yaTengo = gIdsRecibidos(sql, 'ingresos')
  const mapa = new Map()

  for (const i of ingresos || []) {
    if (!i.g_id || yaTengo.has(i.g_id)) continue
    const r = sql.runSync(
      'INSERT INTO ingresos (g_id,fecha,usuario_id,deshecho) VALUES (?,?,?,?)',
      i.g_id, i.fecha || new Date().toISOString(), null, i.deshecho ? 1 : 0
    )
    mapa.set(i.g_id, r.lastInsertRowId)
    resultado.ingresos.push({ g_id: i.g_id, id_local: r.lastInsertRowId })
  }

  let nuevas = 0
  for (const d of detalle_ingresos || []) {
    const idLocal = mapa.get(d.ingreso_g_id)
    // Sin ingreso padre no se inserta el detalle: sería una fila huérfana que
    // el stock derivado contaría mal.
    if (idLocal === undefined) continue
    const productoId = ids.producto(d.producto_nombre ?? d.nombre_producto, d.producto_id)
    sql.runSync(
      'INSERT INTO detalle_ingresos (g_id,ingreso_id,producto_id,nombre_producto,cantidad) VALUES (?,?,?,?,?)',
      d.g_id || `d_${d.ingreso_g_id}_${normalizar(d.producto_nombre)}`, idLocal,
      productoId, d.nombre_producto ?? d.producto_nombre, d.cantidad
    )
    nuevas++
    if (productoId != null) resultado.productosTocados.push(productoId)
  }
  return nuevas
}

/**
 * Fiado y abonos.
 *
 * El abono viaja con `fiado_g_id` — el g_id de la deuda a la que pertenece, no
 * el id local del otro celular. Si ese fiado todavía no llegó, el abono no se
 * inserta: un abono sin fiado no se puede mostrar en ninguna pantalla y solo
 * ensuciaría el historial de pagos.
 */
function fusionarFiado(sql, { fiados, pagos_fiado }, resultado, ids) {
  const yaTengo = gIdsRecibidos(sql, 'fiado')
  const porGid = new Map()

  for (const f of fiados || []) {
    if (!f.g_id || yaTengo.has(f.g_id)) continue
    const r = sql.runSync(
      `INSERT INTO fiado (g_id,cliente_id,monto_original,saldo,concepto,usuario_id,estado,fecha)
       VALUES (?,?,?,?,?,?,?,?)`,
      f.g_id, ids.cliente(f.cliente_nombre, f.cliente_id),
      f.monto_original ?? 0, f.saldo ?? 0,
      f.concepto ?? null, null, f.estado || 'pendiente',
      f.fecha || new Date().toISOString()
    )
    porGid.set(f.g_id, r.lastInsertRowId)
    resultado.fiados.push({ g_id: f.g_id, id_local: r.lastInsertRowId })
  }

  // Los fiados que YA tenía pueden ser los padres de abonos nuevos: el abono
  // puede llegar en un buzón posterior al del fiado. Se busca en el mapa de
  // los recién llegados y, si no, en la base por g_id.
  const yaTengoPagos = gIdsRecibidos(sql, 'pagos_fiado')
  for (const p of pagos_fiado || []) {
    if (!p.g_id || yaTengoPagos.has(p.g_id)) continue
    let fiadoId = porGid.get(p.fiado_g_id)
    if (fiadoId === undefined) {
      const fila = sql.getFirstSync('SELECT id FROM fiado WHERE g_id = ?', p.fiado_g_id)
      fiadoId = fila ? fila.id : undefined
    }
    if (fiadoId === undefined) continue
    sql.runSync(
      'INSERT INTO pagos_fiado (g_id,fiado_id,monto,metodo_pago,usuario_id,anulado,fecha) VALUES (?,?,?,?,?,?,?)',
      p.g_id, fiadoId, p.monto ?? 0, p.metodo_pago || 'Efectivo', null,
      p.anulado ? 1 : 0, p.fecha || new Date().toISOString()
    )
    resultado.pagos.push(p.g_id)
  }
  return porGid.size + resultado.pagos.length
}

/**
 * Productos y clientes: gana el más nuevo.
 *
 * Se compara por `modificado_en`. Si el remoto es más nuevo, se actualiza
 * todo menos el stock (que se recalcula aparte) y el `id`.
 *
 * El `id` local NO se renumera: `detalle_ventas.producto_id` lo referencia.
 * Si el producto existe en los dos dispositivos con id distinto, se busca por
 * `g_id` de producto (agregado más abajo) o, como último recurso, por
 * nombre. Si no se encuentra, se inserta con id nuevo y se deja así: es
 * preferible un producto duplicado a una venta que apunta a otro producto.
 */
function fusionarProductos(sql, productos, resultado) {
  const porNombre = new Map(
    sql.getAllSync('SELECT id, nombre, modificado_en FROM productos')
      .map(p => [String(p.nombre).trim().toLowerCase(), p])
  )
  let actualizados = 0

  for (const p of productos || []) {
    const local = porNombre.get(String(p.nombre).trim().toLowerCase())
    const remotoFecha = p.modificado_en || ''

    if (!local) {
      sql.runSync(
        `INSERT INTO productos (nombre,precio,stock,codigo,categoria,tipo_venta,unidad,costo,modificado_en,creado_en)
         VALUES (?,?,0,?,?,?,?,?,?,?)`,
        p.nombre, p.precio ?? 0, p.codigo ?? null, p.categoria ?? 'General',
        p.tipo_venta || 'unidad', p.unidad || 'unidad', p.costo ?? null,
        remotoFecha || new Date().toISOString(), p.creado_en || new Date().toISOString()
      )
      resultado.productosNuevos.push(p.nombre)
      continue
    }

    if (remotoFecha > (local.modificado_en || '')) {
      sql.runSync(
        `UPDATE productos SET precio=?, codigo=?, categoria=?, tipo_venta=?, unidad=?, costo=?, modificado_en=?
         WHERE id=?`,
        p.precio ?? local.precio, p.codigo ?? local.codigo,
        p.categoria ?? local.categoria, p.tipo_venta ?? local.tipo_venta,
        p.unidad ?? local.unidad, p.costo ?? local.costo, remotoFecha, local.id
      )
      actualizados++
    }
  }
  return actualizados
}

function fusionarClientes(sql, clientes, resultado) {
  const porNombre = new Map(
    sql.getAllSync('SELECT id, nombre, modificado_en FROM clientes')
      .map(c => [String(c.nombre).trim().toLowerCase(), c])
  )
  let actualizados = 0

  for (const c of clientes || []) {
    const local = porNombre.get(String(c.nombre).trim().toLowerCase())
    const remotoFecha = c.modificado_en || ''

    if (!local) {
      sql.runSync(
        `INSERT INTO clientes (nombre,telefono,referencia,dni_ruc,modificado_en,creado_en)
         VALUES (?,?,?,?,?,?)`,
        c.nombre, c.telefono ?? null, c.referencia ?? null, c.dni_ruc ?? null,
        remotoFecha || new Date().toISOString(), c.creado_en || new Date().toISOString()
      )
      resultado.clientesNuevos.push(c.nombre)
      continue
    }

    if (remotoFecha > (local.modificado_en || '')) {
      sql.runSync(
        'UPDATE clientes SET telefono=?, referencia=?, dni_ruc=?, modificado_en=? WHERE id=?',
        c.telefono ?? local.telefono, c.referencia ?? local.referencia,
        c.dni_ruc ?? local.dni_ruc, remotoFecha, local.id
      )
      actualizados++
    }
  }
  return actualizados
}

/**
 * Fusiona un buzón entero recibido de otro dispositivo.
 *
 * Todo en UNA transacción: si algo falla a mitad, no queda media venta de otro
 * celular metida acá. Y como la fusión es idempotente (se apoya en g_id, que
 * no se consume), volver a intentarlo no duplica nada.
 *
 * El orden importa: primero el catálogo, porque las ventas, los ingresos y el
 * fiado llegan referidos a productos y clientes por NOMBRE. Si el otro celular
 * tenía un producto que acá no existe, hay que crearlo antes de poder
 * apuntarle la venta.
 *
 * @param {object} sql        conexión de expo-sqlite
 * @param {object} buzon      { ventas, detalle_ventas, ingresos, detalle_ingresos,
 *                              fiados, pagos_fiado, productos, clientes }
 * @param {function} recalcularStock  callback de src/data/stock.js
 */
export function fusionarBuzon(sql, buzon, recalcularStock) {
  const resultado = {
    ventas: [], ingresos: [], fiados: [], pagos: [],
    productosTocados: [], productosNuevos: [], clientesNuevos: [],
    productosActualizados: 0, clientesActualizados: 0,
  }
  if (!buzon) return null

  sql.withTransactionSync(() => {
    resultado.productosActualizados = fusionarProductos(sql, buzon.productos, resultado)
    resultado.clientesActualizados = fusionarClientes(sql, buzon.clientes, resultado)

    // Catálogo ya está: ahora los nombres que trae el buzón tienen id local.
    const ids = construirResolutor(sql)

    fusionarVentas(sql, buzon, resultado, ids)
    fusionarIngresos(sql, buzon, resultado, ids)
    fusionarFiado(sql, buzon, resultado, ids)

    // El stock se RECALCULA, no se ajusta. Como se deriva del historial que
    // recién se aplicó, da el número correcto sin importar cuántas veces se
    // haya sincronizado antes.
    if (typeof recalcularStock === 'function') {
      resultado.stock = recalcularStock(sql, resultado.productosTocados)
    }
  })

  return {
    ventasAgregadas: resultado.ventas.length,
    ingresosAgregados: resultado.ingresos.length,
    fiadosAgregados: resultado.fiados.length,
    abonosAgregados: resultado.pagos.length,
    productosNuevos: resultado.productosNuevos.length,
    clientesNuevos: resultado.clientesNuevos.length,
    productosActualizados: resultado.productosActualizados,
    clientesActualizados: resultado.clientesActualizados,
    stockRecalculado: resultado.stock?.cambiados ?? 0,
  }
}
