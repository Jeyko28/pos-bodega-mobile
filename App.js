import React, { useState, useEffect } from 'react'
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { NavigationContainer } from '@react-navigation/native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'

import db from './src/data/db'
import { respaldarSiToca } from './src/data/respaldo'
import { SesionContext } from './src/context/SesionContext'
import SetupScreen from './src/screens/SetupScreen'
import LoginScreen from './src/screens/LoginScreen'
import MainTabs from './src/navigation/MainTabs'
import { colors } from './src/theme/colors'

const SESION_KEY = 'pos-bodega-sesion'

export default function App() {
  const [cargando, setCargando] = useState(true)
  const [setupPendiente, setSetupPendiente] = useState(false)
  const [usuario, setUsuario] = useState(null)
  const [errorInicio, setErrorInicio] = useState(null)

  useEffect(() => { iniciar() }, [])

  async function iniciar() {
    try {
      await db.initDB()
      if (!db.isSetupCompletado()) {
        setSetupPendiente(true)
        setCargando(false)
        return
      }
      const guardado = await AsyncStorage.getItem(SESION_KEY)
      if (guardado) setUsuario(JSON.parse(guardado))
    } catch (e) {
      setErrorInicio(e?.message || String(e))
    }

    // Un respaldo que falla no debe impedir abrir la caja: se intenta aparte y en
    // silencio, y su estado se revisa en Ajustes.
    respaldarSiToca().catch(() => {})
    setCargando(false)
  }

  async function handleSetupCompleto(usuarioData) {
    setSetupPendiente(false)
    setUsuario(usuarioData)
    await AsyncStorage.setItem(SESION_KEY, JSON.stringify(usuarioData))
  }

  async function handleLogin(usuarioData) {
    setUsuario(usuarioData)
    await AsyncStorage.setItem(SESION_KEY, JSON.stringify(usuarioData))
  }

  async function handleLogout() {
    setUsuario(null)
    await AsyncStorage.removeItem(SESION_KEY)
  }

  if (cargando) {
    return (
      <View style={styles.cargando}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.cargandoTexto}>Iniciando POS Bodega...</Text>
      </View>
    )
  }

  if (errorInicio) {
    return (
      <View style={styles.cargando}>
        <Text style={styles.errorTitulo}>No se pudo abrir la base de datos</Text>
        <Text style={styles.errorDetalle}>{errorInicio}</Text>
      </View>
    )
  }

  if (setupPendiente) return <SetupScreen onCompleto={handleSetupCompleto} />
  if (!usuario) return <LoginScreen onLogin={handleLogin} />

  return (
    <SafeAreaProvider>
      <SesionContext.Provider value={{ usuario, handleLogout }}>
        <NavigationContainer>
          <MainTabs />
          <StatusBar style="dark" />
        </NavigationContainer>
      </SesionContext.Provider>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  cargando: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 16 },
  cargandoTexto: { color: colors.textMuted, fontSize: 14 },
  errorTitulo: { color: colors.danger, fontSize: 16, fontWeight: '700', textAlign: 'center', paddingHorizontal: 32 },
  errorDetalle: { color: colors.textMuted, fontSize: 13, textAlign: 'center', paddingHorizontal: 32 },
})
