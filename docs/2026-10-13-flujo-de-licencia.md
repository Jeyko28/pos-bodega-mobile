---
fecha: 2026-10-13
version: v1.0.0
tipo: pruebas
tags: [licencia, calidad, limpieza, seguridad]
---

# Flujo de licencia — prueba y corrección de un bug real

> Rendimiento: [[2026-10-13-medicion-rendimiento]] · Decisiones: [[decisiones-tecnicas]] · Herramientas: [[herramientas-de-prueba]]

## Por qué se probó así

La licencia es lo único que puede dejar a una bodeguera **sin poder vender**.
Si falla, pagó y no le sirve: es el peor fallo posible del producto.

Y tiene dos partes que no se pueden probar en pantalla:

1. **El cálculo de 30 días** — para ver el día 30 hay que esperar un mes.
2. **El par generar → verificar** — si el vendedor y la app se desincronizan,
   el código que él emite no lo acepta la app.

Las dos se prueban en Node, sin emulador, ejecutando **el mismo código de la
app** (no una copia): `getEstadoLicencia` se extrae de `db.js` y se evalúa, y
`licencia.js` se transpila y se carga con `expo-crypto` sustituido por
`node:crypto`. Si alguien cambia la fórmula, la prueba usa el cambio.

```bash
node tools/probar-licencia.js        # 17 casos: cálculo de días
node tools/probar-codigo-licencia.js # 24 casos: código y HMAC
```

## Bug encontrado: el código nunca se podía pegar desde WhatsApp

**Este es el hallazgo de la sesión.** No lo habría salido en ninguna prueba manual,
porque en las pruebas de desarrollo el código se tecleaba o se pegaba ya
limpio.

La bodeguera recibe por WhatsApp un mensaje que dice:

> Hola! Tu código es **EY51-PQKP-65YS-85V0** — gracias

Copia el mensaje (no solo el código) y lo pega en la app. Lo que llegaba era:

```js
// src/data/licencia.js, antes
export function extraerCodigo(texto) {
  const limpio = normalizarCodigo(texto)
  return limpio.length === 16 ? limpio : null   // 36 letras → null
}
```

`normalizarCodigo` quita los signos de puntuación y deja **todas las letras**
del mensaje: 36, no 16. Devolvía `null` siempre. La función existía
exactamente para resolver este caso y no lo resolvía.

Consecuencia: **pegar el código desde WhatsApp —el flujo principal, el que el
botón «Pegar código del WhatsApp» invita a hacer— nunca funcionaba.** Solo
funcionaba tecleando las 16 letras exactas, que con vista cansada es pedir un
error.

### La corrección

```js
// Ahora: se busca el bloque con guiones DENTRO del texto.
const RE_CODIGO = /\b[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){3}\b/g

export function extraerCodigo(texto) {
  const encontrados = texto.toUpperCase().match(RE_CODIGO)
  if (encontrados && encontrados.length === 1) return normalizarCodigo(encontrados[0])
  if (encontrados && encontrados.length > 1) return null   // no adivina
  const limpio = normalizarCodigo(texto)
  return limpio.length === 16 ? limpio : null               // código solo, sin guiones
}
```

Dos decisiones:

- **Si hay dos códigos, no elige uno.** Es mejor fallar y que vuelva a copiar
  que activar con el código de otra persona.
- **La regex solo acepta letras de Crockford** (`I`, `L`, `O`, `U` quedan
  fuera), así que no confunde palabras del mensaje con un código.

Y en `verificarCodigo` y `verificarCodigoReset` se cambió `normalizarCodigo`
por `extraerCodigo`: la defensa va en la función de verificación, no solo en
la pantalla, para que ningún camino de entrada se salte la normalización.

## Lo que sí estaba bien

**El cálculo de 30 días** — 17/17 casos, incluyendo la frontera (a las 29.9
días no bloquea, a las 30.5 sí), la anti-trampa de reloj (atrasar el reloj no
alarga la prueba) y que la licencia activa nunca bloquea.

Un detalle que parecía un bug y no lo era: en el día 30, `avisar` es `false`
y `ultimoDia` es `true`. Son excluyentes a propósito — el último día tiene su
propio mensaje, más fuerte que el ámbar de la semana previa.

**El HMAC** — el que está armado a mano en la app coincide con `node:crypto`
en clave corta, clave de 131 bytes (que ejercita el `sha256` de la clave
larga) y con texto acentuado (que ejercita el UTF-8 manual, porque Hermes no
garantiza `TextEncoder`).

El secreto fragmentado en tres módulos arma el mismo valor que el de
`tools/generar-codigo.js`: `b88a2eb...50042`. Si divergieran, ningún código
serviría.

## Un hallazgo sobre el proceso

Dos de los "fallos" iniciales eran **errores de la prueba, no del código**:
un vector del RFC 4231 inventado y una expectativa de días mal puesta. La
prueba los delató igual — porque compara contra una referencia externa
(`node:crypto`), no contra lo que el código "debería" dar.

Corregir la expectativa, no el código, es la mitad del trabajo de una prueba.

## Limpieza hecha antes de publicar

| Cambio | Por qué |
|---|---|
| `recordAudioAndroid: false` en `app.json` | El plugin de `expo-camera` agregaba `RECORD_AUDIO` por defecto; la app nunca graba audio. Google Play lo marca como permiso innecesario |
| Fuera `react-dom`, `react-native-web` | No se usan en ningún archivo. Eran para el target web, que no es el objetivo |
| Fuera `@expo/ngrok`, `@expo/metro-runtime` | Andamiaje de desarrollo; con USB o emulador `--tunnel` no hace falta |
| Fuera el script `web` | Sin target web |
| **Se dejó `expo-dev-client`** | Es lo que permite el perfil `development` de `eas.json`. Sin él se pierde la iteración rápida |

Permisos que quedan: `CAMERA`, `USE_BIOMETRIC`, `USE_FINGERPRINT` — los tres
que la app usa de verdad.

## Pendiente

- [ ] Probar el pegado desde el portapapeles en pantalla (la lógica ya pasa,
      falta el camino real con `expo-clipboard` en un APK)
- [ ] Probar la pantalla de licencia bloqueada en un build de producción
- [ ] Verificar que el aviso ámbar y el de último día se ven bien
