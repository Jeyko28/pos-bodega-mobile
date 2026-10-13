import React, { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { File } from 'expo-file-system'
import db from '../data/db'
import CampoClave from '../components/CampoClave'
import { colors } from '../theme/colors'

export default function SetupScreen({ onCompleto }) {
  const [modo, setModo] = useState('crear')
  const [negocioNombre, setNegocioNombre] = useState('')
  const [adminNombre, setAdminNombre] = useState('')
  const [adminUsername, setAdminUsername] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)
  // El respaldo elegido, a la espera de que la persona confirme de qué
  // negocio se trata. Se muestra el resumen antes de tocar nada.
  const [pendiente, setPendiente] = useState(null)

  const listo = adminNombre.trim() && adminUsername.trim() && adminPassword.trim()

  async function handleCrear() {
    if (!listo || !negocioNombre.trim()) return
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

  async function elegirRespaldo() {
    setError(null)
    try {
      const elegido = await File.pickFileAsync({ mimeTypes: ['application/json'] })
      if (elegido.canceled) return
      const datos = JSON.parse(await elegido.result.text())
      const { valido, error: err, resumen } = db.validarBackup(datos)
      if (!valido) {
        setError(err)
        return
      }
      setPendiente({ datos, resumen })
    } catch (e) {
      setError('No se pudo leer el archivo. Puede que no sea una copia de POS Bodega.')
    }
  }

  async function confirmarUnion() {
    setCargando(true)
    setError(null)
    try {
      const r = await db.unirseConRespaldo({
        datos: pendiente.datos,
        adminNombre: adminNombre.trim(),
        adminUsername: adminUsername.trim(),
        adminPassword: adminPassword.trim(),
      })
      if (!r.success) {
        setError(r.error)
        setCargando(false)
        return
      }
      // Si el nombre de usuario ya venía en el respaldo, se cambió. Avisar acá
      // evita que entre después con "admin" y piense que la app está rota.
      if (r.usernameCambiado) {
        setAviso(`Tu usuario quedó como "${r.usernameCambiado}" porque "admin" ya venía en la copia.`)
      }
      onCompleto(r.usuario)
    } catch (e) {
      setError('No se pudo recuperar la bodega. Intenta de nuevo.')
      setCargando(false)
    }
  }

  // ─── Pantalla de confirmación: de qué bodega se trata ───────────────
  if (pendiente) {
    const { resumen } = pendiente
    return (
      <KeyboardAwareScrollView style={styles.root} contentContainerStyle={styles.scroll} enableOnAndroid extraScrollHeight={20}>
        <Text style={styles.emoji}>📂</Text>
        <Text style={styles.titulo}>Encontramos tu bodega</Text>
        <Text style={styles.subtitulo}>Revisa que sea la correcta antes de continuar</Text>

        <View style={styles.tarjetaResumen}>
          <Text style={styles.resumenNombre}>{resumen.negocio || 'Bodega sin nombre'}</Text>
          <View style={styles.resumenFila}>
            <Text style={styles.resumenNumero}>{resumen.productos}</Text>
            <Text style={styles.resumenTexto}>productos</Text>
          </View>
          <View style={styles.resumenFila}>
            <Text style={styles.resumenNumero}>{resumen.ventas}</Text>
            <Text style={styles.resumenTexto}>ventas registradas</Text>
          </View>
          <View style={styles.resumenFila}>
            <Text style={styles.resumenNumero}>{resumen.clientes}</Text>
            <Text style={styles.resumenTexto}>clientes</Text>
          </View>
          <View style={styles.resumenFila}>
            <Text style={[styles.resumenNumero, resumen.fiados > 0 && styles.resumenNumeroAlerta]}>{resumen.fiados}</Text>
            <Text style={styles.resumenTexto}>fiados pendientes</Text>
          </View>
        </View>

        <View style={styles.nota}>
          <Text style={styles.notaTexto}>
            Vas a crear tu usuario para entrar en este celular. Los usuarios del
            respaldo no traen contraseña, así que solo entrarás tú.
          </Text>
        </View>

        <Text style={styles.label}>Tu nombre</Text>
        <TextInput style={styles.input} placeholder="Juan Pérez" placeholderTextColor={colors.placeholder}
          value={adminNombre} onChangeText={setAdminNombre} />

        <Text style={styles.label}>Usuario para entrar a la app</Text>
        <TextInput style={styles.input} placeholder="admin" placeholderTextColor={colors.placeholder} autoCapitalize="none"
          value={adminUsername} onChangeText={setAdminUsername} />

        <Text style={styles.label}>Contraseña</Text>
        <CampoClave textoGuia="••••••" valor={adminPassword} alCambiar={setAdminPassword} />

        {error && <Text style={styles.error}>{error}</Text>}
        {aviso && <Text style={styles.exito}>{aviso}</Text>}

        <TouchableOpacity style={[styles.boton, !listo && styles.botonDeshabilitado]} disabled={!listo || cargando} onPress={confirmarUnion}>
          {cargando ? <ActivityIndicator color={colors.primaryText} /> : <Text style={styles.botonTexto}>Recuperar mi bodega</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.botonSecundario} onPress={() => { setPendiente(null); setError(null) }} disabled={cargando}>
          <Text style={styles.botonSecundarioTexto}>No es mi bodega, elegir otro archivo</Text>
        </TouchableOpacity>
      </KeyboardAwareScrollView>
    )
  }

  // ─── Pantalla principal: elegir entre crear o recuperar ─────────────
  if (modo === 'recuperar') {
    return (
      <ScrollView style={styles.root} contentContainerStyle={styles.scroll}>
        <Text style={styles.emoji}>📂</Text>
        <Text style={styles.titulo}>Recuperar mi bodega</Text>
        <Text style={styles.subtitulo}>¿Ya usabas POS Bodega en otro celular?</Text>

        <View style={styles.nota}>
          <Text style={styles.notaTexto}>
            Busca en tu Drive o en tu carpeta la copia de seguridad
            (un archivo que termina en .json). Con ella vuelves a tener tus
            productos, tus ventas y tus fiados en este celular.
          </Text>
        </View>

        <TouchableOpacity style={styles.boton} onPress={elegirRespaldo}>
          <Text style={styles.botonTexto}>Buscar mi copia de seguridad</Text>
        </TouchableOpacity>

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity style={styles.botonSecundario} onPress={() => { setModo('crear'); setError(null) }}>
          <Text style={styles.botonSecundarioTexto}>No, es mi primera vez aquí</Text>
        </TouchableOpacity>
      </ScrollView>
    )
  }

  return (
    <KeyboardAwareScrollView style={styles.root} contentContainerStyle={styles.scroll} enableOnAndroid extraScrollHeight={20}>
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
        <CampoClave textoGuia="••••••" valor={adminPassword} alCambiar={setAdminPassword} />

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity style={[styles.boton, !listo && styles.botonDeshabilitado]} disabled={!listo || cargando} onPress={handleCrear}>
          {cargando ? <ActivityIndicator color={colors.primaryText} /> : <Text style={styles.botonTexto}>Crear mi bodega</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.botonSecundario} onPress={() => { setModo('recuperar'); setError(null) }}>
          <Text style={styles.botonSecundarioTexto}>Ya tenía una bodega, quiero recuperarla</Text>
        </TouchableOpacity>
    </KeyboardAwareScrollView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 24, paddingTop: 64, paddingBottom: 32, flexGrow: 1 },
  emoji: { fontSize: 48, textAlign: 'center', marginBottom: 8 },
  titulo: { fontSize: 22, fontWeight: '700', color: colors.text, textAlign: 'center', marginBottom: 4 },
  subtitulo: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginBottom: 24 },
  label: { fontSize: 13, fontWeight: '700', color: colors.textMuted, marginBottom: 6, marginTop: 16 },
  input: { backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14, color: colors.text, fontSize: 15 },
  error: { color: colors.danger, fontSize: 13, marginTop: 16, textAlign: 'center' },
  exito: { color: colors.accent, fontSize: 13, marginTop: 16, textAlign: 'center', fontWeight: '600' },
  boton: { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 32 },
  botonDeshabilitado: { opacity: 0.4 },
  botonTexto: { color: colors.primaryText, fontWeight: '700', fontSize: 16 },
  botonSecundario: { marginTop: 20, paddingVertical: 14, alignItems: 'center' },
  botonSecundarioTexto: { color: colors.accent, fontWeight: '700', fontSize: 14, textDecorationLine: 'underline' },
  tarjetaResumen: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 10, marginTop: 8 },
  resumenNombre: { color: colors.text, fontSize: 17, fontWeight: '800', marginBottom: 4 },
  resumenFila: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  resumenNumero: { color: colors.accent, fontSize: 20, fontWeight: '800', minWidth: 44 },
  resumenNumeroAlerta: { color: colors.warning },
  resumenTexto: { color: colors.textMuted, fontSize: 14 },
  nota: { backgroundColor: colors.accentBg, borderRadius: 10, padding: 12, marginTop: 16 },
  notaTexto: { color: colors.textoAyuda, fontSize: 13, lineHeight: 19 },
})
