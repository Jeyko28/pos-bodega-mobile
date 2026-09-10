// Mini tutorial inicial: 3 pasos, una idea por pantalla, ~30 segundos.
// La literatura 2026 coincide: techo de 3 pantallas antes de la primera
// acción real, puntos de progreso y botón Omitir siempre visible.
// Se muestra una sola vez, justo después de crear la bodega.
import React, { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import * as Haptics from 'expo-haptics'
import { colors } from '../theme/colors'

const PASOS = [
  {
    emoji: '🛒',
    titulo: 'Vende en segundos',
    texto: 'Busca el producto o escanéalo con la cámara. Cobra en efectivo, Yape o Plin.',
  },
  {
    emoji: '📒',
    titulo: 'Fía sin cuaderno',
    texto: 'Anota lo que te deben tus caseros y recuérdaselo por WhatsApp cuando toque.',
  },
  {
    emoji: '🧾',
    titulo: 'Tu plata cuadra sola',
    texto: 'Cierra tu caja cada turno, mira tu ganancia y guarda copias por si cambias de celular.',
  },
]

export default function OnboardingScreen({ onTerminar }) {
  const [paso, setPaso] = useState(0)
  const ultimo = paso === PASOS.length - 1

  function siguiente() {
    Haptics.selectionAsync()
    if (ultimo) onTerminar()
    else setPaso(paso + 1)
  }

  return (
    <View style={styles.root}>
      <TouchableOpacity onPress={onTerminar} style={styles.omitir}>
        <Text style={styles.omitirTexto}>Omitir</Text>
      </TouchableOpacity>

      <View style={styles.contenido}>
        <Text style={styles.emoji}>{PASOS[paso].emoji}</Text>
        <Text style={styles.titulo}>{PASOS[paso].titulo}</Text>
        <Text style={styles.texto}>{PASOS[paso].texto}</Text>
      </View>

      <View style={styles.pie}>
        <View style={styles.puntos}>
          {PASOS.map((_, i) => (
            <View key={i} style={[styles.punto, i === paso && styles.puntoActivo]} />
          ))}
        </View>
        <TouchableOpacity style={styles.boton} onPress={siguiente}>
          <Text style={styles.botonTexto}>{ultimo ? 'Empezar a vender' : 'Siguiente'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: 24, paddingTop: 64 },
  omitir: { alignSelf: 'flex-end', paddingHorizontal: 14, paddingVertical: 10 },
  omitirTexto: { color: colors.textMuted, fontWeight: '700', fontSize: 15 },
  contenido: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 16 },
  emoji: { fontSize: 72, marginBottom: 8 },
  titulo: { color: colors.text, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  texto: { color: colors.textMuted, fontSize: 16, lineHeight: 23, textAlign: 'center' },
  pie: { gap: 20, paddingBottom: 16 },
  puntos: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  punto: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.borderStrong },
  puntoActivo: { width: 24, backgroundColor: colors.primary },
  boton: { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: 'center' },
  botonTexto: { color: '#fff', fontWeight: '700', fontSize: 16 },
})
