---
fecha: 2026-10-13
version: v1.0.0
tipo: funcionalidad
tags: [recuperacion, cuentas, multi-dispositivo]
---

# Unirse a una bodega que ya existe

> Contexto: [[2026-10-13-modelo-de-licencia-nube]] · Herramientas: [[herramientas-de-prueba]]

## El problema que resuelve

La app solo tenía **Setup inicial**: si la bodeguera cambiaba de celular o
perdía el respaldo, veía la pantalla de bienvenida y no había forma de volver
a entrar a su cuenta. Peor: el respaldo **no lleva contraseñas** (a propósito,
no deben salir del teléfono), así que recuperar los datos no servía de nada
para poder vender.

El caso real: una bodega con dos personas, cada una con su celular.

## Qué hace ahora

En la pantalla de bienvenida hay una segunda opción, debajo de "Crear mi
bodega":

> **Ya tenía una bodega, quiero recuperarla**

Lleva a una pantalla que explica qué va a pasar y pide el archivo de respaldo.
Al elegirlo, **muestra un resumen antes de tocar nada**:

```
📂 Encontramos tu bodega
   Bodega El Buen Precio
   500      productos
   20000    ventas registradas
   60       clientes
   1654     fiados pendientes      (en ámbar si hay deuda)
```

Recién después pide crear el usuario de este celular y restaura.

## Dos bugs que aparecieron al implementarlo

**1. La columna `password` es NOT NULL.** La primera versión insertaba a los
usuarios del respaldo con `NULL` en la clave:

```
Runtime error: NOT NULL constraint failed: usuarios.password
```

No era solo que esos usuarios quedaran sin clave — **reventaba la unión
entera**. La bodeguera se quedaba sin su bodega por un detalle del esquema.

Solución: un marcador explícito. `password = 'sin-clave'`, con un helper
`usuarioTieneClave()` que el login consulta. Un usuario del respaldo se
conserva (su id aparece en el historial de ventas, borrarlos dejaría ventas
huérfanas) pero **no puede entrar desde ese equipo**.

**Y cerrar la puerta trasera:** `login()` ahora rechaza cualquier usuario cuyo
password sea el marcador. Sin esa línea, teclear "sin-clave" abriría la puerta.

**2. Colisión de nombre de usuario.** `username` es UNIQUE, y casi siempre el
primer usuario que alguien crea se llama `admin` — que es el nombre que
trae el respaldo. La unión fallaba entera:

```
Runtime error: UNIQUE constraint failed: usuarios.username
```

Solución: si el nombre está tomado, se le agrega un número (`admin2`, `admin3`...)
y **la pantalla lo avisa**: *"Tu usuario quedó como admin2 porque admin ya
venía en la copia"*. Sin ese aviso, la persona entra después con "admin", no
funciona, y piensa que la app está rota.

## Un límite que hay que decir, no esconder

Unirse restaura **los datos**, no las cuentas. Las contraseñas de los usuarios
del respaldo no existen en ningún lado (es la decisión de seguridad del
proyecto). Por eso quien se une crea la suya.

Eso significa: si dos personas se unen por separado al mismo respaldo, cada
una tiene su propia contraseña y **no pueden entrar con la cuenta de la
otra**. Hoy eso es aceptable —son el dueño y su cajero, y cada uno entra con
la suya— pero si someday se quiere una cuenta compartida entre equipos, es
otro trabajo.

La pantalla lo dice: *"Vas a crear tu usuario para entrar en este celular.
Los usuarios del respaldo no traen contraseña, así que solo entrarás tú."*

## Cómo se verificó

```bash
node tools/probar-union.js datos-prueba.json
```

16 comprobaciones sobre la base real del dispositivo, ejecutando el mismo SQL
que genera `db.js`:

```
✓ la base está vacía (teléfono nuevo)
✓ las 20000 ventas están
✓ los 89935 detalles están
✓ los 500 productos están
✓ los 60 clientes están
✓ 1654 fiados pendientes
✓ hay un usuario nuevo con contraseña
✓ el usuario nuevo es admin
✓ los del respaldo quedan con el marcador sin-clave
✓ setup_completado es true
✓ el nombre del negocio viene del respaldo
✓ ya no pide crear el negocio (va directo al login)
```

Y en pantalla, con el emulador: elegir el archivo → ver el resumen → crear
usuario → **dentro de la app vendiendo, con todos los datos**.

### El picker de archivos no se puede automatizar

`adb shell input tap` no responde en el DocumentsUI de Android (es un picker
nativo del sistema). Por eso la verificación del camino completo en pantalla
se hizo a mano, y la de la lógica va por `probar-union.js`.

## Lo que esto NO resuelve

**Sincronización.** Esto es "restaurar una copia", no "mantener dos celulares
al día". Si dos personas venden y una restaura después de la otra, la segunda
pisa la venta de la primera.

Para eso hace falta otra cosa (registro incremental con IDs globales), y está
discutido en [[2026-10-13-modelo-de-licencia-nube]]. La regla de seguridad
es: **no usar esto en dos celulares a la vez.** Si se hace, el último que
restaura manda.
