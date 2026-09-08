import React, { useRef, useEffect } from 'react'
import { Animated, Pressable, View, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { colors } from '../theme/colors'

// Mismo lenguaje visual que los íconos del navbar: contorno cuando está en
// reposo, relleno cuando está activo, pastilla de acento que aparece detrás, y
// rebote al tocar. Se comparte para que no vuelvan a divergir.
export default function BotonHeader({ icono, activo = false, colorActivo = colors.accent, onPress, children }) {
  const presion = useRef(new Animated.Value(0)).current
  const destacado = useRef(new Animated.Value(activo ? 1 : 0)).current

  useEffect(() => {
    Animated.spring(destacado, { toValue: activo ? 1 : 0, useNativeDriver: true, friction: 6, tension: 160 }).start()
  }, [activo])

  const escalaPresion = presion.interpolate({ inputRange: [0, 1], outputRange: [1, 0.85] })
  const escalaIcono = destacado.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] })
  // La pastilla también se insinúa al presionar, no solo cuando el botón está
  // activo: da respuesta táctil visible aunque no haya nada que destacar.
  const opacidadPastilla = Animated.add(destacado, Animated.multiply(presion, 0.5))

  function animar(hacia) {
    Animated.spring(presion, { toValue: hacia, useNativeDriver: true, friction: 7, tension: 200 }).start()
  }

  return (
    <Pressable
      onPressIn={() => animar(1)}
      onPressOut={() => animar(0)}
      onPress={() => { Haptics.selectionAsync(); onPress?.() }}
      style={styles.zona}
      hitSlop={8}
    >
      <Animated.View style={{ transform: [{ scale: escalaPresion }] }}>
        <View style={styles.contenedor}>
          <Animated.View style={[styles.pastilla, { opacity: opacidadPastilla, transform: [{ scale: destacado }] }]} />
          <Animated.View style={{ transform: [{ scale: escalaIcono }] }}>
            <Ionicons
              name={activo ? icono : `${icono}-outline`}
              size={23}
              color={activo ? colorActivo : colors.text}
            />
          </Animated.View>
        </View>
        {children}
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  zona: { paddingHorizontal: 12, paddingVertical: 4 },
  contenedor: { width: 42, height: 32, alignItems: 'center', justifyContent: 'center' },
  pastilla: { ...StyleSheet.absoluteFillObject, borderRadius: 999, backgroundColor: colors.accentBg },
})
