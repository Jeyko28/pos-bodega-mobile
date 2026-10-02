// Hoja de aviso con el lenguaje de la app, para reemplazar los popups del
// sistema (Alert.alert) que se ven anticuados.
// A propósito NO es un <Modal>: vive como vista superpuesta dentro de la
// pantalla u hoja que la llama, porque dos <Modal> nativos a la vez rompen
// en iOS. Uso:
//   {aviso && <AvisoHoja titulo="..." mensaje="..." botones={[{ texto: 'Listo', primario: true }]} onCerrar={...} />}
// Botones: { texto, onPress?, primario?, peligro? }. Con 3+ botones van en
// columna para que quepan los dedos.
// El fondo es blur real (expo-blur) con caída a sombra si el build aún no
// trae el módulo nativo (igual que la huella: require perezoso).
import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native'
import { colors } from '../theme/colors'

let VistaBlur = undefined
function obtenerBlur() {
  if (VistaBlur !== undefined) return VistaBlur
  try {
    VistaBlur = require('expo-blur').BlurView
  } catch {
    VistaBlur = null
  }
  return VistaBlur
}

export default function AvisoHoja({ titulo, mensaje, botones = [{ texto: 'Listo', primario: true }], onCerrar }) {
  // minHeight de pantalla completa: el centrado no depende del alto del
  // contenedor padre (una hoja a medias lo empujaba abajo).
  const { height } = useWindowDimensions()
  const Blur = obtenerBlur()
  return (
    <View style={[styles.fondo, { minHeight: height }, Blur && styles.fondoBlur]}>
      {Blur ? <Blur intensity={60} tint="light" style={StyleSheet.absoluteFill} /> : null}
      <View style={styles.caja}>
        <Text style={styles.titulo}>{titulo}</Text>
        {!!mensaje && <Text style={styles.mensaje}>{mensaje}</Text>}
        <View style={[styles.filaBotones, botones.length > 2 && styles.filaBotonesColumna]}>
          {botones.map((b, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.boton, b.primario ? styles.botonPrimario : b.peligro ? styles.botonPeligro : styles.botonGhost]}
              onPress={b.onPress || onCerrar}
            >
              <Text style={b.primario || b.peligro ? styles.botonPrimarioTexto : styles.botonGhostTexto}>{b.texto}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  // minHeight de pantalla completa: el centrado no depende del alto del
  // contenedor padre (una hoja a medias lo empujaba abajo).
  // position:absolute ESCRITO A MANO, no spread de absoluteFillObject: el
  // spread no aplicaba el absoluto en Android (medido: fondo en y=276,
  // lista colapsada a h=0) y la tarjeta caía abajo sin fondo. Verificado
  // en emulador con sonda onLayout + captura.
  fondo: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: colors.overlay, justifyContent: 'center', alignItems: 'center', padding: 24, zIndex: 10 },
  fondoBlur: { backgroundColor: 'transparent' },
  caja: { width: '100%', backgroundColor: colors.card, borderRadius: 16, padding: 20, gap: 10,
    // Relieve para que no parezca texto flotando: borde fino completo +
    // sombra marcada (elevation en Android, shadow en iOS).
    borderWidth: 1.5, borderColor: colors.borderStrong,
    elevation: 8, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  titulo: { color: colors.text, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  mensaje: { color: colors.textMuted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  filaBotones: { flexDirection: 'row', gap: 10, marginTop: 6 },
  filaBotonesColumna: { flexDirection: 'column' },
  boton: { flex: 1, padding: 14, borderRadius: 10, alignItems: 'center' },
  botonPrimario: { backgroundColor: colors.primary },
  botonPeligro: { backgroundColor: colors.danger },
  botonPrimarioTexto: { color: '#fff', fontWeight: '700', fontSize: 16 },
  botonGhost: { borderWidth: 1, borderColor: colors.border },
  botonGhostTexto: { color: colors.textMuted, fontWeight: '600', fontSize: 16 },
})
