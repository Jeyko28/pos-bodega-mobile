import * as SQLite from 'expo-sqlite'
import * as Crypto from 'expo-crypto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { normalizar as normalizarTexto } from '../utils/texto'

// Antes todos los datos vivían en un solo JSON de AsyncStorage que se reescribía
// entero en cada venta. Con miles de ventas eso se vuelve lento y arriesgado, así
// que ahora cada tabla es una tabla real de SQLite y solo se toca la fila que cambia.
// Se usa la variante síncrona a propósito: las pantallas ya llamaban a estas
// funciones de forma síncrona y así no hubo que reescribir ninguna.
const STORAGE_KEY = 'pos-bodega-data'
const DB_NAME = 'pos-bodega.db'

let sql = null

const ESQUEMA = `
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'cajero',
  activo INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS productos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  precio REAL NOT NULL DEFAULT 0,
  stock REAL NOT NULL DEFAULT 0,
  codigo TEXT,
  categoria TEXT,
  tipo_venta TEXT NOT NULL DEFAULT 'unidad',
  unidad TEXT NOT NULL DEFAULT 'unidad',
  creado_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_productos_codigo ON productos(codigo);

CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  telefono TEXT,
  referencia TEXT,
  dni_ruc TEXT,
  creado_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ventas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  total REAL NOT NULL,
  subtotal_bruto REAL NOT NULL,
  descuento REAL NOT NULL DEFAULT 0,
  tipo_descuento TEXT,
  monto_recibido REAL NOT NULL DEFAULT 0,
  vuelto REAL NOT NULL DEFAULT 0,
  metodo_pago TEXT NOT NULL,
  usuario_id INTEGER,
  cliente_id INTEGER,
  es_fiado INTEGER NOT NULL DEFAULT 0,
  comprador_nombre TEXT,
  comprador_dni_ruc TEXT,
  fecha TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fecha);

CREATE TABLE IF NOT EXISTS detalle_ventas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venta_id INTEGER NOT NULL,
  producto_id INTEGER,
  nombre_producto TEXT NOT NULL,
  precio_unitario REAL NOT NULL,
  cantidad REAL NOT NULL,
  subtotal REAL NOT NULL,
  tipo_venta TEXT NOT NULL DEFAULT 'unidad',
  unidad TEXT NOT NULL DEFAULT 'unidad'
);
CREATE INDEX IF NOT EXISTS idx_detalle_venta ON detalle_ventas(venta_id);

CREATE TABLE IF NOT EXISTS fiado (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL,
  monto_original REAL NOT NULL,
  saldo REAL NOT NULL,
  concepto TEXT,
  usuario_id INTEGER,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  fecha TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fiado_cliente ON fiado(cliente_id);

CREATE TABLE IF NOT EXISTS pagos_fiado (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fiado_id INTEGER NOT NULL,
  monto REAL NOT NULL,
  metodo_pago TEXT NOT NULL DEFAULT 'Efectivo',
  usuario_id INTEGER,
  fecha TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pagos_fiado_fecha ON pagos_fiado(fecha);

CREATE TABLE IF NOT EXISTS categorias_custom (
  id TEXT PRIMARY KEY,
  icon TEXT
);

CREATE TABLE IF NOT EXISTS config (
  clave TEXT PRIMARY KEY,
  valor TEXT
);
`

// ─── CONFIG (tabla clave/valor, se expone como un objeto plano) ──────
function leerConfig(clave, porDefecto = null) {
  const fila = sql.getFirstSync('SELECT valor FROM config WHERE clave = ?', clave)
  if (!fila) return porDefecto
  try { return JSON.parse(fila.valor) } catch { return porDefecto }
}

function escribirConfig(clave, valor) {
  sql.runSync('INSERT OR REPLACE INTO config (clave, valor) VALUES (?, ?)', clave, JSON.stringify(valor))
}

function getConfig() {
  const filas = sql.getAllSync('SELECT clave, valor FROM config')
  const config = {}
  filas.forEach(f => {
    if (f.clave === 'setup_completado' || f.clave === 'migrado_desde_asyncstorage') return
    try { config[f.clave] = JSON.parse(f.valor) } catch { config[f.clave] = f.valor }
  })
  if (config.umbral_stock_bajo === undefined) config.umbral_stock_bajo = 5
  return config
}

async function updateConfig(config) {
  sql.withTransactionSync(() => {
    Object.entries(config).forEach(([clave, valor]) => escribirConfig(clave, valor))
  })
  return getConfig()
}

// ─── INIT + MIGRACIÓN ───────────────────────────────────────────────
async function initDB() {
  if (sql) return
  sql = SQLite.openDatabaseSync(DB_NAME)
  sql.execSync(ESQUEMA)
  if (!leerConfig('migrado_desde_asyncstorage', false)) {
    await migrarDesdeAsyncStorage()
  }
}

// Trae los datos del formato viejo (un JSON en AsyncStorage). No se borra el
// original a propósito: queda como respaldo por si hubiera que volver atrás.
async function migrarDesdeAsyncStorage() {
  const crudo = await AsyncStorage.getItem(STORAGE_KEY)
  if (!crudo) { escribirConfig('migrado_desde_asyncstorage', true); return }

  let viejo
  try { viejo = JSON.parse(crudo) } catch { escribirConfig('migrado_desde_asyncstorage', true); return }

  sql.withTransactionSync(() => {
    ;(viejo.usuarios || []).forEach(u => sql.runSync(
      'INSERT OR REPLACE INTO usuarios (id, nombre, username, password, rol, activo, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?)',
      u.id, u.nombre, u.username, u.password, u.rol || 'cajero', u.activo === false ? 0 : 1, u.creado_en || new Date().toISOString()))

    ;(viejo.productos || []).forEach(p => sql.runSync(
      'INSERT OR REPLACE INTO productos (id, nombre, precio, stock, codigo, categoria, tipo_venta, unidad, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      p.id, p.nombre, p.precio, p.stock, p.codigo ?? null, p.categoria ?? 'General', p.tipo_venta || 'unidad', p.unidad || 'unidad', p.creado_en || new Date().toISOString()))

    ;(viejo.clientes || []).forEach(c => sql.runSync(
      'INSERT OR REPLACE INTO clientes (id, nombre, telefono, referencia, dni_ruc, creado_en) VALUES (?, ?, ?, ?, ?, ?)',
      c.id, c.nombre, c.telefono ?? null, c.referencia ?? null, c.dni_ruc ?? null, c.creado_en || new Date().toISOString()))

    ;(viejo.ventas || []).forEach(v => sql.runSync(
      'INSERT OR REPLACE INTO ventas (id, total, subtotal_bruto, descuento, tipo_descuento, monto_recibido, vuelto, metodo_pago, usuario_id, cliente_id, es_fiado, comprador_nombre, comprador_dni_ruc, fecha) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      v.id, v.total, v.subtotal_bruto ?? v.total, v.descuento ?? 0, v.tipo_descuento ?? 'ninguno',
      v.monto_recibido ?? 0, v.vuelto ?? 0, v.metodo_pago, v.usuario_id ?? null, v.cliente_id ?? null,
      v.es_fiado ? 1 : 0, v.comprador_nombre ?? null, v.comprador_dni_ruc ?? null, v.fecha))

    ;(viejo.detalle_ventas || []).forEach(d => sql.runSync(
      'INSERT OR REPLACE INTO detalle_ventas (id, venta_id, producto_id, nombre_producto, precio_unitario, cantidad, subtotal, tipo_venta, unidad) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      d.id, d.venta_id, d.producto_id ?? null, d.nombre_producto, d.precio_unitario, d.cantidad, d.subtotal, d.tipo_venta || 'unidad', d.unidad || 'unidad'))

    ;(viejo.fiado || []).forEach(f => sql.runSync(
      'INSERT OR REPLACE INTO fiado (id, cliente_id, monto_original, saldo, concepto, usuario_id, estado, fecha) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      f.id, f.cliente_id, f.monto_original, f.saldo, f.concepto ?? null, f.usuario_id ?? null, f.estado || 'pendiente', f.fecha))

    ;(viejo.pagos_fiado || []).forEach(p => sql.runSync(
      'INSERT OR REPLACE INTO pagos_fiado (id, fiado_id, monto, metodo_pago, usuario_id, fecha) VALUES (?, ?, ?, ?, ?, ?)',
      p.id, p.fiado_id, p.monto, p.metodo_pago || 'Efectivo', p.usuario_id ?? null, p.fecha))

    ;(viejo.categorias_custom || []).forEach(c => sql.runSync(
      'INSERT OR REPLACE INTO categorias_custom (id, icon) VALUES (?, ?)', c.id, c.icon))

    Object.entries(viejo.config || {}).forEach(([clave, valor]) => escribirConfig(clave, valor))
    escribirConfig('setup_completado', viejo.setup_completado === true || (viejo.usuarios || []).length > 0)
  })

  // La marca va al final a propósito: si la migración falla a mitad, la
  // transacción revierte y el siguiente arranque vuelve a intentarlo.
  escribirConfig('migrado_desde_asyncstorage', true)
}

// ─── CONTRASEÑAS ────────────────────────────────────────────────────
// Se guardan como `sha256$<salt>$<hash>`, nunca en texto plano. El salt es
// distinto por usuario, así que dos personas con la misma contraseña no
// producen el mismo hash y no sirven las tablas precalculadas.
//
// expo-crypto no ofrece PBKDF2/bcrypt (solo funciones de digest), así que esto
// no resiste una fuerza bruta dedicada contra una contraseña corta. La defensa
// principal sigue siendo que la base vive en el almacenamiento privado de la
// app; el cifrado es una capa extra para que la contraseña no quede legible
// ante quien logre leer el archivo.
const PREFIJO_HASH = 'sha256$'

function generarSalt() {
  return Array.from(Crypto.getRandomBytes(16)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hashearPassword(password, salt = generarSalt()) {
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}${password}`)
  return `${PREFIJO_HASH}${salt}$${hash}`
}

async function passwordCoincide(password, almacenado) {
  // Contraseñas creadas antes de este cambio siguen en texto plano; se aceptan
  // una vez y se reescriben cifradas en el login (ver abajo).
  if (!almacenado?.startsWith(PREFIJO_HASH)) return password === almacenado
  const [, salt] = almacenado.split('$')
  return (await hashearPassword(password, salt)) === almacenado
}

// ─── SETUP ──────────────────────────────────────────────────────────
function isSetupCompletado() { return leerConfig('setup_completado', false) === true }

async function completarSetup({ negocioNombre, adminNombre, adminUsername, adminPassword }) {
  const creadoEn = new Date().toISOString()
  const r = sql.runSync(
    'INSERT INTO usuarios (nombre, username, password, rol, activo, creado_en) VALUES (?, ?, ?, ?, 1, ?)',
    adminNombre, adminUsername, await hashearPassword(adminPassword), 'admin', creadoEn)
  escribirConfig('negocio_nombre', negocioNombre)
  escribirConfig('setup_completado', true)
  return {
    success: true,
    usuario: { id: r.lastInsertRowId, nombre: adminNombre, username: adminUsername, rol: 'admin', activo: true, creado_en: creadoEn },
  }
}

// ─── AUTH / USUARIOS ────────────────────────────────────────────────
async function login(username, password) {
  const u = sql.getFirstSync('SELECT * FROM usuarios WHERE username = ? AND activo = 1', username)
  // El mismo mensaje para usuario inexistente y contraseña errada: decir cuál
  // de los dos falló le confirma a un extraño qué usuarios existen.
  const error = { success: false, error: 'Usuario o contraseña incorrectos' }
  if (!u) return error
  if (!(await passwordCoincide(password, u.password))) return error

  // Migración transparente: si la contraseña estaba en texto plano y acertó,
  // se reescribe cifrada. Así las cuentas viejas se actualizan solas al entrar,
  // sin obligar a nadie a resetear nada.
  if (!u.password.startsWith(PREFIJO_HASH)) {
    sql.runSync('UPDATE usuarios SET password = ? WHERE id = ?', await hashearPassword(password), u.id)
  }

  const { password: _, ...usuario } = u
  return { success: true, usuario: { ...usuario, activo: true } }
}

async function cambiarPassword({ usuarioId, actual, nueva }) {
  const u = sql.getFirstSync('SELECT id, password FROM usuarios WHERE id = ?', usuarioId)
  if (!u || !(await passwordCoincide(actual, u.password))) {
    return { success: false, error: 'La contraseña actual no es correcta' }
  }
  if (!nueva || nueva.length < 4) return { success: false, error: 'La nueva contraseña debe tener al menos 4 caracteres' }
  sql.runSync('UPDATE usuarios SET password = ? WHERE id = ?', await hashearPassword(nueva), usuarioId)
  return { success: true }
}

// Los usuarios no se borran: las ventas guardan quién las hizo, y borrarlo
// dejaría el historial sin dueño. Desactivar impide entrar sin perder ese rastro.
async function setUsuarioActivo(id, activo) {
  const admins = sql.getFirstSync("SELECT COUNT(*) AS n FROM usuarios WHERE rol = 'admin' AND activo = 1")
  const objetivo = sql.getFirstSync('SELECT rol, activo FROM usuarios WHERE id = ?', id)
  if (!objetivo) return { success: false, error: 'Usuario no encontrado' }
  if (!activo && objetivo.rol === 'admin' && admins.n <= 1) {
    return { success: false, error: 'No puedes desactivar al único administrador' }
  }
  sql.runSync('UPDATE usuarios SET activo = ? WHERE id = ?', activo ? 1 : 0, id)
  return { success: true }
}

function getUsuarios() {
  return sql.getAllSync('SELECT id, nombre, username, rol, activo, creado_en FROM usuarios')
    .map(u => ({ ...u, activo: !!u.activo }))
}

async function addUsuario({ nombre, username, password, rol }) {
  const existe = sql.getFirstSync('SELECT id FROM usuarios WHERE username = ?', username)
  if (existe) return { success: false, error: 'El nombre de usuario ya existe' }
  const creadoEn = new Date().toISOString()
  const r = sql.runSync(
    'INSERT INTO usuarios (nombre, username, password, rol, activo, creado_en) VALUES (?, ?, ?, ?, 1, ?)',
    nombre, username, await hashearPassword(password), rol || 'cajero', creadoEn)
  return { success: true, usuario: { id: r.lastInsertRowId, nombre, username, rol: rol || 'cajero', activo: true, creado_en: creadoEn } }
}

// ─── PRODUCTOS ──────────────────────────────────────────────────────
function getProductos() {
  return sql.getAllSync('SELECT * FROM productos').sort((a, b) => a.nombre.localeCompare(b.nombre))
}

async function addProducto({ nombre, precio, stock, codigo, categoria, tipo_venta, unidad }) {
  const creadoEn = new Date().toISOString()
  const r = sql.runSync(
    'INSERT INTO productos (nombre, precio, stock, codigo, categoria, tipo_venta, unidad, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    nombre, parseFloat(precio), parseFloat(stock), codigo || null, categoria || 'General', tipo_venta || 'unidad', unidad || 'unidad', creadoEn)
  return sql.getFirstSync('SELECT * FROM productos WHERE id = ?', r.lastInsertRowId)
}

async function updateProducto({ id, nombre, precio, stock, codigo, categoria, tipo_venta, unidad }) {
  sql.runSync(
    'UPDATE productos SET nombre = ?, precio = ?, stock = ?, codigo = ?, categoria = ?, tipo_venta = ?, unidad = ? WHERE id = ?',
    nombre, parseFloat(precio), parseFloat(stock), codigo || null, categoria, tipo_venta || 'unidad', unidad || 'unidad', id)
  return sql.getFirstSync('SELECT * FROM productos WHERE id = ?', id)
}

async function deleteProducto(id) {
  sql.runSync('DELETE FROM productos WHERE id = ?', id)
  return { success: true }
}

// Alta masiva desde el catálogo base. Se salta los que ya existen por nombre
// para que el dueño pueda volver a entrar y agregar los que le faltaban sin
// duplicar los que ya cargó.
async function addProductosLote(productos) {
  const creadoEn = new Date().toISOString()
  const productosActuales = sql.getAllSync('SELECT nombre FROM productos')
  let agregados = 0
  let omitidos = 0

  sql.withTransactionSync(() => {
    productos.forEach(p => {
      // Se compara sin tildes: "Plátano" y "platano" son el mismo producto y no
      // deben convivir duplicados en el catálogo.
      const existe = productosActuales.some(a => normalizarTexto(a.nombre) === normalizarTexto(p.nombre))
      if (existe) { omitidos++; return }
      productosActuales.push({ nombre: p.nombre })
      sql.runSync(
        'INSERT INTO productos (nombre, precio, stock, codigo, categoria, tipo_venta, unidad, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        p.nombre, parseFloat(p.precio), parseFloat(p.stock) || 0, null,
        p.categoria || 'General', p.tipo_venta || 'unidad', p.unidad || 'unidad', creadoEn)
      agregados++
    })
  })

  return { agregados, omitidos }
}

// Suma al stock en vez de reemplazarlo: cuando llega el proveedor, el dueño
// sabe cuánto LLEGÓ, no cuánto queda en total. Obligarlo a hacer esa suma de
// cabeza, producto por producto, es la razón por la que el inventario termina
// mintiendo y la app dejando de servir.
async function ingresarMercaderia(entradas) {
  let actualizados = 0
  sql.withTransactionSync(() => {
    entradas.forEach(({ id, cantidad }) => {
      const suma = parseFloat(cantidad)
      if (!suma || suma <= 0) return
      sql.runSync('UPDATE productos SET stock = stock + ? WHERE id = ?', suma, id)
      actualizados++
    })
  })
  return { actualizados }
}

// Engancha un código de barras real a un producto que se cargó sin él (por
// ejemplo, desde el catálogo base). Es el mecanismo que hace que el catálogo se
// complete solo con el uso, sin inventar códigos.
async function asignarCodigo(productoId, codigo) {
  const enUso = sql.getFirstSync('SELECT nombre FROM productos WHERE codigo = ? AND id != ?', codigo, productoId)
  if (enUso) return { success: false, error: `Ese código ya es de "${enUso.nombre}"` }
  sql.runSync('UPDATE productos SET codigo = ? WHERE id = ?', codigo, productoId)
  return { success: true }
}

// Los que más se venden, para tenerlos a un toque en hora punta. Se miden por
// número de veces vendidos y no por unidades: cinco ventas de un pan pesan más
// que una venta de 20 kilos de arroz a la hora de decidir qué poner a la mano.
function getMasVendidos(limite = 12, dias = 30) {
  const desde = new Date()
  desde.setDate(desde.getDate() - dias)
  return sql.getAllSync(`
    SELECT p.*, COUNT(d.id) AS veces
    FROM detalle_ventas d
    JOIN ventas v ON v.id = d.venta_id
    JOIN productos p ON p.id = d.producto_id
    WHERE v.fecha >= ?
    GROUP BY p.id
    ORDER BY veces DESC
    LIMIT ?
  `, desde.toISOString(), limite)
}

function getProductosBajoStock() {
  const u = getConfig().umbral_stock_bajo || 5
  return sql.getAllSync('SELECT * FROM productos WHERE stock <= ? ORDER BY stock ASC', u)
}

// ─── CATEGORÍAS PERSONALIZADAS ──────────────────────────────────────
function getCategoriasCustom() { return sql.getAllSync('SELECT * FROM categorias_custom') }

async function addCategoriaCustom({ id, icon }) {
  const yaExiste = sql.getFirstSync('SELECT * FROM categorias_custom WHERE LOWER(id) = LOWER(?)', id)
  if (yaExiste) return yaExiste
  sql.runSync('INSERT INTO categorias_custom (id, icon) VALUES (?, ?)', id, icon)
  return { id, icon }
}

// ─── CLIENTES ───────────────────────────────────────────────────────
const SQL_CLIENTES = `
  SELECT c.*, COALESCE((
    SELECT SUM(f.saldo) FROM fiado f WHERE f.cliente_id = c.id AND f.estado = 'pendiente'
  ), 0) AS deuda_total
  FROM clientes c
`

function getClientes() {
  return sql.getAllSync(SQL_CLIENTES).sort((a, b) => a.nombre.localeCompare(b.nombre))
}

async function addCliente({ nombre, telefono, referencia, dni_ruc }) {
  const creadoEn = new Date().toISOString()
  const r = sql.runSync(
    'INSERT INTO clientes (nombre, telefono, referencia, dni_ruc, creado_en) VALUES (?, ?, ?, ?, ?)',
    nombre, telefono || null, referencia || null, dni_ruc || null, creadoEn)
  return { id: r.lastInsertRowId, nombre, telefono: telefono || null, referencia: referencia || null, dni_ruc: dni_ruc || null, creado_en: creadoEn }
}

// El filtro va en JS y no en SQL a propósito: el LIKE de SQLite no ignora
// tildes, así que buscar "nunez" nunca encontraría a "Núñez". La lista de
// clientes de una bodega es chica, el costo de filtrar en memoria es nulo.
async function updateCliente({ id, nombre, telefono, referencia, dni_ruc }) {
  sql.runSync(
    'UPDATE clientes SET nombre = COALESCE(?, nombre), telefono = ?, referencia = ?, dni_ruc = ? WHERE id = ?',
    nombre ?? null, telefono || null, referencia || null, dni_ruc || null, id)
  return sql.getFirstSync('SELECT * FROM clientes WHERE id = ?', id)
}

function buscarCliente(query) {
  const clientes = sql.getAllSync(SQL_CLIENTES)
  const q = normalizarTexto(query)
  if (!q) return clientes
  return clientes.filter(c => normalizarTexto(c.nombre).includes(q) || (c.telefono || '').includes(query.trim()))
}

// ─── FIADO ──────────────────────────────────────────────────────────
function getFiadoCliente(clienteId) {
  const fiados = sql.getAllSync('SELECT * FROM fiado WHERE cliente_id = ? ORDER BY fecha DESC', clienteId)
  if (!fiados.length) return []
  const pagos = sql.getAllSync(
    `SELECT * FROM pagos_fiado WHERE fiado_id IN (${fiados.map(() => '?').join(',')})`,
    ...fiados.map(f => f.id))
  return fiados.map(f => ({ ...f, pagos: pagos.filter(p => p.fiado_id === f.id) }))
}

function insertarFiado({ clienteId, monto, concepto, usuarioId }) {
  const fecha = new Date().toISOString()
  const m = parseFloat(monto)
  const r = sql.runSync(
    'INSERT INTO fiado (cliente_id, monto_original, saldo, concepto, usuario_id, estado, fecha) VALUES (?, ?, ?, ?, ?, ?, ?)',
    clienteId, m, m, concepto || 'Compra al crédito', usuarioId || null, 'pendiente', fecha)
  return { id: r.lastInsertRowId, cliente_id: clienteId, monto_original: m, saldo: m, concepto, usuario_id: usuarioId || null, estado: 'pendiente', fecha }
}

async function addFiado(args) { return insertarFiado(args) }

async function pagarFiado({ fiadoId, monto, usuarioId, metodoPago = 'Efectivo' }) {
  const f = sql.getFirstSync('SELECT * FROM fiado WHERE id = ?', fiadoId)
  if (!f) return { success: false, error: 'Fiado no encontrado' }

  const mp = Math.min(parseFloat(monto), f.saldo)
  const saldoRestante = Math.max(f.saldo - mp, 0)
  const fecha = new Date().toISOString()
  let pagoId

  sql.withTransactionSync(() => {
    const r = sql.runSync(
      'INSERT INTO pagos_fiado (fiado_id, monto, metodo_pago, usuario_id, fecha) VALUES (?, ?, ?, ?, ?)',
      fiadoId, mp, metodoPago, usuarioId || null, fecha)
    pagoId = r.lastInsertRowId
    sql.runSync('UPDATE fiado SET saldo = ?, estado = ? WHERE id = ?', saldoRestante, saldoRestante === 0 ? 'pagado' : 'pendiente', fiadoId)
  })

  return { success: true, pago: { id: pagoId, fiado_id: fiadoId, monto: mp, metodo_pago: metodoPago, fecha }, saldo_restante: saldoRestante }
}

function getResumenFiado() {
  const r = sql.getFirstSync(`
    SELECT COALESCE(SUM(saldo), 0) AS total_deuda, COUNT(DISTINCT cliente_id) AS clientes_deuda, COUNT(*) AS total_fiados
    FROM fiado WHERE estado = 'pendiente'
  `)
  return { total_deuda: r.total_deuda, clientes_deuda: r.clientes_deuda, total_fiados: r.total_fiados }
}

// Fiados que llevan demasiado sin cobrarse. No hay "fecha de vencimiento" en una
// bodega: el fiado es informal, así que se mide por antigüedad desde que se dio.
function getFiadosAntiguos(dias = 15) {
  const limite = new Date()
  limite.setDate(limite.getDate() - dias)
  return sql.getAllSync(`
    SELECT f.id, f.saldo, f.fecha, f.concepto, c.nombre AS nombre_cliente
    FROM fiado f
    LEFT JOIN clientes c ON c.id = f.cliente_id
    WHERE f.estado = 'pendiente' AND f.fecha < ?
    ORDER BY f.fecha ASC
  `, limite.toISOString())
}

// ─── VENTAS ─────────────────────────────────────────────────────────
async function realizarVenta(items, montoRecibido, metodoPago = 'Efectivo', descuento = 0, tipoDescuento = 'ninguno', usuarioId = null, clienteId = null, esFiado = false, compradorNombre = null, compradorDniRuc = null) {
  const subtotalBruto = items.reduce((s, i) => s + i.subtotal, 0)
  let descuentoMonto = 0
  if (tipoDescuento === 'porcentaje') descuentoMonto = subtotalBruto * (descuento / 100)
  else if (tipoDescuento === 'monto') descuentoMonto = Math.min(descuento, subtotalBruto)
  const total = Math.max(subtotalBruto - descuentoMonto, 0)
  const vuelto = (!esFiado && metodoPago === 'Efectivo') ? montoRecibido - total : 0
  const fecha = new Date().toISOString()

  const cliente = clienteId ? sql.getFirstSync('SELECT * FROM clientes WHERE id = ?', clienteId) : null
  const nombreComprador = compradorNombre || cliente?.nombre || null
  const dniRucComprador = compradorDniRuc || cliente?.dni_ruc || null
  let ventaId

  // Todo en una transacción: si algo falla, no queda una venta a medias con el
  // stock ya descontado.
  sql.withTransactionSync(() => {
    const r = sql.runSync(
      'INSERT INTO ventas (total, subtotal_bruto, descuento, tipo_descuento, monto_recibido, vuelto, metodo_pago, usuario_id, cliente_id, es_fiado, comprador_nombre, comprador_dni_ruc, fecha) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      total, subtotalBruto, descuentoMonto, tipoDescuento, esFiado ? 0 : montoRecibido, vuelto,
      esFiado ? 'Fiado' : metodoPago, usuarioId, clienteId || null, esFiado ? 1 : 0,
      nombreComprador, dniRucComprador, fecha)
    ventaId = r.lastInsertRowId

    items.forEach(item => {
      sql.runSync(
        'INSERT INTO detalle_ventas (venta_id, producto_id, nombre_producto, precio_unitario, cantidad, subtotal, tipo_venta, unidad) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ventaId, item.id, item.nombre, item.precio, item.cantidad, item.subtotal, item.tipo_venta || 'unidad', item.unidad || 'unidad')
      sql.runSync('UPDATE productos SET stock = MAX(0, stock - ?) WHERE id = ?', parseFloat(item.cantidad), item.id)
    })

    if (esFiado && clienteId) {
      const concepto = items.map(i => i.tipo_venta === 'granel' ? `${i.nombre} ${i.cantidad}${i.unidad}` : `${i.nombre} x${i.cantidad}`).join(', ')
      insertarFiado({ clienteId, monto: total, concepto, usuarioId })
    }
  })

  return {
    ventaId, total, subtotalBruto, descuentoMonto, vuelto,
    montoRecibido: esFiado ? 0 : montoRecibido,
    metodoPago: esFiado ? 'Fiado' : metodoPago,
    fecha,
  }
}

function getHistorialVentas() {
  const ventas = sql.getAllSync(`
    SELECT v.*, u.nombre AS nombre_usuario, COALESCE(c.nombre, v.comprador_nombre) AS nombre_cliente
    FROM ventas v
    LEFT JOIN usuarios u ON u.id = v.usuario_id
    LEFT JOIN clientes c ON c.id = v.cliente_id
  `)
  const detalles = sql.getAllSync('SELECT * FROM detalle_ventas')

  const conItems = ventas.map(v => ({
    ...v,
    tipo: 'venta',
    es_fiado: !!v.es_fiado,
    nombre_usuario: v.nombre_usuario || '—',
    items: detalles.filter(d => d.venta_id === v.id),
  }))

  // Los abonos de fiado son ingresos reales del día en que se cobran, no del día
  // de la venta original al crédito — se listan aquí como entradas propias.
  const pagos = sql.getAllSync(`
    SELECT p.*, f.concepto AS concepto_fiado, c.nombre AS nombre_cliente, u.nombre AS nombre_usuario
    FROM pagos_fiado p
    LEFT JOIN fiado f ON f.id = p.fiado_id
    LEFT JOIN clientes c ON c.id = f.cliente_id
    LEFT JOIN usuarios u ON u.id = p.usuario_id
  `).map(p => ({
    id: `pago-${p.id}`,
    tipo: 'pago_fiado',
    total: p.monto,
    metodo_pago: p.metodo_pago || 'Efectivo',
    es_fiado: false,
    usuario_id: p.usuario_id,
    nombre_usuario: p.nombre_usuario || '—',
    nombre_cliente: p.nombre_cliente || null,
    fecha: p.fecha,
    items: [{ id: `pago-${p.id}`, nombre_producto: `Abono fiado: ${p.concepto_fiado || ''}`, cantidad: 1, precio_unitario: p.monto, subtotal: p.monto }],
  }))

  return [...conItems, ...pagos].sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
}

function getDetalleVenta(ventaId) {
  return sql.getAllSync('SELECT * FROM detalle_ventas WHERE venta_id = ?', ventaId)
}

function resumenEntre(desdeISO, hastaISO) {
  const filtroVentas = hastaISO ? 'fecha >= ? AND fecha < ?' : 'fecha >= ?'
  const args = hastaISO ? [desdeISO, hastaISO] : [desdeISO]

  const v = sql.getFirstSync(
    `SELECT COUNT(*) AS total_ventas, COALESCE(SUM(CASE WHEN es_fiado = 0 THEN total ELSE 0 END), 0) AS ingresos
     FROM ventas WHERE ${filtroVentas}`, ...args)
  const p = sql.getFirstSync(
    `SELECT COALESCE(SUM(monto), 0) AS abonos FROM pagos_fiado WHERE ${filtroVentas}`, ...args)

  return { total_ventas: v.total_ventas, ingresos: v.ingresos + p.abonos }
}

function getResumenHoy() {
  const inicio = new Date()
  inicio.setHours(0, 0, 0, 0)
  const fin = new Date(inicio)
  fin.setDate(fin.getDate() + 1)
  return resumenEntre(inicio.toISOString(), fin.toISOString())
}

function getResumenPeriodo(dias) {
  const desde = new Date()
  desde.setDate(desde.getDate() - dias)
  return resumenEntre(desde.toISOString(), null)
}

// Cierre de caja: lo que el dueño revisa en la noche para cuadrar el cajón.
// Separa por método porque solo el efectivo debería estar físicamente ahí.
function getCierreCaja() {
  const inicio = new Date()
  inicio.setHours(0, 0, 0, 0)
  const fin = new Date(inicio)
  fin.setDate(fin.getDate() + 1)
  const desde = inicio.toISOString()
  const hasta = fin.toISOString()

  const ventas = sql.getAllSync(
    `SELECT metodo_pago, COUNT(*) AS cantidad, COALESCE(SUM(total), 0) AS monto
     FROM ventas WHERE fecha >= ? AND fecha < ? GROUP BY metodo_pago`, desde, hasta)

  const abonos = sql.getAllSync(
    `SELECT metodo_pago, COUNT(*) AS cantidad, COALESCE(SUM(monto), 0) AS monto
     FROM pagos_fiado WHERE fecha >= ? AND fecha < ? GROUP BY metodo_pago`, desde, hasta)

  const porMetodo = {}
  const acumular = (metodo, cantidad, monto) => {
    if (!porMetodo[metodo]) porMetodo[metodo] = { metodo, cantidad: 0, monto: 0 }
    porMetodo[metodo].cantidad += cantidad
    porMetodo[metodo].monto += monto
  }
  ventas.forEach(v => acumular(v.metodo_pago, v.cantidad, v.monto))
  abonos.forEach(a => acumular(a.metodo_pago, a.cantidad, a.monto))

  // Lo fiado hoy no entró a la caja: se muestra aparte para no cuadrarlo con el cajón.
  const fiadoHoy = porMetodo.Fiado?.monto || 0
  delete porMetodo.Fiado

  const cobrado = Object.values(porMetodo)
  const efectivo = porMetodo.Efectivo?.monto || 0
  const digital = cobrado.filter(m => m.metodo !== 'Efectivo').reduce((s, m) => s + m.monto, 0)

  return {
    metodos: cobrado.sort((a, b) => b.monto - a.monto),
    efectivo,
    digital,
    fiado_otorgado: fiadoHoy,
    total_cobrado: efectivo + digital,
    total_ventas: ventas.reduce((s, v) => s + v.cantidad, 0),
  }
}

// Para exportar/compartir un respaldo — mantiene el mismo formato que antes
// para que los respaldos viejos y nuevos sean intercambiables.
function getBackupJSON() {
  return JSON.stringify({
    productos: sql.getAllSync('SELECT * FROM productos'),
    ventas: sql.getAllSync('SELECT * FROM ventas'),
    detalle_ventas: sql.getAllSync('SELECT * FROM detalle_ventas'),
    // Sin la columna password a propósito: este archivo sale del teléfono (Drive,
    // WhatsApp, carpeta compartida) y las contraseñas no deben viajar con él.
    // Al restaurar habrá que volver a definirlas.
    usuarios: sql.getAllSync('SELECT id, nombre, username, rol, activo, creado_en FROM usuarios'),
    clientes: sql.getAllSync('SELECT * FROM clientes'),
    fiado: sql.getAllSync('SELECT * FROM fiado'),
    pagos_fiado: sql.getAllSync('SELECT * FROM pagos_fiado'),
    categorias_custom: sql.getAllSync('SELECT * FROM categorias_custom'),
    config: getConfig(),
    setup_completado: isSetupCompletado(),
  }, null, 2)
}

// Solo se restauran los datos del negocio. Lo que es propio del teléfono
// (carpeta de respaldo elegida, lista de copias locales, marca de migración)
// se deja intacto: pertenece a este dispositivo, no al respaldo.
const CLAVES_CONFIG_NEGOCIO = [
  'negocio_nombre', 'negocio_ruc', 'negocio_direccion', 'negocio_telefono',
  'ticket_mensaje', 'umbral_stock_bajo', 'respaldo_frecuencia',
]

export function validarBackup(datos) {
  if (!datos || typeof datos !== 'object') return { valido: false, error: 'El archivo no tiene el formato esperado.' }
  if (!Array.isArray(datos.productos) || !Array.isArray(datos.ventas)) {
    return { valido: false, error: 'Esto no parece un respaldo de POS Bodega.' }
  }
  return {
    valido: true,
    resumen: {
      productos: datos.productos.length,
      ventas: datos.ventas.length,
      clientes: (datos.clientes || []).length,
      fiados: (datos.fiado || []).filter(f => f.estado === 'pendiente').length,
      negocio: datos.config?.negocio_nombre || null,
    },
  }
}

// Reemplaza los datos del negocio por los del respaldo. Los usuarios NO se
// tocan a propósito: el respaldo no lleva contraseñas (no deben salir del
// teléfono), así que restaurarlos dejaría a todos sin poder entrar. Las cuentas
// de este dispositivo siguen siendo las válidas.
async function restaurarBackup(datos) {
  const { valido, error } = validarBackup(datos)
  if (!valido) return { success: false, error }

  try {
    sql.withTransactionSync(() => {
      ;['detalle_ventas', 'ventas', 'pagos_fiado', 'fiado', 'productos', 'clientes', 'categorias_custom']
        .forEach(tabla => sql.runSync(`DELETE FROM ${tabla}`))

      ;(datos.productos || []).forEach(p => sql.runSync(
        'INSERT INTO productos (id, nombre, precio, stock, codigo, categoria, tipo_venta, unidad, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        p.id, p.nombre, p.precio, p.stock, p.codigo ?? null, p.categoria ?? 'General', p.tipo_venta || 'unidad', p.unidad || 'unidad', p.creado_en || new Date().toISOString()))

      ;(datos.clientes || []).forEach(c => sql.runSync(
        'INSERT INTO clientes (id, nombre, telefono, referencia, dni_ruc, creado_en) VALUES (?, ?, ?, ?, ?, ?)',
        c.id, c.nombre, c.telefono ?? null, c.referencia ?? null, c.dni_ruc ?? null, c.creado_en || new Date().toISOString()))

      ;(datos.ventas || []).forEach(v => sql.runSync(
        'INSERT INTO ventas (id, total, subtotal_bruto, descuento, tipo_descuento, monto_recibido, vuelto, metodo_pago, usuario_id, cliente_id, es_fiado, comprador_nombre, comprador_dni_ruc, fecha) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        v.id, v.total, v.subtotal_bruto ?? v.total, v.descuento ?? 0, v.tipo_descuento ?? 'ninguno',
        v.monto_recibido ?? 0, v.vuelto ?? 0, v.metodo_pago, v.usuario_id ?? null, v.cliente_id ?? null,
        v.es_fiado ? 1 : 0, v.comprador_nombre ?? null, v.comprador_dni_ruc ?? null, v.fecha))

      ;(datos.detalle_ventas || []).forEach(d => sql.runSync(
        'INSERT INTO detalle_ventas (id, venta_id, producto_id, nombre_producto, precio_unitario, cantidad, subtotal, tipo_venta, unidad) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        d.id, d.venta_id, d.producto_id ?? null, d.nombre_producto, d.precio_unitario, d.cantidad, d.subtotal, d.tipo_venta || 'unidad', d.unidad || 'unidad'))

      ;(datos.fiado || []).forEach(f => sql.runSync(
        'INSERT INTO fiado (id, cliente_id, monto_original, saldo, concepto, usuario_id, estado, fecha) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        f.id, f.cliente_id, f.monto_original, f.saldo, f.concepto ?? null, f.usuario_id ?? null, f.estado || 'pendiente', f.fecha))

      ;(datos.pagos_fiado || []).forEach(p => sql.runSync(
        'INSERT INTO pagos_fiado (id, fiado_id, monto, metodo_pago, usuario_id, fecha) VALUES (?, ?, ?, ?, ?, ?)',
        p.id, p.fiado_id, p.monto, p.metodo_pago || 'Efectivo', p.usuario_id ?? null, p.fecha))

      ;(datos.categorias_custom || []).forEach(c => sql.runSync(
        'INSERT INTO categorias_custom (id, icon) VALUES (?, ?)', c.id, c.icon))

      CLAVES_CONFIG_NEGOCIO.forEach(clave => {
        if (datos.config?.[clave] !== undefined) escribirConfig(clave, datos.config[clave])
      })
    })
  } catch (e) {
    return { success: false, error: e?.message || String(e) }
  }

  return { success: true }
}

export default {
  initDB,
  isSetupCompletado, completarSetup,
  login, getUsuarios, addUsuario, cambiarPassword, setUsuarioActivo,
  getProductos, addProducto, updateProducto, deleteProducto, getProductosBajoStock,
  addProductosLote, asignarCodigo, ingresarMercaderia, getMasVendidos,
  getCategoriasCustom, addCategoriaCustom,
  getConfig, updateConfig, getBackupJSON, restaurarBackup, validarBackup,
  getClientes, addCliente, updateCliente, buscarCliente,
  getFiadoCliente, addFiado, pagarFiado, getResumenFiado, getFiadosAntiguos,
  realizarVenta, getHistorialVentas, getDetalleVenta, getResumenHoy, getResumenPeriodo, getCierreCaja,
}
