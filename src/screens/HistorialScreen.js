import React, { useState, useCallback } from 'react'
import { View, Text, TextInput, FlatList, StyleSheet, TouchableOpacity, Modal, ScrollView, Pressable, Alert } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import db, { MOTIVOS_SALIDA } from '../data/db'
import { colors } from '../theme/colors'
import { chips } from '../theme/chips'
import { compartirTicket } from '../utils/ticket'
import { usePieDeHoja } from '../utils/teclado'
import { useSesion } from '../context/SesionContext'
import { useLetra } from '../context/LetraContext'

const fmt = (n) => `S/ ${Number(n).toFixed(2)}`
const hora = (iso) => new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
const FONDOS_RAPIDOS = [0, 20, 50, 100]
const METODOS_COBRO = ['Efectivo', 'Yape', 'Plin']
const ICONO = { Efectivo: '💵', Yape: '📱', Plin: '📲', Fiado: '📋' }
const PERIODOS = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'semana', label: 'Esta semana' },
  { id: 'mes', label: 'Este mes' },
]

export default function HistorialScreen() {
  const { usuario } = useSesion()
  const { tx } = useLetra()
  const styles = crearStyles(tx)
  const { alturaTeclado, espacioAbajo } = usePieDeHoja()
  const [ventas, setVentas] = useState([])
  const [resumen, setResumen] = useState({ total_ventas: 0, ingresos: 0 })
  const [ganancia, setGanancia] = useState(null)
  const [periodo, setPeriodo] = useState('hoy')
  const [metodoFiltro, setMetodoFiltro] = useState(null)
  const [ventaSel, setVentaSel] = useState(null)
  const [compartiendo, setCompartiendo] = useState(false)

  const [caja, setCaja] = useState(null)
  const [vistaCaja, setVistaCaja] = useState(null)
  const [fondoInicial, setFondoInicial] = useState('')
  const [efectivoContado, setEfectivoContado] = useState('')
  const [notaCierre, setNotaCierre] = useState('')
  const [guardandoCaja, setGuardandoCaja] = useState(false)
  const [sesiones, setSesiones] = useState([])
  const [salidaMonto, setSalidaMonto] = useState('')
  const [salidaMotivo, setSalidaMotivo] = useState('Proveedor')

  useFocusEffect(useCallback(() => { recargar() }, [periodo]))

  // El período ahora también acota la lista, no solo los totales de arriba:
  // antes decía "Hoy" y debajo listaba las ventas de todos los tiempos.
  function desdeDelPeriodo(p) {
    const desde = new Date()
    if (p === 'hoy') desde.setHours(0, 0, 0, 0)
    else desde.setDate(desde.getDate() - (p === 'semana' ? 7 : 30))
    return desde.toISOString()
  }

  function cargarResumen(p) {
    if (p === 'hoy') setResumen(db.getResumenHoy())
    else if (p === 'semana') setResumen(db.getResumenPeriodo(7))
    else setResumen(db.getResumenPeriodo(30))
    setGanancia(db.getGanancia(desdeDelPeriodo(p)))
  }

  function cerrarVistaCaja() {
    setVistaCaja(null)
    setFondoInicial('')
    setEfectivoContado('')
    setNotaCierre('')
    setSalidaMonto('')
  }

  function abrirVistaCierre() {
    // Se releen los totales al abrir: entre que se cargó la pantalla y este
    // momento pudo entrar otra venta, y el cuadre tiene que ser del instante.
    setCaja(db.getEstadoCaja())
    setEfectivoContado('')
    setNotaCierre('')
    setVistaCaja('cierre')
  }

  function abrirHistorialCaja() {
    setSesiones(db.getSesionesCaja())
    setVistaCaja('historial')
  }

  async function confirmarSalida() {
    setGuardandoCaja(true)
    const r = await db.registrarSalidaCaja({ monto: salidaMonto, motivo: salidaMotivo, usuarioId: usuario?.id })
    setGuardandoCaja(false)
    if (!r.success) { Alert.alert('No se pudo anotar', r.error); return }
    setCaja(db.getEstadoCaja())
    cerrarVistaCaja()
  }

  async function confirmarApertura() {
    setGuardandoCaja(true)
    const r = await db.abrirCaja({ fondoInicial: fondoInicial || 0, usuarioId: usuario?.id })
    setGuardandoCaja(false)
    if (!r.success) { Alert.alert('No se pudo abrir', r.error); return }
    setCaja(db.getEstadoCaja())
    cerrarVistaCaja()
  }

  // La diferencia se calcula mientras el dueño teclea: ver "faltan S/ 3" en el
  // momento le da la chance de volver a contar antes de dejarlo asentado.
  const contadoNum = parseFloat(efectivoContado)
  const diferencia = isNaN(contadoNum) ? null : Math.round((contadoNum - (caja?.esperado_en_cajon || 0)) * 100) / 100

  async function confirmarCierre() {
    setGuardandoCaja(true)
    const r = await db.cerrarCaja({ efectivoContado, nota: notaCierre, usuarioId: usuario?.id })
    setGuardandoCaja(false)
    if (!r.success) { Alert.alert('No se pudo cerrar', r.error); return }
    setCaja(db.getEstadoCaja())
    cerrarVistaCaja()
    const detalle = r.diferencia === 0
      ? 'La caja cuadró exacta.'
      : r.diferencia > 0
        ? `Sobran ${fmt(r.diferencia)} respecto a lo esperado.`
        : `Faltan ${fmt(Math.abs(r.diferencia))} respecto a lo esperado.`
    Alert.alert('✓ Caja cerrada', `${detalle}\n\nEsperado ${fmt(r.esperado)} · contado ${fmt(r.contado)}`)
  }

  // Solo tiene sentido corregir un cobro que entró: un fiado no se cobró
  // todavía, y una venta anulada ya no cuenta en ningún total.
  const puedeCorregir = ventaSel && ventaSel.tipo !== 'pago_fiado' && !ventaSel.es_fiado && !ventaSel.anulada

  function recargar() {
    setVentas(db.getHistorialVentas(desdeDelPeriodo(periodo)))
    setCaja(db.getEstadoCaja())
    cargarResumen(periodo)
  }

  async function corregirMetodo(metodo) {
    const r = await db.cambiarMetodoPago(ventaSel.id, metodo)
    if (!r.success) { Alert.alert('No se pudo corregir', r.error); return }
    setVentaSel(v => ({ ...v, metodo_pago: metodo }))
    recargar()
  }

  function confirmarAnular() {
    Alert.alert(
      '¿Anular esta venta?',
      `Se devuelve el stock de los productos y la venta deja de contar en los totales y en la caja.\n\n${
        ventaSel.es_fiado ? 'También se borra la deuda que generó.\n\n' : ''
      }La venta queda a la vista, marcada como anulada.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Anular',
          style: 'destructive',
          onPress: async () => {
            const r = await db.anularVenta(ventaSel.id, usuario?.id)
            if (!r.success) { Alert.alert('No se pudo anular', r.error); return }
            setVentaSel(null)
            recargar()
            Alert.alert('✓ Venta anulada', 'El stock volvió a como estaba y los totales ya no la cuentan.')
          },
        },
      ],
    )
  }

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

      {/* Lo que ingresó no es lo que se ganó: la mayor parte es del proveedor.
          Esta es la única cifra que la app puede dar y el cuaderno no — pero
          solo vale si los costos están cargados, así que se dice cuánto de lo
          vendido quedó fuera del cálculo en vez de fingir un número exacto. */}
      {ganancia && ganancia.vendido_total > 0 && (
        <View style={styles.tarjetaGanancia}>
          <View style={styles.filaGanancia}>
            <Text style={styles.gananciaLabel}>Ganancia aprox. {etiquetaPeriodo}</Text>
            <Text style={styles.gananciaValor}>{fmt(ganancia.ganancia)}</Text>
          </View>
          {ganancia.cobertura < 0.999 && (
            <Text style={styles.gananciaAviso}>
              {ganancia.vendido_con_costo === 0
                ? 'Ninguno de los productos vendidos tiene su costo cargado todavía. Ponlo al ingresar mercadería o en la ficha del producto.'
                : `Calculada sobre ${fmt(ganancia.vendido_con_costo)} de ${fmt(ganancia.vendido_total)} vendidos: al resto le falta cargarle el costo.`}
            </Text>
          )}
        </View>
      )}

      <View style={[styles.tarjetaCaja, caja?.abierta && styles.tarjetaCajaAbierta]}>
        {caja?.abierta ? (
          <>
            <Text style={styles.cajaEstado}>🟢  Caja abierta desde las {hora(caja.desde)}</Text>
            <Text style={styles.cajaDetalle}>
              Empezaste con {fmt(caja.fondo_inicial)} · en el cajón debería haber{' '}
              <Text style={styles.cajaMonto}>{fmt(caja.esperado_en_cajon)}</Text>
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.cajaEstado}>⚪  Caja cerrada</Text>
            <Text style={styles.cajaDetalle}>Ábrela al empezar el día con el sencillo que dejas en el cajón, y al cerrar la app te dice si cuadra.</Text>
          </>
        )}
        {caja?.total_salidas > 0 && (
          <Text style={styles.cajaDetalle}>Sacaste {fmt(caja.total_salidas)} del cajón en este turno.</Text>
        )}
        <View style={styles.cajaBotones}>
          {caja?.abierta ? (
            <TouchableOpacity style={styles.botonGhost} onPress={() => { setSalidaMonto(''); setSalidaMotivo('Proveedor'); setVistaCaja('salida') }}>
              <Text style={styles.botonGhostTexto}>💸  Saqué plata</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.botonGhost} onPress={abrirHistorialCaja}>
              <Text style={styles.botonGhostTexto}>Cierres anteriores</Text>
            </TouchableOpacity>
          )}
          {caja?.abierta ? (
            <TouchableOpacity style={styles.botonPrimario} onPress={abrirVistaCierre}>
              <Text style={styles.botonPrimarioTexto}>🧮  Cerrar caja</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.botonPrimario} onPress={() => { setFondoInicial(''); setVistaCaja('apertura') }}>
              <Text style={styles.botonPrimarioTexto}>🔓  Abrir caja</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <FlatList
        data={ventasFiltradas}
        keyExtractor={v => String(v.id)}
        contentContainerStyle={{ padding: 12 }}
        renderItem={({ item }) => (
          <TouchableOpacity style={[styles.fila, !!item.anulada && styles.filaAnulada]} onPress={() => setVentaSel(item)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.venta}>{item.tipo === 'pago_fiado' ? 'Abono fiado' : `Venta #${item.id}`} {ICONO[item.metodo_pago] || ''} {item.metodo_pago}</Text>
              <Text style={styles.fecha}>{new Date(item.fecha).toLocaleString('es-PE')}</Text>
              {item.nombre_cliente && <Text style={styles.cliente}>{item.nombre_cliente}</Text>}
              {!!item.anulada && <Text style={styles.etiquetaAnulada}>🚫 Anulada</Text>}
            </View>
            <Text style={[styles.total, !!item.anulada && styles.totalAnulado]}>{fmt(item.total)}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.vacio}>{metodoFiltro ? `No hay ventas con ${metodoFiltro} ${etiquetaPeriodo}.` : `Todavía no hay ventas ${etiquetaPeriodo}.`}</Text>}
      />

      <Modal visible={vistaCaja === 'salida'} transparent animationType="slide" onRequestClose={cerrarVistaCaja}>
        <View style={[styles.modalFondo, { paddingBottom: alturaTeclado }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={cerrarVistaCaja} />
          <ScrollView style={styles.modalScrollLimite} contentContainerStyle={[styles.modalCaja, { paddingBottom: 20 + espacioAbajo }]} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitulo}>💸 Saqué plata del cajón</Text>
            <Text style={styles.modalFecha}>Se descuenta de lo que la app espera encontrar al cerrar, para que el faltante no sea mentira.</Text>

            <Text style={styles.etiqueta}>¿Para qué fue?</Text>
            <View style={styles.metodosCorregir}>
              {MOTIVOS_SALIDA.map(m => (
                <TouchableOpacity
                  key={m}
                  onPress={() => setSalidaMotivo(m)}
                  style={[styles.metodoChip, salidaMotivo === m && styles.metodoChipActivo]}
                >
                  <Text style={[styles.metodoChipTexto, salidaMotivo === m && styles.metodoChipTextoActivo]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={styles.input}
              placeholder="S/ 0.00"
              placeholderTextColor={colors.placeholder}
              keyboardType="decimal-pad"
              value={salidaMonto}
              onChangeText={setSalidaMonto}
            />

            <View style={styles.filaBotones}>
              <TouchableOpacity style={styles.botonGhost} onPress={cerrarVistaCaja}>
                <Text style={styles.botonGhostTexto}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.botonPrimario, !(parseFloat(salidaMonto) > 0) && styles.botonDeshabilitado]}
                onPress={confirmarSalida}
                disabled={!(parseFloat(salidaMonto) > 0) || guardandoCaja}
              >
                <Text style={styles.botonPrimarioTexto}>{guardandoCaja ? 'Anotando...' : 'Anotar salida'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={vistaCaja === 'apertura'} transparent animationType="slide" onRequestClose={cerrarVistaCaja}>
        <View style={[styles.modalFondo, { paddingBottom: alturaTeclado }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={cerrarVistaCaja} />
          <ScrollView style={styles.modalScrollLimite} contentContainerStyle={[styles.modalCaja, { paddingBottom: 20 + espacioAbajo }]} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitulo}>🔓 Abrir caja</Text>
            <Text style={styles.modalFecha}>¿Con cuánto sencillo empiezas? Es lo que hay en el cajón antes de la primera venta.</Text>

            <View style={styles.atajosFondo}>
              {FONDOS_RAPIDOS.map(v => (
                <TouchableOpacity key={v} style={styles.atajoFondo} onPress={() => setFondoInicial(String(v))}>
                  <Text style={styles.atajoFondoTexto}>{v === 0 ? 'Sin fondo' : `S/ ${v}`}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={styles.input}
              placeholder="S/ 0.00"
              placeholderTextColor={colors.placeholder}
              keyboardType="decimal-pad"
              value={fondoInicial}
              onChangeText={setFondoInicial}
            />

            <View style={styles.filaBotones}>
              <TouchableOpacity style={styles.botonGhost} onPress={cerrarVistaCaja}>
                <Text style={styles.botonGhostTexto}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.botonPrimario} onPress={confirmarApertura} disabled={guardandoCaja}>
                <Text style={styles.botonPrimarioTexto}>{guardandoCaja ? 'Abriendo...' : 'Abrir caja'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={vistaCaja === 'cierre'} transparent animationType="slide" onRequestClose={cerrarVistaCaja}>
        <View style={[styles.modalFondo, { paddingBottom: alturaTeclado }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={cerrarVistaCaja} />
          <ScrollView style={styles.modalScrollLimite} contentContainerStyle={[styles.modalCaja, { paddingBottom: 20 + espacioAbajo }]} keyboardShouldPersistTaps="handled">
            {caja?.abierta && (
              <>
                <Text style={styles.modalTitulo}>🧮 Cerrar caja</Text>
                <Text style={styles.modalFecha}>
                  Abierta a las {hora(caja.desde)} · {caja.total_ventas} {caja.total_ventas === 1 ? 'venta' : 'ventas'}
                </Text>

                <View style={styles.filaTotalLinea}>
                  <Text style={styles.itemNombre}>Fondo con el que abriste</Text>
                  <Text style={styles.itemSubtotal}>{fmt(caja.fondo_inicial)}</Text>
                </View>
                {caja.metodos.map(m => (
                  <View key={m.metodo} style={styles.filaTotalLinea}>
                    <Text style={styles.itemNombre}>{ICONO[m.metodo] || ''} {m.metodo} ({m.cantidad})</Text>
                    <Text style={styles.itemSubtotal}>{fmt(m.monto)}</Text>
                  </View>
                ))}
                {(caja.salidas || []).map(s => (
                  <View key={s.id} style={styles.filaTotalLinea}>
                    <Text style={styles.itemNombre}>💸 Salida · {s.motivo} ({hora(s.fecha)})</Text>
                    <Text style={styles.textoSalida}>−{fmt(s.monto)}</Text>
                  </View>
                ))}
                {caja.fiado_otorgado > 0 && (
                  <View style={styles.filaTotalLinea}>
                    <Text style={styles.textoMuted}>Fiado entregado (no entró a la caja)</Text>
                    <Text style={styles.textoFiado}>{fmt(caja.fiado_otorgado)}</Text>
                  </View>
                )}

                <View style={styles.cierreCajon}>
                  <Text style={styles.cierreCajonLabel}>💵 En el cajón debería haber</Text>
                  <Text style={styles.cierreCajonValor}>{fmt(caja.esperado_en_cajon)}</Text>
                </View>

                <Text style={styles.etiqueta}>¿Cuánto contaste realmente?</Text>
                <TextInput
                  style={styles.input}
                  placeholder="S/ 0.00"
                  placeholderTextColor={colors.placeholder}
                  keyboardType="decimal-pad"
                  value={efectivoContado}
                  onChangeText={setEfectivoContado}
                />

                {diferencia !== null && (
                  <Text style={diferencia === 0 ? styles.diferenciaOk : styles.diferenciaMal}>
                    {diferencia === 0
                      ? '✓ Cuadra exacto'
                      : diferencia > 0
                        ? `Sobran ${fmt(diferencia)}`
                        : `Faltan ${fmt(Math.abs(diferencia))}`}
                  </Text>
                )}

                {diferencia !== null && diferencia !== 0 && (
                  <TextInput
                    style={[styles.input, styles.inputNota]}
                    placeholder="¿Sabes por qué no cuadra? (opcional)"
                    placeholderTextColor={colors.placeholder}
                    multiline
                    value={notaCierre}
                    onChangeText={setNotaCierre}
                  />
                )}

                <View style={styles.filaBotones}>
                  <TouchableOpacity style={styles.botonGhost} onPress={cerrarVistaCaja}>
                    <Text style={styles.botonGhostTexto}>Todavía no</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.botonPrimario, diferencia === null && styles.botonDeshabilitado]}
                    onPress={confirmarCierre}
                    disabled={diferencia === null || guardandoCaja}
                  >
                    <Text style={styles.botonPrimarioTexto}>{guardandoCaja ? 'Cerrando...' : 'Cerrar caja'}</Text>
                  </TouchableOpacity>
                </View>
                {diferencia === null && (
                  <Text style={styles.motivoBloqueo}>Cuenta el efectivo del cajón y escríbelo para cerrar.</Text>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={vistaCaja === 'historial'} transparent animationType="slide" onRequestClose={cerrarVistaCaja}>
        <View style={styles.modalFondo}>
          <Pressable style={StyleSheet.absoluteFill} onPress={cerrarVistaCaja} />
          <ScrollView style={styles.modalScrollLimite} contentContainerStyle={[styles.modalCaja, { paddingBottom: 20 + espacioAbajo }]}>
            <Text style={styles.modalTitulo}>Cierres anteriores</Text>
            {sesiones.length === 0 && <Text style={styles.vacio}>Todavía no has cerrado ninguna caja.</Text>}
            {sesiones.map(s => (
              <View key={s.id} style={styles.filaSesion}>
                <View style={styles.filaSesionCabecera}>
                  <Text style={styles.sesionFecha}>{new Date(s.abierta_en).toLocaleDateString('es-PE')}</Text>
                  <Text style={s.diferencia === 0 ? styles.sesionOk : styles.sesionMal}>
                    {s.diferencia === 0
                      ? 'Cuadró'
                      : s.diferencia > 0 ? `Sobró ${fmt(s.diferencia)}` : `Faltó ${fmt(Math.abs(s.diferencia))}`}
                  </Text>
                </View>
                <Text style={styles.sesionDetalle}>
                  {hora(s.abierta_en)} a {hora(s.cerrada_en)} · esperado {fmt(s.efectivo_esperado)} · contado {fmt(s.efectivo_contado)}
                </Text>
                <Text style={styles.sesionDetalle}>
                  Fondo {fmt(s.fondo_inicial)}
                  {s.nombre_apertura ? ` · abrió ${s.nombre_apertura}` : ''}
                  {s.nombre_cierre ? ` · cerró ${s.nombre_cierre}` : ''}
                </Text>
                {s.nota && <Text style={styles.sesionNota}>“{s.nota}”</Text>}
              </View>
            ))}
            <TouchableOpacity style={[styles.botonGhost, { marginTop: 14 }]} onPress={cerrarVistaCaja}>
              <Text style={styles.botonGhostTexto}>Cerrar</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={!!ventaSel} transparent animationType="slide" onRequestClose={() => setVentaSel(null)}>
        <View style={styles.modalFondo}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setVentaSel(null)} />
          <View style={[styles.modalCaja, { maxHeight: '85%', paddingBottom: 20 + espacioAbajo }]}>
            {ventaSel && (
              <>
                <Text style={styles.modalTitulo}>{ventaSel.tipo === 'pago_fiado' ? 'Abono fiado' : `Venta #${ventaSel.id}`} {ICONO[ventaSel.metodo_pago] || ''} {ventaSel.metodo_pago}</Text>
                <Text style={styles.modalFecha}>{new Date(ventaSel.fecha).toLocaleString('es-PE')}</Text>
                {ventaSel.nombre_cliente && <Text style={styles.modalCliente}>Cliente: {ventaSel.nombre_cliente}</Text>}
                {!!ventaSel.anulada && <Text style={styles.avisoAnulada}>🚫 Venta anulada — no cuenta en los totales</Text>}

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

                {/* Corregir el método es el arreglo más pedido: se cobró en
                    efectivo y se marcó Yape, y con eso el cierre ya no cuadra. */}
                {puedeCorregir && (
                  <>
                    <Text style={styles.etiqueta}>Me pagaron con</Text>
                    <View style={styles.metodosCorregir}>
                      {METODOS_COBRO.map(m => (
                        <TouchableOpacity
                          key={m}
                          onPress={() => corregirMetodo(m)}
                          style={[styles.metodoChip, ventaSel.metodo_pago === m && styles.metodoChipActivo]}
                        >
                          <Text style={[styles.metodoChipTexto, ventaSel.metodo_pago === m && styles.metodoChipTextoActivo]}>
                            {ICONO[m]} {m}
                          </Text>
                        </TouchableOpacity>
                      ))}
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

                {ventaSel.tipo !== 'pago_fiado' && !ventaSel.anulada && (
                  <TouchableOpacity style={styles.botonAnular} onPress={confirmarAnular}>
                    <Text style={styles.botonAnularTexto}>🚫  Anular esta venta</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  )
}

// Los tamaños de letra pasan por tx() para el interruptor "Letra grande".
const crearStyles = (tx) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  periodoFila: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  periodoChip: { flex: 1, minHeight: 44, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  periodoChipActivo: { backgroundColor: colors.accentBg, borderColor: colors.primary },
  periodoTexto: { color: colors.textMuted, fontWeight: '600', fontSize: tx(13) },
  periodoTextoActivo: { color: colors.accent },
  tarjetaCaja: { marginHorizontal: 16, marginBottom: 4, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, gap: 4 },
  tarjetaCajaAbierta: { borderColor: colors.primary, backgroundColor: colors.accentBg },
  cajaEstado: { color: colors.text, fontWeight: '700', fontSize: tx(14) },
  cajaDetalle: { color: colors.textMuted, fontSize: tx(13), lineHeight: 17 },
  cajaMonto: { color: colors.accent, fontWeight: '700' },
  cajaBotones: { flexDirection: 'row', gap: 10, marginTop: 10 },

  etiqueta: { color: colors.textMuted, fontSize: tx(13), fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 14, marginBottom: 6 },
  input: { backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14, color: colors.text, fontSize: tx(15), marginTop: 8 },
  inputNota: { minHeight: 70, textAlignVertical: 'top' },
  atajosFondo: { flexDirection: 'row', gap: 8, marginTop: 12 },
  atajoFondo: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input, alignItems: 'center' },
  atajoFondoTexto: { color: colors.text, fontWeight: '600', fontSize: tx(13) },
  diferenciaOk: { color: colors.accent, fontWeight: '800', fontSize: tx(16), marginTop: 10 },
  diferenciaMal: { color: colors.danger, fontWeight: '800', fontSize: tx(16), marginTop: 10 },
  motivoBloqueo: { color: colors.textMuted, fontSize: tx(13), textAlign: 'center', marginTop: 10 },
  botonDeshabilitado: { opacity: 0.5 },

  filaSesion: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 3 },
  filaSesionCabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sesionFecha: { color: colors.text, fontWeight: '700', fontSize: tx(14) },
  sesionOk: { color: colors.accent, fontWeight: '700', fontSize: tx(13) },
  sesionMal: { color: colors.danger, fontWeight: '700', fontSize: tx(13) },
  sesionDetalle: { color: colors.textMuted, fontSize: tx(13) },
  sesionNota: { color: colors.textMuted, fontSize: tx(13), fontStyle: 'italic', marginTop: 2 },
  modalScrollLimite: { flexGrow: 0, maxHeight: '85%' },

  avisoAnulada: { color: colors.danger, fontWeight: '700', fontSize: tx(13), marginTop: 6 },
  filaAnulada: { opacity: 0.55, borderStyle: 'dashed' },
  textoSalida: { color: colors.danger, fontWeight: '700', fontSize: tx(13) },
  etiquetaAnulada: { color: colors.danger, fontWeight: '700', fontSize: tx(13), marginTop: 3 },
  totalAnulado: { textDecorationLine: 'line-through', color: colors.textMuted },
  metodosCorregir: { flexDirection: 'row', gap: 8, marginTop: 4 },
  metodoChip: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input, alignItems: 'center' },
  metodoChipActivo: { borderColor: colors.primary, backgroundColor: colors.accentBg },
  metodoChipTexto: { color: colors.textMuted, fontWeight: '600', fontSize: tx(13) },
  metodoChipTextoActivo: { color: colors.accent, fontWeight: '700' },
  botonAnular: { marginTop: 10, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.danger, alignItems: 'center' },
  botonAnularTexto: { color: colors.danger, fontWeight: '700', fontSize: tx(13) },
  cierreCajon: { marginTop: 12, marginBottom: 4, padding: 14, borderRadius: 12, backgroundColor: colors.accentBg, borderWidth: 1, borderColor: colors.primary },
  cierreCajonLabel: { color: colors.textMuted, fontSize: tx(13), marginBottom: 4 },
  cierreCajonValor: { color: colors.accent, fontWeight: '800', fontSize: tx(26) },
  textoFiado: { color: colors.warning, fontWeight: '700' },
  resumen: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 },
  resumenBox: { flex: 1, backgroundColor: colors.card, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  resumenValor: { color: colors.accent, fontWeight: '900', fontSize: tx(20) },
  tarjetaGanancia: { marginHorizontal: 16, marginBottom: 8, padding: 14, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  filaGanancia: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  gananciaLabel: { color: colors.textMuted, fontSize: tx(13), fontWeight: '600' },
  gananciaValor: { color: colors.accent, fontWeight: '800', fontSize: tx(22) },
  gananciaAviso: { color: colors.textMuted, fontSize: tx(13), lineHeight: 16, marginTop: 6 },
  resumenLabel: { color: colors.textMuted, fontSize: tx(13), marginTop: 4 },
  fila: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  venta: { color: colors.text, fontWeight: '600', fontSize: tx(13) },
  fecha: { color: colors.textMuted, fontSize: tx(13), marginTop: 2 },
  cliente: { color: colors.textMuted, fontSize: tx(13), marginTop: 2 },
  total: { color: colors.accent, fontWeight: '700', fontSize: tx(15) },
  vacio: { color: colors.textMuted, textAlign: 'center', padding: 24, fontSize: tx(13) },
  modalFondo: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalCaja: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalTitulo: { color: colors.text, fontWeight: '700', fontSize: tx(16) },
  modalFecha: { color: colors.textMuted, fontSize: tx(13), marginTop: 2 },
  modalCliente: { color: colors.textMuted, fontSize: tx(13), marginTop: 4, fontWeight: '600' },
  itemFila: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderColor: colors.border },
  itemNombre: { color: colors.text, fontSize: tx(14), fontWeight: '600' },
  itemCantidad: { color: colors.textMuted, fontSize: tx(13), marginTop: 2 },
  itemSubtotal: { color: colors.text, fontWeight: '700', fontSize: tx(14) },
  filaTotalLinea: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  textoMuted: { color: colors.textMuted, fontSize: tx(13) },
  totalGrandeLabel: { color: colors.text, fontWeight: '900', fontSize: tx(18) },
  totalGrande: { color: colors.accent, fontWeight: '900', fontSize: tx(18) },
  filaBotones: { flexDirection: 'row', gap: 10, marginTop: 16 },
  botonGhost: { flex: 1, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  botonGhostTexto: { color: colors.textMuted, fontWeight: '600' },
  botonPrimario: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center' },
  botonPrimarioTexto: { color: colors.primaryText, fontWeight: '700' },
})
