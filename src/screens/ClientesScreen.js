import React, { useState, useCallback } from 'react'
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Modal, ScrollView, Pressable, Alert } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import db from '../data/db'
import { colors } from '../theme/colors'
import { armarMensajeCobranza, abrirWhatsApp } from '../utils/cobranza'
import { usePieDeHoja } from '../utils/teclado'
import { coincide } from '../utils/texto'
import { useSesion } from '../context/SesionContext'
import { useLetra } from '../context/LetraContext'

const fmt = (n) => `S/ ${Number(n).toFixed(2)}`
const METODOS = ['Efectivo', 'Yape', 'Plin']
const ICONO_METODO = { Efectivo: '💵', Yape: '📱', Plin: '📲' }
// Los mismos billetes con los que paga la gente en el mostrador.
const BILLETES = [2, 5, 10, 20, 50, 100, 200]

export default function ClientesScreen() {
  const { usuario } = useSesion()
  const { tx } = useLetra()
  const styles = crearStyles(tx)
  const { alturaTeclado, espacioAbajo } = usePieDeHoja()
  const [clientes, setClientes] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [modalNuevo, setModalNuevo] = useState(false)
  const [form, setForm] = useState({ nombre: '', telefono: '' })
  const [clienteDetalle, setClienteDetalle] = useState(null)
  const [fiados, setFiados] = useState([])
  const [montoAbono, setMontoAbono] = useState('')
  const [metodoAbono, setMetodoAbono] = useState('Efectivo')
  const [abonando, setAbonando] = useState(false)
  const [recibido, setRecibido] = useState('')

  const [telefonoEdit, setTelefonoEdit] = useState('')
  const [borradorMensaje, setBorradorMensaje] = useState(null)

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
    setTelefonoEdit(c.telefono || '')
  }

  const telefonoCambiado = clienteDetalle && telefonoEdit.trim() !== (clienteDetalle.telefono || '').trim()

  async function guardarTelefono() {
    if (!clienteDetalle || !telefonoCambiado) return
    await db.updateCliente({ id: clienteDetalle.id, telefono: telefonoEdit })
    const actualizados = db.getClientes()
    setClientes(actualizados)
    setClienteDetalle(actualizados.find(c => c.id === clienteDetalle.id))
  }

  // Tocar fuera cierra el modal, y eso ocurría antes de que el campo perdiera
  // el foco: el número tecleado se perdía sin aviso. Se guarda al cerrar, venga
  // el cierre de donde venga.
  async function cerrarDetalle() {
    await guardarTelefono()
    setClienteDetalle(null)
    setBorradorMensaje(null)
  }

  const clientesFiltrados = clientes.filter(c => coincide(c.nombre, busqueda))

  const deudaTotal = fiados.filter(f => f.estado === 'pendiente').reduce((s, f) => s + f.saldo, 0)

  // Se prepara el borrador y se deja editar antes de abrir WhatsApp: a un
  // cliente se le escribe de una forma y a otro de otra, y eso ninguna
  // plantilla lo adivina.
  async function prepararCobranza() {
    await guardarTelefono()
    const config = db.getConfig()
    setBorradorMensaje(armarMensajeCobranza({
      cliente: clienteDetalle,
      deuda: deudaTotal,
      negocio: config.negocio_nombre,
      yape: config.negocio_telefono,
    }))
  }

  async function enviarCobranza() {
    // El número que vale es el que está escrito en pantalla, no el que estaba
    // guardado: si el dueño acaba de tipearlo, tocar el botón debe funcionar.
    const enviado = await abrirWhatsApp({ telefono: telefonoEdit, mensaje: borradorMensaje })
    if (enviado) setBorradorMensaje(null)
  }

  // Solo informativo: a la caja entra el abono aplicado, porque el vuelto sale
  // de vuelta al cliente en el mismo movimiento. Sirve para no sacar la cuenta
  // de cabeza con el casero enfrente.
  const recibidoNum = parseFloat(recibido)
  const vuelto = isNaN(recibidoNum) ? null : Math.round((recibidoNum - (parseFloat(montoAbono) || 0)) * 100) / 100

  async function abonar() {
    setAbonando(true)
    const r = await db.abonarACliente({
      clienteId: clienteDetalle.id,
      monto: montoAbono,
      metodoPago: metodoAbono,
      usuarioId: usuario?.id,
    })
    setAbonando(false)
    if (!r.success) { Alert.alert('No se pudo abonar', r.error); return }

    setMontoAbono('')
    setRecibido('')
    setFiados(db.getFiadoCliente(clienteDetalle.id))
    cargar()

    const resto = r.saldo_restante > 0 ? `Le queda ${fmt(r.saldo_restante)}.` : 'Quedó al día. 🎉'
    const sobrante = r.sobrante > 0 ? `\n\nEscribiste ${fmt(r.sobrante)} más de lo que debía: solo se abonó su deuda.` : ''
    Alert.alert('✓ Abono anotado', `Se abonaron ${fmt(r.abonado)}. ${resto}${sobrante}`)
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TextInput
          style={styles.buscador}
          placeholder="🔍 Buscar casero..."
          placeholderTextColor={colors.placeholder}
          value={busqueda}
          onChangeText={setBusqueda}
        />
        <TouchableOpacity style={styles.botonNuevo} onPress={() => setModalNuevo(true)}><Text style={styles.botonNuevoTexto}>+ Cliente</Text></TouchableOpacity>
      </View>

      <FlatList
        data={clientesFiltrados}
        keyExtractor={c => String(c.id)}
        contentContainerStyle={{ padding: 12 }}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.fila} onPress={() => abrirDetalle(item)}>
            <Text style={styles.nombre}>{item.nombre}</Text>
            {item.deuda_total > 0 ? <Text style={styles.deuda}>Debe {fmt(item.deuda_total)}</Text> : <Text style={styles.alDia}>Al día</Text>}
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.vacio}>{busqueda.trim() ? 'Ningún casero coincide.' : 'No hay clientes registrados todavía.'}</Text>}
      />

      {/* Nuevo cliente */}
      <Modal visible={modalNuevo} transparent animationType="slide" onRequestClose={() => setModalNuevo(false)}>
        <View style={[styles.modalFondo, { paddingBottom: alturaTeclado }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setModalNuevo(false)} />
          <ScrollView style={styles.modalScrollLimite} contentContainerStyle={[styles.modalCaja, { paddingBottom: 20 + espacioAbajo }]} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitulo}>Nuevo cliente</Text>
            <TextInput style={styles.input} placeholder="Nombre" placeholderTextColor={colors.placeholder} value={form.nombre} onChangeText={v => setForm(f => ({ ...f, nombre: v }))} />
            <TextInput style={styles.input} placeholder="Teléfono (opcional)" placeholderTextColor={colors.placeholder} value={form.telefono} onChangeText={v => setForm(f => ({ ...f, telefono: v }))} />
            <View style={styles.filaBotones}>
              <TouchableOpacity style={styles.botonGhost} onPress={() => setModalNuevo(false)}><Text style={styles.botonGhostTexto}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={styles.botonPrimario} onPress={guardarCliente}><Text style={styles.botonPrimarioTexto}>Guardar</Text></TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Detalle / fiado */}
      <Modal visible={!!clienteDetalle} transparent animationType="slide" onRequestClose={cerrarDetalle}>
        <View style={[styles.modalFondo, { paddingBottom: alturaTeclado }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={cerrarDetalle} />
          <ScrollView style={{ maxHeight: '80%' }} contentContainerStyle={[styles.modalCaja, { paddingBottom: 20 + espacioAbajo }]} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitulo}>{clienteDetalle?.nombre}</Text>

            {/* El teléfono se puede guardar siempre, deba o no: si solo apareciera
                con deuda, habría que esperar a que deba para poder anotarlo. */}
            <View style={styles.bloqueCobranza}>
              <View style={styles.filaTelefono}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Teléfono (para escribirle por WhatsApp)"
                  placeholderTextColor={colors.placeholder}
                  keyboardType="phone-pad"
                  value={telefonoEdit}
                  onChangeText={setTelefonoEdit}
                  onBlur={guardarTelefono}
                />
                {telefonoCambiado && (
                  <TouchableOpacity style={styles.botonGuardarTel} onPress={guardarTelefono}>
                    <Text style={styles.botonGuardarTelTexto}>Guardar</Text>
                  </TouchableOpacity>
                )}
              </View>
              {!telefonoCambiado && telefonoEdit.trim() !== '' && (
                <Text style={styles.telefonoGuardado}>✓ Número guardado</Text>
              )}

              {deudaTotal > 0 && borradorMensaje === null && (
                <TouchableOpacity
                  style={[styles.botonWhatsApp, !telefonoEdit.trim() && styles.botonDeshabilitado]}
                  onPress={prepararCobranza}
                  disabled={!telefonoEdit.trim()}
                >
                  <Text style={styles.botonWhatsAppTexto}>
                    💬  Recordarle por WhatsApp · {fmt(deudaTotal)}
                  </Text>
                </TouchableOpacity>
              )}

              {borradorMensaje !== null && (
                <>
                  <Text style={styles.etiquetaMensaje}>Revisa el mensaje antes de enviarlo</Text>
                  <TextInput
                    style={[styles.input, styles.mensajeInput]}
                    multiline
                    value={borradorMensaje}
                    onChangeText={setBorradorMensaje}
                  />
                  <View style={styles.filaTelefono}>
                    <TouchableOpacity style={styles.botonGhost} onPress={() => setBorradorMensaje(null)}>
                      <Text style={styles.botonGhostTexto}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.botonWhatsApp, { flex: 1 }]} onPress={enviarCobranza}>
                      <Text style={styles.botonWhatsAppTexto}>Enviar</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
            {/* El casero paga a cuenta de lo que debe, no de una compra
                puntual: un solo monto y la app lo reparte. Repartirlo a mano
                fila por fila, con el cliente esperando, era más lento que el
                cuaderno que vino a reemplazar. */}
            {deudaTotal > 0 && (
              <View style={styles.bloqueAbono}>
                <Text style={styles.deudaLabel}>Debe en total</Text>
                <Text style={styles.deudaMonto}>{fmt(deudaTotal)}</Text>

                <View style={styles.metodoChipsFila}>
                  {METODOS.map(m => (
                    <TouchableOpacity key={m} onPress={() => setMetodoAbono(m)}
                      style={[styles.metodoChip, metodoAbono === m && styles.metodoChipActivo]}>
                      <Text style={[styles.metodoChipTexto, metodoAbono === m && styles.metodoChipTextoActivo]}>
                        {ICONO_METODO[m]} {m}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.fiadoPago}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="¿Cuánto te abona?"
                    placeholderTextColor={colors.placeholder}
                    keyboardType="decimal-pad"
                    value={montoAbono}
                    onChangeText={setMontoAbono}
                  />
                  <TouchableOpacity
                    style={[styles.botonPagar, !(parseFloat(montoAbono) > 0) && styles.botonDeshabilitado]}
                    onPress={abonar}
                    disabled={!(parseFloat(montoAbono) > 0) || abonando}
                  >
                    <Text style={styles.botonPagarTexto}>{abonando ? '...' : 'Abonar'}</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={() => { setMontoAbono(String(deudaTotal)); setRecibido('') }}>
                  <Text style={styles.pagarTodo}>Paga todo ({fmt(deudaTotal)})</Text>
                </TouchableOpacity>

                {/* El casero debe 8 y paga con 10: sin esto el dueño saca el
                    vuelto de cabeza con el cliente enfrente. En Yape y Plin no
                    aplica — ahí el monto entra exacto. */}
                {metodoAbono === 'Efectivo' && parseFloat(montoAbono) > 0 && (
                  <>
                    <View style={styles.billetesFila}>
                      {BILLETES.filter(b => b > parseFloat(montoAbono)).slice(0, 4).map(b => (
                        <TouchableOpacity key={b} style={styles.billete} onPress={() => setRecibido(String(b))}>
                          <Text style={styles.billeteTexto}>{b}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <TextInput
                      style={styles.input}
                      placeholder="¿Con cuánto te paga? (opcional)"
                      placeholderTextColor={colors.placeholder}
                      keyboardType="decimal-pad"
                      value={recibido}
                      onChangeText={setRecibido}
                    />
                    {vuelto !== null && (
                      <Text style={vuelto >= 0 ? styles.vueltoOk : styles.vueltoFalta}>
                        {vuelto >= 0 ? `Vuelto: ${fmt(vuelto)}` : `Falta: ${fmt(Math.abs(vuelto))}`}
                      </Text>
                    )}
                  </>
                )}
              </View>
            )}

            <Text style={styles.subtituloHistorial}>Historial de la libreta</Text>
            <View>
              {fiados.length === 0 && <Text style={styles.vacio}>Sin historial de fiado.</Text>}
              {fiados.map(f => (
                <View key={f.id} style={styles.fiadoFila}>
                  <Text style={styles.fiadoConcepto} numberOfLines={2}>{f.concepto}</Text>
                  <Text style={styles.fiadoFecha}>
                    {new Date(f.fecha).toLocaleDateString('es-PE')} · {f.estado === 'pagado' ? '✓ Pagado' : `Saldo: ${fmt(f.saldo)}`}
                  </Text>
                </View>
              ))}
            </View>
            <TouchableOpacity style={styles.botonGhost} onPress={cerrarDetalle}><Text style={styles.botonGhostTexto}>Cerrar</Text></TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  )
}

// Los tamaños de letra pasan por tx() para el interruptor "Letra grande".
const crearStyles = (tx) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 12 },
  buscador: { flex: 1, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, color: colors.text },
  botonNuevo: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  botonNuevoTexto: { color: colors.primaryText, fontWeight: '700' },
  fila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.card, borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  nombre: { color: colors.text, fontWeight: '600', fontSize: tx(14) },
  deuda: { color: colors.warning, fontWeight: '700', fontSize: tx(13) },
  alDia: { color: colors.accent, fontSize: tx(13) },
  vacio: { color: colors.textMuted, textAlign: 'center', padding: 24, fontSize: tx(13) },
  modalFondo: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalCaja: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 10 },
  modalScrollLimite: { flexGrow: 0, maxHeight: '85%' },
  modalTitulo: { color: colors.text, fontWeight: '700', fontSize: tx(16), marginBottom: 4 },
  input: { backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, color: colors.text, fontSize: tx(15) },
  filaBotones: { flexDirection: 'row', gap: 10, marginTop: 8 },
  botonGhost: { flex: 1, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  botonGhostTexto: { color: colors.textMuted, fontWeight: '600' },
  botonPrimario: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center' },
  botonPrimarioTexto: { color: colors.primaryText, fontWeight: '700' },
  botonGuardarTel: { paddingHorizontal: 16, justifyContent: 'center', borderRadius: 10, backgroundColor: colors.primary },
  botonGuardarTelTexto: { color: colors.primaryText, fontWeight: '700', fontSize: tx(13) },
  telefonoGuardado: { color: colors.accent, fontSize: tx(13), fontWeight: '600' },
  etiquetaMensaje: { color: colors.textMuted, fontSize: tx(13), fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  mensajeInput: { minHeight: 92, textAlignVertical: 'top' },
  bloqueCobranza: { gap: 8, paddingBottom: 12, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
  filaTelefono: { flexDirection: 'row', gap: 8 },
  botonWhatsApp: { paddingVertical: 14, borderRadius: 10, backgroundColor: '#25D366', alignItems: 'center' },
  botonWhatsAppTexto: { color: '#0B2A1E', fontWeight: '800', fontSize: tx(14) },
  botonDeshabilitado: { opacity: 0.45 },
  fiadoFila: { backgroundColor: colors.bg, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  fiadoConcepto: { color: colors.text, fontSize: tx(13) },
  fiadoFecha: { color: colors.textMuted, fontSize: tx(13), marginTop: 2 },
  metodoChipsFila: { flexDirection: 'row', gap: 6 },
  fiadoPago: { flexDirection: 'row', gap: 6 },
  botonPagar: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 20, justifyContent: 'center' },
  botonDeshabilitado: { opacity: 0.5 },

  bloqueAbono: { marginTop: 12, padding: 14, borderRadius: 12, backgroundColor: colors.accentBg, borderWidth: 1, borderColor: colors.primary, gap: 8 },
  deudaLabel: { color: colors.textMuted, fontSize: tx(13), fontWeight: '600' },
  deudaMonto: { color: colors.accent, fontWeight: '800', fontSize: tx(28) },
  metodoChip: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center' },
  metodoChipActivo: { borderColor: colors.primary, backgroundColor: colors.card },
  metodoChipTexto: { color: colors.textMuted, fontWeight: '600', fontSize: tx(13) },
  metodoChipTextoActivo: { color: colors.accent, fontWeight: '700' },
  billetesFila: { flexDirection: 'row', gap: 6, marginTop: 4 },
  billete: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center' },
  billeteTexto: { color: colors.text, fontWeight: '700', fontSize: tx(13) },
  vueltoOk: { color: colors.accent, fontWeight: '800', fontSize: tx(15), marginTop: 6 },
  vueltoFalta: { color: colors.danger, fontWeight: '800', fontSize: tx(15), marginTop: 6 },
  pagarTodo: { color: colors.accent, fontWeight: '700', fontSize: tx(13), textAlign: 'center', paddingVertical: 4 },
  subtituloHistorial: { color: colors.textMuted, fontSize: tx(13), fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16, marginBottom: 4 },
  botonPagarTexto: { color: colors.primaryText, fontWeight: '700', fontSize: tx(13) },
})
