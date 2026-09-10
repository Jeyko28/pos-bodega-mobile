import React, { useState, useEffect } from 'react'
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import db from '../data/db'
import BarcodeScannerModal from './BarcodeScannerModal'
import { iconoCategoria } from '../data/categorias'
import { coincide } from '../utils/texto'
import { useLetra } from '../context/LetraContext'
import { PRESETS_BULTO, sugerirBulto, resolverBulto } from '../data/bultos'
import { colors } from '../theme/colors'
import { useSesion } from '../context/SesionContext'

// Pantalla para cuando llega el proveedor: se van agregando productos y cuánto
// llegó de cada uno, y al final se suma todo de una sola vez. La alternativa
// (abrir la ficha de cada producto y reescribir el stock haciendo la suma a
// mano) es la razón por la que en la práctica el inventario nunca se actualiza.
export default function IngresoMercaderia({ onCerrar, onGuardado }) {
  const { usuario } = useSesion()
  const { tx } = useLetra()
  const styles = crearStyles(tx)
  const insets = useSafeAreaInsets()
  const [productos, setProductos] = useState([])
  const [categoriasCustom, setCategoriasCustom] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [entradas, setEntradas] = useState([])
  const [scanner, setScanner] = useState(false)
  const [mensajeScanner, setMensajeScanner] = useState(null)
  const [retomado, setRetomado] = useState(0)
  const [cargado, setCargado] = useState(false)
  const [codigoDesconocido, setCodigoDesconocido] = useState(null)
  const [nuevo, setNuevo] = useState({ nombre: '', precio: '', cantidad: '1' })
  const [ultimoAgregado, setUltimoAgregado] = useState(null)
  const [vista, setVista] = useState('ingreso')
  const [ingresos, setIngresos] = useState([])
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    setProductos(db.getProductos())
    setCategoriasCustom(db.getCategoriasCustom())

    // En una bodega nadie tiene 20 minutos sin que entre un cliente: si el
    // dueño sale a cobrar a mitad del camión, la lista tiene que estar
    // esperándolo cuando vuelva.
    const pendiente = db.getConfig().ingreso_en_curso
    if (pendiente?.length) {
      setEntradas(pendiente)
      setRetomado(pendiente.length)
    }
    setCargado(true)
  }, [])

  // Se guarda en cada cambio: así ni cerrar la pantalla, ni el botón atrás de
  // Android, ni que se cierre la app pierden el trabajo.
  useEffect(() => {
    if (!cargado) return
    db.updateConfig({ ingreso_en_curso: entradas })
  }, [entradas, cargado])

  const yaEnLista = (id) => entradas.some(e => e.id === id)
  // El buscador también entiende códigos: el de la unidad abre normal, el del
  // paquete abre directo en modo bulto (útil si la cámara falla o no hay luz).
  function esCodigoBultoDe(p, texto) {
    const cod = String(texto || '').trim().replace(/\s/g, '')
    return !!cod && !!p.bulto_codigo && String(p.bulto_codigo).trim() === cod
  }
  const candidatos = productos.filter(p => {
    if (yaEnLista(p.id)) return false
    const t = busqueda.trim()
    if (!t) return true
    if (coincide(p.nombre, t)) return true
    const cod = t.replace(/\s/g, '')
    return (p.codigo && String(p.codigo).trim() === cod) || esCodigoBultoDe(p, t)
  }).slice(0, 20)

  // La decisión de sumar o crear fila va DENTRO del actualizador: escaneando
  // seguido, varias llamadas ocurren antes de que React vuelva a renderizar, y
  // si se consulta la lista desde fuera cada una ve una copia vieja y agrega
  // otra fila del mismo producto.
  function agregar(producto, cantidadInicial = '1', forzarBulto = false) {
    setEntradas(es => {
      const i = es.findIndex(e => e.id === producto.id)
      if (i !== -1) {
        const actual = es[i]
        // Escaneo corrido caja por caja: si la fila ya está en modo bulto,
        // cada escaneo suma un bulto más en vez de tocar las unidades.
        if ((actual.modo || 'uds') === 'bulto') {
          const bultos = String((parseFloat(actual.bultos) || 0) + 1)
          setMensajeScanner({ ok: true, texto: `📦 ${producto.nombre} — van ${bultos}` })
          return es.map((e, idx) => idx === i ? { ...e, bultos } : e)
        }
        const sumada = String((parseFloat(actual.cantidad) || 0) + 1)
        setMensajeScanner({ ok: true, texto: `${producto.nombre} — ahora ${sumada}` })
        return es.map((e, idx) => idx === i ? { ...e, cantidad: sumada } : e)
      }
      setMensajeScanner({ ok: true, texto: `✓ ${producto.nombre} — van ${es.length + 1}` })
      // Si ya se sabe cómo viene su bulto del mayorista, se arranca en ese
      // modo; si no, en unidades y el dueño lo cambia con un toque.
      const yaBulto = forzarBulto || producto.bulto_unidades > 0
      // Va primero, no al final: así el que acabas de tocar queda siempre
      // pegado al buscador, nunca tapado por el teclado numérico aunque ya
      // tengas una lista larga.
      return [{
        id: producto.id,
        nombre: producto.nombre,
        categoria: producto.categoria,
        stockActual: parseFloat(producto.stock),
        costoActual: producto.costo ?? null,
        unidad: producto.tipo_venta === 'granel' ? (producto.unidad || 'kg') : 'uds',
        cantidad: cantidadInicial,
        modo: yaBulto ? 'bulto' : 'uds',
        bultos: yaBulto ? cantidadInicial : '',
        costoBulto: '',
        bultoUnidades: producto.bulto_unidades || null,
        bultoNombre: producto.bulto_nombre || null,
        bultoCodigo: producto.bulto_codigo || '',
        bultoCodigoGuardado: producto.bulto_codigo || '',
      }, ...es]
    })
    setUltimoAgregado(producto.id)
    setBusqueda('')
  }

  function cambiarCantidad(id, valor) {
    setEntradas(es => es.map(e => e.id === id ? { ...e, cantidad: valor } : e))
  }

  function cambiarCosto(id, valor) {
    setEntradas(es => es.map(e => e.id === id ? { ...e, costo: valor } : e))
  }

  function tocarEntrada(id, cambios) {
    setEntradas(es => es.map(e => e.id === id ? { ...e, ...cambios } : e))
  }

  function cambiarModo(id, modo) {
    setEntradas(es => es.map(e => {
      if (e.id !== id) return e
      // Al pasar a bulto se sugiere según categoría (Lácteos→caja 12,
      // Bebidas→six-pack 6...); en el resto elige de los presets.
      if (modo === 'bulto' && !e.bultoUnidades) {
        const sug = sugerirBulto(e.categoria)
        return { ...e, modo, bultoUnidades: sug?.unidades || null, bultoNombre: sug?.nombre || null }
      }
      return { ...e, modo }
    }))
  }

  // "2 cajas", "1 caja": el preview habla como el mayorista.
  function pluralBulto(nombre, n) {
    if (parseFloat(n) === 1) return nombre
    return `${nombre}s`
  }

  // Unidades reales que suma esta fila (resolviendo el bulto si toca).
  function unidadesDe(e) {    if ((e.modo || 'uds') === 'bulto') {
      const r = resolverBulto({ bultos: e.bultos, bultoUnidades: e.bultoUnidades, costoBulto: e.costoBulto })
      return r ? r.unidades : 0
    }
    return parseFloat(e.cantidad) || 0
  }

  function quitar(id) {
    setEntradas(es => es.filter(e => e.id !== id))
  }

  function codigoEscaneado(codigo) {
    const buscado = String(codigo).trim()
    const p = productos.find(x => String(x.codigo || '').trim() === buscado)
    if (p) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      agregar(p)
      return
    }
    // El código del paquete grande también encuentra: abre el producto
    // directo en modo bulto para anotar cuántos llegaron.
    const pb = productos.find(x => x.bulto_codigo && String(x.bulto_codigo).trim() === buscado)
    if (pb) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      setMensajeScanner({ ok: true, texto: `📦 ${pb.nombre} — anota cuántos ${pb.bulto_nombre || 'bultos'} llegaron` })
      agregar(pb, '1', true)
      return
    }
    // En todo camión vienen dos o tres cosas nunca registradas. Mandarlo a
    // otra pantalla a crearlas es justo donde antes se perdía la lista.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
    setScanner(false)
    setMensajeScanner(null)
    setTimeout(() => setCodigoDesconocido(buscado), 300)
  }

  const puedeCrear = nuevo.nombre.trim().length >= 2 && parseFloat(nuevo.precio) > 0

  async function crearYAgregar() {
    const creado = await db.addProducto({
      nombre: nuevo.nombre.trim(),
      precio: nuevo.precio,
      stock: 0,
      codigo: codigoDesconocido,
      categoria: 'Otros',
      tipo_venta: 'unidad',
    })
    setProductos(db.getProductos())
    agregar(creado, nuevo.cantidad || '1')
    setCodigoDesconocido(null)
    setNuevo({ nombre: '', precio: '', cantidad: '1' })
  }

  async function guardar() {
    // Toda fila que sume cero (vacía del todo o a medio llenar) se avisa por
    // nombre antes de guardar: perder un producto calladito es plata perdida.
    const incompletas = entradas.filter(e => unidadesDe(e) <= 0)
    if (incompletas.length) {
      Alert.alert(
        'Hay filas sin cantidad',
        `${incompletas.map(e => `• ${e.nombre}`).join('\n')}\n\nEsas no se van a guardar. ¿Guardamos el resto igual?`,
        [
          { text: 'Revisar', style: 'cancel' },
          { text: 'Guardar el resto', onPress: guardarAhora },
        ])
      return
    }
    guardarAhora()
  }

  async function guardarAhora() {
    // Cada fila se resuelve a unidades reales: el bulto se convierte
    // (2 cajas × 12) y su costo se prorratea antes de tocar el stock.
    const resueltas = entradas.map(e => {
      if ((e.modo || 'uds') === 'bulto') {
        const r = resolverBulto({ bultos: e.bultos, bultoUnidades: e.bultoUnidades, costoBulto: e.costoBulto })
        if (!r) return null
        return {
          id: e.id, nombre: e.nombre,
          cantidad: String(r.unidades),
          costo: r.costoUnitario != null ? String(r.costoUnitario) : '',
          bulto: { unidades: e.bultoUnidades, nombre: e.bultoNombre, codigo: e.bultoCodigo },
        }
      }
      return { id: e.id, nombre: e.nombre, cantidad: e.cantidad, costo: e.costo || '' }
    }).filter(x => x && parseFloat(x.cantidad) > 0)
    if (!resueltas.length) return
    setGuardando(true)
    // El bulto se guarda una sola vez por producto: la próxima entra directo.
    resueltas.forEach(x => { if (x.bulto) db.setBulto(x.id, x.bulto.unidades, x.bulto.nombre, x.bulto.codigo) })
    const r = await db.ingresarMercaderia(resueltas, usuario?.id)
    await db.updateConfig({ ingreso_en_curso: [] })
    setEntradas([])
    setGuardando(false)
    onGuardado?.(r)

    // El deshacer se ofrece en el momento, que es cuando el dueño se da cuenta
    // de que escribió 500 en vez de 50.
    Alert.alert(
      '✓ Mercadería ingresada',
      `Se actualizó el stock de ${r.actualizados} productos.`,
      [
        { text: 'Listo', onPress: onCerrar },
        {
          text: 'Deshacer',
          style: 'destructive',
          onPress: async () => {
            const d = await db.deshacerIngreso(r.ingresoId)
            if (!d.success) { Alert.alert('No se pudo deshacer', d.error); return }
            onGuardado?.({ actualizados: 0 })
            Alert.alert('Ingreso deshecho', 'El stock volvió a como estaba.')
          },
        },
      ],
    )
  }

  function abrirHistorial() {
    setIngresos(db.getIngresos())
    setVista('historial')
  }

  async function deshacerDesdeHistorial(ingreso) {
    Alert.alert(
      'Deshacer este ingreso',
      `Se le restará al stock lo que sumó este ingreso (${ingreso.productos} productos). Esto no se puede volver a aplicar.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Deshacer',
          style: 'destructive',
          onPress: async () => {
            const d = await db.deshacerIngreso(ingreso.id)
            if (!d.success) { Alert.alert('No se pudo deshacer', d.error); return }
            setIngresos(db.getIngresos())
            setProductos(db.getProductos())
            onGuardado?.({ actualizados: 0 })
          },
        },
      ],
    )
  }

  function salir() {
    if (!entradas.length) { onCerrar(); return }
    Alert.alert(
      'Dejar el ingreso a medias',
      `Tienes ${entradas.length} productos en la lista. Puedes seguir después: se guardan hasta que los ingreses o los descartes.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Seguir después', onPress: onCerrar },
        {
          text: 'Descartar',
          style: 'destructive',
          onPress: async () => { await db.updateConfig({ ingreso_en_curso: [] }); onCerrar() },
        },
      ],
    )
  }

  const totalUnidades = entradas.reduce((s, e) => s + unidadesDe(e), 0)

  if (scanner) {
    return (
      <BarcodeScannerModal
        continuo
        mensaje={mensajeScanner}
        onScanned={codigoEscaneado}
        onClose={() => { setScanner(false); setMensajeScanner(null) }}
      />
    )
  }

  return (
    <View style={styles.root}>
      <View style={[styles.encabezado, { paddingTop: insets.top + 14 }]}>
        <Text style={styles.titulo}>Ingresar mercadería</Text>
          <Text style={styles.ayuda}>
            Escanea o busca lo que llegó y escribe la cantidad. Se <Text style={{ fontWeight: '700' }}>suma</Text> a lo que ya tenías; no hace falta que calcules el total. Si vino por caja o paquete, toca 📦 Bulto y la app convierte sola.
          </Text>
        {retomado > 0 && vista === 'ingreso' && (
          <Text style={styles.retomado}>
            ↩︎ Retomaste un ingreso a medias de {retomado} productos.
          </Text>
        )}
        <TouchableOpacity onPress={() => (vista === 'ingreso' ? abrirHistorial() : setVista('ingreso'))}>
          <Text style={styles.enlaceHistorial}>
            {vista === 'ingreso' ? '🕘  Ver ingresos anteriores' : '← Volver al ingreso'}
          </Text>
        </TouchableOpacity>
      </View>

      {vista === 'historial' && (
        <ScrollView style={styles.lista}>
          {ingresos.length === 0 && <Text style={styles.vacio}>Todavía no has ingresado mercadería.</Text>}
          {ingresos.map((i, idx) => {
            // Solo el más reciente que siga vigente puede revertirse: deshacer uno
            // viejo, con ventas de por medio, dejaría un stock sin sentido.
            const esElUltimoVigente = !i.deshecho && !ingresos.slice(0, idx).some(otro => !otro.deshecho)
            return (
              <View key={i.id} style={[styles.filaIngreso, i.deshecho && styles.filaDeshecha]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.nombre}>
                    {new Date(i.fecha).toLocaleString('es-PE')}
                  </Text>
                  <Text style={styles.meta}>
                    {i.productos} productos · {i.unidades} unidades
                    {i.nombre_usuario ? ` · ${i.nombre_usuario}` : ''}
                    {i.deshecho ? ' · DESHECHO' : ''}
                  </Text>
                </View>
                {esElUltimoVigente && (
                  <TouchableOpacity onPress={() => deshacerDesdeHistorial(i)}>
                    <Text style={styles.accionDeshacer}>Deshacer</Text>
                  </TouchableOpacity>
                )}
              </View>
            )
          })}
        </ScrollView>
      )}

      {vista === 'ingreso' && (
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
      )}

      {vista === 'ingreso' && codigoDesconocido && (
        <View style={styles.cajaNuevo}>
          <Text style={styles.nuevoTitulo}>Producto nuevo · código {codigoDesconocido}</Text>
          <View style={styles.nuevoFila}>
            <TextInput
              style={[styles.buscador, { flex: 2 }]}
              placeholder="Nombre"
              placeholderTextColor={colors.placeholder}
              value={nuevo.nombre}
              onChangeText={v => setNuevo(n => ({ ...n, nombre: v }))}
              autoFocus
            />
            <TextInput
              style={[styles.buscador, { flex: 1 }]}
              placeholder="S/"
              placeholderTextColor={colors.placeholder}
              keyboardType="decimal-pad"
              value={nuevo.precio}
              onChangeText={v => setNuevo(n => ({ ...n, precio: v }))}
            />
            <TextInput
              style={[styles.buscador, { width: 62 }]}
              placeholder="Cant."
              placeholderTextColor={colors.placeholder}
              keyboardType="decimal-pad"
              value={nuevo.cantidad}
              onChangeText={v => setNuevo(n => ({ ...n, cantidad: v }))}
            />
          </View>
          <View style={styles.nuevoFila}>
            <TouchableOpacity style={styles.botonGhost} onPress={() => { setCodigoDesconocido(null); setNuevo({ nombre: '', precio: '', cantidad: '1' }) }}>
              <Text style={styles.botonGhostTexto}>Descartar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.botonPrimario, !puedeCrear && styles.botonDeshabilitado]} onPress={crearYAgregar} disabled={!puedeCrear}>
              <Text style={styles.botonPrimarioTexto}>Crear y agregar</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {vista === 'ingreso' && (
      <KeyboardAwareScrollView style={styles.lista} keyboardShouldPersistTaps="handled" enableOnAndroid extraScrollHeight={20}>
        {entradas.length > 0 && (
          <>
            <Text style={styles.subtitulo}>Lo que llegó ({entradas.length})</Text>
            {entradas.map(e => {
              const enBulto = (e.modo || 'uds') === 'bulto'
              const res = enBulto
                ? resolverBulto({ bultos: e.bultos, bultoUnidades: e.bultoUnidades, costoBulto: e.costoBulto })
                : null
              const suma = enBulto ? (res ? res.unidades : 0) : (parseFloat(e.cantidad) || 0)
              return (
              <View key={e.id} style={styles.filaEntrada}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.nombre}>{e.nombre}</Text>
                  <Text style={styles.meta}>
                    Tenías {e.stockActual} → quedará{' '}
                    <Text style={styles.metaResultado}>
                      {(e.stockActual + suma).toFixed(e.unidad === 'uds' ? 0 : 2)} {e.unidad}
                    </Text>
                  </Text>
                  {/* Unidades o bulto del mayorista: la conversión la hace la app. */}
                  <View style={styles.modoFila}>
                    <TouchableOpacity onPress={() => cambiarModo(e.id, 'uds')} style={[styles.modoChip, !enBulto && styles.modoChipActivo]}>
                      <Text style={[styles.modoTexto, !enBulto && styles.modoTextoActivo]}>Uds</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => cambiarModo(e.id, 'bulto')} style={[styles.modoChip, enBulto && styles.modoChipActivo]}>
                      <Text style={[styles.modoTexto, enBulto && styles.modoTextoActivo]}>📦 Bulto</Text>
                    </TouchableOpacity>
                  </View>
                  {!enBulto && (
                    <>
                      {/* Este es el único momento del día en que el dueño tiene la
                          factura del proveedor delante. En blanco no pisa nada. */}
                      <TextInput
                        style={styles.costoInput}
                        keyboardType="decimal-pad"
                        placeholder={e.costoActual != null ? `Te cuesta S/ ${e.costoActual}` : 'Te cuesta (opcional)'}
                        placeholderTextColor={colors.placeholder}
                        value={e.costo || ''}
                        onChangeText={v => cambiarCosto(e.id, v)}
                      />
                    </>
                  )}
                  {enBulto && !e.bultoUnidades && (
                    <View style={{ gap: 6, marginTop: 6 }}>
                      <Text style={styles.meta}>¿Cómo viene del mayorista?</Text>
                      <View style={styles.presetFila}>
                        {PRESETS_BULTO.map((p, i) => (
                          <TouchableOpacity key={i}
                            onPress={() => tocarEntrada(e.id, { bultoUnidades: p.unidades, bultoNombre: p.nombre })}
                            style={styles.presetChip}>
                            <Text style={styles.presetTexto}>{p.nombre} {p.unidades}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <View style={styles.bultoOtroFila}>
                        <TextInput
                          style={[styles.costoInput, { flex: 1, marginTop: 0 }]}
                          keyboardType="number-pad"
                          placeholder="Trae... (ej: 15)"
                          placeholderTextColor={colors.placeholder}
                          value={e.bultoUnidadesCustom || ''}
                          onChangeText={v => tocarEntrada(e.id, { bultoUnidadesCustom: v })}
                        />
                        <TextInput
                          style={[styles.costoInput, { flex: 1, marginTop: 0 }]}
                          placeholder="caja, six-pack..."
                          placeholderTextColor={colors.placeholder}
                          value={e.bultoNombreCustom || ''}
                          onChangeText={v => tocarEntrada(e.id, { bultoNombreCustom: v })}
                        />
                        <TouchableOpacity
                          style={[styles.presetChip, !(parseInt(e.bultoUnidadesCustom) > 0) && styles.botonDeshabilitado]}
                          disabled={!(parseInt(e.bultoUnidadesCustom) > 0)}
                          onPress={() => tocarEntrada(e.id, {
                            bultoUnidades: parseInt(e.bultoUnidadesCustom),
                            bultoNombre: (e.bultoNombreCustom || 'bulto').trim().toLowerCase(),
                            bultoUnidadesCustom: '', bultoNombreCustom: '',
                          })}>
                          <Text style={styles.presetTexto}>OK</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                  {enBulto && !!e.bultoUnidades && (
                    <View style={{ gap: 6, marginTop: 6 }}>
                      <View style={styles.bultoFila}>
                        <TextInput
                          style={styles.cantidadBulto}
                          keyboardType="decimal-pad"
                          placeholder="0"
                          placeholderTextColor={colors.placeholder}
                          value={e.bultos || ''}
                          onChangeText={v => tocarEntrada(e.id, { bultos: v })}
                          selectTextOnFocus
                        />
                        <Text style={styles.bultoEtiqueta}>{e.bultoNombre} de {e.bultoUnidades}</Text>
                        <TouchableOpacity onPress={() => tocarEntrada(e.id, { bultoUnidades: null, bultoNombre: null })}>
                          <Text style={styles.cambiarBulto}>cambiar</Text>
                        </TouchableOpacity>
                      </View>
                      <TextInput
                        style={styles.costoInput}
                        keyboardType="decimal-pad"
                        placeholder={`Cuesta CADA ${e.bultoNombre} (opcional)`}
                        placeholderTextColor={colors.placeholder}
                        value={e.costoBulto || ''}
                        onChangeText={v => tocarEntrada(e.id, { costoBulto: v })}
                      />
                      {/* El código solo se pide si aún no hay uno guardado: con el
                          camión esperando no se copian códigos. Si ya tiene,
                          se cambia en la ficha del producto. */}
                      {e.bultoCodigoGuardado ? (
                        <Text style={styles.bultoCodigoFijo}>📦 Paquete: {e.bultoCodigoGuardado}</Text>
                      ) : (
                        <TextInput
                          style={styles.costoInput}
                          keyboardType="number-pad"
                          placeholder="Código del paquete (opcional)"
                          placeholderTextColor={colors.placeholder}
                          value={e.bultoCodigo || ''}
                          onChangeText={v => tocarEntrada(e.id, { bultoCodigo: v })}
                        />
                      )}
                      {res && (() => {
                        // Total para cotejar con la factura del mayorista: si
                        // pagó 80 por 2 cajas y puso 80 donde van 40, acá se ve.
                        const totalBultos = (parseFloat(e.bultos) || 0) * (parseFloat(e.costoBulto) || 0)
                        const totalTxt = totalBultos > 0 ? ` · total S/ ${totalBultos % 1 === 0 ? totalBultos : totalBultos.toFixed(2)}` : ''
                        return (
                          <Text style={styles.previewBulto}>
                            {e.bultos || 0} {pluralBulto(e.bultoNombre, e.bultos)} × {e.bultoUnidades} = {res.unidades} {e.unidad}
                            {res.costoUnitario != null ? ` · te cuesta S/ ${res.costoUnitario} c/u${totalTxt}` : ''}
                          </Text>
                        )
                      })()}
                    </View>
                  )}
                </View>
                {!enBulto && (
                  <TextInput
                    style={styles.cantidadInput}
                    keyboardType="decimal-pad"
                    value={e.cantidad}
                    onChangeText={v => cambiarCantidad(e.id, v)}
                    selectTextOnFocus
                    autoFocus={e.id === ultimoAgregado}
                    onFocus={() => setUltimoAgregado(null)}
                  />
                )}
                <TouchableOpacity onPress={() => quitar(e.id)} style={styles.quitar}>
                  <Ionicons name="close-circle" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              )
            })}
            <View style={styles.separador} />
          </>
        )}

        <Text style={styles.subtitulo}>{busqueda.trim() ? 'Resultados' : 'Tus productos'}</Text>
        {candidatos.map(p => (
          <TouchableOpacity key={p.id} style={styles.filaProducto} onPress={() => agregar(p, '1', esCodigoBultoDe(p, busqueda))}>
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
      </KeyboardAwareScrollView>
      )}

      <View style={[styles.pie, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity style={styles.botonGhost} onPress={salir}>
          <Text style={styles.botonGhostTexto}>{entradas.length ? 'Salir' : 'Cancelar'}</Text>
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
    </View>
  )
}

// Los tamaños de letra pasan por tx() para el interruptor "Letra grande".
const crearStyles = (tx) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  encabezado: { padding: 16, paddingBottom: 10, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  titulo: { color: colors.text, fontWeight: '700', fontSize: tx(17) },
  ayuda: { color: colors.textMuted, fontSize: tx(13), lineHeight: 17, marginTop: 6 },

  retomado: { color: colors.accent, fontSize: tx(13), fontWeight: '700', marginTop: 8 },
  enlaceHistorial: { color: colors.accent, fontSize: tx(13), fontWeight: '700', marginTop: 10 },
  filaIngreso: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  filaDeshecha: { opacity: 0.5, borderStyle: 'dashed' },
  accionDeshacer: { color: colors.danger, fontWeight: '700', fontSize: tx(13) },
  cajaNuevo: { marginHorizontal: 12, marginBottom: 8, padding: 12, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary, backgroundColor: colors.accentBg, gap: 8 },
  nuevoTitulo: { color: colors.accent, fontSize: tx(13), fontWeight: '700' },
  nuevoFila: { flexDirection: 'row', gap: 8 },
  filaBusqueda: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  buscador: { flex: 1, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, color: colors.text },
  botonEscanear: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.card },

  lista: { flex: 1, paddingHorizontal: 12 },
  subtitulo: { color: colors.textMuted, fontSize: tx(13), fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8, marginBottom: 8 },
  separador: { height: 1, backgroundColor: colors.border, marginVertical: 12 },

  filaEntrada: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.accentBg, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.primary },
  filaProducto: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  icono: { fontSize: tx(20), lineHeight: 26 },
  nombre: { color: colors.text, fontWeight: '600', fontSize: tx(14) },
  meta: { color: colors.textMuted, fontSize: tx(13), marginTop: 2 },
  metaResultado: { color: colors.accent, fontWeight: '700' },
  costoInput: { marginTop: 6, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, color: colors.text, fontSize: tx(13) },
  cantidadInput: { width: 64, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 8, paddingVertical: 10, textAlign: 'center', color: colors.text, fontSize: tx(15), fontWeight: '700' },
  modoFila: { flexDirection: 'row', gap: 8, marginTop: 8 },
  modoChip: { paddingHorizontal: 14, height: 34, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input },
  modoChipActivo: { backgroundColor: colors.card, borderColor: colors.primary, borderWidth: 2 },
  modoTexto: { color: colors.textMuted, fontWeight: '600', fontSize: tx(13) },
  modoTextoActivo: { color: colors.accent, fontWeight: '700' },
  presetFila: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  presetChip: { paddingHorizontal: 12, height: 34, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.input },
  presetTexto: { color: colors.text, fontWeight: '600', fontSize: tx(13) },
  bultoOtroFila: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  bultoFila: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  cantidadBulto: { width: 64, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 8, paddingVertical: 10, textAlign: 'center', color: colors.text, fontSize: tx(15), fontWeight: '700' },
  bultoEtiqueta: { flex: 1, color: colors.text, fontSize: tx(14), fontWeight: '600' },
  cambiarBulto: { color: colors.accent, fontSize: tx(14), fontWeight: '700', padding: 10 },
  bultoCodigoFijo: { color: colors.textMuted, fontSize: tx(13), fontWeight: '600' },
  previewBulto: { color: colors.accent, fontSize: tx(13), fontWeight: '700', lineHeight: 18 },
  quitar: { paddingLeft: 2 },
  vacio: { color: colors.textMuted, textAlign: 'center', padding: 24, fontSize: tx(13) },

  pie: { flexDirection: 'row', gap: 10, padding: 16, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border },
  botonGhost: { flex: 1, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  botonGhostTexto: { color: colors.textMuted, fontWeight: '600' },
  botonPrimario: { flex: 2, padding: 14, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center' },
  botonPrimarioTexto: { color: colors.primaryText, fontWeight: '700' },
  botonDeshabilitado: { opacity: 0.5 },
})
