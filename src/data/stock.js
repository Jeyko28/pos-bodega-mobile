// Stock derivado: se recalcula desde el historial, nunca se acumula.
//
// ─── Por qué ────────────────────────────────────────────────────────
//
// Hoy `productos.stock` se actualiza sumando y restando:
//
//     UPDATE productos SET stock = stock - 3 WHERE id = 42
//
// Es un valor acumulado. Con dos celulares vendiendo offline, cada uno resta
// localmente (los dos quedan en 44), y al sincronizar hay que decidir qué
// número es el correcto: 44, 41 o 38. Cualquier respuesta puede estar mal, y
// "restar los deltas del otro celular" duplicaría el descuento.
//
// La salida es dejar de acumular. El stock se **recalcula** desde los eventos
// que ya existen en la base:
//
//     stock = Σ(ingresos no deshechos) − Σ(ventas no anuladas)
//
// Los eventos se suman sin duplicarse porque son filas, no deltas. Dos
// celulares que vendieron offline convergen al mismo número sin que nadie
// tenga que decidir nada.
//
// Ver docs/2026-10-13-arquitectura-sincronizacion.md

/**
 * Recalcula el stock de un producto desde su historial.
 *
 * Las dos exclusiones son el detalle que hace que esto sea correcto:
 *
 * - **Ventas anuladas** (`ventas.anulada = 1`): la venta sigue en
 *   `detalle_ventas` — no se borra, queda listada y tachada, que es lo que se
 *   revisa después. Si no se excluyeran, anular una venta devolvería el stock
 *   dos veces: una por el `stock = stock + N` que ya se aplicó al anular, y otra
 *   por el recálculo.
 *
 * - **Ingresos deshechos** (`ingresos.deshecho = 1`): mismo caso. La fila
 *   queda por auditoría, ya no cuenta.
 *
 * @param {object} sql  la conexión de expo-sqlite
 * @param {number} productoId
 * @returns {number} el stock correcto
 */
export function stockDeProducto(sql, productoId) {
  const entradas = sql.getFirstSync(
    `SELECT COALESCE(SUM(di.cantidad), 0) AS total
       FROM detalle_ingresos di
       JOIN ingresos i ON i.id = di.ingreso_id
      WHERE di.producto_id = ? AND i.deshecho = 0`,
    productoId
  )

  const salidas = sql.getFirstSync(
    `SELECT COALESCE(SUM(dv.cantidad), 0) AS total
       FROM detalle_ventas dv
       JOIN ventas v ON v.id = dv.venta_id
      WHERE dv.producto_id = ? AND v.anulada = 0`,
    productoId
  )

  // Sin redondeo forzado: SQLite acumula en coma flotante y 3.10 puede dar
  // 3.0999999. Se redondea a 3 decimales, que es más que suficiente para
  // kilos y unidades, y evita que la pantalla muestre "3.09999999999".
  const stock = Number(entradas?.total || 0) - Number(salidas?.total || 0)
  return Math.round(stock * 1000) / 1000
}

/**
 * Recalcula el stock de TODOS los productos.
 *
 * Se usa después de una fusión: como el stock se deriva del historial, basta
 * con volver a calcularlo una vez para que cuadre, sin importar cuántos
 * cambios trajo el otro dispositivo.
 *
 * Devuelve cuántos productos cambiaron, para poder avisar en la interfaz solo
 * cuando hay algo que contar.
 *
 * @param {object} sql
 * @returns {{cambiados: number, ids: number[]}}
 */
export function recalcularTodoElStock(sql) {
  const ids = sql.getAllSync('SELECT id FROM productos').map(p => p.id)
  const cambiados = []
  sql.withTransactionSync(() => {
    for (const id of ids) {
      const correcto = stockDeProducto(sql, id)
      const antes = sql.getFirstSync('SELECT stock FROM productos WHERE id = ?', id)
      const previo = Number(antes?.stock || 0)
      if (Math.abs(previo - correcto) > 0.0001) {
        sql.runSync('UPDATE productos SET stock = ? WHERE id = ?', correcto, id)
        cambiados.push(id)
      }
    }
  })
  return { cambiados: cambiados.length, ids: cambiados }
}

/**
 * Recalcula solo los productos que tocaron las ventas o ingresos recibidos.
 *
 * Es lo que se usa en el caso normal de sincronización: si el otro celular
 * trajo 30 ventas, no hay razón para recorrer los 500 productos.
 *
 * @param {object} sql
 * @param {number[]} productoIds
 */
export function recalcularProductos(sql, productoIds) {
  if (!productoIds || !productoIds.length) return 0
  // Se quitan duplicados: una venta con 5 líneas del mismo producto lo
  // aparecería 5 veces.
  const unicos = [...new Set(productoIds.filter(id => Number.isInteger(id)))]
  let cambiados = 0
  sql.withTransactionSync(() => {
    for (const id of unicos) {
      const correcto = stockDeProducto(sql, id)
      const antes = sql.getFirstSync('SELECT stock FROM productos WHERE id = ?', id)
      if (Math.abs(Number(antes?.stock || 0) - correcto) > 0.0001) {
        sql.runSync('UPDATE productos SET stock = ? WHERE id = ?', correcto, id)
        cambiados++
      }
    }
  })
  return cambiados
}
