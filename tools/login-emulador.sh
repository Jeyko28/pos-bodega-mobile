#!/usr/bin/env bash
# Inicia sesión en el emulador escribiendo en los campos correctos.
#
# Los taps a ciegas fallan porque el texto se va al campo que ya tiene foco
# (el primero). Por eso se limpian TODOS los campos con keyevent 67 antes de
# escribir, y se espera a que el teclado/asincronía se estabilice entre pasos.
set -euo pipefail
export PATH="$PATH:${ANDROID_HOME:-$HOME/Android/Sdk}/platform-tools"

limpiar_campo() {
  adb shell input keyevent KEYCODE_MOVE_END
  sleep 0.3
  for _ in $(seq 1 30); do adb shell input keyevent KEYCODE_DEL; done
}

coords() {  # $1 = texto a buscar en el dump
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
  adb shell cat /sdcard/ui.xml 2>/dev/null | tr '>' '\n' \
    | grep "$1" | grep -o 'bounds="\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]"' | head -1 \
    | grep -o '[0-9]*' | paste -sd' ' - | awk '{print int(($1+$3)/2), int(($2+$4)/2)}'
}

escribir() {  # $1 = texto buscado en el dump, $2 = contenido
  local xy; xy=$(coords "$1")
  [ -z "$xy" ] && { echo "No encontré: $1" >&2; exit 1; }
  adb shell input tap $xy
  sleep 1
  limpiar_campo
  sleep 0.5
  adb shell input text "$2"
  sleep 1
}

echo "Limpiando y escribiendo usuario..."
escribir 'hint="Usuario"' "$1"
echo "Limpiando y escribiendo contraseña..."
escribir 'hint="Contrasena"\|hint="Contraseña"' "$2"

# Se oculta el teclado antes de tocar Entrar, si no el botón queda tapado.
adb shell input keyevent KEYCODE_ESCAPE >/dev/null 2>&1 || true
sleep 1

xy=$(coords 'content-desc="Entrar"')
echo "Entrando..."
adb shell input tap $xy
sleep "${3:-25}"
echo "Listo."
