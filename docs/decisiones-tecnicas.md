---
tipo: referencia
tags: [arquitectura, rendimiento, expo]
---

# Decisiones técnicas

> Contexto: [[2026-10-13-medicion-rendimiento]] · Herramientas: [[herramientas-de-prueba]]

Decisiones que no son obvias leyendo el código. El README tiene el detalle de
producto; acá va lo de arquitectura y rendimiento, con lo que se midió.

## "Es una app Android nativa, ¿no?"

Sí, en el sentido que importa: el build es un proyecto Gradle real con código
Kotlin/Java, y las capacidades que usa la app (SQLite, cámara, biometría,
SAF, PDF) son nativas de Android.

Lo que **no** es nativo es la capa de UI y lógica de negocio, que está en JS
sobre Hermes. Expo SDK 57 usa React Native 0.86, que ya va sobre la Nueva
Arquitectura (JSI/Fabric): las llamadas a módulos nativos son directas, sin
el *bridge* asíncrono que era el cuello de botella del RN viejo.

**Lo que sí mide, medido** (ver la nota de medición): con 20.000 ventas, cobrar
tarda **12 ms**. No hay bottleneck en el límite JS/nativo.

### Por qué NO se reescribió en Kotlin

Los tres patrones que se sospechaban lentos existen igual en cualquier lenguaje:

| Sospecha | Realidad medida |
|---|---|
| API síncrona de SQLite bloquea | 12 ms por venta — no bloquea nada perceptible |
| Recargar todo en cada foco | no se dispara: la pestaña queda montada |
| Filtrar sin `useMemo` | 0.2 ms con 500 productos |

Un `runSync` bloqueante no es instantáneo en Kotlin tampoco. Y una reescritura
de 7.800 líneas no compra nada que el número justifique.

### Cuándo SÍ valdría la pena

- El modelo de sincronización con la PC (Fase 2/3 del README): sockets y
  background tasks muy específicos.
- Un diseño de UI que React Native no puede expresar.
- Un módulo nativo puntual (WorkManager para respaldos reales, SAF más fino)
  → eso se hace con **Expo Modules API** o `npx expo prebuild`, sin reescribir.

## `getProductos`: el único cuelo de botella real

234 ms → 24 ms (10×). Dos causas, ambas en `src/data/db.js`:

1. **`SELECT *`** traía `costo` y `creado_en`, que ninguna pantalla lee desde
   esa función. El costo de compra llega por otros paths.
2. **`localeCompare` en JS** sobre 500 nombres, en cada carga. SQLite ordena
   más rápido: `ORDER BY nombre COLLATE NOCASE`.

Regla general: `getAllSync` que trae `*` y ordena en JS es una bandera roja
cuando la tabla crece. Traer solo lo que se lee, y ordenar en SQL.

## `getMasVendidos`: por qué no se optimizó más

Es la consulta más pesada de la app (recorre las líneas de detalle de 30 días
para devolver 12 filas), pero quedó en 89 ms y SQLite la cachea entre llamadas.

**No se le puede filtrar por fecha desde `detalle_ventas`**: esa tabla no
tiene columna de fecha, solo `venta_id`. Agregarla duplicaría un dato que
puede quedar desfasado de su venta (una venta anulada, un cambio de fecha). El
JOIN con `ventas` es el precio de no duplicar el dato, y 89 ms lo justifican.

Si alguna vez molesta, el camino correcto es una tabla de resumen
`ventas_por_producto_dia` que se actualice al vender, no una columna duplicada.

## Navegación: por qué `useFocusEffect` no es el problema

React Navigation mantiene las pestañas **montadas**. Volver a Vender no
remonta la pantalla, así que `useFocusEffect` no vuelve a disparar. Se midió:
20 navegaciones → 1 sola carga.

Esto importa para leer el código: `cargar()` en `POSScreen.js` parece un
cuello de botella ("recarga 4 tablas en cada foco") y no lo es. **No lo
"optimices" sin medir**: el costo de un `useMemo` mal puesto es real y el
beneficio, cero.

## Cronómetro: `src/utils/cronometro.js`

No es un profiler. Mide las operaciones que el bodeguero repite todo el día, y
solo se lee en Ajustes → ⚡ Velocidad.

Usa `performance.now()` (monótono) y no `Date.now()`: si el usuario cambia la
hora del teléfono, un cálculo con `Date.now()` se descuadra.

Está pensado para poder quitarse: si molesta en producción, se borran las
llamadas `cronometro(...)` y la sección de la pantalla de Ajustes.

## Cosas de Linux que han pasado

El proyecto se mudó de Windows a Linux en octubre 2026. Detalles en
[[entorno-linux-android]].

- **`node_modules` sin bit de ejecución** → `chmod +x`, o EAS falla con `EACCES`
- **`expo-sqlite` no guarda en `databases/`** sino en `files/SQLite/`
- **`config` se serializa con `JSON.stringify`**: `setup_completado` es la
  cadena `"true"`, no `1` ni `'true'`
- **El hash de contraseña incluye el prefijo**: `sha256$<salt>$<hash>`. Sin el
  prefijo, `passwordCoincide` lo toma como texto plano y el login falla

## Migración de cuenta entre dispositivos

**Pendiente, sin dueño.** Hoy la app solo tiene Setup inicial: si se borra o
se cambia de teléfono, la pantalla de bienvenida aparece y no hay forma de
entrar a una cuenta existente.

Tiene dos partes distintas: (a) *no perder los datos* — eso ya lo resuelve el
respaldo en Drive; (b) *poder entrar de nuevo* — recuperar las contraseñas de
los usuarios, que no viajan en el respaldo a propósito.

Pendiente de decidir, no es solo un bug.
