import { StyleSheet } from 'react-native'
import { colors } from './colors'

// Estilo único de "chip": filtros de categoría (Productos y Vender), filtro de
// método de pago (Historial) y selector de categoría del formulario. Vive aparte
// para que las pantallas que lo usan no vuelvan a divergir en alto y padding.
// El alto va fijo (no derivado del padding + texto) porque dentro de un
// ScrollView horizontal la medición automática falla en el primer render y
// recorta las etiquetas.
export const chips = StyleSheet.create({
  fila: { paddingBottom: 10 },
  scroll: { flexGrow: 0, height: 44 },
  contenido: { flexDirection: 'row', paddingHorizontal: 12 },
  chip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    height: 44, paddingHorizontal: 14, marginRight: 8,
    borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input,
  },
  chipActivo: { backgroundColor: colors.accentBg, borderColor: colors.primary },
  chipNuevo: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    height: 44, paddingHorizontal: 14, marginRight: 8,
    borderRadius: 999, borderWidth: 1, borderColor: colors.borderStrong, borderStyle: 'dashed',
  },
  icono: { fontSize: 14, lineHeight: 18, marginRight: 6 },
  texto: { color: colors.textMuted, fontWeight: '600', fontSize: 13, lineHeight: 18 },
  textoActivo: { color: colors.accent },
})
