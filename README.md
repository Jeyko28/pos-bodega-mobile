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

- **Google Drive como destino está preparado pero no conectado.** `DESTINOS` en `data/respaldo.js` es el punto donde se enchufa, y `crearRespaldo()` deja el archivo local escrito antes de cualquier subida.

  No funciona en Expo Go porque esa app usa un identificador compartido (`host.exp.Exponent`), así que Google no puede asociarle la redirección de OAuth. Se resuelve al compilar la app con identificador propio. Pendientes para ese día:

  0. *(Ya hecho)* Identidad de la app en `app.json`: `android.package` y `ios.bundleIdentifier` = `com.pos.bodega`, y `scheme` = `posbodega` para la redirección de OAuth. Se fijó antes de la primera instalación a propósito: cambiar el nombre de paquete después hace que Android trate la app como otra distinta y el usuario pierda sus datos.
  1. Cliente OAuth en Google Cloud con el nombre de paquete y **las dos huellas SHA-1**: la del build de desarrollo y la de producción (si EAS maneja las credenciales, la de producción la tiene EAS). Registrar solo una es el error clásico: anda en desarrollo y falla en la versión entregada.
  2. Permiso `drive.file` únicamente — la app solo ve los archivos que ella creó, y así se evitan los *scopes* restringidos que exigen auditoría de seguridad.
  3. Pantalla de consentimiento publicada, lo que obliga a tener una **URL de política de privacidad**. En modo "Testing" solo entran las cuentas agregadas como probadoras.
  4. Refresh token guardado con `expo-secure-store`, para conectar la cuenta una sola vez.

  Con la app ya compilada también se puede reemplazar el disparo "al abrir la app" por un respaldo periódico real con `expo-background-task` (WorkManager en Android). En iOS sigue sin garantía, pero la plataforma objetivo es Android.

- **Pendiente: guardar el respaldo en una carpeta pública de Android (decidido, falta el APK).** Hoy las copias van a `Paths.document`, que es el sandbox de la app: ocupa espacio real en el teléfono pero ningún explorador de archivos puede abrirlo, y se borra si el usuario desinstala. La solución acordada es Storage Access Framework: el usuario elige una vez su carpeta (ej. `Documentos/POS Bodega`), la ve desde su explorador y el respaldo **sobrevive a la desinstalación**. Es API exclusiva de Android y no se puede probar desde el iPhone de desarrollo, por eso va junto con el trabajo del APK.

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
