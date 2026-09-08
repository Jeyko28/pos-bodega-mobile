import { File, Paths } from 'expo-file-system'
import db from './db'

// Un celular no puede correr un temporizador propio de forma confiable: iOS decide
// si deja ejecutar algo en segundo plano, y Android lo limita. Así que el respaldo
// se dispara al abrir la app, cuando ya pasó el periodo elegido. Para una bodega
// que abre la app todos los días equivale a que sea automático.
const PREFIJO = 'respaldo-pos-bodega-'
const MAXIMO_COPIAS = 5

export const FRECUENCIAS = [
  { id: 'nunca', label: 'Desactivado', dias: null },
  { id: 'diario', label: 'Diario', dias: 1 },
  { id: 'semanal', label: 'Semanal', dias: 7 },
  { id: 'mensual', label: 'Mensual', dias: 30 },
]

// Los destinos se resuelven acá para que agregar Google Drive sea sumar un caso,
// sin tocar la lógica de cuándo toca respaldar.
export const DESTINOS = [
  { id: 'local', label: 'Este teléfono', disponible: true },
  { id: 'drive', label: 'Google Drive', disponible: false },
]

function diasDeFrecuencia(id) {
  return FRECUENCIAS.find(f => f.id === id)?.dias ?? null
}

export function tocaRespaldar(config) {
  const dias = diasDeFrecuencia(config.respaldo_frecuencia)
  if (!dias) return false
  if (!config.respaldo_ultimo) return true
  const proximo = new Date(config.respaldo_ultimo)
  proximo.setDate(proximo.getDate() + dias)
  return new Date() >= proximo
}

function nombreDeHoy() {
  return `${PREFIJO}${new Date().toISOString().slice(0, 10)}.json`
}

function guardarLocal() {
  const nombre = nombreDeHoy()
  const archivo = new File(Paths.document, nombre)
  if (archivo.exists) archivo.delete()
  archivo.create()
  archivo.write(db.getBackupJSON())
  return { nombre, uri: archivo.uri }
}

// Se lleva la lista en config en vez de leer el directorio: es determinista y no
// depende de que el respaldo sea lo único guardado ahí.
function registrarYPodar(nombre, archivosPrevios) {
  const archivos = [...archivosPrevios.filter(n => n !== nombre), nombre]
  const sobran = archivos.slice(0, Math.max(0, archivos.length - MAXIMO_COPIAS))
  sobran.forEach(viejo => {
    const archivo = new File(Paths.document, viejo)
    if (archivo.exists) archivo.delete()
  })
  return archivos.slice(-MAXIMO_COPIAS)
}

export async function crearRespaldo() {
  const config = db.getConfig()
  const { nombre, uri } = guardarLocal()
  const archivos = registrarYPodar(nombre, config.respaldo_archivos || [])

  await db.updateConfig({
    respaldo_ultimo: new Date().toISOString(),
    respaldo_archivos: archivos,
  })

  // Cuando exista el destino Drive, la subida va acá: el archivo local ya está
  // escrito y sirve igual como copia de seguridad si la subida falla.
  return { nombre, uri }
}

// Las copias viven en el sandbox de la app, así que el usuario no puede llegar a
// ellas con un explorador de archivos: esta lista es la única forma de verlas y
// de sacarlas del teléfono.
export function listarRespaldos() {
  const config = db.getConfig()
  return (config.respaldo_archivos || [])
    .map(nombre => {
      const archivo = new File(Paths.document, nombre)
      return {
        nombre,
        fecha: nombre.replace(PREFIJO, '').replace('.json', ''),
        uri: archivo.uri,
        existe: archivo.exists,
      }
    })
    .filter(r => r.existe)
    .reverse()
}

export async function respaldarSiToca() {
  const config = db.getConfig()
  if (!tocaRespaldar(config)) return null
  return crearRespaldo()
}
