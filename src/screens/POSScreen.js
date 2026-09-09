import React, { useState, useEffect, useCallback, useRef } from 'react'
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Modal, ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, Animated } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import db from '../data/db'
import { useSesion } from '../context/SesionContext'
import { colors } from '../theme/colors'
import { CATEGORIAS_BASE, iconoCategoria } from '../data/categorias'
import BarcodeScannerModal from '../components/BarcodeScannerModal'
import { chips } from '../theme/chips'
import * as Haptics from 'expo-haptics'

const fmt = (n) => `S/ ${Number(n).toFixed(2)}`
const formatearPeso = (n) => parseFloat(Number(n).toFixed(3)).toString()
const METODOS = ['Efectivo', 'Yape', 'Plin', 'Fiado']
// En una bodega el cliente pide por plata ("dame dos soles de azúcar") mucho más
// seguido que por peso, así que el modo por monto es el que va por defecto.
const MONTOS_RAPIDOS = [1, 2, 5, 10]
const PESOS_RAPIDOS = [0.25, 0.5, 1, 2]

// El número de "Cliente N" se calcula según los carritos abiertos en ese
// momento (el menor número libre) — no un contador que solo sube y sube.
function siguienteNumeroCliente(carritosActuales) {
  const usados = new Set(
    carritosActuales
      .map(c => c.nombre.match(/^Cliente (\d+)$/))
      .filter(Boolean)
      .map(m => parseInt(m[1], 10))
  )
  let n = 1
  while (usados.has(n)) n++
  return n
}

function nuevoCarrito(carritosActuales = []) {
  return { id: `c${Date.now()}${Math.random()}`, nombre: `Cliente ${siguienteNumeroCliente(carritosActuales)}`, items: [] }
}

export default function POSScreen() {
  const { usuario } = useSesion()
  const [productos, setProductos] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [carritos, setCarritos] = useState([nuevoCarrito()])
  const [carritoActivoId, setCarritoActivoId] = useState(null)
  const [modalPago, setModalPago] = useState(false)
  const [metodoPago, setMetodoPago] = useState(null)
  const [montoRecibido, setMontoRecibido] = useState('')
  const [clientes, setClientes] = useState([])
  const [clienteFiadoId, setClienteFiadoId] = useState(null)
  const [busquedaCliente, setBusquedaCliente] = useState('')
  const [creandoCliente, setCreandoCliente] = useState(false)
  const [cobrando, setCobrando] = useState(false)
  const [productoGranel, setProductoGranel] = useState(null)
  const [entradaGranel, setEntradaGranel] = useState('')
  const [modoGranel, setModoGranel] = useState('monto')
  const [categoriaFiltro, setCategoriaFiltro] = useState(null)
  const [categoriasCustom, setCategoriasCustom] = useState([])
  const [scanner, setScanner] = useState(false)
  const [mensajeScanner, setMensajeScanner] = useState(null)
  const [codigoHuerfano, setCodigoHuerfano] = useState(null)
  const [busquedaHuerfano, setBusquedaHuerfano] = useState('')

  const [aviso, setAviso] = useState(null)
  const avisoOpacidad = useRef(new Animated.Value(0)).current
  const avisoTimer = useRef(null)

  useEffect(() => { setCarritoActivoId(carritos[0]?.id) }, [])

  useEffect(() => () => clearTimeout(avisoTimer.current), [])

  function mostrarAviso(texto) {
    clearTimeout(avisoTimer.current)
    setAviso(texto)
    Animated.timing(avisoOpacidad, { toValue: 1, duration: 180, useNativeDriver: true }).start()
    avisoTimer.current = setTimeout(() => {
      Animated.timing(avisoOpacidad, { toValue: 0, duration: 400, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setAviso(null)
      })
    }, 3500)
  }

  useFocusEffect(useCallback(() => { cargar() }, []))

  async function cargar() {
    setProductos(db.getProductos())
    setClientes(db.getClientes())
    setCategoriasCustom(db.getCategoriasCustom())
  }

  const carritoActivo = carritos.find(c => c.id === carritoActivoId) || carritos[0]

  function actualizarCarritoActivo(nuevosItems) {
    setCarritos(prev => prev.map(c => c.id === carritoActivo.id ? { ...c, items: nuevosItems } : c))
  }

  // Lo que queda realmente disponible: el stock menos lo que ya está reservado
  // en este carrito. Sin restar el carrito se podrían agregar 5 unidades de un
  // producto con stock 3, y la venta dejaría el stock en negativo.
  function disponibleDe(p) {
    const enCarrito = carritoActivo.items.find(it => it.id === p.id)?.cantidad || 0
    return parseFloat(p.stock) - enCarrito
  }

  function avisarSinStock(p) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
    mostrarAviso(parseFloat(p.stock) <= 0
      ? `${p.nombre} está sin stock`
      : `Solo quedan ${p.stock} de ${p.nombre}`)
  }

  function agregarProducto(p) {
    if (disponibleDe(p) <= 0) { avisarSinStock(p); return }
    if (p.tipo_venta === 'granel') { abrirGranel(p); return }
    const items = carritoActivo.items
    const i = items.findIndex(it => it.id === p.id)
    let nuevos
    if (i !== -1) {
      nuevos = items.map((it, idx) => idx === i ? { ...it, cantidad: it.cantidad + 1, subtotal: (it.cantidad + 1) * it.precio } : it)
    } else {
      nuevos = [...items, { id: p.id, nombre: p.nombre, precio: p.precio, cantidad: 1, subtotal: p.precio, tipo_venta: p.tipo_venta, unidad: p.unidad }]
    }
    actualizarCarritoActivo(nuevos)
  }

  function codigoEscaneado(codigo) {
    const buscado = String(codigo).trim()
    const p = productos.find(x => String(x.codigo || '').trim() === buscado)
    // La vibración importa más que el mensaje: al escanear, el cajero mira el
    // producto y no la pantalla.
    if (!p) {
      // Un código desconocido no es un error: es la forma normal de completar el
      // catálogo. Se cierra la cámara y se ofrece engancharlo a un producto que
      // ya existe (típico de los que entraron sin código desde el catálogo base).
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
      setScanner(false)
      setTimeout(() => setCodigoHuerfano(buscado), 350)
      return
    }
    if (p.tipo_venta === 'granel') {
      // Un producto a granel necesita que se ingrese el peso: hay que cerrar la
      // cámara antes de abrir ese modal porque iOS no presenta dos <Modal> a la vez.
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
      setScanner(false)
      setTimeout(() => abrirGranel(p), 350)
      return
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    agregarProducto(p)
    setMensajeScanner({ ok: true, texto: `✓ ${p.nombre} — ${fmt(p.precio)}` })
  }

  async function engancharCodigo(producto) {
    const r = await db.asignarCodigo(producto.id, codigoHuerfano)
    if (!r.success) {
      Alert.alert('No se pudo', r.error)
      return
    }
    await cargar()
    setCodigoHuerfano(null)
    setBusquedaHuerfano('')
    // Se agrega al carrito en el mismo gesto: el cajero escaneó porque quería
    // venderlo, no solo para catalogarlo.
    if (producto.tipo_venta === 'granel') abrirGranel(producto)
    else agregarProducto(producto)
    mostrarAviso(`✓ Código guardado en ${producto.nombre}`)
  }

  function cambiarCantidad(productoId, delta) {
    if (delta > 0) {
      const producto = productos.find(p => p.id === productoId)
      if (producto && disponibleDe(producto) <= 0) { avisarSinStock(producto); return }
    }
    const nuevos = carritoActivo.items
      .map(it => it.id === productoId ? { ...it, cantidad: it.cantidad + delta, subtotal: (it.cantidad + delta) * it.precio } : it)
      .filter(it => it.cantidad > 0)
    actualizarCarritoActivo(nuevos)
  }

  function abrirGranel(p) {
    const existente = carritoActivo.items.find(it => it.id === p.id)
    setProductoGranel(p)
    setModoGranel('monto')
    setEntradaGranel(existente ? formatearPeso(existente.subtotal) : '')
  }

  function cambiarModoGranel(modo) {
    if (modo === modoGranel) return
    // Se conserva lo ya escrito convirtiéndolo a la otra unidad, para no obligar
    // a retipear si el cajero se equivocó de modo.
    const valor = parseFloat(entradaGranel)
    const precio = productoGranel?.precio || 0
    if (!isNaN(valor) && valor > 0 && precio > 0) {
      setEntradaGranel(formatearPeso(modo === 'peso' ? valor / precio : valor * precio))
    }
    setModoGranel(modo)
  }

  function sumarRapidoGranel(valor) {
    const actual = parseFloat(entradaGranel) || 0
    setEntradaGranel(formatearPeso(actual + valor))
  }

  // Devuelve siempre el par (peso, subtotal), sin importar en qué modo se escribió.
  function calcularGranel() {
    const valor = parseFloat(entradaGranel)
    const precio = productoGranel?.precio || 0
    if (isNaN(valor) || valor <= 0 || precio <= 0) return null

    // Un plátano o un huevo no se parten: cuando el granel se cuenta por
    // unidades, la cantidad va en enteros y el cobro se ajusta a lo que
    // realmente se entrega (S/1 en plátanos de S/0.30 son 3, no 3.33).
    const esContable = (productoGranel?.unidad || 'kg') === 'unidad'

    if (modoGranel === 'monto') {
      if (esContable) {
        const unidades = Math.floor(valor / precio)
        if (unidades <= 0) return null
        return { peso: unidades, subtotal: parseFloat((unidades * precio).toFixed(2)) }
      }
      // Por peso el cliente paga exactamente lo que pidió ("dos soles de
      // azúcar"): el subtotal es el monto tal cual y el peso es lo que sale.
      return { peso: parseFloat((valor / precio).toFixed(3)), subtotal: parseFloat(valor.toFixed(2)) }
    }

    const cantidad = esContable ? Math.round(valor) : valor
    if (cantidad <= 0) return null
    return { peso: cantidad, subtotal: parseFloat((cantidad * precio).toFixed(2)) }
  }

  function confirmarGranel() {
    const calculo = calcularGranel()
    if (!calculo) return

    // A diferencia del stepper de unidades, acá el cajero escribe la cantidad,
    // así que puede pasarse del stock de una sola vez.
    const stock = parseFloat(productoGranel.stock)
    if (calculo.peso > stock) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
      Alert.alert('No alcanza el stock', `De ${productoGranel.nombre} solo quedan ${stock} ${productoGranel.unidad || 'kg'}.`)
      return
    }
    const items = carritoActivo.items
    const i = items.findIndex(it => it.id === productoGranel.id)
    let nuevos
    if (i !== -1) {
      nuevos = items.map((it, idx) => idx === i ? { ...it, cantidad: calculo.peso, subtotal: calculo.subtotal } : it)
    } else {
      nuevos = [...items, { id: productoGranel.id, nombre: productoGranel.nombre, precio: productoGranel.precio, cantidad: calculo.peso, subtotal: calculo.subtotal, tipo_venta: 'granel', unidad: productoGranel.unidad || 'kg' }]
    }
    actualizarCarritoActivo(nuevos)
    setProductoGranel(null)
    setEntradaGranel('')
  }

  function agregarCarrito() {
    const c = nuevoCarrito(carritos)
    setCarritos(prev => [...prev, c])
    setCarritoActivoId(c.id)
  }

  function cerrarCarrito(id) {
    if (carritos.length === 1) return
    setCarritos(prev => {
      const restantes = prev.filter(c => c.id !== id)
      if (id === carritoActivoId) setCarritoActivoId(restantes[0].id)
      return restantes
    })
  }

  const total = carritoActivo.items.reduce((s, i) => s + i.subtotal, 0)
  const productosFiltrados = productos
    .filter(p => {
      const q = busqueda.trim().toLowerCase()
      return !q || p.nombre.toLowerCase().includes(q) || String(p.codigo || '').includes(q)
    })
    .filter(p => !categoriaFiltro || p.categoria === categoriaFiltro)

  // Solo se ofrecen como filtro las categorías que hoy tienen productos — un chip
  // que no filtra nada solo estorba en la pantalla más usada del día. Las categorías
  // desconocidas (ej. "General", el valor por defecto) también se listan: si no,
  // esos productos quedarían imposibles de encontrar filtrando.
  const conocidas = [...CATEGORIAS_BASE, ...categoriasCustom]
  const categoriasConProductos = [
    ...conocidas.filter(c => productos.some(p => p.categoria === c.id)),
    ...[...new Set(productos.map(p => p.categoria).filter(Boolean))]
      .filter(id => !conocidas.some(c => c.id === id))
      .map(id => ({ id, icon: '📦' })),
  ]

  const clientesFiltrados = busquedaCliente.trim()
    ? clientes.filter(c => c.nombre.toLowerCase().includes(busquedaCliente.trim().toLowerCase()))
    : clientes

  // Solo se ofrece crear si lo escrito no coincide exactamente con alguien que
  // ya existe, para no terminar con dos "Marco Suárez" en la lista de fiados.
  const puedeCrearCliente = busquedaCliente.trim().length >= 2 &&
    !clientes.some(c => c.nombre.toLowerCase() === busquedaCliente.trim().toLowerCase())

  async function crearClienteYFiar() {
    setCreandoCliente(true)
    const nuevo = await db.addCliente({ nombre: busquedaCliente.trim() })
    setCreandoCliente(false)
    setClientes(db.getClientes())
    setClienteFiadoId(nuevo.id)
    setBusquedaCliente('')
  }

  function abrirPago() {
    if (!carritoActivo.items.length) return
    setMetodoPago(null)
    setMontoRecibido('')
    setClienteFiadoId(null)
    setBusquedaCliente('')
    setModalPago(true)
  }

  async function confirmarCobro() {
    if (!metodoPago) return
    if (metodoPago === 'Fiado' && !clienteFiadoId) return
    if (metodoPago === 'Efectivo' && (isNaN(parseFloat(montoRecibido)) || parseFloat(montoRecibido) < total)) return

    setCobrando(true)
    try {
      const esFiado = metodoPago === 'Fiado'
      const montoFinal = esFiado ? total : (metodoPago === 'Efectivo' ? parseFloat(montoRecibido) : total)
      const resultado = await db.realizarVenta(carritoActivo.items, montoFinal, metodoPago, 0, 'ninguno', usuario?.id || null, clienteFiadoId, esFiado)

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      setModalPago(false)
      cerrarCarritoTrasVenta(carritoActivo.id)
      await cargar()

      // La venta se cierra sola: pedir ticket ocurre un par de veces al mes y no
      // justifica un toque extra en cada una de las ventas del día. Si el cliente
      // lo pide, se comparte desde Historial. El aviso no bloquea y mantiene el
      // vuelto a la vista, que es lo que el cajero necesita en ese segundo.
      mostrarAviso(resultado.metodoPago === 'Efectivo'
        ? `✓ ${fmt(resultado.total)} — Vuelto ${fmt(resultado.vuelto)}`
        : `✓ Venta registrada — ${fmt(resultado.total)}`)
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      Alert.alert('Error', 'No se pudo registrar la venta.')
    }
    setCobrando(false)
  }

  function cerrarCarritoTrasVenta(id) {
    setCarritos(prev => {
      const restantes = prev.filter(c => c.id !== id)
      const finales = restantes.length ? restantes : [nuevoCarrito(restantes)]
      setCarritoActivoId(finales[0].id)
      return finales
    })
  }

  return (
    <View style={styles.root}>
      {/* Selector de carritos / ventas en espera */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsCarritos} contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}>
        {carritos.map(c => (
          <TouchableOpacity key={c.id} onPress={() => setCarritoActivoId(c.id)}
            onLongPress={() => c.items.length === 0 && cerrarCarrito(c.id)}
            style={[styles.tabCarrito, c.id === carritoActivo.id && styles.tabCarritoActivo]}>
            <Text style={[styles.tabCarritoTexto, c.id === carritoActivo.id && styles.tabCarritoTextoActivo]}>
              {c.nombre}{c.items.length ? ` (${c.items.length})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity onPress={agregarCarrito} style={styles.tabNuevo}>
          <Text style={styles.tabNuevoTexto}>+ Nuevo cliente</Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.filaBuscador}>
        <TextInput style={styles.buscador} placeholder="🔍 Buscar producto..." placeholderTextColor={colors.placeholder}
          value={busqueda} onChangeText={setBusqueda} />
        <TouchableOpacity style={styles.botonEscanear} onPress={() => { setMensajeScanner(null); setScanner(true) }}>
          <Text style={styles.botonEscanearTexto}>📷</Text>
        </TouchableOpacity>
      </View>

      {categoriasConProductos.length > 1 && (
        <View style={chips.fila}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={chips.scroll} contentContainerStyle={chips.contenido}>
            <TouchableOpacity onPress={() => setCategoriaFiltro(null)} style={[chips.chip, !categoriaFiltro && chips.chipActivo]}>
              <Text style={[chips.texto, !categoriaFiltro && chips.textoActivo]}>Todo</Text>
            </TouchableOpacity>
            {categoriasConProductos.map(c => (
              <TouchableOpacity key={c.id} onPress={() => setCategoriaFiltro(c.id)} style={[chips.chip, categoriaFiltro === c.id && chips.chipActivo]}>
                <Text style={chips.icono}>{c.icon}</Text>
                <Text style={[chips.texto, categoriaFiltro === c.id && chips.textoActivo]}>{c.id}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <FlatList
        data={productosFiltrados}
        keyExtractor={p => String(p.id)}
        style={styles.listaProductos}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.filaProducto, parseFloat(item.stock) <= 0 && styles.filaSinStock]}
            onPress={() => agregarProducto(item)}
          >
            <Text style={styles.iconoProducto}>{iconoCategoria(item.categoria, categoriasCustom)}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.nombreProducto}>{item.nombre}{item.tipo_venta === 'granel' ? ` ⚖️` : ''}</Text>
              {parseFloat(item.stock) <= 0 ? (
                <Text style={styles.sinStockTexto}>Sin stock — repón para poder venderlo</Text>
              ) : (
                <Text style={styles.stockProducto}>Stock: {item.stock} {item.tipo_venta === 'granel' ? (item.unidad || 'kg') : ''}</Text>
              )}
            </View>
            <Text style={styles.precioProducto}>{fmt(item.precio)}{item.tipo_venta === 'granel' ? `/${item.unidad || 'kg'}` : ''}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.vacio}>No hay productos que coincidan.</Text>}
      />

      {/* Carrito activo */}
      <View style={styles.panelCarrito}>
        <ScrollView style={{ maxHeight: 160 }}>
          {carritoActivo.items.length === 0 && <Text style={styles.vacio}>Carrito de {carritoActivo.nombre} vacío — toca un producto para agregarlo.</Text>}
          {carritoActivo.items.map(it => (
            <View key={it.id} style={styles.filaCarrito}>
              <Text style={styles.itemNombre} numberOfLines={1}>{it.nombre}</Text>
              {it.tipo_venta === 'granel' ? (
                <TouchableOpacity style={styles.botonEditarPeso} onPress={() => abrirGranel({ id: it.id, nombre: it.nombre, precio: it.precio, unidad: it.unidad, tipo_venta: 'granel' })}>
                  <Text style={styles.botonEditarPesoTexto}>{formatearPeso(it.cantidad)} {it.unidad || 'kg'} ✎</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.controlesCantidad}>
                  <TouchableOpacity onPress={() => cambiarCantidad(it.id, -1)} style={styles.botonCantidad}><Text style={styles.botonCantidadTexto}>−</Text></TouchableOpacity>
                  <Text style={styles.cantidadTexto}>{it.cantidad}</Text>
                  <TouchableOpacity onPress={() => cambiarCantidad(it.id, 1)} style={styles.botonCantidad}><Text style={styles.botonCantidadTexto}>+</Text></TouchableOpacity>
                </View>
              )}
              <Text style={styles.itemSubtotal}>{fmt(it.subtotal)}</Text>
            </View>
          ))}
        </ScrollView>
        <View style={styles.filaTotal}>
          <Text style={styles.totalLabel}>Total ({carritoActivo.nombre})</Text>
          <Text style={styles.totalValor}>{fmt(total)}</Text>
        </View>
        <TouchableOpacity style={[styles.botonCobrar, !carritoActivo.items.length && styles.botonDeshabilitado]} disabled={!carritoActivo.items.length} onPress={abrirPago}>
          <Text style={styles.botonCobrarTexto}>Cobrar</Text>
        </TouchableOpacity>
      </View>

      {aviso && (
        <Animated.View style={[styles.aviso, { opacity: avisoOpacidad }]} pointerEvents="none">
          <Text style={styles.avisoTexto}>{aviso}</Text>
        </Animated.View>
      )}

      {/* Código escaneado que todavía no pertenece a ningún producto */}
      <Modal visible={!!codigoHuerfano} transparent animationType="slide" onRequestClose={() => setCodigoHuerfano(null)}>
        <KeyboardAvoidingView style={styles.modalFondo} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCodigoHuerfano(null)} />
          <View style={[styles.modalCaja, { maxHeight: '85%' }]}>
            <Text style={styles.modalTitulo}>Código nuevo</Text>
            <Text style={styles.textoMuted}>
              {codigoHuerfano} — todavía no está en ningún producto. Elige a cuál pertenece y queda guardado para siempre.
            </Text>

            <TextInput style={styles.input} placeholder="Buscar tu producto..." placeholderTextColor={colors.placeholder}
              value={busquedaHuerfano} onChangeText={setBusquedaHuerfano} autoFocus />

            <ScrollView style={{ maxHeight: 260 }} keyboardShouldPersistTaps="handled">
              {productos
                .filter(p => !p.codigo)
                .filter(p => !busquedaHuerfano.trim() || p.nombre.toLowerCase().includes(busquedaHuerfano.toLowerCase()))
                .slice(0, 30)
                .map(p => (
                  <TouchableOpacity key={p.id} style={styles.filaHuerfano} onPress={() => engancharCodigo(p)}>
                    <Text style={styles.iconoProducto}>{iconoCategoria(p.categoria, categoriasCustom)}</Text>
                    <Text style={{ flex: 1, color: colors.text, fontSize: 14, fontWeight: '600' }}>{p.nombre}</Text>
                    <Text style={styles.precioProducto}>{fmt(p.precio)}</Text>
                  </TouchableOpacity>
                ))}
              {productos.filter(p => !p.codigo).length === 0 && (
                <Text style={styles.vacio}>Todos tus productos ya tienen código. Registra este producto desde la pestaña Productos.</Text>
              )}
            </ScrollView>

            <TouchableOpacity style={[styles.botonGhost, { flex: 0 }]} onPress={() => { setCodigoHuerfano(null); setBusquedaHuerfano('') }}>
              <Text style={styles.botonGhostTexto}>Ahora no</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Escáner de código de barras */}
      <Modal visible={scanner} animationType="slide" onRequestClose={() => setScanner(false)}>
        <BarcodeScannerModal
          continuo
          mensaje={mensajeScanner}
          onScanned={codigoEscaneado}
          onClose={() => setScanner(false)}
        />
      </Modal>

      {/* Modal de pago */}
      <Modal visible={modalPago} transparent animationType="slide" onRequestClose={() => setModalPago(false)}>
        <KeyboardAvoidingView style={styles.modalFondo} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setModalPago(false)} />
          <ScrollView style={styles.modalScrollLimite} contentContainerStyle={styles.modalCaja} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitulo}>Método de pago — {fmt(total)}</Text>
            <View style={styles.metodosGrid}>
              {METODOS.map(m => (
                <TouchableOpacity key={m} onPress={() => setMetodoPago(m)} style={[styles.metodoBoton, metodoPago === m && styles.metodoBotonActivo]}>
                  <Text style={[styles.metodoTexto, metodoPago === m && styles.metodoTextoActivo]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {metodoPago === 'Efectivo' && (
              <View>
                <TextInput style={styles.input} placeholder="Monto recibido" placeholderTextColor={colors.placeholder} keyboardType="decimal-pad"
                  value={montoRecibido} onChangeText={setMontoRecibido} autoFocus />
                {montoRecibido !== '' && !isNaN(parseFloat(montoRecibido)) && (
                  parseFloat(montoRecibido) >= total ? (
                    <Text style={styles.vueltoTexto}>Vuelto: {fmt(parseFloat(montoRecibido) - total)}</Text>
                  ) : (
                    <Text style={styles.vueltoFalta}>Falta: {fmt(total - parseFloat(montoRecibido))}</Text>
                  )
                )}
              </View>
            )}

            {metodoPago === 'Fiado' && (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Buscar cliente o escribir uno nuevo"
                  placeholderTextColor={colors.placeholder}
                  value={busquedaCliente}
                  onChangeText={setBusquedaCliente}
                />

                <ScrollView style={{ maxHeight: 140 }} keyboardShouldPersistTaps="handled">
                  {clientesFiltrados.map(c => (
                    <TouchableOpacity key={c.id} onPress={() => setClienteFiadoId(c.id)} style={[styles.clienteFila, clienteFiadoId === c.id && styles.clienteFilaActiva]}>
                      <Text style={styles.clienteNombre}>{c.nombre}</Text>
                      {c.deuda_total > 0 && <Text style={styles.clienteDeuda}>Debe {fmt(c.deuda_total)}</Text>}
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Crear al cliente sin salir del cobro: mandar al cajero a la
                    pestaña Clientes con la cola esperando mataría la venta. */}
                {puedeCrearCliente && (
                  <TouchableOpacity style={styles.crearCliente} onPress={crearClienteYFiar} disabled={creandoCliente}>
                    <Text style={styles.crearClienteTexto}>
                      {creandoCliente ? 'Creando...' : `➕  Crear "${busquedaCliente.trim()}" y fiarle`}
                    </Text>
                  </TouchableOpacity>
                )}

                {!clientesFiltrados.length && !busquedaCliente.trim() && (
                  <Text style={styles.vacio}>Escribe el nombre del cliente para registrarlo al momento.</Text>
                )}
              </>
            )}

            <View style={styles.filaBotones}>
              <TouchableOpacity style={styles.botonGhost} onPress={() => setModalPago(false)}>
                <Text style={styles.botonGhostTexto}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.botonPrimario} onPress={confirmarCobro} disabled={cobrando}>
                {cobrando ? <ActivityIndicator color={colors.primaryText} /> : <Text style={styles.botonPrimarioTexto}>Confirmar</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal de peso (granel) */}
      <Modal visible={!!productoGranel} transparent animationType="slide" onRequestClose={() => setProductoGranel(null)}>
        <KeyboardAvoidingView style={styles.modalFondo} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setProductoGranel(null)} />
          <ScrollView style={styles.modalScrollLimite} contentContainerStyle={styles.modalCaja} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitulo}>⚖️ {productoGranel?.nombre}</Text>
            <Text style={styles.textoMuted}>{fmt(productoGranel?.precio)} por {productoGranel?.unidad || 'kg'}</Text>

            <View style={styles.modoGranelFila}>
              <TouchableOpacity onPress={() => cambiarModoGranel('monto')}
                style={[styles.modoGranelBoton, modoGranel === 'monto' && styles.modoGranelBotonActivo]}>
                <Text style={[styles.modoGranelTexto, modoGranel === 'monto' && styles.modoGranelTextoActivo]}>Por monto (S/)</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => cambiarModoGranel('peso')}
                style={[styles.modoGranelBoton, modoGranel === 'peso' && styles.modoGranelBotonActivo]}>
                <Text style={[styles.modoGranelTexto, modoGranel === 'peso' && styles.modoGranelTextoActivo]}>Por peso ({productoGranel?.unidad || 'kg'})</Text>
              </TouchableOpacity>
            </View>

            <TextInput style={[styles.input, styles.inputPeso]}
              placeholder={modoGranel === 'monto' ? 'S/ 0.00' : `0.00 ${productoGranel?.unidad || 'kg'}`}
              placeholderTextColor={colors.placeholder}
              keyboardType="decimal-pad" value={entradaGranel} onChangeText={setEntradaGranel} autoFocus />

            <View style={styles.pesosRapidosFila}>
              {(modoGranel === 'monto' ? MONTOS_RAPIDOS : PESOS_RAPIDOS).map(v => (
                <TouchableOpacity key={v} style={styles.botonPesoRapido} onPress={() => sumarRapidoGranel(v)}>
                  <Text style={styles.botonPesoRapidoTexto}>+{modoGranel === 'monto' ? `S/${v}` : v}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {calcularGranel() && (
              <Text style={styles.subtotalPreview}>
                {modoGranel === 'monto'
                  ? `≈ ${formatearPeso(calcularGranel().peso)} ${productoGranel?.unidad || 'kg'}`
                  : `Subtotal: ${fmt(calcularGranel().subtotal)}`}
              </Text>
            )}

            <View style={styles.filaBotones}>
              <TouchableOpacity style={styles.botonGhost} onPress={() => setProductoGranel(null)}>
                <Text style={styles.botonGhostTexto}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.botonPrimario} onPress={confirmarGranel}>
                <Text style={styles.botonPrimarioTexto}>Agregar</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  tabsCarritos: { flexGrow: 0, paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.border },
  tabCarrito: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  tabCarritoActivo: { backgroundColor: colors.accentBg, borderColor: colors.primary },
  tabCarritoTexto: { color: colors.textMuted, fontWeight: '600', fontSize: 13 },
  tabCarritoTextoActivo: { color: colors.accent },
  tabNuevo: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.borderStrong, borderStyle: 'dashed' },
  tabNuevoTexto: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  filaBuscador: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 12 },
  buscador: { flex: 1, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, color: colors.text },
  botonEscanear: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.card },
  botonEscanearTexto: { fontSize: 22, lineHeight: 28 },
  listaProductos: { flex: 1, paddingHorizontal: 12 },
  filaProducto: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  iconoProducto: { fontSize: 20, lineHeight: 26, marginRight: 10 },
  filaSinStock: { opacity: 0.5, borderStyle: 'dashed' },
  crearCliente: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary, backgroundColor: colors.accentBg, alignItems: 'center' },
  crearClienteTexto: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  sinStockTexto: { color: colors.danger, fontSize: 12, marginTop: 2, fontWeight: '600' },
  nombreProducto: { color: colors.text, fontWeight: '600', fontSize: 14 },
  stockProducto: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  precioProducto: { color: colors.accent, fontWeight: '700', fontSize: 15 },
  vacio: { color: colors.textMuted, textAlign: 'center', padding: 16, fontSize: 13 },
  filaHuerfano: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  panelCarrito: { borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 12 },
  filaCarrito: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8 },
  itemNombre: { color: colors.text, flex: 1, fontSize: 13 },
  controlesCantidad: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  botonCantidad: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  botonCantidadTexto: { color: colors.text, fontWeight: '700' },
  cantidadTexto: { color: colors.text, fontWeight: '700', minWidth: 20, textAlign: 'center' },
  itemSubtotal: { color: colors.accent, fontWeight: '700', minWidth: 70, textAlign: 'right' },
  botonEditarPeso: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: colors.accentBg, borderWidth: 1, borderColor: colors.primary },
  botonEditarPesoTexto: { color: colors.accent, fontWeight: '600', fontSize: 12 },
  filaTotal: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderColor: colors.border, marginTop: 4 },
  totalLabel: { color: colors.textMuted, fontSize: 13 },
  totalValor: { color: colors.text, fontWeight: '900', fontSize: 20 },
  botonCobrar: { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: 'center' },
  botonDeshabilitado: { opacity: 0.4 },
  botonCobrarTexto: { color: colors.primaryText, fontWeight: '700', fontSize: 16 },
  modalFondo: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalCaja: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 12 },
  modalScrollLimite: { flexGrow: 0, maxHeight: '85%' },
  modalTitulo: { color: colors.text, fontWeight: '700', fontSize: 16, marginBottom: 4 },
  aviso: { position: 'absolute', top: 12, left: 16, right: 16, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  avisoTexto: { color: colors.primaryText, fontWeight: '700', fontSize: 15 },
  modoGranelFila: { flexDirection: 'row', gap: 8 },
  modoGranelBoton: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  modoGranelBotonActivo: { backgroundColor: colors.accentBg, borderColor: colors.primary },
  modoGranelTexto: { color: colors.textMuted, fontWeight: '600', fontSize: 13 },
  modoGranelTextoActivo: { color: colors.accent },
  metodosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metodoBoton: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  metodoBotonActivo: { backgroundColor: colors.accentBg, borderColor: colors.primary },
  metodoTexto: { color: colors.textMuted, fontWeight: '600' },
  metodoTextoActivo: { color: colors.accent },
  input: { backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, color: colors.text, fontSize: 15 },
  vueltoTexto: { color: colors.accent, fontWeight: '700', fontSize: 15, marginTop: 8 },
  vueltoFalta: { color: colors.warning, fontWeight: '700', fontSize: 15, marginTop: 8 },
  textoMuted: { color: colors.textMuted, fontSize: 13 },
  inputPeso: { fontSize: 22, fontWeight: '700', textAlign: 'center', marginTop: 10 },
  pesosRapidosFila: { flexDirection: 'row', gap: 8, marginTop: 4 },
  botonPesoRapido: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  botonPesoRapidoTexto: { color: colors.text, fontWeight: '600', fontSize: 13 },
  subtotalPreview: { color: colors.accent, fontWeight: '700', fontSize: 16, textAlign: 'center', marginTop: 4 },
  clienteFila: { padding: 10, borderRadius: 8, marginBottom: 4, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  clienteFilaActiva: { backgroundColor: colors.accentBg, borderColor: colors.primary },
  clienteNombre: { color: colors.text, fontWeight: '600' },
  clienteDeuda: { color: colors.warning, fontSize: 12 },
  filaBotones: { flexDirection: 'row', gap: 10, marginTop: 8 },
  botonGhost: { flex: 1, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  botonGhostTexto: { color: colors.textMuted, fontWeight: '600' },
  botonPrimario: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center' },
  botonPrimarioTexto: { color: colors.primaryText, fontWeight: '700' },
})
