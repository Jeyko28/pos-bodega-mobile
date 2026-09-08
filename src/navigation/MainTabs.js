import React, { useState, useEffect, useRef } from 'react'
import { Animated, StyleSheet, View } from 'react-native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import POSScreen from '../screens/POSScreen'
import ProductosScreen from '../screens/ProductosScreen'
import ClientesScreen from '../screens/ClientesScreen'
import HistorialScreen from '../screens/HistorialScreen'
import ConfiguracionScreen from '../screens/ConfiguracionScreen'
import db from '../data/db'
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
  const [bajoStock, setBajoStock] = useState(0)

  function actualizarAlertas() {
    setBajoStock(db.getProductosBajoStock().length)
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
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarItemStyle: { paddingTop: 6 },
        tabBarIcon: ({ focused, color }) => <TabIcon ruta={route.name} focused={focused} color={color} />,
      })}
    >
      <Tab.Screen name="POS" component={POSScreen} options={{ title: 'Vender' }} />
      <Tab.Screen name="Productos" component={ProductosScreen} options={{
        tabBarBadge: bajoStock > 0 ? bajoStock : undefined,
        tabBarBadgeStyle: { backgroundColor: colors.warning, color: '#fff' },
      }} />
      <Tab.Screen name="Clientes" component={ClientesScreen} />
      <Tab.Screen name="Historial" component={HistorialScreen} />
      <Tab.Screen name="Configuracion" component={ConfiguracionScreen} options={{ title: 'Ajustes' }} />
    </Tab.Navigator>
  )
}

const styles = StyleSheet.create({
  icono: { width: 48, height: 30, alignItems: 'center', justifyContent: 'center' },
  pastilla: { ...StyleSheet.absoluteFillObject, borderRadius: 999, backgroundColor: colors.accentBg },
})
