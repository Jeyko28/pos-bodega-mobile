# Pruebas en un teléfono real — 15 de octubre de 2026

Por primera vez probamos la app en un teléfono de verdad: un **Redmi Note 10**
(modelo 2106119AL), Android 12, Snapdragon. Antes todo se probaba en emulador.

Este documento es el registro de lo que se encontró. Casi todo son problemas
que **solo aparecen en hardware real** y que el emulador no puede mostrar.

Ver también: [[2026-10-13-arquitectura-sincronizacion]] ·
[[2026-10-13-medicion-rendimiento]] · [Y�EADME]]

---

## 1. Conectar el celular a la compu

### El cable USB se caía cada pocos minutos

El Note 10 se desconectaba de adb constantemente. La causa fue doble: la
pantalla se apagaba (el modo depuración se corta con la pantalla apagada), y
el cable no daba corriente suficiente. Al final, cambiar de puerto USB lo
resolvió a medias, pero la conexión siguió inestable: adb perdía el
dispositivo cada 2-3 minutos incluso con la pantalla encendida.

En el log del sistema aparecen líneas del tipo WifiVendorHal ERROR_UNKNOWN
cada 3 segundos. La pila de WiFi del cemular está quejándose.

### La red local tampoco funcionaba

Con el celular por WiFi, ambos equipos estaban en el rango 192.168.18.x y sin
embargo el celular no llegaba a Metro. Se probaron adb reverse, localhost, la
IP directa y el firewall. Nada funcionó.

### Lo que sí funcionó: el túnel de Expo

    npx expo start --tunnel

Metro publica una dirección pública de ngrok y el celular entra por
internet, sin firewall ni red local. **Es la única vía estable.** El túnel
caduca cuando Metro se reinicia y hay que volver a escanear el QR.

> **Regla**: en este proyecto, Metro siempre con --tunnel.

### Detalle de MIUI

- Hay que activar **Depuración USB (ajustes de seguridad)**, un interruptor
  propio de Xiaomi, distinto del de "Depuración USB" común.
- Sin ese ajuste el celular aparece en adb devices pero rechaza los comandos
  de shell.
- La instalación por adb (INSTALL_FAILED_USER_RESTRICTED) también lo necesita.

---

## 2. Gradle se comía la memoria

La primera compilación felló con el mensaje "Gradle build daemon disappeared
unexpectedly". El log del kernel dice la verdad:

    Out of memory: Killed process 399297 (java) total-vm:8220932kB, anon-rss:3381580kB

La máquina tiene 7,5 GB y Gradle llegó a 3,4 GB. El arreglo es un tope en
android/gradle.properties:

    org.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m -Dfile.encoding=UTF-8
    org.gradle.workers.max=2
    org.gradle.parallel=false
    org.gradle.daemon=false
    kotlin.daemon.jvmargs=-Xmx1024m

daemon=false es lo más importante: es el proceso que queda tomando RAM entre
compilaciones. El compilador de Kotlin abre **otra** JVM y esa también hay
que acotarla. Con esto: BUILD SUCCESSFUL in 3m 52s.

---

## 3. sqlite3 no existe en un teléfono real

Este es el hallazgo con más consecuencias. **Android 9 eliminó el binario
sqlite3 de la imagen del sistema.** El emulador lo tiene (es imagen de
Google con extras), el Note 10 no:

    sh: sqlite3: inaccessible or not found

Todas nuestras herramientas de prueba dependen de ejecutar sqlite3 adentro
del teléfono:

| Herramienta | Estado en teléfono real |
|---|---|
| cargar-datos-emulador.js | no funciona |
| probar-fusion-real.js | no funciona |
| probar-fusion.js | no funciona |
| licencia-estado.js | no funciona |
| probar-union.js | no funciona |

En el emulador todas pasaban. **En hardware real, ninguna.**

> **Deuda técnica**: hay que rehacer estas herramientas para que no dependan
> de binarios del sistema del teléfono.

---

## 4. La base usa WAL y por eso "pesaba vacía"

Después de que cargar-datos-emulador.js fallara, el archivo
pos-bodega.db pesaba **4096 bytes**. No estaba vacía: los datos estaban en los
archivos vecinos.

    pos-bodega.db       4.096
    pos-bodega.db-wal  32.768   <- los datos reales
    pos-bodega.db-shm 477.952

expo-sqlite abre la base en modo **WAL**: escribe primero en el archivo -wal
y el .db principal queda en una página hasta el próximo checkpoint. Hay que
bajar los **tres** archivos.

    adb -s $S shell am force-stop com.pos.bodega
    adb -s $S exec-out run-as com.pos.bodega cat files/SQLite/pos-bodega.db     > /tmp/p.db
    adb -s $S exec-out run-as com.pos.bodega cat files/SQLite/pos-bodega.db-wal > /tmp/p.db-wal
    adb -s $S exec-out run-as com.pos.bodega cat files/SQLite/pos-bodega.db-shm > /tmp/p.db-shm

    $SQLITE /tmp/p.db "PRAGMA wal_checkpoint(TRUNCATE);"
    $SQLITE /tmp/p.db "PRAGMA journal_mode=DELETE;"

Usar exec-out y no shell: el shell remoto convierte los saltos de línea y
corrompe el binario.

Ruta real de la base: /data/data/com.pos.bodega/files/SQLite/
Con run-as se puede usar la relativa files/SQLite/, que es más corta.

---

## 5. La herramienta de carga borra la base si falla

cargar-datos-emulador.js creó una base vacía de 4096 bytes y **tapó la que
tenía la app**, perdiendo el usuario y toda la configuración. Encima
reportó éxito en el paso de copia ("Copiando al sandbox de la app...") cuando
el archivo nunca llegó a existir.

> **Esta es la herramienta más peligrosa del repositorio.** Antes de volver a
> usarla hay que corregirla: que no toque la base hasta tener el SQL listo, y
> que verifique que la copia existe.

---

## 6. El bug del typo: hayProveedorConcepto

La sincronización automática no arrancó nunca. Error en el teléfono:

    Uncaught Error: Property 'hayProveedorConectado' doesn't exist
      at tocaSincronizar (src/data/sync.js:124)

Causa: en src/data/sync.js el import decía

    import { leerBuzones, escribirBuzon, hayProveedorConcepto } from './syncProveedor'

Es decir, hayProveedorConcepto en vez de hayProveedorConectado. El módulo
existe y lo exporta bien; lo que se importaba no existía.

**Cómo se llegó a eso:** el nombre mal escrito estaba en el primer
borrador. Una edición para corregirlo falló sin avisar, y al reescribir el
archivo completo no se verificó que el cambio quedara.

**Diagnóstico que sirvió**: mostrar el archivo entero con
sed -n '1,40p' src/data/sync.js. Los grep apuntaban al import correcto y aun
así fallaba, porque el grep anterior se había corrido en otro momento.

> **Lecci�.:**: cuando una herramienta dice que hizo algo, verificar el
> archivo. Un grep exitoso no prueba que el archivo esté bien.

### Hipótesis que se descartaron (para no repetirlas)

- Caché vieja de Metro: npx expo start --tunnel --clear no lo arregló.
- Ciclo de imports: googleAuth.js solo importa expo-auth-session y
  expo-secure-store; driveUpload.js solo expo-file-system. No hay vuelta.
- Bundle sin la función: grep -c sobre el bundle servido dio 9 apariciones.
- Archivo duplicado: find devolvió un solo syncProveedor.js.
- Dos instancias de Metro peleando por el puerto 8081: era cierto, pero no
  era la causa.

---

## 7. La app funciona en el Note 10

Con el bug corregido, la app abre y vende sin errores de JavaScript. Un dato
que hay que tener en cuenta:

    ReactNativeJS: Memory warning (pressure level) TRIM_MEMORY_RUNNING_MODERATE

**El Note 10 pide memoria con la base casi vacía.** Con el historial completo
esto puede ponerse serio, y es el motivo de fondo para la prueba de 20 000
ventas.

También se ve MiuiMultiWindowUtils "device is selenium": el equipo está en un
modo de prudeas, así que las cifras de rendimiento no son definitivas hasta
repetirlas en un equipo normal.

---

## 8. El acento grave no es seguro en esta máquina

kitty usa el acento grave como tecla modificadora, y al pegar texto largo
los bloques de código con tres acentos graves se interpretaron como
sustitución de comandos. El bloque del documento se abrió a medias.

**Regla**: la documentación que se pegue en esta terminal va sin acentos
graves. Para marcar código se usa sangrado de 4 espacios, que en Obsidian se
ve igual.

---

## Lo que quedó pendiente

- Probar con 20 000 ventas in el teléfono (la base ya está cargada y lista).
- Verificar que el stock derivado coincide con el esperado.
- Probar sincronización real con Drive (falta decidir la cuenta de Google).
- Arreglar las herramientas de prueba para que no usen sqlite3.
- Hacer que cargar-datos-emulador.js no destruya la base.
- Commitear el trabajo de fusión y sincronización.
- Actualizar Expo (57.0.20 a 57.0.29), no antes de que sea estable.

---

## Receta: cargar datos en un teléfono real

    # 1. Generar datos
    node tools/generar-datos-prueba.js > /tmp/datos.json

    # 2. App corriendo, con la bodega creada

    # 3. Parar y bajar base + WAL
    adb -s $S shell am force-stop com.pos.bodega
    adb -s $S exec-out run-as com.pos.bodega cat files/SQLite/pos-bodega.db     > /tmp/p.db
    adb -s $S exec-out run-as com.pos.bodega cat files/SQLite/pos-bodega.db-wal > /tmp/p.db-wal
    adb -s $S exec-out run-as com.pos.bodega cat files/SQLite/pos-bodega.db-shm > /tmp/p.db-shm

    # 4. Consolidar y aplicar los datos
    $SQLITE /tmp/p.db "PRAGMA wal_checkpoint(TRUNCATE);"
    $SQLITE /tmp/p.db < /tmp/carga-datos.sql
    $SQLITE /tmp/p.db "PRAGMA journal_mode=DELETE;"

    # 5. Verificar ANTES de subir
    $SQLITE /tmp/p.db "SELECT COUNT(*) FROM ventas;"     # 20000

    # 6. Subir un solo archivo
    adb -s $S push /tmp/p.db /data/local/tmp/p.db
    adb -s $S shell run-as com.pos.bodega rm -f files/SQLite/pos-bodega.db-wal files/SQLite/pos-bodega.db-shm
    adb -s $S shell run-as com.pos.bodega cp /data/local/tmp/p.db files/SQLite/pos-bodega.db
    adb -s $S shell run-as com.pos.bodega ls -l files/SQLite/

    # 7. Abrir
    adb -s $S shell am start -n com.pos.bodega/.MainActivity
