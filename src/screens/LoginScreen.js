import React, { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native'
import db from '../data/db'
import { colors } from '../theme/colors'

export default function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [cargando, setCargando] = useState(false)

  async function handleLogin() {
    if (!username.trim() || !password.trim()) return
    setCargando(true)
    setError(null)
    const r = await db.login(username.trim(), password.trim())
    setCargando(false)
    if (r.success) onLogin(r.usuario)
    else setError(r.error)
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.card}>
        <Text style={styles.emoji}>🛒</Text>
        <Text style={styles.titulo}>POS Bodega</Text>
        <Text style={styles.subtitulo}>Ingresa tus datos para continuar</Text>

        <TextInput style={styles.input} placeholder="Usuario" placeholderTextColor={colors.placeholder} autoCapitalize="none"
          value={username} onChangeText={setUsername} />
        <TextInput style={styles.input} placeholder="Contraseña" placeholderTextColor={colors.placeholder} secureTextEntry
          value={password} onChangeText={setPassword} />

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity style={styles.boton} onPress={handleLogin} disabled={cargando}>
          {cargando ? <ActivityIndicator color={colors.primaryText} /> : <Text style={styles.botonTexto}>Entrar</Text>}
        </TouchableOpacity>
      </View>
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
})
