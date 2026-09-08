import React, { useState, useCallback } from 'react'
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Modal, ScrollView, KeyboardAvoidingView, Platform, Pressable } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import db from '../data/db'
import { colors } from '../theme/colors'

const fmt = (n) => `S/ ${Number(n).toFixed(2)}`
const METODOS = ['Efectivo', 'Yape', 'Plin']
const ICONO_METODO = { Efectivo: '💵', Yape: '📱', Plin: '📲' }

export default function ClientesScreen() {
  const [clientes, setClientes] = useState([])
  const [modalNuevo, setModalNuevo] = useState(false)
  const [form, setForm] = useState({ nombre: '', telefono: '' })
  const [clienteDetalle, setClienteDetalle] = useState(null)
  const [fiados, setFiados] = useState([])
  const [montoPago, setMontoPago] = useState({})
  const [metodoPago, setMetodoPago] = useState({})

  useFocusEffect(useCallback(() => { cargar() }, []))

  function cargar() { setClientes(db.getClientes()) }

  async function guardarCliente() {
    if (!form.nombre.trim()) return
    await db.addCliente(form)
    setForm({ nombre: '', telefono: '' })
    setModalNuevo(false)
    cargar()
  }

  function abrirDetalle(c) {
    setClienteDetalle(c)
    setFiados(db.getFiadoCliente(c.id))
  }

  async function pagar(fiadoId) {
    const monto = parseFloat(montoPago[fiadoId])
    if (isNaN(monto) || monto <= 0) return
    await db.pagarFiado({ fiadoId, monto, metodoPago: metodoPago[fiadoId] || 'Efectivo' })
    setFiados(db.getFiadoCliente(clienteDetalle.id))
    setMontoPago(m => ({ ...m, [fiadoId]: '' }))
    cargar()
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.titulo}>Clientes</Text>
        <TouchableOpacity style={styles.botonNuevo} onPress={() => setModalNuevo(true)}><Text style={styles.botonNuevoTexto}>+ Cliente</Text></TouchableOpacity>
      </View>

      <FlatList
        data={clientes}
        keyExtractor={c => String(c.id)}
        contentContainerStyle={{ padding: 12 }}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.fila} onPress={() => abrirDetalle(item)}>
            <Text style={styles.nombre}>{item.nombre}</Text>
            {item.deuda_total > 0 ? <Text style={styles.deuda}>Debe {fmt(item.deuda_total)}</Text> : <Text style={styles.alDia}>Al día</Text>}
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.vacio}>No hay clientes registrados todavía.</Text>}
      />

      {/* Nuevo cliente */}
      <Modal visible={modalNuevo} transparent animationType="slide" onRequestClose={() => setModalNuevo(false)}>
        <KeyboardAvoidingView style={styles.modalFondo} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setModalNuevo(false)} />
          <ScrollView style={styles.modalScrollLimite} contentContainerStyle={styles.modalCaja} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitulo}>Nuevo cliente</Text>
            <TextInput style={styles.input} placeholder="Nombre" placeholderTextColor={colors.placeholder} value={form.nombre} onChangeText={v => setForm(f => ({ ...f, nombre: v }))} />
            <TextInput style={styles.input} placeholder="Teléfono (opcional)" placeholderTextColor={colors.placeholder} value={form.telefono} onChangeText={v => setForm(f => ({ ...f, telefono: v }))} />
            <View style={styles.filaBotones}>
              <TouchableOpacity style={styles.botonGhost} onPress={() => setModalNuevo(false)}><Text style={styles.botonGhostTexto}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={styles.botonPrimario} onPress={guardarCliente}><Text style={styles.botonPrimarioTexto}>Guardar</Text></TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Detalle / fiado */}
      <Modal visible={!!clienteDetalle} transparent animationType="slide" onRequestClose={() => setClienteDetalle(null)}>
        <KeyboardAvoidingView style={styles.modalFondo} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setClienteDetalle(null)} />
          <View style={[styles.modalCaja, { maxHeight: '80%' }]}>
            <Text style={styles.modalTitulo}>{clienteDetalle?.nombre}</Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              {fiados.length === 0 && <Text style={styles.vacio}>Sin historial de fiado.</Text>}
              {fiados.map(f => (
                <View key={f.id} style={styles.fiadoFila}>
                  <Text style={styles.fiadoConcepto} numberOfLines={2}>{f.concepto}</Text>
                  <Text style={styles.fiadoFecha}>{new Date(f.fecha).toLocaleDateString('es-PE')} · {f.estado === 'pagado' ? 'Pagado' : `Saldo: ${fmt(f.saldo)}`}</Text>
                  {f.estado === 'pendiente' && (
                    <View style={styles.fiadoPagoBloque}>
                      <View style={styles.metodoChipsFila}>
                        {METODOS.map(m => (
                          <TouchableOpacity key={m} onPress={() => setMetodoPago(mp => ({ ...mp, [f.id]: m }))}
                            style={[styles.metodoChipMini, (metodoPago[f.id] || 'Efectivo') === m && styles.metodoChipMiniActivo]}>
                            <Text style={styles.metodoChipMiniTexto}>{ICONO_METODO[m]}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <View style={styles.fiadoPago}>
                        <TextInput style={styles.inputPago} placeholder="Monto" placeholderTextColor={colors.placeholder} keyboardType="decimal-pad"
                          value={montoPago[f.id] || ''} onChangeText={v => setMontoPago(m => ({ ...m, [f.id]: v }))} />
                        <TouchableOpacity style={styles.botonPagar} onPress={() => pagar(f.id)}><Text style={styles.botonPagarTexto}>Pagar</Text></TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.botonGhost} onPress={() => setClienteDetalle(null)}><Text style={styles.botonGhostTexto}>Cerrar</Text></TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  titulo: { color: colors.text, fontWeight: '700', fontSize: 18 },
  botonNuevo: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  botonNuevoTexto: { color: colors.primaryText, fontWeight: '700' },
  fila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.card, borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  nombre: { color: colors.text, fontWeight: '600', fontSize: 14 },
  deuda: { color: colors.warning, fontWeight: '700', fontSize: 13 },
  alDia: { color: colors.accent, fontSize: 13 },
  vacio: { color: colors.textMuted, textAlign: 'center', padding: 24, fontSize: 13 },
  modalFondo: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalCaja: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 10 },
  modalScrollLimite: { flexGrow: 0, maxHeight: '85%' },
  modalTitulo: { color: colors.text, fontWeight: '700', fontSize: 16, marginBottom: 4 },
  input: { backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, color: colors.text, fontSize: 15 },
  filaBotones: { flexDirection: 'row', gap: 10, marginTop: 8 },
  botonGhost: { flex: 1, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  botonGhostTexto: { color: colors.textMuted, fontWeight: '600' },
  botonPrimario: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center' },
  botonPrimarioTexto: { color: colors.primaryText, fontWeight: '700' },
  fiadoFila: { backgroundColor: colors.bg, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  fiadoConcepto: { color: colors.text, fontSize: 13 },
  fiadoFecha: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  fiadoPagoBloque: { marginTop: 10, gap: 8 },
  metodoChipsFila: { flexDirection: 'row', gap: 6 },
  metodoChipMini: { width: 38, height: 34, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  metodoChipMiniActivo: { backgroundColor: colors.accentBg, borderColor: colors.primary },
  metodoChipMiniTexto: { fontSize: 16 },
  fiadoPago: { flexDirection: 'row', gap: 6 },
  inputPago: { flex: 1, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8, color: colors.text, fontSize: 12 },
  botonPagar: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 14, justifyContent: 'center' },
  botonPagarTexto: { color: colors.primaryText, fontWeight: '700', fontSize: 12 },
})
