// Cronómetro de la app.
//
// No es un profiler: es un medidor de las operaciones que el bodeguero
// hace todo el día. Cada vez que la app tarda en algo que una persona
// percibe, queda registrado aquí con su duración. Al final se lee
// `TABLA()` desde Ajustes y sale una tabla con lo que más costó.
//
// El objetivo es reemplazar "se siente lento" por un número. Un segundo de
// lectura no sirve si no sabes si lo pagas tú, SQLite o el render.
//
// Uso:
//   const t = cronometro('cargarPOS')
//   ...trabajo...
//   t()                        // registra el tiempo
//   cronometro('venta', () => db.realizarVenta(...))   // versión asíncrona

const registros = new Map()   // nombre -> { total, veces, peor, reciente[] }
const MARGEN = 20              // cuántas muestras recientes guardar por operación

// El arranque de la app se mide desde el primer import del módulo, no desde
// una llamada explícita: así el número incluye lo que el usuario realmente
// espera, que es desde que toca el ícono hasta que ve la pantalla.
const ARRANQUE = Date.now()

function ahora() {
  // performance.now() es monótono y no lo afecta un cambio de reloj, que
  // sí lo sufriría Date.now() si el usuario ajusta la hora del teléfono.
  return typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now()
}

export function cronometro(nombre, fn) {
  if (typeof fn === 'function') {
    const t0 = ahora()
    const r = fn()
    if (r && typeof r.then === 'function') {
      return r.then(
        (v) => { registrar(nombre, ahora() - t0); return v },
        (e) => { registrar(nombre, ahora() - t0); throw e }
      )
    }
    registrar(nombre, ahora() - t0)
    return r
  }

  const t0 = ahora()
  return (extra) => registrar(nombre, ahora() - t0, extra)
}

function registrar(nombre, ms, extra) {
  let r = registros.get(nombre)
  if (!r) {
    r = { nombre, total: 0, veces: 0, peor: 0, reciente: [] }
    registros.set(nombre, r)
  }
  r.total += ms
  r.veces++
  if (ms > r.peor) r.peor = ms
  r.reciente.push(ms)
  if (r.reciente.length > MARGEN) r.reciente.shift()
  return ms
}

// Marca de arranque. Se llama desde App.js al pintar la primera pantalla;
// la diferencia con ARRANQUE es lo que el usuario realmente percibió.
export function marcarArranqueListo() {
  if (registros.has('arranque')) return registros.get('arranque').ultima
  const ms = Date.now() - ARRANQUE
  registrar('arranque', ms)
  return ms
}

// El tiempo del bundle yaVenía downloaded, pero entre que Hermes levanta y que
// el primer render ocurre hay trabajo que JS sí puede medir.
export function TABLA() {
  const filas = [...registros.values()].map(r => {
    const promedio = r.total / r.veces
    const reciente = r.reciente.reduce((a, b) => a + b, 0) / r.reciente.length
    return {
      nombre: r.nombre,
      veces: r.veces,
      promedio,
      peor: r.peor,
      reciente,
      recienteVes: r.reciente.length,
    }
  })
  // Lo que más costó, primero: es lo único que interesa al leerlo.
  filas.sort((a, b) => b.promedio - a.promedio)
  return filas
}

export function limpiar() {
  registros.clear()
}

export function volcar() {
  // Para leer desde Metro/adb sin abrir la app.
  return TABLA().map(f =>
    `${f.nombre.padEnd(24)} n=${String(f.veces).padStart(4)}  prom=${f.promedio.toFixed(1).padStart(8)}ms  peor=${f.peor.toFixed(1).padStart(8)}ms`
  ).join('\n')
}

export default cronometro
