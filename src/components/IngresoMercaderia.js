import React, { useState, useEffect } from 'react'
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import db from '../data/db'
import BarcodeScannerModal from './BarcodeScannerModal'
import { iconoCategoria } from '../data/categorias'
import { coincide } from '../utils/texto'
import { colors } from '../theme/colors'

// Pantalla para cuando llega el proveedor: se van agregando productos y cuánto
// llegó de cada uno, y al final se suma todo de una sola vez. La alternativa
// (abrir la ficha de cada producto y reescribir el stock haciendo la suma a
// mano) es la razón por la que en la práctica el inventario nunca se actualiza.
export default function IngresoMercaderia({ onCerrar, onGuardado }) {
  const insets = useSafeAreaInsets()
  const [productos, setProductos] = useState([])
  const [categoriasCustom, setCategoriasCustom] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [entradas, setEntradas] = useState([])
  const [scanner, setScanner] = useState(false)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    setProductos(db.getProductos())
    setCategoriasCustom(db.getCategoriasCustom())
  }, [])

  const yaEnLista = (id) => entradas.some(e => e.id === id)
  const candidatos = productos.filter(p => !yaEnLista(p.id) && coincide(p.nombre, busqueda)).slice(0, 20)

  function agregar(producto, cantidadInicial = '1') {
    if (yaEnLista(producto.id)) {
      // Ya estaba: se le suma uno más en vez de duplicar la fila.
      setEntradas(es => es.map(e => e.id === producto.id
        ? { ...e, cantidad: String((parseFloat(e.cantidad) || 0) + 1) }
        : e))
      return
    }
    setEntradas(es => [...es, {
      id: producto.id,
      nombre: producto.nombre,
      categoria: producto.categoria,
      stockActual: parseFloat(producto.stock),
      unidad: producto.tipo_venta === 'granel' ? (producto.unidad || 'kg') : 'uds',
      cantidad: cantidadInicial,
    }])
    setBusqueda('')
  }

  function cambiarCantidad(id, valor) {
    setEntradas(es => es.map(e => e.id === id ? { ...e, cantidad: valor } : e))
  }

  function quitar(id) {
    setEntradas(es => es.filter(e => e.id !== id))
  }

  function codigoEscaneado(codigo) {
    const buscado = String(codigo).trim()
    const p = productos.find(x => String(x.codigo || '').trim() === buscado)
    if (!p) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      Alert.alert('Código desconocido', 'Ese código no está en ningún producto. Puedes buscarlo por nombre en esta misma pantalla, o registrarlo desde Productos.')
      return
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    agregar(p)
  }

  async function guardar() {
    const validas = entradas.filter(e => parseFloat(e.cantidad) > 0)
    if (!validas.length) return
    setGuardando(true)
    const r = await db.ingresarMercaderia(validas)
    setGuardando(false)
    onGuardado?.(r)
    Alert.alert('✓ Mercadería ingresada', `Se actualizó el stock de ${r.actualizados} productos.`)
    onCerrar()
  }

  const totalUnidades = entradas.reduce((s, e) => s + (parseFloat(e.cantidad) || 0), 0)

  if (scanner) {
    return <BarcodeScannerModal continuo onScanned={codigoEscaneado} onClose={() => setScanner(false)} />
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.encabezado, { paddingTop: insets.top + 14 }]}>
        <Text style={styles.titulo}>Ingresar mercadería</Text>
        <Text style={styles.ayuda}>
          Escanea o busca lo que llegó y escribe la cantidad. Se <Text style={{ fontWeight: '700' }}>suma</Text> a lo que ya tenías; no hace falta que calcules el total.
        </Text>
      </View>

      <View style={styles.filaBusqueda}>
        <TextInput
          style={styles.buscador}
          placeholder="Buscar producto..."
          placeholderTextColor={colors.placeholder}
          value={busqueda}
          onChangeText={setBusqueda}
        />
        <TouchableOpacity style={styles.botonEscanear} onPress={() => setScanner(true)}>
          <Ionicons name="barcode-outline" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.lista} keyboardShouldPersistTaps="handled">
        {entradas.length > 0 && (
          <>
            <Text style={styles.subtitulo}>Lo que llegó ({entradas.length})</Text>
            {entradas.map(e => (
              <View key={e.id} style={styles.filaEntrada}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.nombre}>{e.nombre}</Text>
                  <Text style={styles.meta}>
                    Tenías {e.stockActual} → quedará{' '}
                    <Text style={styles.metaResultado}>
                      {(e.stockActual + (parseFloat(e.cantidad) || 0)).toFixed(e.unidad === 'uds' ? 0 : 2)} {e.unidad}
                    </Text>
                  </Text>
                </View>
                <TextInput
                  style={styles.cantidadInput}
                  keyboardType="decimal-pad"
                  value={e.cantidad}
                  onChangeText={v => cambiarCantidad(e.id, v)}
                  selectTextOnFocus
                />
                <TouchableOpacity onPress={() => quitar(e.id)} style={styles.quitar}>
                  <Ionicons name="close-circle" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            ))}
            <View style={styles.separador} />
          </>
        )}

        <Text style={styles.subtitulo}>{busqueda.trim() ? 'Resultados' : 'Tus productos'}</Text>
        {candidatos.map(p => (
          <TouchableOpacity key={p.id} style={styles.filaProducto} onPress={() => agregar(p)}>
            <Text style={styles.icono}>{iconoCategoria(p.categoria, categoriasCustom)}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.nombre}>{p.nombre}</Text>
              <Text style={styles.meta}>Stock actual: {p.stock}</Text>
            </View>
            <Ionicons name="add-circle-outline" size={24} color={colors.primary} />
          </TouchableOpacity>
        ))}
        {!candidatos.length && (
          <Text style={styles.vacio}>
            {busqueda.trim() ? 'Ningún producto coincide.' : 'Ya agregaste todos tus productos a la lista.'}
          </Text>
        )}
      </ScrollView>

      <View style={[styles.pie, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity style={styles.botonGhost} onPress={onCerrar}>
          <Text style={styles.botonGhostTexto}>Cancelar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.botonPrimario, !entradas.length && styles.botonDeshabilitado]}
          onPress={guardar}
          disabled={!entradas.length || guardando}
        >
          <Text style={styles.botonPrimarioTexto}>
            {guardando ? 'Guardando...' : entradas.length ? `Ingresar ${totalUnidades % 1 === 0 ? totalUnidades : totalUnidades.toFixed(2)}` : 'Agrega productos'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  encabezado: { padding: 16, paddingBottom: 10, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  titulo: { color: colors.text, fontWeight: '700', fontSize: 17 },
  ayuda: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 6 },

  filaBusqueda: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  buscador: { flex: 1, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, color: colors.text },
  botonEscanear: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.card },

  lista: { flex: 1, paddingHorizontal: 12 },
  subtitulo: { color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8, marginBottom: 8 },
  separador: { height: 1, backgroundColor: colors.border, marginVertical: 12 },

  filaEntrada: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.accentBg, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.primary },
  filaProducto: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  icono: { fontSize: 20, lineHeight: 26 },
  nombre: { color: colors.text, fontWeight: '600', fontSize: 14 },
  meta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  metaResultado: { color: colors.accent, fontWeight: '700' },
  cantidadInput: { width: 64, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 8, paddingVertical: 10, textAlign: 'center', color: colors.text, fontSize: 15, fontWeight: '700' },
  quitar: { paddingLeft: 2 },
  vacio: { color: colors.textMuted, textAlign: 'center', padding: 24, fontSize: 13 },

  pie: { flexDirection: 'row', gap: 10, padding: 16, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border },
  botonGhost: { flex: 1, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  botonGhostTexto: { color: colors.textMuted, fontWeight: '600' },
  botonPrimario: { flex: 2, padding: 14, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center' },
  botonPrimarioTexto: { color: colors.primaryText, fontWeight: '700' },
  botonDeshabilitado: { opacity: 0.5 },
})
