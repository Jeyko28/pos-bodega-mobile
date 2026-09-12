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

Cualquier cambio en `app.json` bajo `android`/`ios` (permisos, `scheme`, plugins nuevos) es nativo: no basta con recargar la app, hay que compilar un build nuevo. Lo mismo al agregar un paquete con código nativo (ej: `expo-clipboard`): el APK dev instalado no lo trae hasta recompilar.

---

## Estructura

```
src/
  data/
    db.js          Capa de datos: SQLite + migración. Único lugar que toca la base.
    categorias.js  Categorías base compartidas por Productos y Vender.
  screens/         Una pantalla por sección (Setup, Login, POS, Productos, Clientes, Historial, Configuración)
  components/      BarcodeScannerModal, CatalogoBase, IngresoMercaderia, PanelUsuario, HeaderAcciones, BotonHeader
  navigation/      MainTabs (barra inferior)
  theme/           colors.js (paleta) y chips.js (estilo de chip compartido)
  utils/           ticket.js (PDF), emoji.js (emoji por palabra), texto.js (búsqueda sin tildes),
                   cobranza.js (mensaje de WhatsApp), teclado.js (alto del teclado y área segura)
  context/         SesionContext (usuario logueado)
```

---

## Capa de datos

Todo pasa por `src/data/db.js`. Ninguna pantalla habla con SQLite directamente.

Las tablas son: `productos`, `ventas`, `detalle_ventas`, `clientes`, `fiado`, `pagos_fiado`, `usuarios`, `categorias_custom`, `ingresos` y `detalle_ingresos` (mercadería que llega del proveedor), `sesiones_caja` y `salidas_caja` (turnos de caja y plata que sale del cajón) y `config` (clave/valor).

El costo de compra vive en `productos.costo` (opcional) y se **congela** en `detalle_ventas.costo_unitario` al vender.

Las columnas nuevas se agregan en `agregarColumnasFaltantes()`: `CREATE TABLE IF NOT EXISTS` no toca una tabla que ya existe, así que para las bodegas que ya venían usando la app hay que sumarlas con `ALTER TABLE`, comprobando antes con `PRAGMA table_info` porque SQLite no tiene "ADD COLUMN IF NOT EXISTS".

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

- **El teclado se resuelve de dos formas distintas, y no es duplicación.** Una pantalla con scroll propio (Ajustes, Setup, catálogo, ingreso de mercadería) usa `KeyboardAwareScrollView`: el problema ahí es llevar el campo enfocado a la vista. Una hoja anclada abajo dentro de un `<Modal>` (cobro, granel, editar producto, clientes, panel de usuario) no puede resolverlo scrolleando — su contenido no desborda, así que no hay nada que desplazar: hay que **subir la hoja**. Para eso `utils/teclado.js` mide el alto real del teclado y el contenedor le reserva ese hueco. El margen del área segura se suma **siempre**, porque en Android con la app de borde a borde el alto que reporta el teclado no incluye la franja de la barra de gestos, y sin sumarlo la hoja queda unos píxeles por debajo de su borde.

  Ojo con `KeyboardAwareScrollView` en Android: si `enableOnAndroid` está activo, la librería **reescribe** el `contentContainerStyle` con `paddingBottom = (estilo || {}).paddingBottom + altoTeclado`. Si se le pasa un array, ese lookup da `undefined` y termina pisando el padding propio. Por eso las pantallas que la usan declaran `paddingBottom` explícito en un objeto plano.

  Toda apertura de hoja llama a `Keyboard.dismiss()` primero: si el teclado queda abierto, Android lo esconde al cambiar de ventana sin disparar el evento de cierre, la altura medida queda atorada y la hoja flota a media pantalla. Si ya estaba cerrado, despedirlo no hace nada.

### De producto

- **La caja se abre y se cierra por turno, no por día.** Un cierre real necesita contra qué comparar: el fondo con el que se abrió. `sesiones_caja` guarda apertura, cierre, quién hizo cada una, lo esperado, lo contado y la diferencia — las dos cifras, no solo el descuadre, porque cuando no cuadra lo que se revisa es de dónde salió. Los totales del turno se calculan por rango de tiempo (desde `abierta_en`), no marcando cada venta con su sesión: así un turno que cruza la medianoche o dos turnos en un mismo día salen bien sin tocar la tabla `ventas`.

  **Del cajón también sale plata**, y no registrarlo era lo que hacía mentir al cierre: se le paga al distribuidor, se manda por pan, el dueño saca para él. `salidas_caja` guarda cada salida con su motivo y se resta de lo esperado. Sin eso el cierre acusa un faltante que no existe, y a la segunda vez nadie vuelve a cerrar caja.

  **Vender nunca exige tener la caja abierta.** Si el dueño no la abrió, el cuadre se cae al día de hoy y muestra los números igual, solo que sin fondo contra el cual comparar. Bloquear la venta por un trámite administrativo es exactamente el error que ya se corrigió con el stock: avisar sí, prohibir no.

- **La ganancia es aproximada y dice sobre cuánto está calculada.** "Ingresos hoy: S/ 640" no responde la pregunta que se hace el dueño — la mayor parte de esa plata es del proveedor. El costo se pide donde ya tiene la factura delante (al ingresar mercadería) o en la ficha del producto, y es **opcional**: exigirlo para poder vender sería peor que no tener el dato. Como no todos los productos lo tendrán, mostrar un número pelado sería mentir, así que la tarjeta dice cuánto de lo vendido quedó fuera del cálculo.

  El costo se **congela** en cada venta (`detalle_ventas.costo_unitario`) en vez de leerlo del producto al calcular: si mañana el proveedor sube el precio, la ganancia de las ventas de hoy no puede cambiar sola.

- **Un monto suelto se cobra sin dar de alta el producto.** Pan, hielo, una bolsa: cosas que se venden a diario y que nadie va a cargar al catálogo. Entran al carrito como "Varios" con un id no numérico, y por eso `realizarVenta` guarda el detalle con `producto_id` nulo y no le descuenta stock a nadie. Sin esta salida, cada una de esas ventas se quedaba fuera del sistema y arrastraba el cuadre de caja con ella.

- **El stock puede quedar negativo, y eso es información, no un error.** Como vender no exige stock (ver arriba), se vende más de lo registrado todos los días: llegó el camión y no se alcanzó a ingresar, los productos del catálogo base entran en 0, alguien contó mal. Frenar el descuento en cero (`MAX(0, ...)`) hacía que el inventario se desviara en silencio: al ingresar 20 del proveedor la app diría 20 cuando en el estante hay 15. En negativo se corrige solo al ingresar, y el número dice cuánto se vendió sin registrar. En pantalla nunca se muestra "-3": se muestra "Faltan 3 uds por ingresar", que es la acción concreta.

- **El fiado se abona al total del cliente, no deuda por deuda.** La app reparte el abono de la más vieja a la más nueva y deja un pago por cada deuda tocada, así el historial sigue cuadrando. Repartirlo a mano, fila por fila y con el casero esperando en el mostrador, era más lento que el cuaderno que la app vino a reemplazar.

- **Todo lo registrado se puede corregir, y nada se borra.** En el mostrador uno se equivoca a diario: marcó 2 y era 1, el cliente devolvió el producto, cobró en efectivo y tocó Yape. Sin arreglo posible el stock se desvía solo y el cierre acusa descuadres inventados, así que se anula la venta (devuelve stock, borra el fiado que generó, deja de contar en todos los totales) o se corrige el método desde el detalle. La venta anulada queda listada y tachada: lo que se revisa después es justamente qué se anuló. Un fiado que ya tiene abonos cobrados no se puede anular de una — primero se anulan los abonos, porque esos sí movieron plata real.

- **El respaldo automático viene prendido.** `respaldo_frecuencia` arranca en `'diario'` desde `getConfig()`. Antes no tenía valor por defecto, `tocaRespaldar()` devolvía `false` y una bodega podía trabajar meses sin una sola copia salvo que alguien entrara a Ajustes a activarla. Un respaldo que hay que ir a pedir no protege a nadie.

- **El Historial se consulta por período, no entero.** `getHistorialVentas(desde)` recibe el rango del chip seleccionado. Antes traía todas las ventas y todos sus detalles a memoria en cada entrada a la pestaña: a cien ventas diarias son decenas de miles de filas en unos meses, en un teléfono de gama media. De paso arregla algo que confundía: el chip decía "Hoy" y la lista de abajo mostraba las ventas de todos los tiempos.

- **No existe "Tarjeta" como método de pago.** Una bodega pequeña no tiene datáfono: implica alquiler mensual, comisión y cuenta comercial. Los métodos son Efectivo, Yape, Plin y Fiado.

- **Los abonos de fiado cuentan como ingreso del día en que se cobran**, no del día de la venta al crédito. Aparecen en el Historial como entradas propias ("Abono fiado") con su fecha y su método de pago. La venta fiada original no suma ingreso, porque en ese momento no entró plata.

- **No hay pestaña de Alertas.** El stock bajo vive dentro de Productos (un filtro `⚠️ Stock bajo` más un contador en el ícono de la pestaña). El motivo no es solo aligerar la barra: antes veías la alerta en un lado y tenías que ir a otro para arreglarla.

- **El ticket no es comprobante electrónico ante SUNAT.** Es un PDF de control interno que se comparte por WhatsApp, y lo dice explícitamente en el pie.

- **No hay Dashboard con gráficos.** Se evaluó y se descartó: para una bodega chica, los totales por período (Hoy / Semana / Mes) en Historial cubren la necesidad real sin el peso de mantener una pantalla de reportes.

---

## Estado

**Fase 1 (actual): app autónoma.** Setup, mini tutorial de 3 pasos (~30 segundos, una sola vez tras crear la bodega), login por usuario o huella (verificada en emulador con dedo simulado; el módulo se pide con require perezoso para no tumbar builds viejos), con recupero de contraseña por código del vendedor atado a la instalación (distinto al de activación: `node tools/generar-codigo.js <ID> ["Negocio"] reset`), roles admin/cajero (4 pestañas para todos; Ajustes vive en el perfil del dueño, el cajero ni lo ve), productos con escaneo de código de barras, catálogo base de bodega peruana, ingreso de mercadería con deshacer (por unidades o por bulto del mayorista: caja, six-pack, paquete, fardo o saco, con conversión automática a unidades y prorrateo del costo; se pregunta una sola vez por producto; el escáner corrido suma bultos, el preview muestra el total para cotejar la factura y avisa por nombre las filas sin cantidad antes de guardar). El bulto tiene su propio código de barras (distinto al de la unidad): escanearlo en el ingreso abre directo el producto en modo bulto, y si se escanea vendiendo avisa que es el paquete grande. La ficha del producto (alta) no pide stock ni costo —eso es abastecer— pero sí el bulto opcional con su código; el catálogo base avisa que sus precios son referenciales y al terminar ofrece ingresar lo que hay en el estante, venta con carritos simultáneos y escaneo continuo (botones +/− grandes, quitar por fila, borrado con confirmación, carrito plegable con chevron, vuelto grande en el cobro y en el aviso, una sola barra de búsqueda de 48dp con lupa y X en Vender/Productos/Clientes), venta a granel por peso o por monto, fiado con abonos parciales y cobranza por WhatsApp (tarjeta verde Al día al saldar, ficha nueva anclada abajo con tarjeta de bienvenida, hojas de aviso propias `AvisoHoja` centradas con blur en vez de popups del sistema), apertura y cierre de caja con salidas de efectivo y descuadre, anulación y corrección de ventas, cobro de montos sueltos, costo de compra y ganancia aproximada, historial con filtros, alertas de stock, ticket en PDF y respaldo local, en carpeta pública y en Google Drive con restauración. Textos con piso mínimo de 13 e interruptor "Letra grande" (×1.2) en Ajustes → Legibilidad para vista cansada: escala Vender, Productos, Ingreso, Clientes e Historial (`src/context/LetraContext.js`, flag `letra_grande` en config). Norma de toques (Material 48dp / Apple 44pt / WCAG AA 24px): controles tocables a mínimo 44 de alto (chips, quitar, plegar, limpiar, atajos, Ingreso) con 8 de separación; buscador único de 48dp (`src/components/BarraBusqueda.js`).

Lo que el respaldo **no** incluye: `ingresos`, `detalle_ingresos` ni `sesiones_caja`. Son historial operativo del teléfono, no datos del negocio que deban viajar a otro equipo — pero significa que al cambiar de celular esos historiales no se recuperan. Tampoco viajan las claves `lic_*`: el código de activación está atado a la instalación que lo pidió.

**Fase 2 y 3 (no empezadas):** la PC como servidor local, sincronización por WiFi entre celular y escritorio, y modo contingencia cuando se cae la conexión. El diseño está discutido pero no implementado.

Fuera de alcance por ahora: facturación electrónica SUNAT, importar respaldos, ofertas y promociones, control de vencimientos.

---

## Licencia (pago único offline, verificado 2026-09-09)

30 días gratis desde la instalación. Última semana con aviso ámbar en Vender, último día con aviso fuerte, día 31 se bloquea **solo la venta**: productos, clientes, fiados, historial, caja y respaldos siguen abiertos. Un solo pago, para siempre, sin mensualidad.

- **Código atado a la instalación.** Al arrancar se genera `lic_instal_id` (8 letras, `Crypto.getRandomBytes`) y `lic_instalado_en`. El código de activación son 16 letras (4×4) = 80 bits del `HMAC-SHA256(secreto, "pos-bodega:<ID>")` en Base32 Crockford. Solo sirve en el teléfono que lo pidió: si lo prestan, no les funciona.
- **Sin servidor.** La app verifica offline con un secreto HMAC fragmentado en 3 módulos (ningún archivo lo tiene completo) + ofuscación R8 en el build de producción (`expo-build-properties`). El HMAC está armado a mano porque `expo-crypto` no trae HMAC: usa `Crypto.digest()` sobre bytes (no `digestStringAsync`, que rompería los pads binarios) y UTF-8 manual (Hermes no garantiza `TextEncoder`). Verificado contra el vector RFC 4231 caso 2 y contra `node:crypto`.
- **Flujo vendedor.** La bodeguera toca "Pedir mi código por WhatsApp" (botón `wa.me` al 51981487284 con su ID ya escrito; el número nunca se muestra en pantalla). El vendedor corre `node tools/generar-codigo.js <ID> ["Negocio"]` y le devuelve el código por el mismo chat. Cada emisión queda anotada en `tools/registro-codigos.jsonl` (fecha, ID, negocio, código): un ID con dos negocios distintos es código prestado dando vueltas. Cambio de celular con pago hecho = código nuevo sin costo (el respaldo en Drive trae los datos; la licencia no viaja).
- **Pegar sin tipear.** Si la bodeguera copió el código del WhatsApp, la pantalla lo detecta del portapapeles (`expo-clipboard`: auto-relleno al abrir/enfocar + botón "Pegar código del WhatsApp") y solo toca Activar. Tipear 16 letras con vista cansada es pedir un error.
- **Anti-trampa de reloj.** Se guarda `lic_ultimo_visto` (lo máximo visto) y el cálculo usa `max(hoy, ultimo_visto)`: atrasar la fecha no alarga la prueba.
- **Capas de bloqueo.** `MainTabs` reemplaza Vender por `LicenciaScreen` al vencer + `realizarVenta` lanza error si `getEstadoLicencia().bloqueado` (el POS lo muestra en el Alert de cobro).
- **Soporte.** Tarjeta "Ayuda y soporte" en Ajustes + botón en `LicenciaScreen`, mismo WhatsApp.
- **Límites honestos.** Sin servidor no hay revocación ni amarre inviolable: esto frena al usuario honesto, no a quien desarme el APK (JS sin ofuscar, DB sin cifrar). Reinstalar genera ID nuevo = prueba nueva; se asume como costo de reposición, no como agujero a perseguir.

---

## Origen y forma de trabajo

- Proyecto iniciado en Claude Code; desde 2026-09-09 se trabaja en opencode (Muse Spark).
- Todo cambio funcional se documenta aquí, en la sección Estado.

## Ciclo dev con emulador (verificado 2026-09-09)

Entorno Windows + PowerShell 5.1:

- `npm.ps1`/`npx.ps1` están bloqueados por ExecutionPolicy → usar
  `& "C:\Program Files\nodejs\npx.cmd"` y `& "C:\Program Files\nodejs\npm.cmd"`.
  Node v24.15.0, Expo SDK 57.
- Android Studio instalado y SDK en `%LOCALAPPDATA%\Android\Sdk`, pero `adb`/`emulator`
  NO están en PATH → usar rutas completas (`platform-tools\adb.exe`, `emulator\emulator.exe`).
- AVD `Pixel_6a` (android-34, PlayStore): el skin `pixel_6a` no existe en el SDK
  (`ERROR | unknown skin name 'pixel_6a'`) → arrancar con `-skin 1080x2400`
  (la doc del emulador acepta `<ancho>x<alto>` como skin sin adornos).
- AVD `GamaMedia` (copia del anterior, `-skin 720x1600`): pantalla chica de gama
  media real para verificar que nada se desborda con letra normal y grande.
- Metro corre por defecto en :8081. Si está caído, el iPhone con Expo Go no conecta.

Pasos:

1. Arrancar AVD: `emulator -avd Pixel_6a -no-snapshot -skin 1080x2400` con `Start-Process`
   (a veces el shell que lo lanza muere con `ChildProcess.kill`, pero el emulador
   igual queda vivo: verificar con `adb devices`).
2. `adb reverse tcp:8081 tcp:8081` para que el emulador vea a Metro.
3. Metro: `Start-Process npx.cmd expo start` (verificar con
   `Get-NetTCPConnection -LocalPort 8081` y `Get-CimInstance Win32_Process`).
4. Abrir la app instalada (`com.pos.bodega`, build dev):
   `adb shell am start -a android.intent.action.VIEW -d 'posbodega://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081'`
5. Verificar UI con captura: `adb exec-out screencap -p > pantalla.png` y leer la imagen.
