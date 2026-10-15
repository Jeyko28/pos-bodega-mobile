#!/usr/bin/env bash
# Vuelca la pantalla del emulador y lista los campos de texto con su centro.
#
# Las coordenadas de un toque SIEMPRE salen de acá y nunca de una captura:
# un screenshot se ve igual en dos pantallas distintas, y un tap a ciegas en
# el emulador a veces "funciona" en la fila de arriba. Esta es la diferencia
# entre una prueba y una suposición.
set -e
export PATH="$PATH:$ANDROID_HOME/platform-tools"
PKG=${PKG:-com.pos.bodega}
SALIDA=/sdcard/ui-dump.xml

adb shell uiautomator dump "$SALIDA" >/dev/null 2>&1
adb shell cat "$SALIDA" | tr '>' '\n' | grep 'android.widget.EditText' | \
  sed -E 's/^.*text="([^"]*)".*bounds="\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]".*$/\2 \3 \4 \5|\1/'