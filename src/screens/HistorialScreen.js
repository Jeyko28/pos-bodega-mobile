import React, { useState, useCallback } from 'react'
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Modal, ScrollView, Pressable, Alert } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import db from '../data/db'
import { colors } from '../theme/colors'
import { chips } from '../theme/chips'
import { compartirTicket } from '../utils/ticket'

const fmt = (n) => `S/ ${Number(n).toFixed(2)}`
const ICONO = { Efectivo: '💵', Yape: '📱', Plin: '📲', Fiado: '📋' }
const PERIODOS = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'semana', label: 'Esta semana' },
  { id: 'mes', label: 'Este mes' },
]

export default function HistorialScreen() {
  const [ventas, setVentas] = useState([])
  const [resumen, setResumen] = useState({ total_ventas: 0, ingresos: 0 })
  const [periodo, setPeriodo] = useState('hoy')
  const [metodoFiltro, setMetodoFiltro] = useState(null)
  const [ventaSel, setVentaSel] = useState(null)
  const [cierre, setCierre] = useState(null)
  const [compartiendo, setCompartiendo] = useState(false)

  useFocusEffect(useCallback(() => {
    setVentas(db.getHistorialVentas())
    cargarResumen(periodo)
  }, [periodo]))

  function cargarResumen(p) {
    if (p === 'hoy') setResumen(db.getResumenHoy())
    else if (p === 'semana') setResumen(db.getResumenPeriodo(7))
    else setResumen(db.getResumenPeriodo(30))
  }

  function abrirCierre() { setCierre(db.getCierreCaja()) }

  async function handleCompartir() {
    setCompartiendo(true)
    try {
      await compartirTicket(ventaSel, db.getConfig())
    } catch (e) {
      Alert.alert('Error', 'No se pudo generar el ticket.')
    }
    setCompartiendo(false)
  }

  const etiquetaPeriodo = PERIODOS.find(p => p.id === periodo)?.label.toLowerCase()
  const metodosDisponibles = Object.keys(ICONO).filter(m => ventas.some(v => v.metodo_pago === m))
  const ventasFiltradas = metodoFiltro ? ventas.filter(v => v.metodo_pago === metodoFiltro) : ventas

  return (
    <View style={styles.root}>
      <View style={styles.periodoFila}>
        {PERIODOS.map(p => (
          <TouchableOpacity key={p.id} onPress={() => setPeriodo(p.id)} style={[styles.periodoChip, periodo === p.id && styles.periodoChipActivo]}>
            <Text style={[styles.periodoTexto, periodo === p.id && styles.periodoTextoActivo]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {metodosDisponibles.length > 1 && (
        <View style={chips.fila}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={chips.scroll} contentContainerStyle={[chips.contenido, { paddingHorizontal: 16 }]}>
            <TouchableOpacity onPress={() => setMetodoFiltro(null)} style={[chips.chip, !metodoFiltro && chips.chipActivo]}>
              <Text style={[chips.texto, !metodoFiltro && chips.textoActivo]}>Todos</Text>
            </TouchableOpacity>
            {metodosDisponibles.map(m => (
              <TouchableOpacity key={m} onPress={() => setMetodoFiltro(m)} style={[chips.chip, metodoFiltro === m && chips.chipActivo]}>
                <Text style={chips.icono}>{ICONO[m]}</Text>
                <Text style={[chips.texto, metodoFiltro === m && chips.textoActivo]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={styles.resumen}>
        <View style={styles.resumenBox}>
          <Text style={styles.resumenValor}>{resumen.total_ventas}</Text>
          <Text style={styles.resumenLabel}>Ventas {etiquetaPeriodo}</Text>
        </View>
        <View style={styles.resumenBox}>
          <Text style={styles.resumenValor}>{fmt(resumen.ingresos)}</Text>
          <Text style={styles.resumenLabel}>Ingresos {etiquetaPeriodo}</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.botonCierre} onPress={abrirCierre}>
        <Text style={styles.botonCierreTexto}>🧮  Cierre de caja de hoy</Text>
      </TouchableOpacity>

      <FlatList
        data={ventasFiltradas}
        keyExtractor={v => String(v.id)}
        contentContainerStyle={{ padding: 12 }}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.fila} onPress={() => setVentaSel(item)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.venta}>{item.tipo === 'pago_fiado' ? 'Abono fiado' : `Venta #${item.id}`} {ICONO[item.metodo_pago] || ''} {item.metodo_pago}</Text>
              <Text style={styles.fecha}>{new Date(item.fecha).toLocaleString('es-PE')}</Text>
              {item.nombre_cliente && <Text style={styles.cliente}>{item.nombre_cliente}</Text>}
            </View>
            <Text style={styles.total}>{fmt(item.total)}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.vacio}>{metodoFiltro ? `No hay ventas con ${metodoFiltro}.` : 'Todavía no hay ventas registradas.'}</Text>}
      />

      <Modal visible={!!cierre} transparent animationType="slide" onRequestClose={() => setCierre(null)}>
        <View style={styles.modalFondo}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCierre(null)} />
          <View style={[styles.modalCaja, { maxHeight: '85%' }]}>
            {cierre && (
              <>
                <Text style={styles.modalTitulo}>🧮 Cierre de caja</Text>
                <Text style={styles.modalFecha}>{new Date().toLocaleDateString('es-PE')} · {cierre.total_ventas} ventas</Text>

                <ScrollView style={{ marginTop: 12 }}>
                  {cierre.metodos.length === 0 && <Text style={styles.vacio}>Todavía no se cobró nada hoy.</Text>}
                  {cierre.metodos.map(m => (
                    <View key={m.metodo} style={styles.filaTotalLinea}>
                      <Text style={styles.itemNombre}>{ICONO[m.metodo] || ''} {m.metodo} ({m.cantidad})</Text>
                      <Text style={styles.itemSubtotal}>{fmt(m.monto)}</Text>
                    </View>
                  ))}
                </ScrollView>

                <View style={styles.cierreCajon}>
                  <Text style={styles.cierreCajonLabel}>💵 En el cajón debería haber</Text>
                  <Text style={styles.cierreCajonValor}>{fmt(cierre.efectivo)}</Text>
                </View>

                <View style={styles.filaTotalLinea}>
                  <Text style={styles.textoMuted}>Cobrado en digital (Yape/Plin)</Text>
                  <Text style={styles.textoMuted}>{fmt(cierre.digital)}</Text>
                </View>
                {cierre.fiado_otorgado > 0 && (
                  <View style={styles.filaTotalLinea}>
                    <Text style={styles.textoMuted}>Fiado entregado hoy (no cobrado)</Text>
                    <Text style={styles.textoFiado}>{fmt(cierre.fiado_otorgado)}</Text>
                  </View>
                )}
                <View style={styles.filaTotalLinea}>
                  <Text style={styles.totalGrandeLabel}>TOTAL COBRADO</Text>
                  <Text style={styles.totalGrande}>{fmt(cierre.total_cobrado)}</Text>
                </View>

                <TouchableOpacity style={[styles.botonGhost, { flex: 0, marginTop: 14 }]} onPress={() => setCierre(null)}>
                  <Text style={styles.botonGhostTexto}>Cerrar</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={!!ventaSel} transparent animationType="slide" onRequestClose={() => setVentaSel(null)}>
        <View style={styles.modalFondo}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setVentaSel(null)} />
          <View style={[styles.modalCaja, { maxHeight: '85%' }]}>
            {ventaSel && (
              <>
                <Text style={styles.modalTitulo}>{ventaSel.tipo === 'pago_fiado' ? 'Abono fiado' : `Venta #${ventaSel.id}`} {ICONO[ventaSel.metodo_pago] || ''} {ventaSel.metodo_pago}</Text>
                <Text style={styles.modalFecha}>{new Date(ventaSel.fecha).toLocaleString('es-PE')}</Text>
                {ventaSel.nombre_cliente && <Text style={styles.modalCliente}>Cliente: {ventaSel.nombre_cliente}</Text>}

                <ScrollView style={{ marginTop: 12, marginBottom: 8 }}>
                  {(ventaSel.items || []).map(it => (
                    <View key={it.id} style={styles.itemFila}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemNombre}>{it.nombre_producto}</Text>
                        <Text style={styles.itemCantidad}>{it.cantidad} x {fmt(it.precio_unitario)}</Text>
                      </View>
                      <Text style={styles.itemSubtotal}>{fmt(it.subtotal)}</Text>
                    </View>
                  ))}
                </ScrollView>

                {ventaSel.descuento > 0 && (
                  <View style={styles.filaTotalLinea}>
                    <Text style={styles.textoMuted}>Descuento</Text>
                    <Text style={styles.textoMuted}>-{fmt(ventaSel.descuento)}</Text>
                  </View>
                )}
                <View style={styles.filaTotalLinea}>
                  <Text style={styles.totalGrandeLabel}>TOTAL</Text>
                  <Text style={styles.totalGrande}>{fmt(ventaSel.total)}</Text>
                </View>
                {ventaSel.metodo_pago === 'Efectivo' && ventaSel.tipo !== 'pago_fiado' && (
                  <>
                    <View style={styles.filaTotalLinea}>
                      <Text style={styles.textoMuted}>Recibido</Text>
                      <Text style={styles.textoMuted}>{fmt(ventaSel.monto_recibido)}</Text>
                    </View>
                    <View style={styles.filaTotalLinea}>
                      <Text style={styles.textoMuted}>Vuelto</Text>
                      <Text style={styles.textoMuted}>{fmt(ventaSel.vuelto)}</Text>
                    </View>
                  </>
                )}

                <View style={styles.filaBotones}>
                  <TouchableOpacity style={styles.botonGhost} onPress={() => setVentaSel(null)}>
                    <Text style={styles.botonGhostTexto}>Cerrar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.botonPrimario} onPress={handleCompartir} disabled={compartiendo}>
                    <Text style={styles.botonPrimarioTexto}>{compartiendo ? 'Generando...' : '📄 Compartir ticket'}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  periodoFila: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  periodoChip: { flex: 1, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  periodoChipActivo: { backgroundColor: colors.accentBg, borderColor: colors.primary },
  periodoTexto: { color: colors.textMuted, fontWeight: '600', fontSize: 13 },
  periodoTextoActivo: { color: colors.accent },
  botonCierre: { marginHorizontal: 16, marginBottom: 4, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.card, alignItems: 'center' },
  botonCierreTexto: { color: colors.text, fontWeight: '700', fontSize: 14 },
  cierreCajon: { marginTop: 12, marginBottom: 4, padding: 14, borderRadius: 12, backgroundColor: colors.accentBg, borderWidth: 1, borderColor: colors.primary },
  cierreCajonLabel: { color: colors.textMuted, fontSize: 13, marginBottom: 4 },
  cierreCajonValor: { color: colors.accent, fontWeight: '800', fontSize: 26 },
  textoFiado: { color: colors.warning, fontWeight: '700' },
  resumen: { flexDirection: 'row', gap: 10, padding: 16 },
  resumenBox: { flex: 1, backgroundColor: colors.card, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  resumenValor: { color: colors.accent, fontWeight: '900', fontSize: 20 },
  resumenLabel: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  fila: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  venta: { color: colors.text, fontWeight: '600', fontSize: 13 },
  fecha: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  cliente: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  total: { color: colors.accent, fontWeight: '700', fontSize: 15 },
  vacio: { color: colors.textMuted, textAlign: 'center', padding: 24, fontSize: 13 },
  modalFondo: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalCaja: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalTitulo: { color: colors.text, fontWeight: '700', fontSize: 16 },
  modalFecha: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  modalCliente: { color: colors.textMuted, fontSize: 13, marginTop: 4, fontWeight: '600' },
  itemFila: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderColor: colors.border },
  itemNombre: { color: colors.text, fontSize: 14, fontWeight: '600' },
  itemCantidad: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  itemSubtotal: { color: colors.text, fontWeight: '700', fontSize: 14 },
  filaTotalLinea: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  textoMuted: { color: colors.textMuted, fontSize: 13 },
  totalGrandeLabel: { color: colors.text, fontWeight: '900', fontSize: 18 },
  totalGrande: { color: colors.accent, fontWeight: '900', fontSize: 18 },
  filaBotones: { flexDirection: 'row', gap: 10, marginTop: 16 },
  botonGhost: { flex: 1, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  botonGhostTexto: { color: colors.textMuted, fontWeight: '600' },
  botonPrimario: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center' },
  botonPrimarioTexto: { color: colors.primaryText, fontWeight: '700' },
})
