---
fecha: 2026-10-13
version: v1.0.0
tipo: pruebas
tags: [licencia, herramientas, android]
---

# Flujo de licencia probado de punta a punta

> Contexto: [[2026-10-13-flujo-de-licencia]] · Herramientas: [[herramientas-de-prueba]]

## La herramienta que hace posible probarlo

Para ver la pantalla de licencia hacen falta 30 días. Con
`tools/licencia-estado.js` se llega en un segundo:

```bash
node tools/licencia-estado.js ver           # qué ve la app ahora
node tools/licencia-estado.js 2XF7M74B 1    # día 1: 30 días
node tools/licencia-estado.js 2XF7M74B 24   # aviso ámbar
node tools/licencia-estado.js 2XF7M74B 30   # último día
node tools/licencia-estado.js 2XF7M74B 31   # bloqueada
node tools/licencia-estado.js 2XF7M74B activa
```

También imprime el **código de activación** válido para esa instalación, así
que no hay que ir a buscarlo al generador del vendedor.

Solo funciona en el build de desarrollo: necesita `run-as`, que Android no
permite en apps debuggables... al revés: `run-as` **solo** funciona en apps
debuggables. En un APK de producción falla, y está bien que así sea.

## Lo que se probó en pantalla

| Escenario | Resultado |
|---|---|
| Bloqueada: la pestaña Vender muestra la licencia | Correcto, con el ID de instalación grande y legible |
| Bloqueada: Productos, Clientes y Caja siguen abiertas | **Correcto.** Los datos no son rehenes |
| Activar con el código correcto | "¡Activado!" y la venta se desbloquea |
| Licencia activa tras reiniciar la app | Sigue activa |

El mensaje de la pantalla bloqueada dice lo que tiene que decir:

> Se acabaron tus 30 días gratis. Para seguir vendiendo activa tu pago único:
> es un solo pago, para siempre.
>
> Tu código solo funciona en este teléfono. Si cambias de celular, escríbenos
> y te damos uno nuevo sin costo (tu pago ya está hecho).
>
> Tus datos están a salvo: puedes verlos, consultar fiados y hacer tu respaldo
> con normalidad.

Eso último no es decorativo: se verificó que las otras tres pestañas funcionan
con la prueba vencida y los 20.000 datos cargados.

## Dos falsos positivos que costaron tiempo

**El botón «Pegar código del WhatsApp» no llenaba el campo.** Con el mensaje
de WhatsApp escrito en el portapapeles desde `adb shell service call`, el
campo seguía con el placeholder `XXXX`.

No era un bug de la app: **en Android 10+ el portapapeles solo es legible
desde la app que tiene el foco.** Escribirlo desde un shell externo produce un
portapapeles que la app no puede leer. El `try/catch` de `pegarDelPortapapeles`
traga el error a propósito (para no avisar cuando el portapapeles trae otra
cosa), y por eso no se veía ningún error.

**Las otras pestañas parecían bloqueadas.** Los taps iban a `y=1900`, pero las
pestañas están en `y=2186-2311`. El dump lo dice clarito
(`bounds="[810,2186][1080,2311]") y los taps a ciegas se fueron a otra parte.

Ambos casos apuntan a lo mismo: **las coordenadas de una captura no coinciden
con las de `uiautomator dump`**, y sin verificar no se sabe si lo que falló es
la app o el método.

## El ciclo completo, verificado

```
estado bloqueado  →  se ve el ID 2XF7M74B
      ↓
node tools/licencia-estado.js 2XF7M74B 31   →  código CCRP-YHTZ-GWFG-MR9X
      ↓
se escribe en la pantalla  →  "Activar mi licencia"
      ↓
"✓ Licencia activa" + hoja de "¡Activado!"
      ↓
"Seguir vendiendo"  →  vuelve a la pantalla de venta normal
```

El código emitido por `tools/generar-codigo.js` es aceptado por la app tal
cual, con guiones y todo.

## Lo que falta probar

- [ ] El pegado real desde el portapapeles (hace falta un device físico o
      escribir el portapapeles desde dentro de la app)
- [ ] El aviso ámbar del día 24 y el mensaje del último día, que se ven solo
      durante 7 días y 1 día respectivamente
- [ ] Que un código de otro teléfono sea rechazado con el mensaje de error
