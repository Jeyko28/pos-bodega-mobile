// Aviso ámbar sobre los días gratis que quedan. Se muestra arriba del POS
// solo la última semana de prueba: antes estorba, después ya es bloqueo.
import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { colors } from '../theme/colors'

export default function AvisoLicencia({ estado, onVerCodigo }) {
  if (!estado || (!estado.avisar && !estado.ultimoDia)) return null

  return (
    <View style={[styles.caja, estado.ultimoDia && styles.cajaUltimo]}>
      <Text style={styles.texto}>
        {estado.ultimoDia
          ? '⏰ ¡Hoy es tu último día gratis! Mañana se pausan las ventas hasta activar.'
          : `⏰ Te quedan ${estado.restantes} días gratis. Activa tu pago único y olvídate.`}
      </Text>
      <TouchableOpacity style={styles.boton} onPress={onVerCodigo}>
        <Text style={styles.botonTexto}>Ver mi código</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  caja: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 12, marginTop: 8, padding: 12, borderRadius: 12, backgroundColor: colors.warningBg, borderWidth: 1, borderColor: colors.warning },
  cajaUltimo: { backgroundColor: colors.dangerBg, borderColor: colors.danger },
  texto: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  boton: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  botonTexto: { color: '#fff', fontWeight: '700', fontSize: 13 },
})
