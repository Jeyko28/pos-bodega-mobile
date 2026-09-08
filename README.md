# POS Bodega — App móvil

Punto de venta para bodegas pequeñas, pensado para funcionar **solo con un celular**, sin PC y sin internet.

Es un producto **paralelo**, no un reemplazo, de la versión de escritorio (`../pos-bodega`, Electron): esa sigue siendo para quien tiene computadora. Esta apunta a la bodega que recién arranca y cuyo único equipo es un teléfono.

- **Plataforma objetivo:** Android. El desarrollo se prueba en iPhone con Expo Go, pero el usuario final es Android.
- **Stack:** Expo SDK 57, React Native 0.86, React 19, React Navigation, SQLite local.

---

## Levantar el proyecto

```bash
npm install
npm start -- --tunnel
```

Luego se escanea el QR con **Expo Go** en el teléfono.

Sobre `--tunnel`: no es un capricho. La conexión por red local (el modo por defecto) falla seguido — basta con que el WiFi esté marcado como "Público" en Windows, que el firewall bloquee Node, o que la señal sea débil, para que Expo Go no conecte. El túnel enruta por la nube de Expo y evita todo eso. Es más lento pero mucho más confiable.

Si aparece `Unable to resolve module <algo>` después de instalar un paquete, hay que limpiar la caché de Metro:

```bash
npx expo start --tunnel --clear
```

---

## Build de desarrollo (EAS)

Expo Go ya no alcanza para probar Google Drive (necesita un identificador de app propio para el OAuth) ni para SAF. El proyecto está enlazado a EAS (`@jeykg/pos-bodega-mobile`) con perfiles en `eas.json`:

```bash
npx eas-cli build --platform android --profile development
```

Genera un APK instalable directo (sin Play Store) con `expo-dev-client`, que se conecta a Metro igual que Expo Go pero con el código nativo del proyecto (incluye SQLite, cámara, y lo que se vaya agregando). El keystore de firma lo genera y gestiona EAS en la nube — no hay archivo de keystore local que cuidar.

Cualquier cambio en `app.json` bajo `android`/`ios` (permisos, `scheme`, plugins nuevos) es nativo: no basta con recargar la app, hay que compilar un build nuevo.

---

## Estructura

```
src/
  data/
    db.js          Capa de datos: SQLite + migración. Único lugar que toca la base.
    categorias.js  Categorías base compartidas por Productos y Vender.
  screens/         Una pantalla por sección (Setup, Login, POS, Productos, Clientes, Historial, Configuración)
  components/      BarcodeScannerModal
  navigation/      MainTabs (barra inferior)
  theme/           colors.js (paleta) y chips.js (estilo de chip compartido)
  utils/           ticket.js (PDF del comprobante), emoji.js (emoji sugerido por palabra)
  context/         SesionContext (usuario logueado)
```

---

## Capa de datos

Todo pasa por `src/data/db.js`. Ninguna pantalla habla con SQLite directamente.

Las tablas son: `productos`, `ventas`, `detalle_ventas`, `clientes`, `fiado`, `pagos_fiado`, `usuarios`, `categorias_custom` y `config` (clave/valor).

### Migración desde el formato viejo

La primera versión guardaba **todo en un solo JSON dentro de AsyncStorage**, que se reescribía completo en cada venta. Eso no escala: una bodega real acumula miles de ventas, y reescribir el archivo entero en cada cobro se vuelve lento y riesgoso.

`initDB()` migra sola ese JSON a SQLite en el primer arranque, **conservando los IDs originales** para que las deudas sigan apuntando a sus clientes. El JSON viejo **no se borra**: queda como respaldo. La marca de "migrado" se escribe al final, así que si la migración falla la transacción revierte y el siguiente arranque reintenta.

---

## Decisiones que no son obvias leyendo el código

Cada una costó tiempo de depuración o fue una decisión de producto deliberada. Vale la pena leerlas antes de "arreglar" algo que parece raro.

### Técnicas

- **`db.js` usa la API síncrona de expo-sqlite.** Las pantallas ya llamaban a estas funciones de forma síncrona (`db.getProductos()` dentro del render). Pasar todo a asíncrono habría obligado a reescribir las 6 pantallas y multiplicado el riesgo de la migración. Las consultas son chicas; el costo es despreciable.

- **Nunca mostrar dos `<Modal>` nativos a la vez.** En iOS uno de los dos deja de responder. Por eso `BarcodeScannerModal` **no** trae su propio `<Modal>`: se renderiza como contenido del modal que ya está abierto. Y cuando al escanear hay que abrir el modal de peso (producto a granel), primero se cierra la cámara y recién después se abre el otro, con un pequeño retardo.

- **Los chips tienen alto fijo (`theme/chips.js`), no derivado del padding.** Dentro de un `ScrollView` horizontal, la medición automática falla en el primer render y recorta las etiquetas; el síntoma es que se ven bien recién después de tocar cualquier chip. Con alto fijo no hay nada ambiguo que medir. Ese archivo existe para que las tres pantallas que usan chips no vuelvan a divergir.

- **Emoji en categorías, íconos en la barra.** No es inconsistencia: la barra tiene 5 pestañas fijas, así que un set de íconos permite el efecto contorno → relleno al seleccionar. Las categorías las crea el usuario en runtime y `utils/emoji.js` les asigna un emoji a partir de la palabra ("Especias" → 🧂); ningún set de íconos puede hacer eso con una palabra arbitraria.

- **El respaldo automático se dispara al abrir la app, no con un temporizador.** Un celular no puede correr tareas en segundo plano de forma confiable (iOS decide si las ejecuta, Android las limita). `data/respaldo.js` revisa al arrancar si ya pasó el periodo elegido y, si toca, guarda. Para una bodega que abre la app a diario, equivale a que sea automático.

- **Google Drive está implementado en código, pendiente de probar en un build nuevo.** `data/googleAuth.js` maneja el login OAuth (Authorization Code + PKCE, vía `expo-auth-session`) y guarda el refresh token con `expo-secure-store`; `data/driveUpload.js` sube el respaldo a una carpeta "POS Bodega — Respaldos" en el Drive del usuario. `respaldo.js` sube automáticamente después de cada respaldo local si hay una cuenta conectada. El botón para conectar/desconectar vive en Ajustes → Copia de seguridad.

  No funcionaba en Expo Go porque esa app usa un identificador compartido (`host.exp.Exponent`), así que Google no podía asociarle la redirección de OAuth — resuelto al compilar con identificador propio (ver "Identidad de la app" abajo). Estado de cada pieza:

  - *(Hecho)* Identidad de la app en `app.json`: `android.package` / `ios.bundleIdentifier` = `com.pos.bodega`. Se fijó antes de la primera instalación real a propósito: cambiar el nombre de paquete después hace que Android trate la app como otra distinta y el usuario pierda sus datos.
  - *(Hecho)* Cliente OAuth tipo Android creado en Google Cloud (`953316471021-fss1su32i361nm6np4i3guh3i473lf3g.apps.googleusercontent.com`), con el SHA-1 del keystore que EAS generó y gestiona en la nube para los builds de este proyecto.
  - *(Hecho)* Permiso `drive.file` únicamente — la app solo ve los archivos que ella creó, evitando los *scopes* restringidos que exigen auditoría de seguridad.
  - *(Hecho)* Pantalla de consentimiento en modo "Testing" — solo las cuentas agregadas como probadoras pueden iniciar sesión. Publicarla (para cualquier usuario) exige antes una URL de política de privacidad.
  - *(Hecho)* `scheme` en `app.json` incluye el esquema invertido del client ID (`com.googleusercontent.apps.953316471021-...`), que es el formato que Google exige para la redirección en clientes tipo Android. **Es configuración nativa: no toma efecto en el build ya instalado, hace falta compilar un APK nuevo para probar el login real.**

  Si se necesita un segundo cliente OAuth para la build de producción (con su propio SHA-1 si algún día se firma fuera de EAS), se crea igual que este, apuntando al mismo proyecto de Google Cloud.

  Con la app ya en un APK real también se puede reemplazar el disparo "al abrir la app" por un respaldo periódico real con `expo-background-task` (WorkManager en Android). En iOS sigue sin garantía, pero la plataforma objetivo es Android.

- **Storage Access Framework (SAF) está implementado en código, pendiente del mismo build que Drive.** `data/respaldoCarpeta.js` usa `expo-file-system/legacy` (el namespace donde vive `StorageAccessFramework` en este SDK — la API nueva de `File`/`Paths` no la expone) para que el usuario elija una carpeta real una sola vez; Android persiste ese permiso solo. Cada respaldo automático escribe ahí además de en el sandbox de la app, si hay una carpeta elegida. A diferencia de la lista dentro de la app (que sí se poda a 5 copias porque el usuario no puede entrar a limpiarla), en la carpeta pública no se borra nada automáticamente — es del usuario, la administra desde su propio explorador. Es API exclusiva de Android 11+; en iOS la sección no aparece y el respaldo local sigue funcionando igual.

### De producto

- **No existe "Tarjeta" como método de pago.** Una bodega pequeña no tiene datáfono: implica alquiler mensual, comisión y cuenta comercial. Los métodos son Efectivo, Yape, Plin y Fiado.

- **Los abonos de fiado cuentan como ingreso del día en que se cobran**, no del día de la venta al crédito. Aparecen en el Historial como entradas propias ("Abono fiado") con su fecha y su método de pago. La venta fiada original no suma ingreso, porque en ese momento no entró plata.

- **No hay pestaña de Alertas.** El stock bajo vive dentro de Productos (un filtro `⚠️ Stock bajo` más un contador en el ícono de la pestaña). El motivo no es solo aligerar la barra: antes veías la alerta en un lado y tenías que ir a otro para arreglarla.

- **El ticket no es comprobante electrónico ante SUNAT.** Es un PDF de control interno que se comparte por WhatsApp, y lo dice explícitamente en el pie.

- **No hay Dashboard con gráficos.** Se evaluó y se descartó: para una bodega chica, los totales por período (Hoy / Semana / Mes) en Historial cubren la necesidad real sin el peso de mantener una pantalla de reportes.

---

## Estado

**Fase 1 (actual): app autónoma.** Setup, login por usuario, productos con escaneo de código de barras, venta con carritos simultáneos y escaneo continuo, venta a granel por peso, fiado con abonos parciales, historial con filtros, alertas de stock, ticket en PDF y respaldo exportable.

**Fase 2 y 3 (no empezadas):** la PC como servidor local, sincronización por WiFi entre celular y escritorio, y modo contingencia cuando se cae la conexión. El diseño está discutido pero no implementado.

Fuera de alcance por ahora: facturación electrónica SUNAT, importar respaldos, ofertas y promociones, control de vencimientos.
