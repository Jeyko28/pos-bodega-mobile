import { File } from 'expo-file-system'
import { obtenerAccessTokenValido } from './googleAuth'

// Subida "multipart" a la API de Drive v3: un solo request con metadata (JSON)
// + contenido, separados por un boundary — es el formato mínimo que Drive acepta
// sin depender de subida reanudable (innecesaria para un archivo de unos KB).
const BOUNDARY = 'pos-bodega-respaldo-boundary'
const CARPETA_NOMBRE = 'POS Bodega — Respaldos'

async function obtenerOCrearCarpeta(accessToken) {
  const busqueda = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      `name='${CARPETA_NOMBRE}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    )}&spaces=drive&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  const resultado = await busqueda.json()
  if (resultado.files?.length) return resultado.files[0].id

  const creada = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: CARPETA_NOMBRE, mimeType: 'application/vnd.google-apps.folder' }),
  })
  const carpeta = await creada.json()
  return carpeta.id
}

export async function subirArchivoADrive(uri, nombreArchivo) {
  const accessToken = await obtenerAccessTokenValido()
  if (!accessToken) return { success: false, error: 'Google Drive no está conectado.' }

  const carpetaId = await obtenerOCrearCarpeta(accessToken)
  const contenido = await new File(uri).text()

  const metadata = { name: nombreArchivo, parents: [carpetaId] }
  const cuerpo =
    `--${BOUNDARY}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${JSON.stringify(metadata)}\r\n` +
    `--${BOUNDARY}\r\n` +
    'Content-Type: application/json\r\n\r\n' +
    `${contenido}\r\n` +
    `--${BOUNDARY}--`

  const respuesta = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${BOUNDARY}` },
    body: cuerpo,
  })

  if (!respuesta.ok) {
    const detalle = await respuesta.text()
    return { success: false, error: `Drive rechazó la subida (${respuesta.status}): ${detalle}` }
  }

  const archivo = await respuesta.json()
  return { success: true, fileId: archivo.id }
}

/**
 * Busca (o crea) una subcarpeta dentro de otra.
 *
 * La carpeta de sincronización vive dentro de la de respaldos, así el usuario
 * ve todo lo de la app en un solo lugar de Drive en vez de en dos carpetas
 * sueltas que no sabría qué son.
 */
export async function obtenerOCrearSubcarpeta(nombre) {
  const accessToken = await obtenerAccessTokenValido()
  if (!accessToken) return { success: false, error: 'Google Drive no está conectado.' }

  const carpetaId = await obtenerOCrearCarpeta(accessToken)
  const busqueda = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      `name='${nombre}' and mimeType='application/vnd.google-apps.folder' and '${carpetaId}' in parents and trashed=false`,
    )}&spaces=drive&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  const existentes = (await busqueda.json()).files || []
  if (existentes.length) return { success: true, carpetaId: existentes[0].id }

  const creada = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nombre, parents: [carpetaId], mimeType: 'application/vnd.google-apps.folder' }),
  })
  const carpeta = await creada.json()
  return { success: true, carpetaId: carpeta.id }
}

/**
 * Lista los archivos de una carpeta, con su contenido.
 *
 * Son 1 request por archivo. Con dos dispositivos son 2 requests por
 * sincronización, y una sincronización cada 30 minutos: nada comparado con
 * cargar una foto. A cambio el buzón es un archivo entero que se relee
 * siempre — así no importa si se perdió una descarga, porque la siguiente
 * trae el archivo completo.
 */
export async function leerArchivosDeCarpeta(carpetaId) {
  const accessToken = await obtenerAccessTokenValido()
  if (!accessToken) return { success: false, error: 'Google Drive no está conectado.' }

  const busqueda = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      `'${carpetaId}' in parents and trashed=false`,
    )}&spaces=drive&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!busqueda.ok) return { success: false, error: `Drive no dejó listar (${busqueda.status})` }
  const listado = await busqueda.json()

  const archivos = []
  for (const f of listado.files || []) {
    const descarga = await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!descarga.ok) continue
    const texto = await descarga.text()
    try { archivos.push({ nombre: f.name, datos: JSON.parse(texto) }) } catch { /* quedó a medias */ }
  }
  return { success: true, archivos }
}

/**
 * Escribe un archivo, reemplazándolo si ya existía.
 *
 * El buzón de cada dispositivo se reescribe entero en cada sincronización.
 * Subirlo como copia nueva dejaría cientos de archivos con el mismo nombre en
 * Drive y, peor, la lectura elegiría cuál es el bueno. Acá se actualiza el
 * existente y se borran los sobrantes, que solo aparecen si una sincronización
 * anterior se cortó a la mitad.
 */
export async function guardarArchivoEnCarpeta(carpetaId, nombreArchivo, contenido) {
  const accessToken = await obtenerAccessTokenValido()
  if (!accessToken) return { success: false, error: 'Google Drive no está conectado.' }

  const texto = typeof contenido === 'string' ? contenido : JSON.stringify(contenido)

  const busqueda = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      `name='${nombreArchivo}' and '${carpetaId}' in parents and trashed=false`,
    )}&spaces=drive&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  const existentes = (await busqueda.json()).files || []

  if (existentes.length) {
    const [principal, ...sobrantes] = existentes
    const respuesta = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${principal.id}?uploadType=media`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: texto,
      },
    )
    for (const s of sobrantes) {
      await fetch(`https://www.googleapis.com/drive/v3/files/${s.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
    }
    if (!respuesta.ok) return { success: false, error: `Drive rechazó la actualización (${respuesta.status})` }
    return { success: true, fileId: principal.id }
  }

  const metadata = { name: nombreArchivo, parents: [carpetaId] }
  const cuerpo =
    `--${BOUNDARY}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${JSON.stringify(metadata)}\r\n` +
    `--${BOUNDARY}\r\n` +
    'Content-Type: application/json\r\n\r\n' +
    `${texto}\r\n` +
    `--${BOUNDARY}--`

  const respuesta = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${BOUNDARY}` },
    body: cuerpo,
  })

  if (!respuesta.ok) {
    const detalle = await respuesta.text()
    return { success: false, error: `Drive rechazó la subida (${respuesta.status}): ${detalle}` }
  }

  const archivo = await respuesta.json()
  return { success: true, fileId: archivo.id }
}
