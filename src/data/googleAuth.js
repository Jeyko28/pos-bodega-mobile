import * as AuthSession from 'expo-auth-session'
import * as SecureStore from 'expo-secure-store'

// Cliente OAuth tipo "Android" creado en Google Cloud Console, atado al
// nombre de paquete (com.pos.bodega) y a la huella SHA-1 del keystore de EAS.
// No es secreto: los clientes Android no llevan client secret, la verificación
// la hace Google contra el paquete + la firma del APK.
const CLIENT_ID = '953316471021-fss1su32i361nm6np4i3guh3i473lf3g.apps.googleusercontent.com'

// Google exige este formato exacto de esquema (client id invertido) para
// clientes OAuth tipo Android. Debe declararse también en app.json → "scheme"
// porque es configuración nativa: un cambio ahí solo toma efecto con un build nuevo.
const ID_SIN_SUFIJO = CLIENT_ID.replace('.apps.googleusercontent.com', '')
export const ESQUEMA_REDIRECCION = `com.googleusercontent.apps.${ID_SIN_SUFIJO}`

// Se arma el string a mano, sin makeRedirectUri(): esa función construye
// "esquema://oauth2redirect" (doble barra, formato de URL normal), pero Google
// exige "esquema:/oauth2redirect" (una sola barra) para clientes tipo Android
// — es su convención de apps nativas, no una URL con host. La diferencia de una
// barra hace que Google rechace la solicitud completa con "Error 400:
// invalid_request... no cumple con la política de OAuth 2.0 de Google".
const REDIRECT_URI = `${ESQUEMA_REDIRECCION}:/oauth2redirect`

export const DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
}

// drive.file: la app solo puede ver y escribir los archivos que ella misma creó,
// nunca el resto del Drive del usuario. Evita el proceso de verificación pesado
// de Google que exigen los scopes más amplios.
export const SCOPE_DRIVE = 'https://www.googleapis.com/auth/drive.file'

const CLAVE_TOKEN = 'pos-bodega-google-drive-token'

export function configDeRequest() {
  return {
    clientId: CLIENT_ID,
    scopes: [SCOPE_DRIVE],
    redirectUri: REDIRECT_URI,
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
  }
}

async function guardarTokens({ accessToken, refreshToken, expiresIn }) {
  await SecureStore.setItemAsync(CLAVE_TOKEN, JSON.stringify({
    accessToken,
    refreshToken,
    expiraEn: Date.now() + (expiresIn || 3600) * 1000,
  }))
}

export async function intercambiarCodigoPorTokens(code, codeVerifier) {
  const resultado = await AuthSession.exchangeCodeAsync(
    { clientId: CLIENT_ID, code, redirectUri: REDIRECT_URI, extraParams: { code_verifier: codeVerifier } },
    DISCOVERY,
  )
  await guardarTokens(resultado)
  return resultado
}

export async function hayCuentaConectada() {
  const raw = await SecureStore.getItemAsync(CLAVE_TOKEN)
  return !!raw
}

export async function desconectarCuenta() {
  await SecureStore.deleteItemAsync(CLAVE_TOKEN)
}

// El access token dura ~1 hora; el refresh token no expira mientras el usuario
// no revoque el acceso desde su cuenta de Google. Se renueva solo cuando falta
// poco (o ya venció), para no pedir un token nuevo en cada subida.
export async function obtenerAccessTokenValido() {
  const raw = await SecureStore.getItemAsync(CLAVE_TOKEN)
  if (!raw) return null
  const guardado = JSON.parse(raw)

  if (guardado.expiraEn > Date.now() + 60_000) return guardado.accessToken
  if (!guardado.refreshToken) return null

  const refrescado = await AuthSession.refreshAsync(
    { clientId: CLIENT_ID, refreshToken: guardado.refreshToken },
    DISCOVERY,
  )
  await guardarTokens({ ...refrescado, refreshToken: refrescado.refreshToken || guardado.refreshToken })
  return refrescado.accessToken
}
