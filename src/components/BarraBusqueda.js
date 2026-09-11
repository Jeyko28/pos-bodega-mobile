// Una sola barra de búsqueda, idéntica en Vender, Productos y Clientes:
// misma altura (48 mínimo), misma lupa, misma X para limpiar.
// Antes cada pantalla tenía la suya y se veían de distinto tamaño.
import React from 'react'
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '../theme/colors'

export default function BarraBusqueda({ valor, onCambiar, textoGuia }) {
  return (
    <View style={styles.caja}>
      <Ionicons name="search" size={20} color={colors.textMuted} />
      <TextInput
        style={styles.input}
        placeholder={textoGuia}
        placeholderTextColor={colors.placeholder}
        value={valor}
        onChangeText={onCambiar}
      />
      {valor !== '' && (
        <TouchableOpacity onPress={() => onCambiar('')} style={styles.limpiar}>
          <Text style={styles.limpiarTexto}>✕</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  caja: { flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 48, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, gap: 8 },
  input: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: 10 },
  limpiar: { padding: 10 },
  limpiarTexto: { color: colors.textMuted, fontWeight: '700', fontSize: 18 },
})
