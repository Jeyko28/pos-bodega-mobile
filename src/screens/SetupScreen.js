import React, { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native'
import db from '../data/db'
import { colors } from '../theme/colors'

export default function SetupScreen({ onCompleto }) {
  const [negocioNombre, setNegocioNombre] = useState('')
  const [adminNombre, setAdminNombre] = useState('')
  const [adminUsername, setAdminUsername] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)

  const listo = negocioNombre.trim() && adminNombre.trim() && adminUsername.trim() && adminPassword.trim()

  async function handleCrear() {
    if (!listo) return
    setError(null)
    setCargando(true)
    try {
      const r = await db.completarSetup({ negocioNombre: negocioNombre.trim(), adminNombre: adminNombre.trim(), adminUsername: adminUsername.trim(), adminPassword: adminPassword.trim() })
      onCompleto(r.usuario)
    } catch (e) {
      setError('No se pudo crear el negocio. Intenta de nuevo.')
    }
    setCargando(false)
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.emoji}>🏪</Text>
        <Text style={styles.titulo}>Bienvenido a POS Bodega</Text>
        <Text style={styles.subtitulo}>Configura tu negocio para empezar a vender</Text>

        <Text style={styles.label}>Nombre del negocio</Text>
        <TextInput style={styles.input} placeholder="Bodega El Buen Precio" placeholderTextColor={colors.placeholder}
          value={negocioNombre} onChangeText={setNegocioNombre} />

        <Text style={styles.label}>Tu nombre (dueño / administrador)</Text>
        <TextInput style={styles.input} placeholder="Juan Pérez" placeholderTextColor={colors.placeholder}
          value={adminNombre} onChangeText={setAdminNombre} />

        <Text style={styles.label}>Usuario para entrar a la app</Text>
        <TextInput style={styles.input} placeholder="admin" placeholderTextColor={colors.placeholder} autoCapitalize="none"
          value={adminUsername} onChangeText={setAdminUsername} />

        <Text style={styles.label}>Contraseña</Text>
        <TextInput style={styles.input} placeholder="••••••" placeholderTextColor={colors.placeholder} secureTextEntry
          value={adminPassword} onChangeText={setAdminPassword} />

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity style={[styles.boton, !listo && styles.botonDeshabilitado]} disabled={!listo || cargando} onPress={handleCrear}>
          {cargando ? <ActivityIndicator color={colors.primaryText} /> : <Text style={styles.botonTexto}>Crear mi bodega</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 24, paddingTop: 64, flexGrow: 1 },
  emoji: { fontSize: 48, textAlign: 'center', marginBottom: 8 },
  titulo: { fontSize: 22, fontWeight: '700', color: colors.text, textAlign: 'center', marginBottom: 4 },
  subtitulo: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginBottom: 32 },
  label: { fontSize: 12, fontWeight: '700', color: colors.textMuted, marginBottom: 6, marginTop: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14, color: colors.text, fontSize: 15 },
  error: { color: colors.danger, fontSize: 13, marginTop: 16, textAlign: 'center' },
  boton: { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 32 },
  botonDeshabilitado: { opacity: 0.4 },
  botonTexto: { color: colors.primaryText, fontWeight: '700', fontSize: 16 },
})
