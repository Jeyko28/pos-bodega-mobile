import React, { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, Modal, ScrollView, Pressable, StyleSheet, Keyboard } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import db from '../data/db'
import BotonHeader from './BotonHeader'
import CampoClave from './CampoClave'
import AvisoHoja from './AvisoHoja'
import { useSesion } from '../context/SesionContext'
import { useLetra } from '../context/LetraContext'
import { useNavigation } from '@react-navigation/native'
import { usePieDeHoja } from '../utils/teclado'
import { colors } from '../theme/colors'

const FORM_VACIO = { nombre: '', username: '', password: '', rol: 'cajero' }

// Todo el panel vive dentro de UN solo <Modal> que cambia de vista, en vez de
// abrir modales anidados: en iOS, mostrar dos <Modal> a la vez deja uno de los
// dos sin responder.
export default function PanelUsuario() {
  const { usuario, handleLogout } = useSesion()
  const { grande, alternar } = useLetra()
  const navigation = useNavigation()
  const { alturaTeclado, espacioAbajo } = usePieDeHoja()
  const [abierto, setAbierto] = useState(false)
  const [vista, setVista] = useState('menu')

  const [passActual, setPassActual] = useState('')
  const [passNueva, setPassNueva] = useState('')
  const [passRepetida, setPassRepetida] = useState('')
  const [guardando, setGuardando] = useState(false)

  const [usuarios, setUsuarios] = useState([])
  const [form, setForm] = useState(FORM_VACIO)
  const [aviso, setAviso] = useState(null)

  const esAdmin = usuario?.rol === 'admin'

  function abrir() {
    Keyboard.dismiss()
    setVista('menu')
    setAbierto(true)
  }

  function cerrar() {
    setAbierto(false)
    setPassActual(''); setPassNueva(''); setPassRepetida('')
    setForm(FORM_VACIO)
  }

  function irAUsuarios() {
    setUsuarios(db.getUsuarios())
    setVista('usuarios')
  }

  async function guardarPassword() {
    if (passNueva !== passRepetida) {
      setAviso({ titulo: 'No coinciden', mensaje: 'La nueva contraseña y su repetición no son iguales.' })
      return
    }
    setGuardando(true)
    const r = await db.cambiarPassword({ usuarioId: usuario.id, actual: passActual, nueva: passNueva })
    setGuardando(false)
    if (!r.success) {
      setAviso({ titulo: 'No se pudo cambiar', mensaje: r.error })
      return
    }
    setPassActual(''); setPassNueva(''); setPassRepetida('')
    setVista('menu')
    setAviso({ titulo: '✓ Listo', mensaje: 'Tu contraseña quedó actualizada.' })
  }

  async function guardarUsuario() {
    if (!form.nombre.trim() || !form.username.trim() || form.password.length < 4) {
      setAviso({ titulo: 'Faltan datos', mensaje: 'Completa nombre, usuario y una contraseña de al menos 4 caracteres.' })
      return
    }
    setGuardando(true)
    const r = await db.addUsuario(form)
    setGuardando(false)
    if (!r.success) {
      setAviso({ titulo: 'No se pudo crear', mensaje: r.error })
      return
    }
    setForm(FORM_VACIO)
    setUsuarios(db.getUsuarios())
    setVista('usuarios')
  }

  async function alternarActivo(u) {
    const r = await db.setUsuarioActivo(u.id, !u.activo)
    if (!r.success) {
      setAviso({ titulo: 'No se puede', mensaje: r.error })
      return
    }
    setUsuarios(db.getUsuarios())
  }

  return (
    <>
      <BotonHeader icono="person-circle" activo={abierto} onPress={abrir} />

      <Modal visible={abierto} transparent animationType="slide" onRequestClose={cerrar}>
        <View style={[styles.fondo, { paddingBottom: alturaTeclado }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={cerrar} />
          <ScrollView style={styles.hojaScrollLimite} contentContainerStyle={[styles.hoja, { paddingBottom: 20 + espacioAbajo }]} keyboardShouldPersistTaps="handled">
            {vista === 'menu' && (
              <>
                <View style={styles.perfil}>
                  <View style={styles.avatar}>
                    <Ionicons name="person" size={26} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.nombre}>{usuario?.nombre || 'Usuario'}</Text>
                    <Text style={styles.detalle}>@{usuario?.username} · {esAdmin ? 'Administrador' : 'Cajero'}</Text>
                  </View>
                </View>

                <TouchableOpacity style={styles.opcion} onPress={() => setVista('password')}>
                  <Ionicons name="key-outline" size={20} color={colors.text} />
                  <Text style={styles.opcionTexto}>Cambiar mi contraseña</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </TouchableOpacity>

                {/* Letra grande al alcance de todos (el cajero no entra a
                    Ajustes, pero sus ojos cansan igual). */}
                <TouchableOpacity style={styles.opcion} onPress={alternar}>
                  <Ionicons name="text-outline" size={20} color={colors.text} />
                  <Text style={styles.opcionTexto}>Letra grande: {grande ? 'activada' : 'apagada'}</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </TouchableOpacity>

                {esAdmin && (
                  <TouchableOpacity style={styles.opcion} onPress={irAUsuarios}>
                    <Ionicons name="people-outline" size={20} color={colors.text} />
                    <Text style={styles.opcionTexto}>Usuarios de la bodega</Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                )}

                {esAdmin && (
                  <TouchableOpacity style={styles.opcion} onPress={() => { cerrar(); navigation.navigate('Ajustes') }}>
                    <Ionicons name="settings-outline" size={20} color={colors.text} />
                    <Text style={styles.opcionTexto}>Ajustes del negocio</Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={[styles.opcion, styles.opcionSalir]} onPress={() => { cerrar(); handleLogout() }}>
                  <Ionicons name="log-out-outline" size={20} color={colors.danger} />
                  <Text style={[styles.opcionTexto, { color: colors.danger, fontWeight: '700' }]}>Cerrar sesión</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.botonGhost} onPress={cerrar}>
                  <Text style={styles.botonGhostTexto}>Volver</Text>
                </TouchableOpacity>
              </>
            )}

            {vista === 'password' && (
              <>
                <Text style={styles.titulo}>Cambiar mi contraseña</Text>
                <CampoClave textoGuia="Contraseña actual" valor={passActual} alCambiar={setPassActual} />
                <CampoClave textoGuia="Nueva contraseña" valor={passNueva} alCambiar={setPassNueva} />
                <CampoClave textoGuia="Repite la nueva" valor={passRepetida} alCambiar={setPassRepetida} />
                <View style={styles.filaBotones}>
                  <TouchableOpacity style={styles.botonGhost} onPress={() => setVista('menu')}>
                    <Text style={styles.botonGhostTexto}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.botonPrimario} onPress={guardarPassword} disabled={guardando}>
                    <Text style={styles.botonPrimarioTexto}>{guardando ? 'Guardando...' : 'Guardar'}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {vista === 'usuarios' && (
              <>
                <Text style={styles.titulo}>Usuarios de la bodega</Text>
                <Text style={styles.ayuda}>Crea una cuenta aparte para quien te ayuda a atender. Cada venta queda registrada a nombre de quien la hizo.</Text>

                <ScrollView style={{ maxHeight: 260, marginTop: 8 }}>
                  {usuarios.map(u => (
                    <View key={u.id} style={styles.filaUsuario}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.usuarioNombre}>{u.nombre} {u.id === usuario?.id && <Text style={styles.detalle}>(tú)</Text>}</Text>
                        <Text style={styles.detalle}>@{u.username} · {u.rol === 'admin' ? 'Administrador' : 'Cajero'}</Text>
                      </View>
                      {u.id !== usuario?.id && (
                        <TouchableOpacity onPress={() => alternarActivo(u)}>
                          <Text style={[styles.accion, !u.activo && { color: colors.textMuted }]}>
                            {u.activo ? 'Desactivar' : 'Activar'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </ScrollView>

                <View style={styles.filaBotones}>
                  <TouchableOpacity style={styles.botonGhost} onPress={() => setVista('menu')}>
                    <Text style={styles.botonGhostTexto}>Volver</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.botonPrimario} onPress={() => { setForm(FORM_VACIO); setVista('nuevoUsuario') }}>
                    <Text style={styles.botonPrimarioTexto}>+ Nuevo</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {vista === 'nuevoUsuario' && (
              <>
                <Text style={styles.titulo}>Nuevo usuario</Text>
                <TextInput style={styles.input} placeholder="Nombre (ej. María)" placeholderTextColor={colors.placeholder}
                  value={form.nombre} onChangeText={v => setForm(f => ({ ...f, nombre: v }))} />
                <TextInput style={styles.input} placeholder="Usuario para entrar (ej. maria)" placeholderTextColor={colors.placeholder}
                  autoCapitalize="none" value={form.username} onChangeText={v => setForm(f => ({ ...f, username: v }))} />
                <TextInput style={styles.input} placeholder="Contraseña" placeholderTextColor={colors.placeholder}
                  secureTextEntry value={form.password} onChangeText={v => setForm(f => ({ ...f, password: v }))} />

                <View style={styles.rolFila}>
                  {['cajero', 'admin'].map(r => (
                    <TouchableOpacity key={r} onPress={() => setForm(f => ({ ...f, rol: r }))}
                      style={[styles.rolBoton, form.rol === r && styles.rolBotonActivo]}>
                      <Text style={[styles.rolTexto, form.rol === r && styles.rolTextoActivo]}>
                        {r === 'cajero' ? 'Cajero' : 'Administrador'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.ayuda}>
                  El cajero puede vender y cobrar. El administrador además gestiona usuarios y la configuración del negocio.
                </Text>

                <View style={styles.filaBotones}>
                  <TouchableOpacity style={styles.botonGhost} onPress={() => setVista('usuarios')}>
                    <Text style={styles.botonGhostTexto}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.botonPrimario} onPress={guardarUsuario} disabled={guardando}>
                    <Text style={styles.botonPrimarioTexto}>{guardando ? 'Creando...' : 'Crear'}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
          {aviso && (
            <AvisoHoja
              titulo={aviso.titulo}
              mensaje={aviso.mensaje}
              botones={aviso.botones || [{ texto: 'Entendido', primario: true }]}
              onCerrar={() => setAviso(null)}
            />
          )}
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  hojaScrollLimite: { flexGrow: 0, maxHeight: '85%' },
  hoja: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 10 },

  perfil: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 6 },
  avatar: { width: 48, height: 48, borderRadius: 999, backgroundColor: colors.accentBg, alignItems: 'center', justifyContent: 'center' },
  nombre: { color: colors.text, fontWeight: '700', fontSize: 16 },
  detalle: { color: colors.textMuted, fontSize: 13 },

  opcion: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  opcionSalir: { borderColor: colors.danger, backgroundColor: colors.dangerBg },
  opcionTexto: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '600' },

  titulo: { color: colors.text, fontWeight: '700', fontSize: 16 },
  ayuda: { color: colors.textMuted, fontSize: 13, lineHeight: 17 },
  input: { backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, color: colors.text, fontSize: 15 },

  filaUsuario: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  usuarioNombre: { color: colors.text, fontWeight: '600', fontSize: 14 },
  accion: { color: colors.accent, fontWeight: '700', fontSize: 13 },

  rolFila: { flexDirection: 'row', gap: 8 },
  rolBoton: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  rolBotonActivo: { backgroundColor: colors.accentBg, borderColor: colors.primary },
  rolTexto: { color: colors.textMuted, fontWeight: '600', fontSize: 13 },
  rolTextoActivo: { color: colors.accent },

  filaBotones: { flexDirection: 'row', gap: 10, marginTop: 6 },
  botonGhost: { flex: 1, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  botonGhostTexto: { color: colors.textMuted, fontWeight: '600' },
  botonPrimario: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center' },
  botonPrimarioTexto: { color: colors.primaryText, fontWeight: '700' },
})
