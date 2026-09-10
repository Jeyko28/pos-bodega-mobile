import React, { useState, useCallback, useEffect } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Modal, Linking } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { useFocusEffect } from '@react-navigation/native'
import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import * as AuthSession from 'expo-auth-session'
import db from '../data/db'
import { FRECUENCIAS, listarRespaldos, crearRespaldo } from '../data/respaldo'
import { configDeRequest, DISCOVERY, intercambiarCodigoPorTokens, hayCuentaConectada, desconectarCuenta } from '../data/googleAuth'
import { safDisponible, hayCarpetaElegida, elegirCarpetaPublica, olvidarCarpeta } from '../data/respaldoCarpeta'
import LicenciaScreen from './LicenciaScreen'
import { useLetra } from '../context/LetraContext'
import { WS_VENTAS, mensajeSoporte } from '../data/licencia'
import { abrirWhatsApp } from '../utils/cobranza'
import { colors } from '../theme/colors'

export default function ConfiguracionScreen() {
  const { grande, alternar } = useLetra()
  const [config, setConfig] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [exito, setExito] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [restaurando, setRestaurando] = useState(false)
  const [respaldos, setRespaldos] = useState([])
  const [driveConectado, setDriveConectado] = useState(false)
  const [conectandoDrive, setConectandoDrive] = useState(false)
  const [licencia, setLicencia] = useState(null)
  const [modalLicencia, setModalLicencia] = useState(false)
  const [request, response, promptAsync] = AuthSession.useAuthRequest(configDeRequest(), DISCOVERY)

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
    setLicencia(db.getEstadoLicencia())
    hayCuentaConectada().then(setDriveConectado)
  }, []))

  // La respuesta de Google llega de forma asíncrona (el usuario sale de la app,
  // elige su cuenta en el navegador, y vuelve) — se procesa en cuanto cambia,
  // no dentro de una función que el usuario dispara directamente.
  useEffect(() => {
    if (response?.type !== 'success' || !request) return
    setConectandoDrive(true)
    intercambiarCodigoPorTokens(response.params.code, request.codeVerifier)
      .then(() => setDriveConectado(true))
      .catch(() => Alert.alert('Error', 'No se pudo conectar con Google Drive.'))
      .finally(() => setConectandoDrive(false))
  }, [response])

  async function conectarDrive() {
    setConectandoDrive(true)
    const resultado = await promptAsync()
    if (resultado.type !== 'success') setConectandoDrive(false)
  }

  function confirmarDesconectarDrive() {
    Alert.alert('Desconectar Google Drive', '¿Seguro? Los respaldos futuros dejarán de subirse a Drive hasta que vuelvas a conectar la cuenta.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Desconectar', style: 'destructive', onPress: async () => { await desconectarCuenta(); setDriveConectado(false) } },
    ])
  }

  const carpetaElegida = config ? hayCarpetaElegida(config) : false

  async function elegirCarpeta() {
    const resultado = await elegirCarpetaPublica()
    if (resultado.success) setConfig(db.getConfig())
  }

  function confirmarOlvidarCarpeta() {
    Alert.alert('Cambiar carpeta', 'Se te va a pedir elegir una carpeta nueva (puede ser la misma). Los respaldos ya guardados en la anterior no se mueven.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Elegir otra', onPress: async () => { await olvidarCarpeta(); await elegirCarpeta() } },
    ])
  }

  async function restaurarRespaldo() {
    let datos
    try {
      const elegido = await File.pickFileAsync({ mimeTypes: ['application/json'] })
      if (elegido.canceled) return
      const texto = await elegido.result.text()
      datos = JSON.parse(texto)
    } catch (e) {
      Alert.alert('No se pudo leer', 'El archivo no se pudo abrir o no es un JSON válido.')
      return
    }

    const { valido, error, resumen } = db.validarBackup(datos)
    if (!valido) {
      Alert.alert('Archivo no válido', error)
      return
    }

    Alert.alert(
      '¿Restaurar este respaldo?',
      `Contiene ${resumen.productos} productos, ${resumen.ventas} ventas, ${resumen.clientes} clientes y ${resumen.fiados} fiados pendientes` +
      `${resumen.negocio ? ` de "${resumen.negocio}"` : ''}.\n\n` +
      'Se reemplazarán TODOS los datos actuales de este teléfono. Antes de hacerlo se guarda una copia de lo que tienes ahora, por si te arrepientes.\n\n' +
      'Tus usuarios y contraseñas no cambian.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Restaurar',
          style: 'destructive',
          onPress: async () => {
            setRestaurando(true)
            // Copia de seguridad del estado actual antes de pisarlo: si el
            // respaldo elegido resulta ser el equivocado, no se pierde nada.
            await crearRespaldo().catch(() => {})
            const r = await db.restaurarBackup(datos)
            setRestaurando(false)
            if (!r.success) {
              Alert.alert('No se pudo restaurar', r.error)
              return
            }
            setConfig(db.getConfig())
            setRespaldos(listarRespaldos())
            Alert.alert('✓ Restaurado', 'Tus datos volvieron. Revisa Productos e Historial para confirmar.')
          },
        },
      ],
    )
  }

  async function compartirArchivo(uri) {
    const disponible = await Sharing.isAvailableAsync()
    if (!disponible) {
      Alert.alert('No disponible', 'Este dispositivo no puede compartir archivos.')
      return
    }
    await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Enviar respaldo de POS Bodega' })
  }

  async function hablarConSoporte() {
    await abrirWhatsApp({ telefono: WS_VENTAS, mensaje: mensajeSoporte({ negocio: config?.negocio_nombre }) })
  }

  // Google exige el aviso de privacidad visible dentro de la app.
  async function abrirPrivacidad() {
    try {
      await Linking.openURL('https://jeyko28.github.io/pos-bodega-legal/privacidad.html')
    } catch {
      Alert.alert('No se pudo abrir', 'Revisa tu conexión e inténtalo de nuevo.')
    }
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

  if (!config) return <View style={styles.root} />

  return (
    <KeyboardAwareScrollView
      style={styles.root}
      contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 16 }}
      keyboardShouldPersistTaps="handled"
      enableOnAndroid
      extraScrollHeight={20}
    >
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
        <View style={styles.destinoFila}>
          <Text style={styles.destinoTexto}>📱  Este teléfono</Text>
          <Text style={styles.destinoEstado}>Activo</Text>
        </View>
        <View style={styles.destinoFila}>
          <Text style={styles.destinoTexto}>☁️  Google Drive</Text>
          {driveConectado ? (
            <TouchableOpacity onPress={confirmarDesconectarDrive}>
              <Text style={[styles.destinoEstado, styles.destinoEstadoActivo]}>Conectado — Desconectar</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={conectarDrive} disabled={!request || conectandoDrive}>
              <Text style={styles.destinoAccion}>{conectandoDrive ? 'Conectando...' : 'Conectar'}</Text>
            </TouchableOpacity>
          )}
        </View>
        {safDisponible() && (
          <View style={styles.destinoFila}>
            <Text style={styles.destinoTexto}>📁  Carpeta del teléfono</Text>
            {carpetaElegida ? (
              <TouchableOpacity onPress={confirmarOlvidarCarpeta}>
                <Text style={[styles.destinoEstado, styles.destinoEstadoActivo]}>Elegida — Cambiar</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={elegirCarpeta}>
                <Text style={styles.destinoAccion}>Elegir carpeta</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <Text style={styles.textoAyuda}>
          {driveConectado
            ? 'Cada respaldo automático también se sube a la carpeta "POS Bodega — Respaldos" en tu Drive.'
            : 'Sin conectar, las copias solo viven dentro de la app. Toca "Conectar" e inicia sesión con tu cuenta de Google.'}
          {' '}
          {carpetaElegida
            ? 'También se guarda una copia en la carpeta que elegiste, visible desde el explorador de archivos del teléfono y que sobrevive aunque desinstales la app.'
            : safDisponible()
              ? 'Elige una carpeta del teléfono para que el respaldo también quede visible en tu explorador de archivos, no solo dentro de la app.'
              : ''}
          {' '}La lista de abajo son copias dentro de la app, en una carpeta privada que el explorador de archivos no puede abrir — por eso se listan para enviarlas a mano.
        </Text>
        {!driveConectado && !carpetaElegida && (
          <Text style={styles.textoAdvertencia}>
            ⚠️ Una copia guardada solo dentro de la app se pierde junto con el teléfono. Conecta Drive, elige una carpeta, o envía el respaldo por WhatsApp de vez en cuando.
          </Text>
        )}

        <TouchableOpacity style={styles.botonSecundario} onPress={exportarBackup} disabled={exportando}>
          <Text style={styles.botonSecundarioTexto}>{exportando ? 'Generando...' : '📤 Exportar backup ahora'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.botonSecundario} onPress={restaurarRespaldo} disabled={restaurando}>
          <Text style={styles.botonSecundarioTexto}>{restaurando ? 'Restaurando...' : '♻️ Restaurar desde un archivo'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tarjeta}>
        <Text style={styles.tituloSeccion}>🔑 Mi licencia</Text>
        <Text style={styles.textoAyuda}>
          {licencia?.modo === 'activa'
            ? '✓ Licencia activa: tu pago único ya quedó registrado en este teléfono.'
            : licencia?.modo === 'bloqueada'
              ? '⏸️ Tus 30 días gratis terminaron. Activa tu pago único para seguir vendiendo.'
              : `🎉 Estás en tus 30 días gratis (te quedan ${licencia?.restantes ?? '…'}).`}
        </Text>
        <TouchableOpacity style={styles.botonSecundario} onPress={() => setModalLicencia(true)}>
          <Text style={styles.botonSecundarioTexto}>
            {licencia?.modo === 'activa' ? 'Ver mi licencia' : 'Ver mi código / Activar'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tarjeta}>
        <Text style={styles.tituloSeccion}>👁️ Legibilidad</Text>
        <Text style={styles.textoAyuda}>
          Letras más grandes en Vender, Productos, Ingreso, Clientes e Historial. Para vista cansada.
        </Text>
        <TouchableOpacity style={styles.destinoFila} onPress={alternar}>
          <Text style={styles.destinoTexto}>🔍  Letra grande</Text>
          <Text style={[styles.destinoEstado, grande && styles.destinoEstadoActivo]}>
            {grande ? 'Activada' : 'Apagada'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tarjeta}>
        <Text style={styles.tituloSeccion}>💬 Ayuda y soporte</Text>
        <Text style={styles.textoAyuda}>
          ¿Algo no cuadra o no sabes cómo hacer algo? Escríbenos por WhatsApp y te ayudamos.
        </Text>
        <TouchableOpacity style={styles.botonSecundario} onPress={hablarConSoporte}>
          <Text style={styles.botonSecundarioTexto}>💬 Hablar con soporte</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tarjeta}>
        <Text style={styles.tituloSeccion}>🔒 Privacidad</Text>
        <Text style={styles.textoAyuda}>
          Cómo usa la app tus datos y tu Google Drive.
        </Text>
        <TouchableOpacity style={styles.botonSecundario} onPress={abrirPrivacidad}>
          <Text style={styles.botonSecundarioTexto}>🔒 Leer política de privacidad</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.version}>POS Bodega · Fase 1 (celular)</Text>

      <Modal visible={modalLicencia} animationType="slide" onRequestClose={() => setModalLicencia(false)}>
        <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: 48 }}>
          <TouchableOpacity onPress={() => setModalLicencia(false)}
            style={{ alignSelf: 'flex-end', marginRight: 16, marginBottom: 4, paddingHorizontal: 14, paddingVertical: 10 }}>
            <Text style={{ color: colors.textMuted, fontWeight: '700', fontSize: 15 }}>✕ Cerrar</Text>
          </TouchableOpacity>
          <LicenciaScreen onActivada={() => { setModalLicencia(false); setLicencia(db.getEstadoLicencia()) }} />
        </View>
      </Modal>
    </KeyboardAwareScrollView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  tarjeta: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 8 },
  tituloSeccion: { color: colors.text, fontWeight: '700', fontSize: 15, marginBottom: 4 },
  etiqueta: { color: colors.textMuted, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  frecuenciaFila: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  frecuenciaChip: { paddingHorizontal: 12, height: 34, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input },
  frecuenciaChipActivo: { backgroundColor: colors.accentBg, borderColor: colors.primary },
  frecuenciaTexto: { color: colors.textMuted, fontWeight: '600', fontSize: 13, lineHeight: 18 },
  frecuenciaTextoActivo: { color: colors.accent },
  destinoFila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  destinoTexto: { color: colors.text, fontSize: 14, fontWeight: '600' },
  destinoEstado: { color: colors.textMuted, fontSize: 13 },
  destinoEstadoActivo: { color: colors.accent, fontWeight: '700' },
  destinoAccion: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  respaldoFila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  respaldoFecha: { color: colors.text, fontSize: 13 },
  respaldoAccion: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  textoAdvertencia: { color: colors.warning, fontSize: 13, lineHeight: 17 },
  input: { backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, color: colors.text, fontSize: 15 },
  botonGuardar: { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: 'center' },
  botonGuardarTexto: { color: colors.primaryText, fontWeight: '700', fontSize: 16 },
  textoAyuda: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  botonSecundario: { backgroundColor: colors.accentBg, borderWidth: 1, borderColor: colors.primary, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 4 },
  botonSecundarioTexto: { color: colors.accent, fontWeight: '700', fontSize: 14 },
  version: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 8 },
})
