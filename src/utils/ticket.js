import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import { File, Paths } from 'expo-file-system'

const fmt = (n) => `S/ ${Number(n).toFixed(2)}`

function generarTicketHTML(venta, config = {}) {
  // La venta puede venir recién cobrada (camelCase, desde POS) o desde el
  // historial guardado (snake_case) — se normalizan los dos formatos aquí.
  const metodoPago = venta.metodoPago || venta.metodo_pago
  const nombreComprador = venta.nombreComprador || venta.comprador_nombre || venta.nombre_cliente
  const numero = venta.ventaId || venta.id
  const montoRecibido = venta.montoRecibido ?? venta.monto_recibido
  const vuelto = venta.vuelto

  const fecha = new Date(venta.fecha)
  const fechaStr = fecha.toLocaleDateString('es-PE')
  const horaStr = fecha.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })

  const filas = (venta.items || []).map(item => `
    <tr>
      <td style="padding:8px 0;font-size:18px;">${item.nombre_producto || item.nombre}<br/>
        <span style="color:#666;font-size:14px;">${item.cantidad} x ${fmt(item.precio_unitario || item.precio)}</span>
      </td>
      <td style="padding:8px 0;text-align:right;font-weight:700;font-size:18px;">${fmt(item.subtotal)}</td>
    </tr>
  `).join('')

  return `
  <html>
    <body style="font-family: Courier, monospace; padding: 28px; color:#111;">
      <div style="text-align:center;margin-bottom:14px;">
        <div style="font-size:26px;font-weight:900;text-transform:uppercase;">${config.negocio_nombre || 'MI BODEGA'}</div>
        ${config.negocio_ruc ? `<div style="font-size:16px;">RUC/DNI: ${config.negocio_ruc}</div>` : ''}
        ${config.negocio_direccion ? `<div style="font-size:16px;">${config.negocio_direccion}</div>` : ''}
        ${config.negocio_telefono ? `<div style="font-size:16px;">Tel: ${config.negocio_telefono}</div>` : ''}
      </div>
      <hr/>
      <div style="font-size:17px;line-height:1.6;">
        <div>VENTA N° ${numero}</div>
        <div>FECHA: ${fechaStr} ${horaStr}</div>
        <div>PAGO: ${metodoPago}</div>
        ${nombreComprador ? `<div>CLIENTE: ${nombreComprador}</div>` : ''}
      </div>
      <hr/>
      <table style="width:100%;border-collapse:collapse;">${filas}</table>
      <hr/>
      <div style="display:flex;justify-content:space-between;font-size:26px;font-weight:900;margin:8px 0;">
        <span>TOTAL</span><span>${fmt(venta.total)}</span>
      </div>
      ${metodoPago === 'Efectivo' ? `
        <div style="display:flex;justify-content:space-between;font-size:17px;margin-top:6px;">
          <span>Recibido</span><span>${fmt(montoRecibido)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:17px;font-weight:700;">
          <span>Vuelto</span><span>${fmt(vuelto)}</span>
        </div>` : ''}
      <hr/>
      <div style="text-align:center;font-size:17px;margin-top:12px;">
        ${config.ticket_mensaje || '¡Gracias por su compra!'}
      </div>
      <div style="text-align:center;font-size:13px;color:#777;margin-top:10px;">
        Documento interno de control de venta — no es comprobante electrónico ante SUNAT
      </div>
    </body>
  </html>`
}

function nombreArchivoTicket(venta, config) {
  const numero = venta.ventaId || venta.id || 'venta'
  const fecha = new Date(venta.fecha || Date.now()).toISOString().slice(0, 10)
  const negocio = (config?.negocio_nombre || 'POS-Bodega').replace(/[^a-zA-Z0-9]+/g, '-')
  return `Ticket-${negocio}-${numero}-${fecha}.pdf`
}

export async function compartirTicket(venta, config) {
  const html = generarTicketHTML(venta, config)
  const { uri } = await Print.printToFileAsync({ html, width: 430, height: 792 })

  // printToFileAsync guarda con un nombre aleatorio (ej. 3D20638F-....pdf) —
  // se copia a un archivo con nombre legible antes de compartirlo.
  let uriParaCompartir = uri
  try {
    const origen = new File(uri)
    const destino = new File(Paths.cache, nombreArchivoTicket(venta, config))
    origen.copySync(destino, { overwrite: true })
    uriParaCompartir = destino.uri
  } catch (e) {
    // Si falla la copia, se comparte igual con el nombre aleatorio original.
  }

  const disponible = await Sharing.isAvailableAsync()
  if (disponible) {
    await Sharing.shareAsync(uriParaCompartir, { mimeType: 'application/pdf', dialogTitle: 'Compartir comprobante' })
  }
  return uriParaCompartir
}
