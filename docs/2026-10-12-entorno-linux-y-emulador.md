---
fecha: 2026-10-12
version: v1.0.0
tipo: sesion
tags: [linux, emulador, sdk, entorno]
---

# Del Windows al Linux — primer arranque del emulador

> Herramientas: [[entorno-linux-android]] · Medición del día siguiente: [[2026-10-13-medicion-rendimiento]]

## Contexto

El proyecto se había desarrollado en Windows con emuladores. Cambió de sistema
operativo y hubo que reconstruir el entorno desde cero. El README todavía
tiene la sección de dev en PowerShell: **quedó obsoleta**.

## Qué se hizo

1. Se verificó el entorno: Node 24, JDK 17, Android SDK 36, `adb` en
   `~/Android/Sdk/platform-tools`. KVM disponible y el usuario en el grupo.
2. Se detectó que el AVD previo (`Medium_Phone_API_37.0`) estaba **corrupto**:
   la carpeta de la system image existía pero vacía. La descarga se había
   cortado en una instalación anterior.
3. Se descargó `android-36` (no 37: es el `compileSdk` que usa el proyecto) y
   se creó `BodegaGamaMedia` con 2 GB de RAM y 1080x2400, para representar la
   gama media real en vez de un flagship.
4. Se arreglaron los permisos de ejecución de `node_modules` (herencia de
   Windows) que hacían fallar EAS con `EACCES`.
5. Build de desarrollo por EAS, instalado en el emulador.

## Obstáculos encontrados

**El AVD no arrancaba.** `FATAL: Broken AVD system path`. La causa fue una
system image vacía, no un problema de permisos ni de virtualización. La
descarga de 1 GB se había interrumpido sin avisar.

**`hw.gpu.enabled=no`.** `avdmanager` lo deja así en algunos perfiles y el
emulador funciona por software: no se nota al arrancar, pero todo va lento.
Es una fuente habitual de "el emulador va lento" que en realidad es "el
emulador va renderizando por CPU".

**El entorno no tenía `adb`, ni JDK, ni Node.** La primera medición de
"¿puedo interactuar con Android Studio?" fue no: sin SDK ni teléfono
conectado no hay forma. Se instaló todo.

**El teléfono no se detectaba.** El cable USB del usuario era **solo de
carga**, sin pines de datos: el teléfono no aparece en `lsusb`. Se siguió con
el emulador. Queda pendiente repetir las pruebas en el Redmi físico cuando
haya un cable de datos.

## Decisiones

- **Emulador de 2 GB en vez del dispositivo real** mientras no haya cable. El
  emulador con KVM rinde distinto a un Snapdragon, así que los números sirven
  para comparar antes/después, no como valor absoluto de producción.
- **Android 36 y no 37**: el proyecto compila contra SDK 36; usar una imagen
  más nueva solo agrega variables.
- **Volumen de datos realista desde el primer día.** Con 10 productos todo
  parece rápido. Con 20.000 ventas aparecen los problemas que de verdad
  afectan al bodeguero (ver [[2026-10-13-medicion-rendimiento]]).

## Aprendido

- En Linux, un AVD "creado" no significa "funcional": la system image se
  descarga aparte y su ausencia no se nota hasta que el emulador muere.
- `chmod +x` sobre `node_modules` es el primer suspect cuando algo funciona en
  Windows y da `EACCES` en Linux.
- Automatizar la UI con `adb shell input` exige leer coordenadas de
  `uiautomator dump`: las de una captura no coinciden.
