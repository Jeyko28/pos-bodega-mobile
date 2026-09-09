import { useEffect, useState } from 'react'
import { Keyboard, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Un <Modal> abre su propia ventana nativa: Android no la redimensiona al
// aparecer el teclado (menos aún con la app en modo edge-to-edge), y las hojas
// ancladas abajo quedan tapadas. Medir el alto real del teclado y dejarle ese
// hueco es lo único que funciona igual en ambas plataformas.
export function useAlturaTeclado() {
  const [altura, setAltura] = useState(0)

  useEffect(() => {
    const aparece = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      e => setAltura(e.endCoordinates?.height || 0),
    )
    const desaparece = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setAltura(0),
    )
    return () => { aparece.remove(); desaparece.remove() }
  }, [])

  return altura
}

// Lo que necesita una hoja anclada abajo: cuánto subirla y cuánto respirar al
// final. El margen del sistema se aplica siempre: sin teclado esquiva la barra
// de gestos (la app dibuja de borde a borde), y con teclado compensa que en
// Android la altura reportada del teclado no incluye esa misma franja, así que
// sin sumarla la hoja queda unos píxeles por debajo de su borde.
export function usePieDeHoja() {
  const alturaTeclado = useAlturaTeclado()
  const insets = useSafeAreaInsets()
  return { alturaTeclado, espacioAbajo: insets.bottom }
}
