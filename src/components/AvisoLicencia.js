// Aviso de una línea sobre los días gratis. Se muestra arriba del POS solo
// la última semana de prueba: antes estorba, después ya es bloqueo.
// Toda la franja es el botón (dedos gruesos).
import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { colors } from '../theme/colors'

export default function AvisoLicencia({ estado, onVerCodigo }) {
  if (!estado || (!estado.avisar && !estado.ultimoDia)) return null

  return (
    <TouchableOpacity
      style={[styles.caja, estado.ultimoDia && styles.cajaUltimo]}
      onPress={onVerCodigo}
    >
      <Text style={styles.texto} numberOfLines={1}>
        {estado.ultimoDia
          ? `⏰ ¡Último día gratis! Toca para ver tu código  ›`
          : `⏰ Quedan ${estado.restantes} días gratis · Ver código  ›`}
      </Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  caja: { marginHorizontal: 12, marginTop: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.warningBg, borderWidth: 1, borderColor: colors.warning },
  cajaUltimo: { backgroundColor: colors.dangerBg, borderColor: colors.danger },
  texto: { color: colors.text, fontSize: 13, fontWeight: '700' },
})
