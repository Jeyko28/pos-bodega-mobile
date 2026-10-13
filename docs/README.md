# Documentación de POS Bodega

Notas de trabajo del proyecto, ordenadas por fecha. La documentación de
producto (decisiones de negocio, qué hace cada pantalla) vive en el
[`README.md`](../README.md) del repo; acá va lo técnico y de proceso.

## Sesiones

| Fecha | Nota | Qué pasó |
|---|---|---|
| 2026-10-12 | [[2026-10-12-entorno-linux-y-emulador]] | Del Windows al Linux: se reconstruyó el entorno, se creó el emulador de gama media y se destapó un AVD corrupto |
| 2026-10-13 | [[2026-10-13-medicion-rendimiento]] | Primera medición real con 20.000 ventas: cobrar tarda 12 ms, `getProductos` bajó de 234 a 24 ms |
| 2026-10-13 | [[2026-10-13-flujo-de-licencia]] | 41 pruebas del flujo de licencia. **Bug real**: pegar el código desde WhatsApp nunca funcionó |
| 2026-10-13 | [[2026-10-13-prueba-flujo-licencia]] | Licencia probada de punta a punta en pantalla, con herramienta para saltar a cualquier día de la prueba |
| 2026-10-13 | [[2026-10-13-modelo-de-licencia-nube]] | Propuesta: la licencia pasa de bloquear la venta a bloquear la nube |

## Referencia

- [[entorno-linux-android]] — cómo montar SDK, emulador y dev client en Linux
- [[herramientas-de-prueba]] — generador de datos, carga al emulador, login, cronómetro, pruebas de licencia
- [[decisiones-tecnicas]] — por qué no se reescribió en nativo, qué se optimizó y qué no

## Prioridad de ahora

**Funcionamiento correcto → estética correcta → estructura clara.**

El criterio: la bodeguera tiene que poder hacer una venta sin dudar. Si algo
se traba, si una pantalla la confunde o si el flujo tiene un paso de más, eso
se arregla antes que cualquier función nueva.

- [ ] Probar el pegado del código desde el portapapeles (Android 10+ solo deja
      leerlo a la app con foco; hace falta device físico o escribir desde la app)
- [ ] Ver el aviso ámbar (día 24) y el del último día (día 30) en pantalla
- [ ] Verificar que un código de otro teléfono se rechaza con su mensaje de error
- [ ] Google Drive: implementado, nunca probado en un APK real
- [ ] SAF (carpeta pública): implementado, sin probar. Solo Android 11+
- [ ] Revisar Ajustes: 8 secciones mezclando uso diario con cosas de una vez
- [ ] Probar con muchas ventas concentradas en un solo día, no en un año
- [ ] Repetir las mediciones en el Redmi 10 físico (falta cable de datos)

### Decisiones abiertas

- [ ] [[2026-10-13-modelo-de-licencia-nube]] — ¿la licencia bloquea la nube en
      vez de la venta? Tres preguntas antes: ¿OneDrive vale el trabajo?,
      ¿la bodeguera usa más de un celular?, ¿qué precio?
- [ ] Migración de cuenta entre dispositivos — la app solo tiene Setup inicial
- [ ] Sincronización con la PC (Fase 2/3 del README) — sin empezar

## Cerrado

- [x] Medir el arranque en un build `preview` — 84 ms de JS, ~1 s al proceso
      completo. El 6.4 s era del dev build.
- [x] Pantalla de licencia bloqueada probada en pantalla, con 20.000 datos:
      solo se bloquea la venta, productos/clientes/caja siguen abiertos
- [x] Activación completa: código del vendedor → aceptado → venta desbloqueada

## Sobre este formato

Obsidian lee estas notas tal cual: los `[[wikilinks]]` funcionan porque los
archivos se llaman igual que el link. El frontmatter (`---`) lo usan los
plugins de propiedades.

Cada nota lleva `fecha`, `version` y `tipo` arriba para poder filtrar. Cuando
el proyecto llegue a la versión 1.1, las notas nuevas usan `v1.1.0`.
