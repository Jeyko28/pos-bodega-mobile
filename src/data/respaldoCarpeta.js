import { Platform } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import db from './db'

// Storage Access Framework es la única forma en Android de escribir en una
// carpeta que el usuario ve en su propio explorador de archivos y que
// sobrevive a desinstalar la app — a diferencia de Paths.document (el sandbox
// donde vive hoy el respaldo local, privado e invisible fuera de la app).
// Solo existe en Android 11+; en iOS esta pieza queda inactiva y el respaldo
// dentro de la app sigue funcionando igual que antes.
const CLAVE_CARPETA = 'respaldo_carpeta_uri'

export function safDisponible() {
  return Platform.OS === 'android'
}

export function hayCarpetaElegida(config) {
  return !!config[CLAVE_CARPETA]
}

export async function elegirCarpetaPublica() {
  const permiso = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync()
  if (!permiso.granted) return { success: false }
  // El permiso queda persistido por Android apenas se concede acá — no hace
  // falta volver a pedirlo en cada apertura de la app.
  await db.updateConfig({ [CLAVE_CARPETA]: permiso.directoryUri })
  return { success: true, uri: permiso.directoryUri }
}

export async function olvidarCarpeta() {
  await db.updateConfig({ [CLAVE_CARPETA]: null })
}

// Cada respaldo crea un archivo nuevo (no se sobrescribe ni se podan copias
// viejas acá): esta carpeta es del usuario, la administra él desde su propio
// explorador — a diferencia de la lista dentro de la app, que sí se poda
// porque ahí el usuario no puede entrar a limpiarla manualmente.
export async function guardarEnCarpetaPublica(nombreArchivo, contenidoTexto) {
  const config = db.getConfig()
  const carpetaUri = config[CLAVE_CARPETA]
  if (!carpetaUri) return { success: false, error: 'No hay carpeta elegida.' }

  try {
    const archivoUri = await FileSystem.StorageAccessFramework.createFileAsync(carpetaUri, nombreArchivo, 'application/json')
    await FileSystem.writeAsStringAsync(archivoUri, contenidoTexto)
    return { success: true, uri: archivoUri }
  } catch (e) {
    // El permiso se revoca si el usuario borra la carpeta o resetea permisos
    // del teléfono; ahí hay que pedirlo de nuevo (elegirCarpetaPublica), no
    // reintentar solo.
    return { success: false, error: e?.message || String(e) }
  }
}
