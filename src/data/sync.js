// Sincronización automática entre dispositivos.
//
// ─── Cuándo ─────────────────────────────────────────────────────────
//
// Al abrir la app, al volver del fondo, cada 30 minutos mientras está abierta
// y al cerrar. Son cuatro momentos y ninguno requiere que el cajero haga nada.
//
// Que sea automático y no un botón no es capricho: un botón es una tarea que
// se olvida. Y automatizar acá **no cuesta batería**: sincronizar es una
// petición web normal, no una conexión abierta ni un servicio en segundo
// plano (que Android restringe desde la versión 8). Es lo mismo que abrir
// Instagram y ver las fotos nuevas: llamas, recibes, te desconectas.
//
// ─── La regla de oro ─────────────────────────────────────────────────
//
// **Sincronizar nunca puede detener una venta.** Si no hay red, si el Drive
// falla, si el otro celular no existe: la app vende igual y como mucho muestra
// un aviso discreto que se va solo. Nada de modales bloqueantes, nada de
// esperas: la venta no consulta a la nube ni antes ni después.
//
// Ver docs/2026-10-13-arquitectura-sincronizacion.md

import { AppState } from 'react-native'
import db from './db'
import { leerBuzones, escribirBuzon, hayProveedorConectado } from './syncProveedor'

const INTERVALO_MS = 30 * 60 * 1000   // 30 minutos
const CLAVE_ULTIMA = 'sync_ultima_en'

// ─── Estado ──────────────────────────────────────────────────────────
//
// Se guarda en módulo, no en un Context: la sincronización es del dato, no de
// la pantalla. Dos pantallas pueden mirarla al mismo tiempo sin pelearse.
let enCurso = false
let oyentes = new Set()

function avisar(resumen) {
  oyentes.forEach(fn => { try { fn(resumen) } catch { /* un oyente roto no corta la sincronización */ } })
}

/** Permite que cualquier pantalla se entere de que hubo novedades. */
export function suscribirSync(fn) {
  oyentes.add(fn)
  return () => oyentes.delete(fn)
}

/**
 * Ejecuta una sincronización.
 *
 * Nunca lanza: todo error se convierte en `{ ok: false }`. Quien llama es
 * siempre la interfaz, y una excepción acá aparecería como una pantalla en
 * blanco en medio de una venta.
 *
 * @param {{manual?: boolean}} opciones  manual = la jaló el cajero hacia abajo
 */
export async function sincronizar({ manual = false } = {}) {
  // Dos sincronizaciones a la vez no aportan nada y sí pueden pisarse: la
  // segunda esperaría a la primera sin ganar nada.
  if (enCurso) return { ok: false, motivo: 'en-curso' }
  enCurso = true
  try {
    if (!(await hayProveedorConectado())) {
      // Sin Drive conectado no hay por dónde sincronizar. No es un error: es
      // el estado normal de una app que funciona sola.
      return { ok: false, motivo: 'sin-cuenta' }
    }

    // 1. Publicar lo mío — pero solo si hay algo nuevo. Subir 50 KB de
    //    catálogo cada 30 minutos sin que la bodega haya vendido nada es
    //    gastar la batería del celular de la dueña por nada.
    const firma = db.getFirmaBuzon()
    if (firma !== db.leerConfig('sync_firma', null)) {
      const mio = db.getBuzonPendiente()
      const publicado = await escribirBuzon(mio)
      // Si no se pudo publicar, no se marca la firma: el próximo intento
      // vuelve a intentarlo en vez de dar por publicado lo que no salió.
      if (!publicado?.ok) return { ok: false, motivo: publicado?.error || 'no-se-publico' }
    }

    // 2. Leer lo de los otros y fusionarlo.
    const ajenos = await leerBuzones()
    const resumen = {
      ventasAgregadas: 0, ingresosAgregados: 0, fiadosAgregados: 0,
      abonosAgregados: 0, productosNuevos: 0, clientesNuevos: 0,
      productosActualizados: 0, clientesActualizados: 0, stockRecalculado: 0,
    }
    for (const buzon of ajenos) {
      if (!buzon || buzon.dispositivo === db.idDispositivo()) continue
      const r = db.fusionarBuzon(buzon)
      if (!r) continue
      Object.keys(resumen).forEach(k => { resumen[k] += r[k] || 0 })
    }

    // 3. Ya está. Se marca la hora y la firma para no reintentar en el
    //    próximo arranque si nada cambió.
    db.marcarSincronizado(firma)

    if (huboNovedades(resumen)) avisar(resumen)
    return { ok: true, resumen }
  } catch (e) {
    // Un fallo de red es lo esperado, no una excepción. La venta sigue.
    return { ok: false, motivo: String(e?.message || e) }
  } finally {
    enCurso = false
  }
}

function huboNovedades(r) {
  return r.ventasAgregadas + r.ingresosAgregados + r.fiadosAgregados + r.abonosAgregados +
    r.productosNuevos + r.clientesNuevos + r.productosActualizados + r.clientesActualizados > 0
}

/**
 * ¿Vale la pena sincronizar ahora? (para el arranque y el volver-del-fondo)
 *
 * Devuelve una promesa porque preguntar si hay cuenta de Drive lee
 * SecureStore. Quien llama lo trata como "puede que sí" y no espera: si
 * ternyata no, `sincronizar` se sale en un milisegundo.
 */
export function tocaSincronizar() {
  const ultima = db.leerConfig(CLAVE_ULTIMA, null)
  const fecha = ultima ? Date.parse(ultima) : 0
  if (Date.now() - fecha <= 2 * 60 * 1000) return Promise.resolve(false)  // aún no
  return hayProveedorConectado().then(Boolean).catch(() => false)
}

/**
 * Programa las sincronizaciones automáticas mientras la app está abierta.
 *
 * @param {function} alTerminar  se llama con el resumen si hubo novedades, para
 *                               que la pantalla refresque su lista
 * @returns {function} para detectar (lo llama el useEffect de limpieza)
 */
export function programarSincronizacion(alTerminar) {
  // Al abrir: solo si hace rato que no se sincroniza. Se espera un poco para no
  // competir con la primera carga de la pantalla de ventas, que es lo primero
  // que la bodega necesita ver.
  const alAbrir = setTimeout(() => tocaSincronizar().then(si => { if (si) sincronizar() }), 1500)

  const intervalo = setInterval(() => { sincronizar() }, INTERVALO_MS)

  // Al volver del fondo: si la app estuvo un rato afuera, es cuando más
  // probable es que el otro celular haya vendido algo. El listener compara
  // contra "no estaba activa" para no disparar en cada micro-intercambio con
  // la app de fotos.
  let ibaActiva = AppState.currentState === 'active'
  const alCambiar = (estado) => {
    const activo = estado === 'active'
    if (activo && !ibaActiva) tocaSincronizar().then(si => { if (si) sincronizar() })
    ibaActiva = activo
  }
  const suscripcion = AppState.addEventListener('change', alCambiar)

  const quitar = alTerminar ? suscribirSync(alTerminar) : null

  return () => {
    clearTimeout(alAbrir)
    clearInterval(intervalo)
    suscripcion?.remove()
    quitar?.()
  }
}