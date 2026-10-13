---
tipo: referencia
tags: [android, linux, emulador, entorno]
---

# Herramientas de prueba

> Contexto: [[2026-10-12-entorno-linux-y-emulador]] · Medición: [[2026-10-13-medicion-rendimiento]]

Scripts para probar POS Bodega sin depender del teléfono físico. Todos son
herramientas de desarrollo y **no se importan desde la app** (no deben acabar
dentro del APK).

## `tools/generar-datos-prueba.js`

Genera un JSON con el formato exacto de `db.getBackupJSON()`, para poder
restaurar desde la pantalla que ya tiene la app.

```bash
node tools/generar-datos-prueba.js [productos] [ventas] [clientes]
node tools/generar-datos-prueba.js 500 20000 60 > /tmp/opencode/datos-prueba.json
```

Por defecto: 500 productos, 20.000 ventas, 60 clientes (~23 MB).

Lo que incluye a propósito, porque son cosas que una bodega real tiene y un
conjunto de datos "limpio" no:

- **Stock negativo** en ~12% de los productos (llegó el camión y no se alcanzó a ingresar)
- **Fiados pagados y pendientes** mezclados (60% pagados, con abonos parciales)
- Ventas repartidas en un año **con más peso en los días recientes**
- Pico de ventas en mañana y tarde
- Precio de compra entre el 55% y 75% del precio de venta

El PRNG tiene semilla fija (`20260912`): el mismo comando da siempre el mismo
archivo, así una medición se puede repetir y comparar.

### Detalles del esquema que costaron una vuelta

`fiado` usa `monto_original` + `saldo` separados (un abono parcial baja el
saldo sin tocar lo prestado) y `pagos_fiado` apunta con `fiado_id`, no con
`cliente_id`. `ventas.anulada` no existe en el generador porque
`restaurarBackup` no la inserta.

## `tools/cargar-datos-emulador.js`

Carga el JSON directo en la base del emulador, saltándose la UI.

```bash
node tools/cargar-datos-emulador.js /tmp/opencode/datos-prueba.json
```

Credenciales que crea: usuario `admin`, contraseña `prueba123`.

Por qué no usar la UI: el JSON pesa 23 MB y el selector de archivos del emulador
manipulado con `adb shell input` es frágil. **Esto no prueba el flujo de
restauración** (que se prueba desde Ajustes como lo haría la bodeguera), solo
deja la base con volumen realista rápido.

Tres cosas que este script hace y no son evidentes:

1. **Para la app antes de escribir.** Tiene la base abierta con WAL; otro
   proceso escribiendo encima produce una mezcla corrupta.
2. **Borra el `-wal` y el `-shm`.** Pero al borrarlos se pierde el esquema
   (SQLite en WAL reconstruye las tablas desde el log), así que el script crea
   las tablas primero.
3. **Saca el esquema del propio `db.js`** con un regex sobre `const ESQUEMA`.
   Si mañana se le agrega una columna, el script la tiene sin que nadie tenga
   que acordarse de mantener dos copias.

### Rutas que no son las obvias

| Qué | Dónde |
|---|---|
| Base de datos | `/data/data/com.pos.bodega/files/SQLite/pos-bodega.db` |
| `run-as` | solo funciona en builds debuggables |
| `sqlite3` | `/system/bin/sqlite3` (sí existe en el emulador) |
| `config` se guarda | con `JSON.stringify` → `setup_completado` va como la cadena `"true"`, no `1` |
| Hash de contraseña | `sha256$<salt-hex-32>$<hash>` — el prefijo va dentro o el login falla |

## `tools/login-emulador.sh`

Inicia sesión escribiendo en los campos correctos.

```bash
./tools/login-emulador.sh admin prueba123
```

Existe porque **los taps a ciegas fallan**: el texto se va al campo que ya
tiene foco (el primero). El script limpia cada campo con `KEYCODE_DEL` antes
de escribir y saca las coordenadas de `uiautomator dump` en vez de fijarlas.

## `tools/probar-union.js`

Verifica la unión a una bodega existente contra la base real del dispositivo.
Ejecuta el mismo SQL que genera `db.js` y comprueba que todo quedó.

```bash
node tools/probar-union.js /tmp/opencode/datos-prueba.json
```

16 comprobaciones: conteos de ventas/productos/clientes/fiados, que el
usuario nuevo tenga clave real, que los del respaldo queden con el marcador
`sin-clave`, y que la app ya no pida crear el negocio.

Existe porque **el DocumentsUI de Android no responde a `adb shell input
tap`**: el selector de archivos no se puede automatizar. El camino de la
pantalla se prueba a mano; la lógica, con este script.

Ver [[2026-10-13-unirse-a-bodega]].

`tools/generar-codigo.js` es del flujo de licencias (ver README) y no tiene
relación con esto.

## `tools/licencia-estado.js`

Pone la app en cualquier día de la prueba, o con la licencia activa, en un
segundo. Para ver la pantalla de licencia hacen falta 30 días.

```bash
node tools/licencia-estado.js ver            # qué ve la app ahora
node tools/licencia-estado.js 2XF7M74B 1     # día 1: 30 días
node tools/licencia-estado.js 2XF7M74B 24    # aviso ámbar
node tools/licencia-estado.js 2XF7M74B 30    # último día
node tools/licencia-estado.js 2XF7M74B 31    # bloqueada
node tools/licencia-estado.js 2XF7M74B activa
node tools/licencia-estado.js 2XF7M74B nuevo  # reinicia la instalación
```

Imprime también el **código de activación** válido para esa instalación, para
no tener que ir al generador del vendedor.

**Solo funciona en el build de desarrollo**: necesita `run-as`, que Android
solo permite en apps debuggables. En un APK de producción falla, y está bien.

Reiniciar la app después de cada cambio: `adb shell am force-stop com.pos.bodega`
y volver a abrir con el deep link de Metro.

## Pruebas de licencia (sin emulador)

```bash
node tools/probar-licencia.js         # 17 casos: cálculo de días
node tools/probar-codigo-licencia.js  # 24 casos: código y HMAC
```

Ejecutan **el código real de la app**, no una copia: `getEstadoLicencia` se
extrae de `db.js` y `licencia.js` se transpila con `expo-crypto` sustituido
por `node:crypto`. Si alguien cambia la fórmula, la prueba usa el cambio.

Ver [[2026-10-13-flujo-de-licencia]].

## El cronómetro de la app

`src/utils/cronometro.js` no es un profiler: mide las operaciones que el
bodeguero repite todo el día. Los resultados se ven en **Ajustes → ⚡
Velocidad**, con promedio, peor caso y número de veces.

Está pensado para quedarse o irse: las llamadas son baratas (un `Map`), pero
si molesta en producción se quita borrando las llamadas `cronometro(...)` y la
sección de la pantalla. Ver [[2026-10-13-medicion-rendimiento]].

## Con el teléfono físico

Requiere **cable de datos**, no uno de solo carga. Con el dev build instalado:

```bash
adb reverse tcp:8081 tcp:8081
npx expo start --dev-client
```

Expo Go **no sirve** para este proyecto: Drive necesita identificador de app
propio y SAF no existe en Expo Go. Ver el README.
