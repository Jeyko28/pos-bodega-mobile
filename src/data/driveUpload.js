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
