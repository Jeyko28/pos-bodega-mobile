import React, { useState, useEffect, useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { colors } from '../theme/colors'

// No es un <Modal> propio a propósito: se usa incrustado dentro del Modal
// del formulario que lo abre. Mostrar dos <Modal> nativos a la vez en iOS
// es poco confiable (uno de los dos deja de responder).
export default function BarcodeScannerModal({ onClose, onScanned, continuo = false, mensaje = null }) {
  const [permission, requestPermission] = useCameraPermissions()
  const [bloqueado, setBloqueado] = useState(false)
  const temporizador = useRef(null)
  const ultimoCodigo = useRef({ data: null, momento: 0 })

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission()
    }
  }, [permission])

  useEffect(() => () => clearTimeout(temporizador.current), [])

  function handleScanned({ data }) {
    if (bloqueado) return

    // El mismo código seguido solo cuenta una vez cada 3 segundos: con el
    // celular apoyado apuntando a la caja, la cámara vuelve a leer el mismo
    // producto una y otra vez y sumaría unidades que nunca llegaron. Un código
    // distinto entra al instante, así que pasar productos de corrido sigue
    // siendo rápido.
    const ahora = Date.now()
    if (continuo && data === ultimoCodigo.current.data && ahora - ultimoCodigo.current.momento < 3000) {
      return
    }
    ultimoCodigo.current = { data, momento: ahora }

    setBloqueado(true)
    onScanned(data)
    // En modo continuo la cámara se rearma sola: permite pasar varios productos
    // seguidos sin cerrar y reabrir el escáner en cada uno.
    if (continuo) temporizador.current = setTimeout(() => setBloqueado(false), 900)
  }

  return (
    <View style={styles.root}>
      {permission?.granted ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'] }}
          onBarcodeScanned={handleScanned}
        />
      ) : (
        <View style={styles.sinPermiso}>
          <Text style={styles.sinPermisoTexto}>
            {permission?.canAskAgain === false
              ? 'Necesitamos permiso de cámara. Actívalo en Ajustes del teléfono para esta app.'
              : 'Solicitando acceso a la cámara...'}
          </Text>
        </View>
      )}

      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.marco} />
        <Text style={styles.instruccion}>Apunta al código de barras</Text>
        {mensaje && <Text style={[styles.feedback, mensaje.ok ? styles.feedbackOk : styles.feedbackError]}>{mensaje.texto}</Text>}
      </View>

      <TouchableOpacity style={styles.botonCerrar} onPress={onClose}>
        <Text style={styles.botonCerrarTexto}>✕ Cerrar</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  marco: { width: 260, height: 160, borderWidth: 3, borderColor: colors.primary, borderRadius: 16, backgroundColor: 'transparent' },
  instruccion: { color: '#fff', fontSize: 14, fontWeight: '600', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  feedback: { fontSize: 15, fontWeight: '700', textAlign: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, marginHorizontal: 24, overflow: 'hidden' },
  feedbackOk: { color: '#fff', backgroundColor: 'rgba(16,185,129,0.92)' },
  feedbackError: { color: '#fff', backgroundColor: 'rgba(220,38,38,0.92)' },
  sinPermiso: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  sinPermisoTexto: { color: '#fff', textAlign: 'center', fontSize: 14 },
  botonCerrar: { position: 'absolute', top: 56, right: 20, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999 },
  botonCerrarTexto: { color: '#fff', fontWeight: '700' },
})
