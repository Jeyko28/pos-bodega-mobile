---
fecha: 2026-10-13
version: v1.0.0
tipo: medicion
tags: [rendimiento, android, instrumentacion]
---

# Medición de rendimiento — 20.000 ventas reales

> Contexto: [[2026-10-12-entorno-linux-y-emulador]] · Decisiones: [[decisiones-tecnicas]] · Herramientas: [[herramientas-de-prueba]]

## Por qué existe esta nota

La pregunta de origen era *"¿la app se siente lenta?"*. Nadie lo había medido:
las pruebas de desarrollo se hicieron con pocas ventas y nunca con el volumen
de una bodega real. Sin un número, cualquier decisión sobre reescribir o no
reescribir es una corazonada.

Acá está el número.

## Condiciones de la prueba

| | |
|---|---|
| Dispositivo | Emulador `BodegaGamaMedia` (Android 36, **2 GB RAM**, 1080x2400) |
| Datos | 500 productos · **20.000 ventas** · 89.935 líneas de detalle · 2.342 fiados |
| Build | dev (`development`), bundle sin minificar servido por Metro |
| Motivo del volumen | una bodega al año de operar |

El emulador se eligió con 2 GB de RAM a propósito: es la clase de equipo de una
bodeguera (el Redmi 10 de referencia tiene 4 GB + swap). Si vuela ahí, vuela
en un equipo mejor.

**Caveat importante:** es un emulador con KVM, no un Snapdragon real. Los
números absolutos sirven para *comparar antes/después*, no como valor absoluto
de producción.

## Resultados: ANTES

Medidos en Ajustes → ⚡ Velocidad, tras ~20 navegaciones entre pestañas y 1 venta.

| Operación | Promedio | Peor | Veces |
|---|---|---|---|
| arranque | 6.456 ms | 6.456 | 1× |
| POS.cargar | 399 ms | 399 | 1× |
| db.getProductos | 234 ms | 234 | 1× |
| db.getMasVendidos | 147 ms | 147 | 1× |
| db.getClientes | 15 ms | 15 | 1× |
| db.realizarVenta | 12 ms | 12 | 1× |
| POS.filtrarProductos | 0.2 ms | 0 | 2× |

En una segunda ronda los promedios bajaron solos (getProductos 234→163,
getMasVendidos 147→87): es el **caché de SQLite**. Tras los primeros minutos
de la jornada, el bodeguero ya no paga esos valores.

## El hallazgo que cambió la decisión

**Cobrar una venta toma 12 ms.** Más rápido que el tiempo que tarda una mano
en levantarse del botón. No hay ningún lenguaje que baje eso a 5 ms de forma
que un humano lo note.

Segundo hallazgo: **`POS.cargar` no se dispara al volver a la pestaña.** De 20
navegaciones, corrió 1 vez. React Navigation mantiene la pestaña montada, así
que `useFocusEffect` no vuelve a disparar. El patrón "recargar todo en cada
foco" que parecía el problema central **no está presente** en la navegación
normal.

Tercero: **el filtro de productos, sin `useMemo`, medía 0.2 ms.** La
preocupación de que "cada tecla re-filtra 500 productos" era correcta en
teoría pero irrelevante en la práctica a esta escala.

Segundo hallazgo:

## Resultados: DESPUÉS

| Operación | Antes | Después | Cambio |
|---|---|---|---|
| **db.getProductos** | 234 ms | **23.9 ms** | **10×** |
| POS.cargar | 399 ms | **144.5 ms** | **2.8×** |
| db.getMasVendidos | 147 ms | 89.1 ms | 1.6× |
| db.realizarVenta | 12 ms | — | sin tocar |
| POS.filtrarProductos | 0.4 ms | 0.3 ms | — |
| arranque | 6.456 ms | 423 ms¹ | no comparable |

¹ El 6.456 ms incluía descargar el bundle de 6 MB desde Metro. Con el bundle
en caché arranca en 423 ms. **Este número no sirve para comparar**: hay que
medir en un build `preview`.

## Qué se cambió y por qué

### `getProductos` — el único problema real

```js
// antes: SELECT * + sort en JS
sql.getAllSync('SELECT * FROM productos')
  .sort((a, b) => a.nombre.localeCompare(b.nombre))

// después
sql.getAllSync(`
  SELECT id, nombre, precio, stock, codigo, categoria, tipo_venta, unidad,
         bulto_unidades, bulto_nombre, bulto_codigo
  FROM productos
  ORDER BY nombre COLLATE NOCASE
`)
```

Dos causas, ambas verificadas:

1. `SELECT *` traía `costo` y `creado_en`, que ninguna pantalla lee desde esta
   función (el costo llega por otros paths).
2. `localeCompare` sobre 500 nombres es trabajo de JS, y la función se llama en
   cada carga. `COLLATE NOCASE` ordena en SQLite.

### `getMasVendidos` — mejora parcial

`p.*` → lista corta de columnas. **El filtro de fecha NO se pudo mover a
`detalle_ventas`**: esa tabla no tiene columna de fecha, solo `venta_id`.
Agregarla duplicaría un dato que puede quedar desfasado de su venta; no vale
la pena mientras esté en presupuesto.

### `useMemo` en el filtro de productos

Se agregó por buenas prácticas. Resultado: 0.3 ms. **No era un problema**; era
preventivo.

## Lo que NO se hizo, y por qué

**No se reescribió en Kotlin.** Con `realizarVenta` en 12 ms y el peor caso de
consulta en 144 ms, una reescritura de 7.800 líneas no compra nada medible.
Además, los tres patrones que se sospechaban lentos (síncrono vs asíncrono,
recarga en foco, filtro sin memoizar) existen **igual en Kotlin**: un
`runSync` bloqueante no es instantáneo en ningún lenguaje.

## Pendiente

- [ ] Medir el arranque en un build `preview` (el de 6.4 s es artefacto del dev build)
- [ ] Repetir todo en el Redmi 10 físico (requiere cable de datos)
- [ ] Migración de cuenta entre dispositivos: hoy solo hay Setup inicial
      (el usuario lo mencionó; sin waveguide)
- [ ] Probar con 10.000+ ventas de un solo día, no repartidas en un año
