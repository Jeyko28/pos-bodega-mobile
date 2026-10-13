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

## Referencia

- [[entorno-linux-android]] — cómo montar SDK, emulador y dev client en Linux
- [[herramientas-de-prueba]] — generador de datos, carga al emulador, login, cronómetro, pruebas de licencia
- [[decisiones-tecnicas]] — por qué no se reescribió en nativo, qué se optimizó y qué no

## Pendientes

- [ ] Probar el pegado del código desde el portapapeles en un APK real
- [ ] Probar la pantalla de licencia bloqueada en un build de producción
- [ ] Repetir las mediciones en el Redmi 10 físico (falta cable de datos)
- [ ] Migración de cuenta entre dispositivos — la app solo tiene Setup inicial
- [ ] Probar con muchas ventas concentradas en un solo día, no repartidas en un año
- [ ] Google Drive y SAF: implementado, sin probar en un APK
- [ ] Sincronización con la PC (Fase 2/3 del README) — sin empezar

## Cerrado

- [x] Medir el arranque en un build `preview` — 84 ms de JS, ~1 s al proceso
      completo. El 6.4 s era del dev build.

## Sobre este formato

Obsidian lee estas notas tal cual: los `[[wikilinks]]` funcionan porque los
archivos se llaman igual que el link. El frontmatter (`---`) lo usan los
plugins de propiedades.

Cada nota lleva `fecha`, `version` y `tipo` arriba para poder filtrar. Cuando
el proyecto llegue a la versión 1.1, las notas nuevas usan `v1.1.0`.
