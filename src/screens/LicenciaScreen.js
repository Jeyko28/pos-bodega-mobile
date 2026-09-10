// Pantalla de licencia: ver días gratis, pedir el código por WhatsApp,
// ingresarlo y activar. También es la vía de contacto con soporte.
// Se usa de dos formas: reemplazando la pestaña Vender cuando la prueba
// venció, y como hoja dentro del POS y Ajustes cuando aún hay prueba.
import React, { useState, useEffect } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native'
import * as Haptics from 'expo-haptics'
import * as Clipboard from 'expo-clipboard'
import db from '../data/db'
import { WS_VENTAS, mensajePedirCodigo, mensajeSoporte, extraerCodigo } from '../data/licencia'
import { abrirWhatsApp } from '../utils/cobranza'
import { usePieDeHoja } from '../utils/teclado'
import { colors } from '../theme/colors'

export default function LicenciaScreen({ onActivada }) {
  const { espacioAbajo } = usePieDeHoja()
  const [estado, setEstado] = useState(() => db.getEstadoLicencia())
  const [negocio, setNegocio] = useState(() => db.getConfig()?.negocio_nombre || '')
  const [codigo, setCodigo] = useState('')
  const [activando, setActivando] = useState(false)
  const [pegadoAuto, setPegadoAuto] = useState(false)

  function conGuiones(crudo16) {
    return `${crudo16.slice(0, 4)}-${crudo16.slice(4, 8)}-${crudo16.slice(8, 12)}-${crudo16.slice(12, 16)}`
  }

  // Si la bodeguera copió el código del WhatsApp, se pega solo: tipear
  // 16 letras con vista cansada es pedir un error. Falla en silencio si el
  // portapapeles trae otra cosa (o si el build aún no incluye el módulo).
  async function pegarDelPortapapeles(auto = false) {
    try {
      const texto = await Clipboard.getStringAsync()
      const valido = extraerCodigo(texto)
      if (!valido) return false
      setCodigo(conGuiones(valido))
      if (auto) setPegadoAuto(true)
      Haptics.selectionAsync()
      return true
    } catch {
      return false
    }
  }

  useEffect(() => { pegarDelPortapapeles(true) }, [])
  // Reintentar al tocar el campo: quizá copió el código después de abrir.
  function alEnfocarCodigo() {
    if (!codigo.trim()) pegarDelPortapapeles(true)
  }

  // El número nunca se muestra: solo un botón que abre el chat directo.
  async function pedirPorWhatsApp() {
    await abrirWhatsApp({ telefono: WS_VENTAS, mensaje: mensajePedirCodigo({ instalacionId: estado.instalacionId, negocio }) })
  }

  async function hablarConSoporte() {
    await abrirWhatsApp({ telefono: WS_VENTAS, mensaje: mensajeSoporte({ negocio }) })
  }

  async function activar() {
    if (!codigo.trim()) {
      Alert.alert('Falta el código', 'Escribe el código de 16 letras que te enviamos por WhatsApp.')
      return
    }
    setActivando(true)
    try {
      const r = await db.activarLicencia(codigo)
      if (!r.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        Alert.alert('No se pudo activar', r.error)
        return
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      const nuevo = db.getEstadoLicencia()
      setEstado(nuevo)
      setCodigo('')
      Alert.alert('✓ ¡Activado!', 'Tu POS Bodega ya es tuyo para siempre. Gracias por tu compra.', [
        { text: 'Seguir vendiendo', onPress: () => onActivada && onActivada(nuevo) },
      ])
    } finally {
      setActivando(false)
    }
  }

  const titulo =
    estado.modo === 'activa' ? '✓ Licencia activa' :
    estado.modo === 'bloqueada' ? '⏸️ Ventas en pausa' :
    estado.ultimoDia ? '⏰ Último día gratis' :
    `🎉 Te quedan ${estado.restantes} días gratis`

  const bajada =
    estado.modo === 'activa'
      ? 'Tu pago único quedó registrado en este teléfono. No tienes que hacer nada más.'
      : estado.modo === 'bloqueada'
        ? 'Se acabaron tus 30 días gratis. Para seguir vendiendo activa tu pago único: es un solo pago, para siempre.'
        : 'Pide tu código con tiempo: cuando llegues al día 31, las ventas se pausan hasta activar.'

  return (
    <ScrollView style={styles.root} contentContainerStyle={[styles.scroll, { paddingBottom: 24 + espacioAbajo }]} keyboardShouldPersistTaps="handled">
      <Text style={styles.titulo}>{titulo}</Text>
      <Text style={styles.bajada}>{bajada}</Text>

      {estado.modo !== 'activa' && (
        <View style={styles.tarjeta}>
          <Text style={styles.etiqueta}>Tu código de instalación</Text>
          <Text selectable style={styles.instalacionId}>{estado.instalacionId || '…'}</Text>
          <Text style={styles.ayuda}>
            Mándanos este código por WhatsApp y te devolvemos tu código de activación.
          </Text>
          <TouchableOpacity style={styles.botonWs} onPress={pedirPorWhatsApp}>
            <Text style={styles.botonWsTexto}>💬 Pedir mi código por WhatsApp</Text>
          </TouchableOpacity>
        </View>
      )}

      {estado.modo !== 'activa' && (
        <View style={styles.tarjeta}>
          <Text style={styles.etiqueta}>¿Ya tienes tu código? Escríbelo acá</Text>
          <TextInput style={styles.input} placeholderTextColor={colors.placeholder}
            value={codigo} onChangeText={v => { setCodigo(v); setPegadoAuto(false) }} onFocus={alEnfocarCodigo}
            placeholder="XXXX-XXXX-XXXX-XXXX" autoCapitalize="characters" autoCorrect={false} />
          {pegadoAuto && <Text style={styles.pegadoAviso}>✓ Pegado del WhatsApp, revísalo y toca Activar.</Text>}
          <TouchableOpacity style={styles.botonGhost} onPress={() => pegarDelPortapapeles()}>
            <Text style={styles.botonGhostTexto}>📋 Pegar código del WhatsApp</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.botonActivar} onPress={activar} disabled={activando}>
            {activando
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.botonActivarTexto}>Activar mi licencia</Text>}
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.tarjeta}>
        <Text style={styles.ayuda}>
          Tu código solo funciona en este teléfono. Si cambias de celular, escríbenos y te damos uno nuevo sin costo (tu pago ya está hecho).
          {'\n\n'}Tus datos están a salvo: puedes verlos, consultar fiados y hacer tu respaldo con normalidad.
        </Text>
        <TouchableOpacity style={styles.botonSecundario} onPress={hablarConSoporte}>
          <Text style={styles.botonSecundarioTexto}>💬 Hablar con soporte</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 16, gap: 16 },
  titulo: { color: colors.text, fontSize: 22, fontWeight: '800', textAlign: 'center', marginTop: 8 },
  bajada: { color: colors.textMuted, fontSize: 14, lineHeight: 20, textAlign: 'center', paddingHorizontal: 8 },
  tarjeta: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 10 },
  etiqueta: { color: colors.textMuted, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  instalacionId: { color: colors.text, fontSize: 26, fontWeight: '800', textAlign: 'center', letterSpacing: 3 },
  ayuda: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  input: { backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14, color: colors.text, fontSize: 18, fontWeight: '700', textAlign: 'center', letterSpacing: 1 },
  botonWs: { backgroundColor: '#25D366', borderRadius: 12, padding: 16, alignItems: 'center' },
  botonWsTexto: { color: '#fff', fontWeight: '700', fontSize: 16 },
  botonActivar: { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: 'center' },
  botonActivarTexto: { color: '#fff', fontWeight: '700', fontSize: 16 },
  botonSecundario: { backgroundColor: colors.accentBg, borderWidth: 1, borderColor: colors.primary, borderRadius: 10, padding: 14, alignItems: 'center' },
  botonSecundarioTexto: { color: colors.accent, fontWeight: '700', fontSize: 14 },
  botonGhost: { padding: 12, alignItems: 'center' },
  botonGhostTexto: { color: colors.accent, fontWeight: '700', fontSize: 14 },
  pegadoAviso: { color: colors.accent, fontSize: 13, fontWeight: '700', textAlign: 'center' },
})
