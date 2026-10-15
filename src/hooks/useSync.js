// Sincronización desde la pantalla.
//
// Tres cosas hace, y las tres son deliberadamente discretas:
//
//   1. Jalar hacia abajo refresca. Es el gesto que toda persona conoce y que
//      no necesita explicación. El botón "Sincronizar" que habría podido ir
//      abajo se quitó porque sincronizar es automático: un botón que hay que
//      apretar solo transmite la idea de que no se está haciendo.
//   2. Si una sincronización automática trajo ventas de otro celular, la lista
//      se recarga sola. La dueña no tiene que enterarse de que hubo novedades:
//      las ve, y ya.
//   3. Si falló, sale un aviso que se va solo. No un modal, no una pantalla de
//      error. Falla la nube, no la app.
//
// Y lo que NO hace: bloquear. Mientras sincroniza, la pantalla se puede usar
// entera. Si el cajero quiere vender, vende.
//
// Uso:
//   const { refreshControl, onRefresh } = useSync(cargar, mostrarAviso)

import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshControl } from 'react-native'
import { sincronizar, suscribirSync } from '../data/sync'

/**
 * @param {function} alRefrescarDatos  vuelve a leer de la base local. Se llama
 *                                      DESPUÉS de fusionar, nunca antes: no
 *                                      tiene sentido pintar datos viejos.
 * @param {function} [alAvisar]        si la pantalla ya tiene su propio aviso
 *                                      (POS lo tiene), se usa ese en vez del
 *                                      que traería el hook.
 */
export function useSync(alRefrescarDatos, alAvisar) {
  const [refrescando, setRefrescando] = useState(false)

  // Se guardan en refs para que ni la suscripción a novedades ni el refresco
  // se rehagan en cada render con funciones nuevas.
  const refrescarDatos = useRef(alRefrescarDatos)
  refrescarDatos.current = alRefrescarDatos
  const avisar = useRef(alAvisar)
  avisar.current = alAvisar

  const onRefresh = useCallback(async () => {
    setRefrescando(true)
    try {
      const r = await sincronizar({ manual: true })
      // Siempre recarga, incluso si no había nada nuevo: el gesto del cajero
      // significa "quiero ver el estado real", no solo "quiero sincronizar".
      refrescarDatos.current?.()

      if (r.ok) {
        const n = r.resumen?.ventasAgregadas || 0
        if (n > 0) avisar.current?.(`Se actualizaron ${n} ${n === 1 ? 'venta' : 'ventas'} del otro celular.`)
        return
      }
      // "en-curso" no es un fallo: ya estaba sincronizando, no hay nada que
      // avisar. "sin-cuenta" tampoco: sin Drive conectado la app funciona
      // igual, y decirlo molestaría sin arreglar nada.
      if (r.motivo !== 'en-curso' && r.motivo !== 'sin-cuenta') {
        avisar.current?.('No se pudo actualizar. Revisa tu internet.')
      }
    } catch {
      avisar.current?.('No se pudo actualizar. Revisa tu internet.')
    } finally {
      setRefrescando(false)
    }
  }, [])

  // Novedades que llegan solas (al abrir la app, al volver del fondo, cada
  // 30 minutos): la pantalla se recarga sin que nadie la toque.
  useEffect(() => suscribirSync(() => refrescarDatos.current?.()), [])

  const refreshControl = (
    <RefreshControl
      refreshing={refrescando}
      onRefresh={onRefresh}
      colors={['#1B5E20']}
      progressBackgroundColor="#ffffff"
    />
  )

  return { refrescando, onRefresh, refreshControl }
}