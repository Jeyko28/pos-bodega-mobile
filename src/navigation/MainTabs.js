import React, { useState, useEffect, useRef } from 'react'
import { Animated, StyleSheet, View } from 'react-native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import POSScreen from '../screens/POSScreen'
import LicenciaScreen from '../screens/LicenciaScreen'
import ProductosScreen from '../screens/ProductosScreen'
import ClientesScreen from '../screens/ClientesScreen'
import HistorialScreen from '../screens/HistorialScreen'
import db from '../data/db'
import { BotonNotificaciones, construirAvisos } from '../components/HeaderAcciones'
import PanelUsuario from '../components/PanelUsuario'
import { useLetra } from '../context/LetraContext'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '../theme/colors'

const Tab = createBottomTabNavigator()

// Cada pestaña usa la variante rellena cuando está activa y la de contorno
// cuando no: el ícono cambia con la selección, algo que un emoji no puede hacer
// porque no se puede teñir.
const ICONOS = {
  POS: 'cart',
  Productos: 'cube',
  Clientes: 'people',
  Historial: 'receipt',
  Configuracion: 'settings',
}

function TabIcon({ ruta, focused, color }) {
  const anim = useRef(new Animated.Value(focused ? 1 : 0)).current

  useEffect(() => {
    Animated.spring(anim, {
      toValue: focused ? 1 : 0,
      useNativeDriver: true,
      friction: 6,
      tension: 160,
    }).start()
  }, [focused])

  const escala = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] })

  return (
    <View style={styles.icono}>
      <Animated.View style={[styles.pastilla, { opacity: anim, transform: [{ scale: anim }] }]} />
      <Animated.View style={{ transform: [{ scale: escala }] }}>
        <Ionicons name={focused ? ICONOS[ruta] : `${ICONOS[ruta]}-outline`} size={22} color={color} />
      </Animated.View>
    </View>
  )
}

export default function MainTabs() {
  const insets = useSafeAreaInsets()
  const { tx } = useLetra()
  const [bajoStock, setBajoStock] = useState(0)
  const [avisos, setAvisos] = useState([])
  // Vencida la prueba, la pestaña Vender muestra la licencia: el resto
  // (productos, clientes, fiados, historial, ajustes) sigue abierto.
  const [ventasBloqueadas, setVentasBloqueadas] = useState(() => db.getEstadoLicencia().bloqueado)

  function actualizarAlertas() {
    const productos = db.getProductosBajoStock()
    setBajoStock(productos.length)
    // La campanita es solo para fiados viejos: el stock bajo ya tiene su chip
    // con número en Productos, y triple alarma cansa.
    setAvisos(construirAvisos({ bajoStock: [], fiadosAntiguos: db.getFiadosAntiguos() }))
    setVentasBloqueadas(db.getEstadoLicencia().bloqueado)
  }

  useEffect(() => { actualizarAlertas() }, [])

  return (
    <Tab.Navigator
      // El contador de stock bajo se refresca al cambiar de pestaña: reemplaza a
      // la pestaña "Alertas" que existía antes, sin ocupar un espacio fijo.
      screenListeners={{
        state: actualizarAlertas,
        tabPress: () => Haptics.selectionAsync(),
      }}
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        headerTitleAlign: 'center',
        headerLeft: () => <PanelUsuario />,
        headerRight: () => <BotonNotificaciones avisos={avisos} />,
        // El área segura reserva la franja de la barra de gestos, pero el
        // indicador se dibuja dentro de ella y las etiquetas quedaban pegadas:
        // van 10 más de aire para que no se toquen.
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border, height: 64 + insets.bottom, paddingBottom: insets.bottom + 10 },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: tx(12), fontWeight: '600' },
        tabBarItemStyle: { paddingTop: 6 },
        tabBarIcon: ({ focused, color }) => <TabIcon ruta={route.name} focused={focused} color={color} />,
      })}
    >
      <Tab.Screen name="POS" options={{ title: 'Vender' }}>
        {() => ventasBloqueadas
          ? <LicenciaScreen onActivada={() => setVentasBloqueadas(false)} />
          : <POSScreen />}
      </Tab.Screen>
      <Tab.Screen name="Productos" component={ProductosScreen} options={{
        tabBarBadge: bajoStock > 0 ? bajoStock : undefined,
        tabBarBadgeStyle: { backgroundColor: colors.warning, color: '#fff' },
      }} />
      <Tab.Screen name="Clientes" component={ClientesScreen} />
      <Tab.Screen name="Historial" component={HistorialScreen} options={{ title: 'Caja y ventas' }} />
    </Tab.Navigator>
  )
}

const styles = StyleSheet.create({
  icono: { width: 48, height: 30, alignItems: 'center', justifyContent: 'center' },
  // position:absolute escrito a mano: el spread de absoluteFillObject no
  // aplicaba el absoluto en Android (ver AvisoHoja) y la pastilla quedaba mal.
  pastilla: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 999, backgroundColor: colors.accentBg },
})
