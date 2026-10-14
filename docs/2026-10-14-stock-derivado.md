---
fecha: 2026-10-14
version: v1.0.0
tipo: arquitectura
tags: [sincronizacion, stock, pruebas]
---

# Stock derivado — implementación y verificación

> Diseño: [[2026-10-13-arquitectura-sincronizacion]] · Herramientas: [[herramientas-de-prueba]]

Pasos 2 y 3 de la arquitectura. El `g_id` ya estaba (commit anterior); acá
está el cálculo del stock, que es lo que faltaba para que la sincronización
no destruya el inventario.

## `src/data/stock.js`

Tres funciones, sin estado:

- `stockDeProducto(sql, id)` — el stock de un producto
- `recalcularProductos(sql, ids)` — solo los que tocaron una fusión
- `recalcularTodoElStock(sql)` — todos, para cuando hace falta

## La fórmula y sus dos exclusiones

```
stock = Σ(ingresos no deshechos) − Σ(ventas no anuladas)
```

Las exclusiones son **el detalle que hace que esto sea correcto**, y no son
obvias:

**Ventas anuladas.** Al anular, `anularVenta()` ya hace
`stock = stock + cantidad`. La fila sigue en `detalle_ventas` — no se borra,
queda listada y tachada, que es lo que se revisa después. Si el recálculo no
la excluyera, **anular una venta devolvería el stock dos veces**.

**Ingresos deshechos.** Mismo caso: la fila queda por auditoría pero ya no
cuenta.

## La prueba que lo decide

`tools/probar-fusion.js` simula dos celulares vendiendo offline:

- A vende 13 panes y 5 leches
- B vende 8 panes, 12 leches y 4 arroz — sin ver lo que hizo A
- **Los ids locales chocan**: los dos tienen venta `id=1`

Y después de fusionar:

```
Pan:   100 − (13+8)  = 79
Leche: 100 − (5+12)  = 83
Arroz: 100 − 4       = 96
```

El resultado central: **el stock fusionado es idéntico al que tendría un
solo celular que hubiera vendido todo**. Esa es la garantía.

También comprueba que **fusionar dos veces no cambia nada** (el buzón no se
vació a tiempo) y que **no se pierde ninguna venta**.

### Por qué recalcular y no restar deltas

La prueba muestra explícitamente el error que el diseño evita. Restar el delta
del otro celular (`stock = stock - 8`) *parece* funcionar… hasta que el stock
ya tenga dos salidas aplicadas y se descuadre.

Recalcular desde el historial siempre da el número correcto, se aplique una
vez o tres. Es la diferencia entre "funciona en el caso que probé" y
"funciona siempre".

## Un hallazgo sobre los datos de prueba

Al verificar la fórmula contra la base real, el stock derivado daba
**negativo** (−71, −86, −86) mientras el guardado decía 45, 57, 57.

La causa no era la fórmula: era que **el generador de datos de prueba ponía un
stock inicial inventado** (90, 72…) **sin el ingreso que lo justificara**. En
la app real eso no pasa: `addProducto` crea el producto con `stock: 0` y el
stock solo sube por ingresos registrados.

El generador ahora reproduce la app real: productos en 0, y el stock llega
por `ingresos` / `detalle_ingresos` con la cantidad calculada a partir de lo
que realmente se vendió (vendido × 1.35 + piso). Resultado: stock entre 28 y
70, coherente con el historial.

Sin ese arreglo, cualquier prueba del stock derivado daba números que no
existen en una bodega real.

### Y un segundo hallazgo

`cargar-datos-emulador.js` **no insertaba ingresos**, aunque el JSON los
tenía. Resultado: `ingresos` con filas pero `detalle_ingresos` vacía, y el
INSERT fallaba en silencio porque **la columna `g_id` no existía** en esa
tabla — la había agregado a las demás y olvidado esta.

Las dos cosas están arregladas y verificadas.

## Verificación en la app real

Con 120 productos, 800 ventas y 12 ingresos:

```
productos con stock incoherente: 0 / 120
```

Y después de **una venta hecha en la pantalla** (Atún Open Ocean × 1):

```
ventas: 801
g_id:   v_mv7poio8264u101kf02bfa66   ← formato nuevo, con random
stock:  52 = 127 (entró) − 75 (salió)
```

El `g_id` generado tiene el formato correcto: timestamp base36 + 6 bytes
aleatorios + id del dispositivo (`f02bfa66`).

## Lo que falta

El stock derivado **calcula** el valor correcto, pero la app todavía **acumula**
en las operaciones (`stock = stock ± N`). Las dos cosas dan el mismo número
mientras no haya fusión, y a propósito no se cambió todavía: hacerlo es el
paso 4 y toca todas las funciones de venta, ingreso y anulación.

Para la sincronización no hace falta cambiar eso: después de fusionar se
recalcula y queda bien. Cambiar el acumulado a derivado es lo que evita
divergencias a largo plazo.

## Estado de la arquitectura

| Paso | Estado |
|---|---|
| 1. `g_id` global | Hecho |
| 2. Fusionar sin perder | Lógica probada (17 casos); falta la función en `db.js` |
| 3. Stock derivado | Hecho y verificado contra datos reales |
| 4. `modificado_en` | Columnas agregadas; falta la regla "gana el último" |
| 5. Buzones por dispositivo | Pendiente |
| 6. Proveedor agnóstico | Pendiente |
