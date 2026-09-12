// Campo de contraseña con ojito para ver lo escrito (vista cansada con
// lentes: sin esto no se sabe si el error fue de dedo o de memoria).
import React, { useState } from 'react'
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '../theme/colors'

export default function CampoClave({ valor, alCambiar, textoGuia, autoFocus }) {
  const [visible, setVisible] = useState(false)
  return (
    <View style={styles.caja}>
      <TextInput
        style={styles.input}
        placeholder={textoGuia}
        placeholderTextColor={colors.placeholder}
        secureTextEntry={!visible}
        value={valor}
        onChangeText={alCambiar}
        autoFocus={autoFocus}
      />
      <TouchableOpacity onPress={() => setVisible(!visible)} style={styles.ojo}>
        <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.textMuted} />
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  caja: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingRight: 4 },
  input: { flex: 1, padding: 14, color: colors.text, fontSize: 15 },
  ojo: { padding: 12 },
})
