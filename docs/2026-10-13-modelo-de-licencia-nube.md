---
fecha: 2026-10-13
version: v1.0.0
tipo: estrategia
tags: [licencia, negocio, producto, nube]
---

# Modelo de licencia — de "bloquear venta" a "bloquear nube"

> Contexto: [[2026-10-13-flujo-de-licencia]] · Estado verificado: [[2026-10-13-prueba-flujo-licencia]]

## Lo que hay hoy

Al vencer los 30 días, **solo se bloquea la venta**. Productos, clientes,
fiado, historial, caja y respaldos siguen abiertos — verificado en pantalla
con 20.000 datos de prueba.

Es una decisión de producto deliberada: los datos de la bodeguera nunca son
rehenes. Y bloquea en la acción que más duele (cobrar) pero deja libre todo lo
que le permite seguir funcionando.

## La propuesta: la licencia pasa a bloquear la nube

El cobro pasa a ser sobre **servicios premium**, no sobre la app:

- Respaldo a Google Drive / OneDrive
- Sincronización entre dispositivos
- Acceso desde más de un equipo con la misma cuenta

Y **la app base nunca se bloquea**: vender, productos, clientes, fiado, caja,
historial, ticket, respaldo local y respaldo en carpeta propia (SAF) siguen
gratis para siempre.

## Por qué creo que es mejor

**Para la bodeguera es menos dañino.** Una bodega con el POS bloqueado pierde
clientes mientras yo cobro. Una bodega sin Drive sigue vendiendo, y el día que
pierda el celular (o quiera el respaldo en otra parte) ve el precio.

**Vende el problema, no la app.** "Te bloqueo hasta que pagues" es una
especie de secuestro. "Tus datos están seguros en la nube, en otro celular,
por S/ X una vez" es un producto.

**Deixa de haber una fecha de expiración.** Hoy el día 31 es una amenaza. Con
este modelo no hay fecha: la app es del bodeguero, la nube es el servicio.

**El respaldo local ya existe y es suficiente para arrancar.** Una bodega
puede trabajar meses sin Drive. Cuando le importe, ya conoce el problema.

## El riesgo, y cómo lo mitigaría

**El riesgo real: que nadie pague nunca.** Si la app base es completa y la
nube es "un extra", el embudo puede no convertir. Tres mitigaciones:

1. **La nube tiene que ser genuinamente útil, no decorativa.** Respaldo
   automático + cambiar de celular sin perder nada. Eso se vende solo cuando
   pasa.
2. **Mostrar el valor antes de cobrar.** Avisar "tenés 3 respaldos, el
   último hace 2 días" una vez a la semana, no un muro de pago.
3. **Un escalón gratis real.** Respaldo manual a Drive gratis; el automático
   y la sincronización multi-dispositivo son de pago. Así el que quiere probar
   puede, y el que depende de ello paga.

**También:** OneDrive agrega una integración completa (OAuth de Microsoft,
tokens, API Graph) por el mismo trabajo que ya existe para Drive. No es
gratis. Ver abajo.

## Lo que NO cambiaría

- **Los 30 días gratis** pasan a ser "30 días con todo incluido". Así el
  bodeguera prueba el producto completo antes de decidir.
- **El código atado a la instalación** se queda: sigue siendo lo que evita que
  un código primal preste. Pero si la nube es lo premium, la licencia debería
  atarse **a la cuenta, no al teléfono** (ver abajo).
- **La verificación offline** se queda: sin servidor sigue siendo HMAC. Lo que
  cambia es **qué** se verifica, no **cómo**.

## El punto difícil: qué se verifica sin servidor

Hoy es: "¿este código de 16 letras corresponde a esta instalación?" — un
HMAC local. Fácil.

Si la licencia pasa a ser de servicios en la nube, el pago tiene que llegar a
algún lado. Sin servidor, hay tres caminos:

| Camino | Cómo funciona | Qué cuesta |
|---|---|---|
| **A. Código, igual que hoy** | El vendedor emite un código; la app lo valida contra la cuenta de Drive/OneDrive en vez de contra el teléfono | Barato. La nube es la que ya sabe quién pagó |
| **B. Código por dispositivo** | Igual que hoy, y cada dispositivo nuevo pide código | Barato. Pero contradice "sincronizar entre dispositivos" |
| **C. Servidor de licencias** | La app consulta si el código está pagado | Caro de operar. Un servidor es una responsabilidad de por vida |

**Recomiendo A.** Se aprovecho todo lo construido: el HMAC, el código, el
generador del vendedor, el registro de emisiones. Lo único que cambia es que
el código se canjea **contra la cuenta de nube** (guardada en
`expo-secure-store`), no contra el ID del teléfono.

El flujo quedaría:

```
bodeguera conecta su Google/OneDrive
      ↓
pide código por WhatsApp (va su correo, no su ID de teléfono)
      ↓
vendedor emite código ligado a ese correo
      ↓
app verifica el código + confirma que la cuenta conectada es esa
      ↓
nube activada para esa cuenta, en cualquier teléfono que la conecte
```

Esto además resuelve de paso un pendiente que tenemos: hoy cambiar de
teléfono con pago hecho requiere pedir un código nuevo. Con la licencia atada
a la cuenta, **la nube sigue funcionando en el celular nuevo** porque lo que
importa es la cuenta.

## Lo que hay que construir

1. **SatuDrive** — ya está implementado, falta probar en un APK real.
2. **OneDrive** — integración nueva completa (OAuth + Graph API). Es el
   doble del trabajo de Drive. **Pregunta abierta: ¿lo necesito?** Google
   Drive cubre la Needs covered; OneDrive solo agrega valor si la bodeguera ya
   usa Microsoft.
3. **Sincronización** — es la Fase 2 del README, sin empezar, y es la parte
   grande. No es "subir un archivo más": es decidir qué pasa si los dos
   dispositivos editan a la vez.
4. **Mover el bloqueo** de la venta a la nube. Es un cambio chico en el código
   (un `if` más) una vez que el permiso de nube esté definido.

## Preguntas antes de decidir

1. **¿OneDrive vale el doble de trabajo?** La integración de Google Drive ya
   está hecha. OneDrive sería desde cero y solo suma valor si la usuaria ya
   vive en Microsoft.
2. **¿La bodeguera tiene más de un dispositivo?** Si nunca va a usar dos
   teléfonos, la sincronización es un fantasma y el premium es solo respaldo.
3. **¿Precio?** Sin empresa, esto es un cobro entre personas. Un monto alto y
   único funciona mejor que una suscripción mensual que hay que renovar.

Pendiente de decisión, no es solo implementación.
