import React, { useState, useCallback } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import db from '../data/db'
import { FRECUENCIAS, DESTINOS, listarRespaldos } from '../data/respaldo'
import { useSesion } from '../context/SesionContext'
import { colors } from '../theme/colors'

export default function ConfiguracionScreen() {
  const { usuario, handleLogout } = useSesion()
  const [config, setConfig] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [exito, setExito] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [respaldos, setRespaldos] = useState([])

  async function exportarBackup() {
    setExportando(true)
    try {
      const nombreArchivo = `backup-pos-bodega-${new Date().toISOString().slice(0, 10)}.json`
      const file = new File(Paths.cache, nombreArchivo)
      if (file.exists) file.delete()
      file.create()
      file.write(db.getBackupJSON())
      const disponible = await Sharing.isAvailableAsync()
      if (disponible) {
        await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Guardar respaldo de POS Bodega' })
      } else {
        Alert.alert('No disponible', 'Este dispositivo no puede compartir archivos.')
      }
    } catch (e) {
      Alert.alert('Error', 'No se pudo generar el respaldo.')
    }
    setExportando(false)
  }

  useFocusEffect(useCallback(() => {
    setConfig(db.getConfig())
    setRespaldos(listarRespaldos())
  }, []))

  async function compartirArchivo(uri) {
    const disponible = await Sharing.isAvailableAsync()
    if (!disponible) {
      Alert.alert('No disponible', 'Este dispositivo no puede compartir archivos.')
      return
    }
    await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Enviar respaldo de POS Bodega' })
  }

  async function guardar() {
    setGuardando(true)
    await db.updateConfig(config)
    setGuardando(false)
    setExito(true)
    setTimeout(() => setExito(false), 2000)
  }

  // Se guarda al toque y no con el botón "Guardar cambios", que está más arriba en
  // la pantalla y no se ve desde esta tarjeta.
  async function cambiarFrecuencia(id) {
    setConfig(c => ({ ...c, respaldo_frecuencia: id }))
    await db.updateConfig({ respaldo_frecuencia: id })
  }

  function confirmarCerrarSesion() {
    Alert.alert('Cerrar sesión', '¿Seguro que quieres salir?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', style: 'destructive', onPress: handleLogout },
    ])
  }

  if (!config) return <View style={styles.root} />

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 16, gap: 16 }}>
      <View style={styles.tarjeta}>
        <Text style={styles.etiqueta}>Sesión actual</Text>
        <Text style={styles.usuarioNombre}>{usuario?.nombre}</Text>
        <Text style={styles.usuarioRol}>{usuario?.rol === 'admin' ? 'Administrador' : 'Cajero'} · @{usuario?.username}</Text>
      </View>

      <View style={styles.tarjeta}>
        <Text style={styles.tituloSeccion}>🏪 Datos del negocio</Text>
        <Text style={styles.etiqueta}>Nombre del negocio</Text>
        <TextInput style={styles.input} placeholderTextColor={colors.placeholder}
          value={config.negocio_nombre || ''} onChangeText={v => setConfig(c => ({ ...c, negocio_nombre: v }))} />
        <Text style={styles.etiqueta}>RUC / DNI (opcional)</Text>
        <TextInput style={styles.input} placeholderTextColor={colors.placeholder} keyboardType="number-pad"
          value={config.negocio_ruc || ''} onChangeText={v => setConfig(c => ({ ...c, negocio_ruc: v }))} />
        <Text style={styles.etiqueta}>Dirección (opcional)</Text>
        <TextInput style={styles.input} placeholderTextColor={colors.placeholder}
          value={config.negocio_direccion || ''} onChangeText={v => setConfig(c => ({ ...c, negocio_direccion: v }))} />
        <Text style={styles.etiqueta}>Teléfono (opcional)</Text>
        <TextInput style={styles.input} placeholderTextColor={colors.placeholder} keyboardType="phone-pad"
          value={config.negocio_telefono || ''} onChangeText={v => setConfig(c => ({ ...c, negocio_telefono: v }))} />
      </View>

      <View style={styles.tarjeta}>
        <Text style={styles.tituloSeccion}>🧾 Ticket</Text>
        <Text style={styles.etiqueta}>Mensaje al final del ticket</Text>
        <TextInput style={styles.input} placeholderTextColor={colors.placeholder}
          value={config.ticket_mensaje || ''} onChangeText={v => setConfig(c => ({ ...c, ticket_mensaje: v }))} placeholder="¡Gracias por su compra!" />
      </View>

      <View style={styles.tarjeta}>
        <Text style={styles.tituloSeccion}>🔔 Alertas de stock</Text>
        <Text style={styles.etiqueta}>Avisar cuando el stock sea igual o menor a</Text>
        <TextInput style={styles.input} placeholderTextColor={colors.placeholder} keyboardType="number-pad"
          value={String(config.umbral_stock_bajo ?? 5)} onChangeText={v => setConfig(c => ({ ...c, umbral_stock_bajo: parseInt(v) || 0 }))} />
      </View>

      <TouchableOpacity style={styles.botonGuardar} onPress={guardar} disabled={guardando}>
        <Text style={styles.botonGuardarTexto}>{exito ? '✓ Guardado' : guardando ? 'Guardando...' : 'Guardar cambios'}</Text>
      </TouchableOpacity>

      <View style={styles.tarjeta}>
        <Text style={styles.tituloSeccion}>🗄️ Copia de seguridad</Text>
        <Text style={styles.textoAyuda}>
          Guarda todos tus datos (productos, ventas, clientes, fiados) en un archivo, para recuperarlos si cambias de teléfono.
        </Text>

        <Text style={[styles.etiqueta, { marginTop: 8 }]}>Respaldo automático</Text>
        <View style={styles.frecuenciaFila}>
          {FRECUENCIAS.map(f => (
            <TouchableOpacity key={f.id} onPress={() => cambiarFrecuencia(f.id)}
              style={[styles.frecuenciaChip, (config.respaldo_frecuencia || 'nunca') === f.id && styles.frecuenciaChipActivo]}>
              <Text style={[styles.frecuenciaTexto, (config.respaldo_frecuencia || 'nunca') === f.id && styles.frecuenciaTextoActivo]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.textoAyuda}>
          {config.respaldo_ultimo
            ? `Último respaldo: ${new Date(config.respaldo_ultimo).toLocaleString('es-PE')}`
            : 'Todavía no se ha hecho ningún respaldo automático.'}
        </Text>

        {respaldos.length > 0 && (
          <>
            <Text style={[styles.etiqueta, { marginTop: 8 }]}>Copias guardadas ({respaldos.length})</Text>
            {respaldos.map(r => (
              <TouchableOpacity key={r.nombre} style={styles.respaldoFila} onPress={() => compartirArchivo(r.uri)}>
                <Text style={styles.respaldoFecha}>📄  {r.fecha}</Text>
                <Text style={styles.respaldoAccion}>Enviar</Text>
              </TouchableOpacity>
            ))}
          </>
        )}

        <Text style={[styles.etiqueta, { marginTop: 8 }]}>Dónde se guarda</Text>
        {DESTINOS.map(d => (
          <View key={d.id} style={[styles.destinoFila, !d.disponible && styles.destinoNoDisponible]}>
            <Text style={styles.destinoTexto}>{d.id === 'drive' ? '☁️' : '📱'}  {d.label}</Text>
            <Text style={styles.destinoEstado}>{d.disponible ? 'Activo' : 'Próximamente'}</Text>
          </View>
        ))}
        <Text style={styles.textoAyuda}>
          Estas copias viven dentro de la app, en una carpeta privada que el explorador de archivos del teléfono no puede abrir. Por eso se listan aquí: toca cualquiera para enviarla a tu WhatsApp, correo o Drive.
        </Text>
        <Text style={styles.textoAdvertencia}>
          ⚠️ Una copia guardada aquí se pierde junto con el teléfono. Para estar protegido de verdad, envía el respaldo fuera del celular.
        </Text>

        <TouchableOpacity style={styles.botonSecundario} onPress={exportarBackup} disabled={exportando}>
          <Text style={styles.botonSecundarioTexto}>{exportando ? 'Generando...' : '📤 Exportar backup ahora'}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.botonCerrarSesion} onPress={confirmarCerrarSesion}>
        <Text style={styles.botonCerrarSesionTexto}>Cerrar sesión</Text>
      </TouchableOpacity>

      <Text style={styles.version}>POS Bodega · Fase 1 (celular)</Text>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  tarjeta: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 8 },
  tituloSeccion: { color: colors.text, fontWeight: '700', fontSize: 15, marginBottom: 4 },
  etiqueta: { color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  frecuenciaFila: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  frecuenciaChip: { paddingHorizontal: 12, height: 34, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input },
  frecuenciaChipActivo: { backgroundColor: colors.accentBg, borderColor: colors.primary },
  frecuenciaTexto: { color: colors.textMuted, fontWeight: '600', fontSize: 13, lineHeight: 18 },
  frecuenciaTextoActivo: { color: colors.accent },
  destinoFila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  destinoNoDisponible: { opacity: 0.55 },
  destinoTexto: { color: colors.text, fontSize: 14, fontWeight: '600' },
  destinoEstado: { color: colors.textMuted, fontSize: 12 },
  respaldoFila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  respaldoFecha: { color: colors.text, fontSize: 13 },
  respaldoAccion: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  textoAdvertencia: { color: colors.warning, fontSize: 12, lineHeight: 17 },
  usuarioNombre: { color: colors.text, fontWeight: '700', fontSize: 16, marginTop: 2 },
  usuarioRol: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  input: { backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, color: colors.text, fontSize: 15 },
  botonGuardar: { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: 'center' },
  botonGuardarTexto: { color: colors.primaryText, fontWeight: '700', fontSize: 16 },
  textoAyuda: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  botonSecundario: { backgroundColor: colors.accentBg, borderWidth: 1, borderColor: colors.primary, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 4 },
  botonSecundarioTexto: { color: colors.accent, fontWeight: '700', fontSize: 14 },
  botonCerrarSesion: { borderWidth: 1, borderColor: colors.danger, borderRadius: 12, padding: 16, alignItems: 'center' },
  botonCerrarSesionTexto: { color: colors.danger, fontWeight: '700', fontSize: 15 },
  version: { color: colors.textMuted, fontSize: 11, textAlign: 'center', marginTop: 8 },
})
