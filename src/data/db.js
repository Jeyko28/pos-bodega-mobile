import * as SQLite from 'expo-sqlite'
import AsyncStorage from '@react-native-async-storage/async-storage'

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

// ─── SETUP ──────────────────────────────────────────────────────────
function isSetupCompletado() { return leerConfig('setup_completado', false) === true }

async function completarSetup({ negocioNombre, adminNombre, adminUsername, adminPassword }) {
  const creadoEn = new Date().toISOString()
  const r = sql.runSync(
    'INSERT INTO usuarios (nombre, username, password, rol, activo, creado_en) VALUES (?, ?, ?, ?, 1, ?)',
    adminNombre, adminUsername, adminPassword, 'admin', creadoEn)
  escribirConfig('negocio_nombre', negocioNombre)
  escribirConfig('setup_completado', true)
  return {
    success: true,
    usuario: { id: r.lastInsertRowId, nombre: adminNombre, username: adminUsername, rol: 'admin', activo: true, creado_en: creadoEn },
  }
}

// ─── AUTH / USUARIOS ────────────────────────────────────────────────
function login(username, password) {
  const u = sql.getFirstSync(
    'SELECT id, nombre, username, rol, activo, creado_en FROM usuarios WHERE username = ? AND password = ? AND activo = 1',
    username, password)
  if (!u) return { success: false, error: 'Usuario o contraseña incorrectos' }
  return { success: true, usuario: { ...u, activo: true } }
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
    nombre, username, password, rol || 'cajero', creadoEn)
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

function buscarCliente(query) {
  const q = `%${query.toLowerCase()}%`
  return sql.getAllSync(`${SQL_CLIENTES} WHERE LOWER(c.nombre) LIKE ? OR c.telefono LIKE ?`, q, q)
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
    usuarios: sql.getAllSync('SELECT * FROM usuarios'),
    clientes: sql.getAllSync('SELECT * FROM clientes'),
    fiado: sql.getAllSync('SELECT * FROM fiado'),
    pagos_fiado: sql.getAllSync('SELECT * FROM pagos_fiado'),
    categorias_custom: sql.getAllSync('SELECT * FROM categorias_custom'),
    config: getConfig(),
    setup_completado: isSetupCompletado(),
  }, null, 2)
}

export default {
  initDB,
  isSetupCompletado, completarSetup,
  login, getUsuarios, addUsuario,
  getProductos, addProducto, updateProducto, deleteProducto, getProductosBajoStock,
  getCategoriasCustom, addCategoriaCustom,
  getConfig, updateConfig, getBackupJSON,
  getClientes, addCliente, buscarCliente,
  getFiadoCliente, addFiado, pagarFiado, getResumenFiado,
  realizarVenta, getHistorialVentas, getDetalleVenta, getResumenHoy, getResumenPeriodo, getCierreCaja,
}
