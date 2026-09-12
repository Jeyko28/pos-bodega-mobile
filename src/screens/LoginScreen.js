import React, { useState, useEffect } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Modal, ScrollView } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import db from '../data/db'
import CampoClave from '../components/CampoClave'
import AvisoHoja from '../components/AvisoHoja'
import { WS_VENTAS } from '../data/licencia'
import { abrirWhatsApp } from '../utils/cobranza'
import { colors } from '../theme/colors'

export const ULTIMO_USUARIO_KEY = 'pos-bodega-ultimo-usuario'

// El módulo de huella solo existe en builds que lo incluyen. Se pide con
// require perezoso dentro de try/catch: un import normal arriba tumba el
// arranque entero en builds viejos (pantalla roja), en vez de solo ocultar
// el botón.
let moduloHuella = undefined
function obtenerHuella() {
  if (moduloHuella !== undefined) return moduloHuella
  try {
    moduloHuella = require('expo-local-authentication')
  } catch {
    moduloHuella = null
  }
  return moduloHuella
}

export default function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [recordado, setRecordado] = useState(null)
  const [huellaLista, setHuellaLista] = useState(false)
  const [modalRecupero, setModalRecupero] = useState(false)
  const [recUsuario, setRecUsuario] = useState('')
  const [recCodigo, setRecCodigo] = useState('')
  const [recNueva, setRecNueva] = useState('')
  const [recInstalacion, setRecInstalacion] = useState(null)
  const [recGuardando, setRecGuardando] = useState(false)
  const [aviso, setAviso] = useState(null)

  // Huella solo si el teléfono la tiene configurada Y hay un usuario
  // recordado de una entrada anterior. Sin módulo nativo (build viejo),
  // esto falla en silencio y el botón no aparece.
  useEffect(() => {
    (async () => {
      try {
        const LA = obtenerHuella()
        if (!LA) return
        const guardado = await AsyncStorage.getItem(ULTIMO_USUARIO_KEY)
        if (!guardado) return
        const tiene = await LA.hasHardwareAsync()
        const activa = tiene && await LA.isEnrolledAsync()
        if (activa) {
          setRecordado(JSON.parse(guardado))
          setHuellaLista(true)
        }
      } catch { /* sin huella en este teléfono o build */ }
    })()
  }, [])

  async function handleLogin() {
    if (!username.trim() || !password.trim()) return
    setCargando(true)
    setError(null)
    const r = await db.login(username.trim(), password.trim())
    setCargando(false)
    if (r.success) onLogin(r.usuario)
    else setError(r.error)
  }

  async function entrarConHuella() {
    try {
      const LA = obtenerHuella()
      if (!LA) return
      const r = await LA.authenticateAsync({
        promptMessage: 'Pon tu dedo para entrar a POS Bodega',
        cancelLabel: 'Usar contraseña',
        disableDeviceFallback: false,
      })
      if (r.success && recordado) onLogin(recordado)
    } catch { /* el usuario canceló o falló: sigue con contraseña */ }
  }

  async function abrirRecupero() {
    setRecUsuario(username.trim())
    setRecCodigo('')
    setRecNueva('')
    setRecInstalacion(db.getEstadoLicencia().instalacionId)
    setModalRecupero(true)
  }

  async function pedirCodigoRecupero() {
    const r = await abrirWhatsApp({
      telefono: WS_VENTAS,
      mensaje: `Hola, buenas. Olvidé mi clave del POS Bodega. Mi código de instalación es ${recInstalacion} y mi usuario es ${recUsuario || '(no lo recuerdo)'}.`,
    })
    if (!r.ok) setAviso({ titulo: 'No se pudo abrir WhatsApp', mensaje: r.error })
  }

  async function guardarNuevaClave() {
    if (!recNueva || recNueva.length < 4) {
      setAviso({ titulo: 'Muy corta', mensaje: 'La nueva contraseña debe tener al menos 4 caracteres.' })
      return
    }
    setRecGuardando(true)
    try {
      const r = await db.restablecerPassword({ username: recUsuario, codigo: recCodigo, nueva: recNueva })
      if (!r.success) {
        setAviso({ titulo: 'No se pudo', mensaje: r.error })
        return
      }
      setModalRecupero(false)
      setUsername(recUsuario.trim())
      setPassword('')
      setError(null)
      setAviso({ titulo: '✓ Listo', mensaje: 'Ya tienes contraseña nueva. Entra con ella (o con tu huella).' })
    } finally {
      setRecGuardando(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.card}>
        <Text style={styles.emoji}>🛒</Text>
        <Text style={styles.titulo}>POS Bodega</Text>
        <Text style={styles.subtitulo}>Ingresa tus datos para continuar</Text>

        <TextInput style={styles.input} placeholder="Usuario" placeholderTextColor={colors.placeholder} autoCapitalize="none"
          value={username} onChangeText={setUsername} />
        <CampoClave textoGuia="Contraseña" valor={password} alCambiar={setPassword} />

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity style={styles.boton} onPress={handleLogin} disabled={cargando}>
          {cargando ? <ActivityIndicator color={colors.primaryText} /> : <Text style={styles.botonTexto}>Entrar</Text>}
        </TouchableOpacity>

        {huellaLista && (
          <TouchableOpacity style={styles.botonHuella} onPress={entrarConHuella}>
            <Text style={styles.botonHuellaTexto}>👆  Entrar con huella ({recordado?.username})</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={abrirRecupero} style={styles.enlace}>
          <Text style={styles.enlaceTexto}>¿Olvidaste tu contraseña?</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={modalRecupero} animationType="slide" onRequestClose={() => setModalRecupero(false)}>
        <ScrollView style={styles.modalRoot} contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.modalTitulo}>Recuperar contraseña</Text>
          <Text style={styles.modalAyuda}>
            Pide tu código por WhatsApp (necesitas internet un momento) y escríbelo acá con tu clave nueva. Después entras sin internet.
          </Text>

          <Text style={styles.etiqueta}>Tu código de instalación</Text>
          <Text selectable style={styles.instalacionId}>{recInstalacion || '…'}</Text>
          <TouchableOpacity style={styles.botonWs} onPress={pedirCodigoRecupero}>
            <Text style={styles.botonWsTexto}>💬 Pedir mi código por WhatsApp</Text>
          </TouchableOpacity>

          <Text style={styles.etiqueta}>Tu usuario</Text>
          <TextInput style={styles.input} placeholder="admin" placeholderTextColor={colors.placeholder} autoCapitalize="none"
            value={recUsuario} onChangeText={setRecUsuario} />
          <Text style={styles.etiqueta}>Código que te enviamos</Text>
          <TextInput style={styles.input} placeholder="XXXX-XXXX-XXXX-XXXX" placeholderTextColor={colors.placeholder}
            autoCapitalize="characters" autoCorrect={false}
            value={recCodigo} onChangeText={setRecCodigo} />
          <Text style={styles.etiqueta}>Contraseña nueva</Text>
          <CampoClave textoGuia="Mínimo 4 caracteres" valor={recNueva} alCambiar={setRecNueva} />

          <TouchableOpacity style={styles.boton} onPress={guardarNuevaClave} disabled={recGuardando}>
            {recGuardando
              ? <ActivityIndicator color={colors.primaryText} />
              : <Text style={styles.botonTexto}>Guardar nueva contraseña</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setModalRecupero(false)} style={styles.enlace}>
            <Text style={styles.enlaceTexto}>Volver</Text>
          </TouchableOpacity>
        </ScrollView>
        {aviso && (
          <AvisoHoja
            titulo={aviso.titulo}
            mensaje={aviso.mensaje}
            botones={aviso.botones || [{ texto: 'Entendido', primario: true }]}
            onCerrar={() => setAviso(null)}
          />
        )}
      </Modal>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: 24 },
  card: { gap: 12 },
  emoji: { fontSize: 48, textAlign: 'center', marginBottom: 4 },
  titulo: { fontSize: 24, fontWeight: '700', color: colors.text, textAlign: 'center' },
  subtitulo: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginBottom: 20 },
  input: { backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14, color: colors.text, fontSize: 15 },
  error: { color: colors.danger, fontSize: 13, textAlign: 'center' },
  boton: { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 12 },
  botonTexto: { color: colors.primaryText, fontWeight: '700', fontSize: 16 },
  botonHuella: { backgroundColor: colors.accentBg, borderWidth: 1, borderColor: colors.primary, borderRadius: 12, padding: 16, alignItems: 'center' },
  botonHuellaTexto: { color: colors.accent, fontWeight: '700', fontSize: 16 },
  enlace: { alignItems: 'center', padding: 12 },
  enlaceTexto: { color: colors.accent, fontWeight: '700', fontSize: 14 },
  modalRoot: { flex: 1, backgroundColor: colors.bg },
  modalScroll: { padding: 24, paddingTop: 64, gap: 10, paddingBottom: 40 },
  modalTitulo: { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' },
  modalAyuda: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 8 },
  etiqueta: { color: colors.textMuted, fontSize: 11, fontWeight: '700', marginTop: 8 },
  instalacionId: { color: colors.text, fontSize: 24, fontWeight: '800', textAlign: 'center', letterSpacing: 2 },
  botonWs: { backgroundColor: '#25D366', borderRadius: 12, padding: 16, alignItems: 'center' },
  botonWsTexto: { color: '#fff', fontWeight: '700', fontSize: 16 },
})
