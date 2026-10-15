// Proveedor de sincronización sobre Google Drive.
//
// La app no habla con Drive, ni con Firebase, ni con ningún servicio: habla
// con este archivo. Tiene tres operaciones y nada más:
//
//   hayProveedorConectado()  → ¿hay con quién sincronizar?
//   escribirBuzon(mio)        → publico mis cambios
//   leerBuzones()             → los buzones de los otros dispositivos
//
// Cambiar de Drive a otro transporte es reemplazar este archivo. Ni las
// pantallas, ni sync.js, ni la fusión se enteran.
//
// ─── Por qué "un buzón por dispositivo" ──────────────────────────────
//
// Cada celular escribe en SU PROPIO archivo dentro de la carpeta común. Dos
// celulares sin internet escribiendo en el mismo archivo se pisarían al
// subirlo; con un archivo por dispositivo cada uno escribe solo en el suyo y
// no puede romper nada del otro. Es una propiedad que Drive ya da sin pedirle
// nada, y es la razón de que esto funcione sin servidor propio.
//
// El archivo se REESCRIBE entero en cada sincronización. Podría escribir solo
// lo nuevo, pero un archivo de 200 KB se sube igual de rápido que uno de 20 KB
// desde un celular, y leer siempre el archivo completo elimina toda una clase
// de errores: si una descarga se pierde o se corta, la siguiente trae todo.
//
// ─── El alcance ──────────────────────────────────────────────────────
//
// Drive está en la cuenta de la dueña de la bodega, así que la sincronización
// funciona sin internet propio, sin servidor y sin pagar. Lo que NO hace —y no
// va a hacer— es compartir la cuenta: la hija entra con la cuenta de su madre.

import db from './db'
import { hayCuentaConectada } from './googleAuth'
import { obtenerOCrearSubcarpeta, leerArchivosDeCarpeta, guardarArchivoEnCarpeta } from './driveUpload'

const CARPETA_SINCRONIZACION = 'POS Bodega — Sincronización'

// El nombre del archivo propio: incluye el id del dispositivo, que es único
// por instalación y ya se genera en db.js.
const PREFIJO_BUZON = 'buzon-'

let idCarpetaCache = null

/** ¿Hay con quién sincronizar? Sin cuenta de Drive, no hay transporte. */
export async function hayProveedorConectado() {
  return hayCuentaConectada()
}

/** La carpeta de sincronización dentro de la de respaldos. Se crea una vez. */
async function carpetaDeSincronizacion() {
  if (idCarpetaCache) return idCarpetaCache
  const r = await obtenerOCrearSubcarpeta(CARPETA_SINCRONIZACION)
  if (!r.success) return { ok: false, error: r.error }
  idCarpetaCache = r.carpetaId
  return { ok: true, id: r.carpetaId }
}

/**
 * Publica mi buzón.
 *
 * Un fallo acá NO es una venta perdida: el buzón se reconstruye desde el
 * historial en el próximo intento (por eso la ventana de 90 días), y la venta
 * ya está guardada en la base local.
 */
export async function escribirBuzon(buzon) {
  const carpeta = await carpetaDeSincronizacion()
  if (!carpeta.ok) return { ok: false, error: carpeta.error }

  const nombre = `${PREFIJO_BUZON}${buzon.dispositivo}.json`
  const r = await guardarArchivoEnCarpeta(carpeta.id, nombre, buzon)
  if (!r.success) return { ok: false, error: r.error }

  return { ok: true }
}

/**
 * Lee los buzones de los otros dispositivos.
 *
 * Se ignoran los archivos mal formados: uno a medio escribir no puede impedir
 * que se lean los demás.
 */
export async function leerBuzones() {
  const carpeta = await carpetaDeSincronizacion()
  if (!carpeta.ok) return []

  const r = await leerArchivosDeCarpeta(carpeta.id)
  if (!r.success) return []

  const mio = db.idDispositivo()
  return r.archivos
    .filter(a => a.datos && typeof a.datos === 'object' && a.datos.dispositivo && a.datos.dispositivo !== mio)
    .map(a => a.datos)
}

export { CARPETA_SINCRONIZACION }