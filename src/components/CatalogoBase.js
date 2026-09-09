import React, { useState, useMemo } from 'react'
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import db from '../data/db'
import { CATALOGO_BASE } from '../data/catalogoBase'
import { iconoCategoria } from '../data/categorias'
import { chips } from '../theme/chips'
import { colors } from '../theme/colors'

// Se renderiza como contenido de un <Modal> que ya está abierto (nunca abre uno
// propio): dos <Modal> nativos a la vez rompen en iOS.
export default function CatalogoBase({ onCerrar, onAgregados }) {
  // Es un Modal a pantalla completa, así que dibuja por debajo de la barra de
  // estado y del indicador inferior: hay que respetar esos márgenes a mano.
  const insets = useSafeAreaInsets()
  const [seleccion, setSeleccion] = useState({})
  const [precios, setPrecios] = useState({})
  const [categoria, setCategoria] = useState(null)
  const [guardando, setGuardando] = useState(false)

  // Los que ya están cargados se muestran marcados y bloqueados, para que el
  // dueño vea de un vistazo qué le falta en vez de topárselos al guardar.
  const yaExisten = useMemo(() => {
    const nombres = db.getProductos().map(p => p.nombre.toLowerCase())
    return new Set(nombres)
  }, [])

  const categorias = useMemo(() => [...new Set(CATALOGO_BASE.map(p => p.categoria))], [])
  const visibles = categoria ? CATALOGO_BASE.filter(p => p.categoria === categoria) : CATALOGO_BASE
  const totalElegidos = Object.values(seleccion).filter(Boolean).length

  function alternar(nombre) {
    setSeleccion(s => ({ ...s, [nombre]: !s[nombre] }))
  }

  // Solo se pueden marcar los que no están ya cargados; los demás no son
  // candidatos y contarlos haría que "marcar todos" nunca se sintiera completo.
  const marcables = visibles.filter(p => !yaExisten.has(p.nombre.toLowerCase()))
  const todosMarcados = marcables.length > 0 && marcables.every(p => seleccion[p.nombre])

  function alternarTodos() {
    const cambios = {}
    marcables.forEach(p => { cambios[p.nombre] = !todosMarcados })
    setSeleccion(s => ({ ...s, ...cambios }))
  }

  async function guardar() {
    const elegidos = CATALOGO_BASE
      .filter(p => seleccion[p.nombre])
      .map(p => ({ ...p, precio: parseFloat(precios[p.nombre] ?? p.precio) || p.precio }))

    if (!elegidos.length) return
    setGuardando(true)
    const r = await db.addProductosLote(elegidos)
    setGuardando(false)
    onAgregados?.(r)
    Alert.alert('✓ Listo', `Se agregaron ${r.agregados} productos.${r.omitidos ? ` ${r.omitidos} ya existían.` : ''}\n\nRevisa el stock de cada uno: entran en 0.`)
    onCerrar()
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.encabezado, { paddingTop: insets.top + 14 }]}>
        <Text style={styles.titulo}>Productos comunes de bodega</Text>
        <Text style={styles.ayuda}>
          Marca los que vendes y ajusta el precio. Entran sin código de barras: el código se guarda solo la primera vez que escanees ese producto en tu tienda.
        </Text>
      </View>

      <View style={[chips.fila, styles.filaCategorias]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={chips.scroll} contentContainerStyle={chips.contenido}>
          <TouchableOpacity onPress={() => setCategoria(null)} style={[chips.chip, !categoria && chips.chipActivo]}>
            <Text style={[chips.texto, !categoria && chips.textoActivo]}>Todas</Text>
          </TouchableOpacity>
          {categorias.map(c => (
            <TouchableOpacity key={c} onPress={() => setCategoria(c)} style={[chips.chip, categoria === c && chips.chipActivo]}>
              <Text style={chips.icono}>{iconoCategoria(c)}</Text>
              <Text style={[chips.texto, categoria === c && chips.textoActivo]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.barraSeleccion}>
        <TouchableOpacity onPress={alternarTodos} disabled={!marcables.length}>
          <Text style={[styles.marcarTodosTexto, !marcables.length && { color: colors.textMuted }]}>
            {todosMarcados ? '☑️  Desmarcar' : '⬜  Marcar todos'}
            {categoria ? ` los de ${categoria}` : ''}
            {marcables.length ? ` (${marcables.length})` : ''}
          </Text>
        </TouchableOpacity>
        {totalElegidos > 0 && (
          <Text style={styles.contadorSeleccion}>{totalElegidos} elegidos</Text>
        )}
      </View>

      <ScrollView style={styles.lista} keyboardShouldPersistTaps="handled">
        {visibles.map(p => {
          const existe = yaExisten.has(p.nombre.toLowerCase())
          const marcado = !!seleccion[p.nombre]
          return (
            <TouchableOpacity key={p.nombre} style={[styles.fila, existe && styles.filaExistente]}
              onPress={() => !existe && alternar(p.nombre)} disabled={existe}>
              <Ionicons
                name={existe ? 'checkmark-circle' : marcado ? 'checkbox' : 'square-outline'}
                size={22}
                color={existe ? colors.textMuted : marcado ? colors.primary : colors.borderStrong}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.nombre, existe && { color: colors.textMuted }]}>{p.nombre}</Text>
                <Text style={styles.meta}>
                  {existe ? 'Ya lo tienes' : `${p.categoria}${p.tipo_venta === 'granel' ? ` · por ${p.unidad}` : ''}`}
                </Text>
              </View>
              {!existe && (
                <View style={styles.precioCaja}>
                  <Text style={styles.moneda}>S/</Text>
                  <TextInput
                    style={styles.precioInput}
                    keyboardType="decimal-pad"
                    value={precios[p.nombre] ?? String(p.precio)}
                    onChangeText={v => setPrecios(pr => ({ ...pr, [p.nombre]: v }))}
                  />
                </View>
              )}
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      <View style={[styles.pie, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity style={styles.botonGhost} onPress={onCerrar}>
          <Text style={styles.botonGhostTexto}>Cancelar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.botonPrimario, !totalElegidos && styles.botonDeshabilitado]}
          onPress={guardar} disabled={!totalElegidos || guardando}>
          <Text style={styles.botonPrimarioTexto}>
            {guardando ? 'Agregando...' : totalElegidos ? `Agregar ${totalElegidos}` : 'Elige productos'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  encabezado: { padding: 16, paddingBottom: 4, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  titulo: { color: colors.text, fontWeight: '700', fontSize: 17 },
  ayuda: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 6 },

  filaCategorias: { paddingTop: 12 },
  barraSeleccion: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10 },
  marcarTodosTexto: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  contadorSeleccion: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },

  lista: { flex: 1, paddingHorizontal: 12 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  filaExistente: { opacity: 0.6 },
  nombre: { color: colors.text, fontWeight: '600', fontSize: 14 },
  meta: { color: colors.textMuted, fontSize: 11, marginTop: 2 },

  precioCaja: { flexDirection: 'row', alignItems: 'center', gap: 2, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 8, backgroundColor: colors.input },
  moneda: { color: colors.textMuted, fontSize: 12 },
  precioInput: { width: 46, paddingVertical: 8, color: colors.text, fontSize: 14, fontWeight: '600' },

  pie: { flexDirection: 'row', gap: 10, padding: 16, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border },
  botonGhost: { flex: 1, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  botonGhostTexto: { color: colors.textMuted, fontWeight: '600' },
  botonPrimario: { flex: 2, padding: 14, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center' },
  botonPrimarioTexto: { color: colors.primaryText, fontWeight: '700' },
  botonDeshabilitado: { opacity: 0.5 },
})
