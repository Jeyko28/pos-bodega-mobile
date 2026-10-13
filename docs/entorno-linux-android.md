---
tipo: referencia
tags: [android, linux, emulador, sdk]
---

# Montar el entorno en Linux

> Herramientas: [[herramientas-de-prueba]] · Medición: [[2026-10-13-medicion-rendimiento]]

El README tiene una sección de dev con **PowerShell** y emuladores de Windows.
Esa parte quedó obsoleta al cambiar a Linux. Acá está la versión actual.

## Qué se necesita

| Herramienta | Versión | Nota |
|---|---|---|
| Node | 24.x | vía nvm |
| JDK | 17 | lo pide Gradle |
| Android SDK | platform 36, build-tools 36 | |
| System image | `android-36;google_apis;x86_64` | |
| `/dev/kvm` | — | sin esto el emulador es inservible |

Verificar:

```bash
which adb java node
ls -l /dev/kvm          # el usuario debe estar en el grupo kvm
```

## Permisos de ejecución (trampa al venir de Windows)

`node_modules` llega sin el bit de ejecución, porque en Windows da igual:

```bash
chmod +x node_modules/expo/bin/cli node_modules/.bin/expo
```

Sin esto EAS falla con `spawn ... EACCES`. Si reinstalás dependencias en
Linux, vuelve a pasar.

## El AVD

Crear uno con las specs de gama media real (el Redmi 10 de referencia tiene
4 GB; 2 GB es más exigente):

```bash
avdmanager create avd -n BodegaGamaMedia \
  -k "system-images;android-36;google_apis;x86_64" \
  -d "medium_phone"
```

En `~/.android/avd/BodegaGamaMedia.avd/config.ini`:

```ini
hw.ramSize=2048
hw.lcd.width=1080
hw.lcd.height=2400
hw.lcd.density=420
hw.gpu.enabled=yes          # con "no" el emulador va por software, lentísimo
hw.gpu.mode=auto
```

`avdmanager` deja `hw.gpu.enabled=no` por defecto en algunos perfiles: es el
motivo más común de un emulador que "funciona pero va lento".

## Arrancar

```bash
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"
emulator -avd BodegaGamaMedia -no-snapshot -no-boot-anim -gpu auto &

adb devices                                  # debe aparecer emulator-5554
adb shell getprop sys.boot_completed          # esperar "1"
```

### Si el emulador no arranca

`FATAL: Broken AVD system path` casi siempre es la system image **vacía**: se
creó la carpeta pero la descarga se cortó.

```bash
ls ~/Android/Sdk/system-images/android-36/google_apis/x86_64/   # debe tener archivos
sdkmanager --install "system-images;android-36;google_apis;x86_64"
```

Aviso de `sdkmanager`: dice que está *deprecated* y que use el binario
`android`. Funciona igual.

## RAM de la máquina

El emulador pide 2 GB. Con 7.5 GB totales y 5 GB ocupados, el emulador +
Metro + Android Studio juntos no entran. **Si se cuelga o se cierra solo, es
falta de memoria, no un problema de la app.** Cerrar Android Studio durante
las pruebas suele bastar.

## Instalar la app

El dev build viene de EAS (nube, ~7 min):

```bash
npx eas-cli build --platform android --profile development
npx eas-cli build:view <build-id>          # da la URL del APK
curl -sL -o pos.apk "<url>"
adb install -r -t pos.apk
```

Pesaba **197 MB**: es dev build, con Metro dentro y sin minificar. Un build
`preview` baja a ~40 MB. No confundir el tamaño con un problema.

## Correr el bundle

```bash
adb reverse tcp:8081 tcp:8081        # el teléfono/emu ve a Metro
npx expo start --dev-client          # sin --tunnel: ya no hace falta
adb shell am start -a android.intent.action.VIEW \
  -d 'posbodega://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081'
```

Con `--tunnel` (la instrucción del README) es para cuando Metro tiene que
salir a internet por WiFi. Con USB o emulador el reverse directo es más
rápido y más confiable.

## Meter datos de prueba

Ver [[herramientas-de-prueba]]. En resumen:

```bash
node tools/generar-datos-prueba.js 500 20000 60 > /tmp/opencode/datos-prueba.json
node tools/cargar-datos-emulador.js /tmp/opencode/datos-prueba.json
./tools/login-emulador.sh admin prueba123
```

## Automatizar la UI

`adb shell input tap X Y` con coordenadas de una captura **no funciona**: la
captura sale a media resolución y el tap va al lugar equivocado. Hay que sacar
las coordenadas reales de `uiautomator dump`:

```bash
adb shell uiautomator dump /sdcard/ui.xml
adb shell cat /sdcard/ui.xml | tr '>' '\n' | grep -F 'content-desc="Cobrar"' \
  | grep -o 'bounds="\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]"'
```

Y ojo: `grep` con `\|` dentro de `sh -c` anidado se complica; los scripts de
`tools/` ya lo resuelven.
