import React, { useState } from 'react'
import { View, Text, TouchableOpacity, Modal, ScrollView, Pressable, StyleSheet } from 'react-native'
import BotonHeader from './BotonHeader'
import { colors } from '../theme/colors'

const fmt = (n) => `S/ ${Number(n).toFixed(2)}`

// Las notificaciones se calculan en el momento a partir de los datos reales
// (stock y fiado); no hay bandeja guardada ni estado de "leído". Un aviso
// desaparece cuando el problema se resuelve, que es lo que importa en el
// mostrador — no llevar registro de qué se leyó.
export function BotonNotificaciones({ avisos = [] }) {
  const [abierto, setAbierto] = useState(false)

  return (
    <>
      <BotonHeader
        icono="notifications"
        activo={avisos.length > 0}
        colorActivo={colors.warning}
        onPress={() => setAbierto(true)}
      >
        {avisos.length > 0 && (
          <View style={styles.punto}>
            <Text style={styles.puntoTexto}>{avisos.length > 9 ? '9+' : avisos.length}</Text>
          </View>
        )}
      </BotonHeader>

      <Modal visible={abierto} transparent animationType="fade" onRequestClose={() => setAbierto(false)}>
        <View style={styles.fondo}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAbierto(false)} />
          <View style={styles.tarjetaAvisos}>
            <Text style={styles.titulo}>Avisos</Text>

            <ScrollView style={{ maxHeight: 360 }}>
              {avisos.length === 0 && (
                <Text style={styles.vacio}>Todo en orden — sin avisos por ahora.</Text>
              )}
              {avisos.map(a => (
                <View key={a.id} style={styles.aviso}>
                  <Text style={styles.avisoIcono}>{a.icono}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.avisoTitulo}>{a.titulo}</Text>
                    <Text style={styles.avisoDetalle}>{a.detalle}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity style={styles.botonCerrar} onPress={() => setAbierto(false)}>
              <Text style={styles.botonCerrarTexto}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  )
}

// Arma la lista a partir de lo que ya está en la base: productos por acabarse y
// fiados que llevan mucho sin cobrarse.
export function construirAvisos({ bajoStock = [], fiadosAntiguos = [] }) {
  const avisos = []

  bajoStock.forEach(p => {
    const sinStock = parseFloat(p.stock) === 0
    avisos.push({
      id: `stock-${p.id}`,
      icono: sinStock ? '🔴' : '⚠️',
      titulo: sinStock ? `${p.nombre} — sin stock` : `${p.nombre} — quedan ${p.stock}`,
      detalle: sinStock ? 'Se agotó, conviene reponerlo.' : 'Está por acabarse.',
    })
  })

  fiadosAntiguos.forEach(f => {
    const dias = Math.floor((Date.now() - new Date(f.fecha)) / 86400000)
    avisos.push({
      id: `fiado-${f.id}`,
      icono: '📋',
      titulo: `${f.nombre_cliente || 'Cliente'} debe ${fmt(f.saldo)}`,
      detalle: `Hace ${dias} días · ${f.concepto || 'Compra al crédito'}`,
    })
  })

  return avisos
}

const styles = StyleSheet.create({
  punto: { position: 'absolute', top: 0, right: 8, minWidth: 16, height: 16, paddingHorizontal: 3, borderRadius: 999, backgroundColor: colors.warning, alignItems: 'center', justifyContent: 'center' },
  puntoTexto: { color: '#fff', fontSize: 10, fontWeight: '800', lineHeight: 13 },

  fondo: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: 24 },
  tarjetaAvisos: { backgroundColor: colors.card, borderRadius: 16, padding: 20 },
  titulo: { color: colors.text, fontWeight: '700', fontSize: 16, marginBottom: 10 },
  aviso: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  avisoIcono: { fontSize: 18, lineHeight: 24 },
  avisoTitulo: { color: colors.text, fontWeight: '600', fontSize: 14 },
  avisoDetalle: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  vacio: { color: colors.textMuted, textAlign: 'center', paddingVertical: 24, fontSize: 13 },

  botonCerrar: { marginTop: 14, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  botonCerrarTexto: { color: colors.textMuted, fontWeight: '600' },
})
