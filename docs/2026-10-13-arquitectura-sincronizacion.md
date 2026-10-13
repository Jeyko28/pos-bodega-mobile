---
fecha: 2026-10-13
version: v1.0.0
tipo: arquitectura
tags: [sincronizacion, nube, producto, offline]
---

# Sincronización entre dispositivos — estructura

> Contexto: [[2026-10-13-unirse-a-bodega]] · Decide: [[2026-10-13-modelo-de-licencia-nube]]

Esta nota define **cómo** se sincroniza, no implementa nada todavía. Es la
decisión de la que depende el resto de la nube (respaldo premium,
licencia por cuenta, OneDrive o lo que siga).

## Decisiones tomadas

| | |
|---|---|
| **Cuándo** | Al abrir y al cerrar la app **+** cada 30 min si está abierta. Ni por venta (gasta datos) ni solo al abrir (el segundo celular queda viejo) |
| **Conflictos** | Ventas y fiados: **nunca se pierden**, se suman. Productos y clientes: gana el último |
| **Dónde vive** | Agnóstico: hoy Drive, mañana lo que sea |

## El problema: no es la red, es la identidad

La conexión siempre está — eso es cierto y lo simplifica todo. El obstáculo
es otro, y es el que hay que resolver antes de escribir una línea.

Hoy `ventas.id` es un `INTEGER PRIMARY KEY AUTOINCREMENT`, o sea **local**:

```
Celular A vende → venta id=500
Celular B vende offline, sin ver nada → venta id=500
```

Son **dos ventas distintas con el mismo id**. Cuando B descarga lo de A no
puede saber si ese `500` es la misma venta o otra. Si lo trata como la misma,
**se pierde una venta**: plata que entró al cajón y desaparece del historial.

Por eso "el que sube último pisa" no es una solución — es una pérdida de datos
con steps extra.

## La solución: identificador global

Cada venta, cada abono y cada ingreso llevan un **id global** además del
local:

```
g_id  TEXT    -- "v_7f3a2b8c9d1e4f5a": timestamp + random del dispositivo
id    INTEGER -- autoincrement local, solo para las FK internas
```

La regla de fusión es una línea:

> **Si ya tengo esa `g_id`, no la inserto. Si no, la sumo.**

No hay conflictos posibles en ventas, porque una venta con el mismo `g_id` es
**por definición la misma venta**. Y dos ventas distintas nunca comparten
`g_id`. Se suman, siempre, sin perder nada.

El `id` local se queda porque `detalle_ventas.venta_id` y otras cosas lo
referencian; al fusionar, cada venta conserva su id local.

## El stock: por qué NO se puede sincronizar así

El stock es el único dato que **no se puede sumar**, y es el que más importa.

Hoy se actualiza acumulando:

```sql
UPDATE productos SET stock = stock - 3 WHERE id = 42
```

Es un valor acumulado, no un historial. Si A y B venden 3 unidades del mismo
pan offline, cada uno resta localmente (queda 44 cada uno), y al fusionar hay
que decidir: ¿44, 41, o 38? **Cualquier respuesta puede estar mal.**

### La solución: volver el stock derivado

En vez de acumular, **recalcular** desde los eventos que ya existen:

```
stock = Σ(detalle_ingresos.cantidad) − Σ(detalle_ventas.cantidad)
```

`detalle_ingresos` (lo que llega del proveedor) y `detalle_ventas` (lo que
sale) **ya están guardadas**. Con eso el stock se puede recalcular cuando
haga falta, y dos dispositivos que vendieron offline convergen al mismo
número sin duplicar nada.

**Costo:** es una migración. `productos.stock` pasa a ser un valor calculado
(una vista o un campo que se refresca), y hay que backfillear los datos
existentes desde el historial. Es trabajo acotado, pero es la parte delicate.

**El error clásico a evitar:** aplicar los deltas de stock del otro celular
(`stock = stock - 3` otra vez) duplicaría el descuento. El stock **se
recalcula**, no se acumula desde afuera.

## Productos y clientes: gana el último

Con fecha de modificación por fila:

```
productos.modificado_en   -- ISO
clientes.modificado_en
```

Al fusionar, gana el `modificado_en` más nuevo. Es simple y predecible.

Es aceptable losing un precio si dos personas editan el mismo producto
offline al mismo tiempo: **no es plata**, es un dato que se corrige en un
segundo. Lo que no se acepta es perder una venta.

## Cómo viaja: "buzón" por dispositivo

Sin servidor, cada dispositivo tiene **su propio archivo** en la carpeta de
Drive:

```
POS Bodega — Sincronización/
  b_8f3a2b8c9d1e4f5a.json    ← buzón del celular A
  b_c7e2f1a9b4d6e8c3.json    ← buzón del celular B
  b_negro                  ← quién es (metadata del archivo)
```

**El flujo de un dispositivo, en cada sincronización:**

```
1. Subir   → escribe SU buzón con lo que cambió desde la última vez
2. Leer    → descarga los buzones de los otros que no haya leído
3. Fusionar → mete sus ventas/abonos/ingresos (por g_id, sin perder)
              recalcula el stock desde el historial
              aplica productos/clientes del último (por modificado_en)
4. Limpiar → vacía los buzones ya procesados
5. Guardar → recuerda hasta qué versión leyó de cada dispositivo
```

Cada buzón lleva un **número de versión incremental**. Así "no perdí nada" es
verificable: si el dispositivo B está en la versión 7 y A tiene un buzón con
la 6, B no procesa el 7 hasta haber tomado el 6.

**Por qué "un buzón por dispositivo" y no uno compartido:** dos dispositivos
offline escribiendo en el mismo archivo se pisarían. Con un archivo por
dispositivo, cada uno escribe solo en el suyo y no puede pisar a nadie. Es
justo la propiedad que ya da Drive sin pedirle nada nuevo.

## Por qué "agnóstico" es lo correcto

La app no habla con Drive: habla con `proveedorDeSincronizacion`, una
interfaz con tres operaciones:

```
leerBuzones(mios)          → lista de buzones ajenos
escribirBuzon(mio, datos)  → publica mis cambios
```

Hoy lo implementa Drive. Mañana, Firebase, un servidor propio, o un pendrive
compartido por WiFi — **sin tocar la app**. El resto (ids globales, fusión,
stock derivado) es idéntico en todos los casos.

La decisión de negocio queda separada de la técnica: si Google cambia sus
términos o el costo, se cambia el proveedor y no se reescribe la app.

## Riesgo principal, dicho de frente

**Dos dispositivos vendiendo a la vez en el mismo mostrador.** Se resuelve con
el diseño (nada se pierde), pero el orden de los abonos de fiado puede diferir
entre dispositivos, y en una bodega real eso casi nunca pasa.

Lo que sí hay que decir en la interfaz: cuando se sincroniza, **la pantalla
puede cambiar sola** (aparecen ventas nuevas). Si alguien está cobrando en
ese momento, no puede verle la fila duplicada.

Por eso sincronizar **al abrir y al cerrar**, y cada 30 min, y **nunca
mientras se está cobrando**.

## Qué hay que construir, en orden

| # | Pieza | Por qué va primero |
|---|---|---|
| 1 | `g_id` en ventas, abonos, ingresos + índices | Sin esto no hay fusión posible. Y solo eso, sin más, ya sirve. |
| 2 | Fusionar ventas sin perder (ignora las repetidas) | El núcleo del "no se pierde plata". |
| 3 | Stock derivado de `detalle_ingresos` y `detalle_ventas` | Sin esto el stock queda mal después de fusionar. |
| 4 | `modificado_en` en productos y clientes | Regla simple, cierra la fusión. |
| 5 | Buzones por dispositivo + versiones | El transporte. |
| 6 | Interfaz `proveedorDeSincronizacion` + implementación Drive | Agnóstico. |

Los pasos 1-4 se pueden hacer **sin Drive, sin nube y sin internet**, y ya
solucionan el caso de "recuperar un respaldo sin pisar lo local". El paso 5-6
es lo que agrega la nube.

## Decisión pendiente

**¿Es demasiado trabajo para el momento?** Los pasos 1-4 son la mitad del
problema y valen por sí solos (restauración segura). El 5-6 es lo que activa
el premium.

Si el tiempo aprieta, se puede hacer 1-4 ahora y dejar la nube para después —
el modelo de negocio no depende de hacerlos juntos.
