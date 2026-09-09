import React, { useState, useCallback } from 'react'
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Modal, Alert, KeyboardAvoidingView, Platform, ScrollView, Pressable } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import db from '../data/db'
import { colors } from '../theme/colors'
import BarcodeScannerModal from '../components/BarcodeScannerModal'
import CatalogoBase from '../components/CatalogoBase'
import IngresoMercaderia from '../components/IngresoMercaderia'
import { sugerirEmoji } from '../utils/emoji'
import { CATEGORIAS_BASE } from '../data/categorias'
import { chips } from '../theme/chips'
import { coincide } from '../utils/texto'

const fmt = (n) => `S/ ${Number(n).toFixed(2)}`

// El granel no siempre es peso: en bodega el plátano o el huevo se venden
// sueltos y contados. La unidad define cómo se pide y cómo se cobra.
const UNIDADES_GRANEL = [
  { id: 'kg', label: 'Kilo', singular: 'kilo' },
  { id: 'unidad', label: 'Unidad', singular: 'unidad' },
  { id: 'litro', label: 'Litro', singular: 'litro' },
]

export default function ProductosScreen() {
  const [productos, setProductos] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [categoriaFiltro, setCategoriaFiltro] = useState(null)
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState({ nombre: '', precio: '', stock: '', categoria: '', tipo_venta: 'unidad', unidad: 'kg', codigo: '' })
  const [scanner, setScanner] = useState(false)
  const [catalogo, setCatalogo] = useState(false)
  const [ingreso, setIngreso] = useState(false)
  const [categoriasCustom, setCategoriasCustom] = useState([])
  const [agregandoCategoria, setAgregandoCategoria] = useState(false)
  const [nuevaCategoriaTexto, setNuevaCategoriaTexto] = useState('')
  const [soloBajoStock, setSoloBajoStock] = useState(false)
  const [umbral, setUmbral] = useState(5)

  const CATEGORIAS = [...CATEGORIAS_BASE, ...categoriasCustom]

  useFocusEffect(useCallback(() => {
    setProductos(db.getProductos())
    setCategoriasCustom(db.getCategoriasCustom())
    setUmbral(db.getConfig().umbral_stock_bajo || 5)
  }, []))

  async function confirmarNuevaCategoria() {
    const nombre = nuevaCategoriaTexto.trim()
    if (!nombre) return
    const icon = sugerirEmoji(nombre)
    await db.addCategoriaCustom({ id: nombre, icon })
    setCategoriasCustom(db.getCategoriasCustom())
    setForm(f => ({ ...f, categoria: nombre }))
    setNuevaCategoriaTexto('')
    setAgregandoCategoria(false)
  }

  function abrirNuevo() {
    setEditando(null)
    setForm({ nombre: '', precio: '', stock: '', categoria: '', tipo_venta: 'unidad', unidad: 'kg', codigo: '' })
    setModal(true)
  }

  function abrirEditar(p) {
    setEditando(p)
    setForm({ nombre: p.nombre, precio: String(p.precio), stock: String(p.stock), categoria: p.categoria || '', tipo_venta: p.tipo_venta, unidad: p.unidad || 'kg', codigo: p.codigo || '' })
    setModal(true)
  }

  function handleCodigoEscaneado(codigo) {
    setForm(f => ({ ...f, codigo }))
    setScanner(false)
  }

  const formValido = form.nombre.trim() && form.precio && form.stock && form.categoria

  async function guardar() {
    if (!formValido) return
    const datos = { ...form, unidad: form.tipo_venta === 'granel' ? (form.unidad || 'kg') : 'unidad' }
    if (editando) {
      await db.updateProducto({ id: editando.id, ...datos })
    } else {
      await db.addProducto(datos)
    }
    setModal(false)
    setProductos(db.getProductos())
  }

  function eliminar(p) {
    Alert.alert('Eliminar producto', `¿Eliminar "${p.nombre}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => { await db.deleteProducto(p.id); setProductos(db.getProductos()) } },
    ])
  }

  const enAlerta = (p) => parseFloat(p.stock) <= umbral
  const totalBajoStock = productos.filter(enAlerta).length

  const filtrados = productos
    .filter(p => coincide(p.nombre, busqueda))
    .filter(p => !categoriaFiltro || p.categoria === categoriaFiltro)
    .filter(p => !soloBajoStock || enAlerta(p))

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TextInput style={styles.buscador} placeholder="🔍 Buscar..." placeholderTextColor={colors.placeholder} value={busqueda} onChangeText={setBusqueda} />
        <TouchableOpacity style={styles.botonNuevo} onPress={abrirNuevo}><Text style={styles.botonNuevoTexto}>+ Producto</Text></TouchableOpacity>
      </View>

      {productos.length > 0 && (
        <TouchableOpacity style={styles.botonIngreso} onPress={() => setIngreso(true)}>
          <Text style={styles.botonIngresoTexto}>📦  Ingresar mercadería</Text>
          <Text style={styles.botonIngresoAyuda}>Llegó el proveedor · suma al stock</Text>
        </TouchableOpacity>
      )}

      <View style={chips.fila}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={chips.scroll} contentContainerStyle={chips.contenido}>
          <TouchableOpacity onPress={() => { setCategoriaFiltro(null); setSoloBajoStock(false) }}
            style={[chips.chip, !categoriaFiltro && !soloBajoStock && chips.chipActivo]}>
            <Text style={[chips.texto, !categoriaFiltro && !soloBajoStock && chips.textoActivo]}>Todas</Text>
          </TouchableOpacity>
          {totalBajoStock > 0 && (
            <TouchableOpacity onPress={() => { setSoloBajoStock(!soloBajoStock); setCategoriaFiltro(null) }}
              style={[chips.chip, styles.chipAlerta, soloBajoStock && styles.chipAlertaActivo]}>
              <Text style={chips.icono}>⚠️</Text>
              <Text style={[chips.texto, styles.textoAlerta]}>Stock bajo ({totalBajoStock})</Text>
            </TouchableOpacity>
          )}
          {CATEGORIAS.map(c => (
            <TouchableOpacity key={c.id} onPress={() => { setCategoriaFiltro(c.id); setSoloBajoStock(false) }}
              style={[chips.chip, categoriaFiltro === c.id && chips.chipActivo]}>
              <Text style={chips.icono}>{c.icon}</Text>
              <Text style={[chips.texto, categoriaFiltro === c.id && chips.textoActivo]}>{c.id}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={filtrados}
        keyExtractor={p => String(p.id)}
        contentContainerStyle={{ padding: 12 }}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.fila} onPress={() => abrirEditar(item)} onLongPress={() => eliminar(item)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.nombre}>{item.nombre}</Text>
              <Text style={styles.detalle}>
                {CATEGORIAS.find(c => c.id === item.categoria)?.icon || '🏷️'} {item.categoria || 'General'} ·{' '}
                <Text style={enAlerta(item) && (parseFloat(item.stock) === 0 ? styles.stockCero : styles.stockBajo)}>
                  {parseFloat(item.stock) === 0 ? 'Sin stock' : `Stock: ${item.stock} ${item.tipo_venta === 'granel' ? (item.unidad || 'kg') : 'uds'}`}
                </Text>
              </Text>
            </View>
            <Text style={styles.precio}>{fmt(item.precio)}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.vacioCaja}>
            <Text style={styles.vacio}>Todavía no tienes productos cargados.</Text>
            <TouchableOpacity style={styles.botonCatalogo} onPress={() => setCatalogo(true)}>
              <Text style={styles.botonCatalogoTexto}>📋  Empezar con productos comunes</Text>
            </TouchableOpacity>
            <Text style={styles.vacioAyuda}>
              Marca los que vendes y ajusta precios. Es mucho más rápido que escribirlos uno por uno, y siempre puedes agregar los tuyos con "+ Producto".
            </Text>
          </View>
        }
        ListFooterComponent={filtrados.length > 0 ? (
          <TouchableOpacity style={styles.enlaceCatalogo} onPress={() => setCatalogo(true)}>
            <Text style={styles.enlaceCatalogoTexto}>📋  Agregar productos comunes de bodega</Text>
          </TouchableOpacity>
        ) : null}
      />

      <Modal visible={catalogo} animationType="slide" onRequestClose={() => setCatalogo(false)}>
        <CatalogoBase onCerrar={() => setCatalogo(false)} onAgregados={() => setProductos(db.getProductos())} />
      </Modal>

      <Modal visible={ingreso} animationType="slide" onRequestClose={() => setIngreso(false)}>
        <IngresoMercaderia onCerrar={() => setIngreso(false)} onGuardado={() => setProductos(db.getProductos())} />
      </Modal>

      <Modal visible={modal} transparent={!scanner} animationType="slide" onRequestClose={() => (scanner ? setScanner(false) : setModal(false))}>
        {scanner ? (
          <BarcodeScannerModal onClose={() => setScanner(false)} onScanned={handleCodigoEscaneado} />
        ) : (
        <KeyboardAvoidingView style={styles.modalFondo} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setModal(false)} />
          <ScrollView style={styles.modalScrollLimite} contentContainerStyle={styles.modalCaja} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitulo}>{editando ? 'Editar producto' : 'Nuevo producto'}</Text>
            <TextInput style={styles.input} placeholder="Nombre" placeholderTextColor={colors.placeholder} value={form.nombre} onChangeText={v => setForm(f => ({ ...f, nombre: v }))} />
            <TextInput style={styles.input} placeholder="Precio" placeholderTextColor={colors.placeholder} keyboardType="decimal-pad" value={form.precio} onChangeText={v => setForm(f => ({ ...f, precio: v }))} />
            <TextInput style={styles.input} placeholder="Stock" placeholderTextColor={colors.placeholder} keyboardType="decimal-pad" value={form.stock} onChangeText={v => setForm(f => ({ ...f, stock: v }))} />
            <View style={styles.filaCodigo}>
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Código de barras (opcional)" placeholderTextColor={colors.placeholder}
                value={form.codigo} onChangeText={v => setForm(f => ({ ...f, codigo: v }))} />
              <TouchableOpacity style={styles.botonEscanear} onPress={() => setScanner(true)}>
                <Text style={styles.botonEscanearTexto}>📷</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.etiquetaCategoria}>Categoría</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={chips.scroll} contentContainerStyle={chips.contenido}>
              {CATEGORIAS.map(c => (
                <TouchableOpacity key={c.id} onPress={() => setForm(f => ({ ...f, categoria: c.id }))}
                  style={[chips.chip, form.categoria === c.id && chips.chipActivo]}>
                  <Text style={chips.icono}>{c.icon}</Text>
                  <Text style={[chips.texto, form.categoria === c.id && chips.textoActivo]}>{c.id}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={() => setAgregandoCategoria(true)} style={chips.chipNuevo}>
                <Text style={styles.categoriaTextoNueva}>+ Nueva</Text>
              </TouchableOpacity>
            </ScrollView>

            {agregandoCategoria && (
              <View style={styles.filaNuevaCategoria}>
                <TextInput style={[styles.input, { flex: 1 }]} placeholder="Ej: Especias" placeholderTextColor={colors.placeholder}
                  value={nuevaCategoriaTexto} onChangeText={setNuevaCategoriaTexto} autoFocus />
                <TouchableOpacity style={styles.botonConfirmarCategoria} onPress={confirmarNuevaCategoria}>
                  <Text style={styles.botonConfirmarCategoriaTexto}>{sugerirEmoji(nuevaCategoriaTexto)}  ✓</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.botonCancelarCategoria} onPress={() => { setAgregandoCategoria(false); setNuevaCategoriaTexto('') }}>
                  <Text style={styles.botonCancelarCategoriaTexto}>✕</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.tipoVentaFila}>
              {['unidad', 'granel'].map(t => (
                <TouchableOpacity key={t} onPress={() => setForm(f => ({ ...f, tipo_venta: t }))} style={[styles.tipoVentaBoton, form.tipo_venta === t && styles.tipoVentaBotonActivo]}>
                  <Text style={[styles.tipoVentaTexto, form.tipo_venta === t && styles.tipoVentaTextoActivo]}>{t === 'unidad' ? 'Por unidad' : 'Suelto / a granel'}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {form.tipo_venta === 'granel' && (
              <>
                <Text style={styles.etiquetaCategoria}>Se vende por</Text>
                <View style={styles.tipoVentaFila}>
                  {UNIDADES_GRANEL.map(u => (
                    <TouchableOpacity key={u.id} onPress={() => setForm(f => ({ ...f, unidad: u.id }))}
                      style={[styles.tipoVentaBoton, (form.unidad || 'kg') === u.id && styles.tipoVentaBotonActivo]}>
                      <Text style={[styles.tipoVentaTexto, (form.unidad || 'kg') === u.id && styles.tipoVentaTextoActivo]}>{u.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.ayudaUnidad}>
                  El precio es por {UNIDADES_GRANEL.find(u => u.id === (form.unidad || 'kg'))?.singular}.
                  {(form.unidad || 'kg') === 'unidad'
                    ? ' Sirve para lo que se vende suelto y contado, como el plátano: si son 4 por S/1, pon 0.25 y el cliente podrá pedir "un sol".'
                    : ' El cliente podrá pedir por peso o por monto ("dos soles de azúcar").'}
                </Text>
              </>
            )}
            <View style={styles.filaBotones}>
              <TouchableOpacity style={styles.botonGhost} onPress={() => setModal(false)}><Text style={styles.botonGhostTexto}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.botonPrimario, !formValido && styles.botonDeshabilitado]} onPress={guardar} disabled={!formValido}>
                <Text style={styles.botonPrimarioTexto}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
        )}
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', gap: 8, padding: 12 },
  buscador: { flex: 1, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, color: colors.text },
  botonIngreso: { marginHorizontal: 12, marginBottom: 4, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.card, alignItems: 'center' },
  botonIngresoTexto: { color: colors.text, fontWeight: '700', fontSize: 14 },
  botonIngresoAyuda: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  botonNuevo: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' },
  botonNuevoTexto: { color: colors.primaryText, fontWeight: '700' },
  fila: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  nombre: { color: colors.text, fontWeight: '600', fontSize: 14 },
  detalle: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  stockBajo: { color: colors.warning, fontWeight: '700' },
  stockCero: { color: colors.danger, fontWeight: '700' },
  chipAlerta: { borderColor: colors.warning, backgroundColor: colors.warningBg },
  chipAlertaActivo: { borderWidth: 2 },
  textoAlerta: { color: colors.warning },
  precio: { color: colors.accent, fontWeight: '700', fontSize: 15 },
  vacio: { color: colors.textMuted, textAlign: 'center', fontSize: 14 },
  vacioCaja: { padding: 24, alignItems: 'center', gap: 14 },
  vacioAyuda: { color: colors.textMuted, textAlign: 'center', fontSize: 12, lineHeight: 17 },
  botonCatalogo: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 20, alignSelf: 'stretch', alignItems: 'center' },
  botonCatalogoTexto: { color: colors.primaryText, fontWeight: '700', fontSize: 14 },
  enlaceCatalogo: { paddingVertical: 16, alignItems: 'center' },
  enlaceCatalogoTexto: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  modalFondo: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalCaja: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 10 },
  modalScrollLimite: { flexGrow: 0, maxHeight: '85%' },
  modalTitulo: { color: colors.text, fontWeight: '700', fontSize: 16, marginBottom: 4 },
  input: { backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, color: colors.text, fontSize: 15 },
  filaCodigo: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  botonEscanear: { width: 46, height: 46, borderRadius: 10, backgroundColor: colors.accentBg, borderWidth: 1, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  botonEscanearTexto: { fontSize: 20 },
  etiquetaCategoria: { color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 },
  categoriaTextoNueva: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  filaNuevaCategoria: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: -2 },
  botonConfirmarCategoria: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 12, height: 46, alignItems: 'center', justifyContent: 'center' },
  botonConfirmarCategoriaTexto: { color: colors.primaryText, fontWeight: '700', fontSize: 14 },
  botonCancelarCategoria: { width: 46, height: 46, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  botonCancelarCategoriaTexto: { color: colors.textMuted, fontWeight: '700', fontSize: 16 },
  ayudaUnidad: { color: colors.textMuted, fontSize: 11, lineHeight: 16 },
  tipoVentaFila: { flexDirection: 'row', gap: 8 },
  tipoVentaBoton: { flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  tipoVentaBotonActivo: { backgroundColor: colors.accentBg, borderColor: colors.primary },
  tipoVentaTexto: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  tipoVentaTextoActivo: { color: colors.accent },
  filaBotones: { flexDirection: 'row', gap: 10, marginTop: 8 },
  botonGhost: { flex: 1, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  botonGhostTexto: { color: colors.textMuted, fontWeight: '600' },
  botonPrimario: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center' },
  botonDeshabilitado: { opacity: 0.4 },
  botonPrimarioTexto: { color: colors.primaryText, fontWeight: '700' },
})
