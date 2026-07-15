/**
 * Comprobante de pago (voucher) — no es un DTE/SII.
 * Se emite al confirmar el cobro; la boleta/factura electrónica va aparte (lib/dte).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const company = require('../config/company');

const VOUCHER_DIR = path.join(__dirname, '../data/vouchers');

function ensureDir() {
  if (!fs.existsSync(VOUCHER_DIR)) fs.mkdirSync(VOUCHER_DIR, { recursive: true });
}

function formatCLP(amount) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0
  }).format(amount || 0);
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString('es-CL', { dateStyle: 'long', timeStyle: 'short' });
  } catch (_) {
    return iso;
  }
}

function buildHtml(voucher) {
  const methodLabel = ({
    card: 'Tarjeta',
    transfer: 'Transferencia',
    transbank: 'Webpay / Transbank',
    mercadopago: 'Mercado Pago',
    paypal: 'PayPal',
    demo: 'Demo'
  })[voucher.paymentMethod] || (voucher.paymentMethod || 'Pago en línea');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Comprobante de pago ${voucher.code}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 640px; margin: 2rem auto; color: #111827; padding: 0 1rem; }
    .card { border: 1px solid #E6E9EF; border-radius: 16px; overflow: hidden; }
    .head { background: #2563EB; color: #fff; padding: 1.25rem 1.5rem; }
    .body { padding: 1.5rem; }
    .row { display: flex; justify-content: space-between; gap: 1rem; padding: .55rem 0; border-bottom: 1px solid #F1F5F9; font-size: 14px; }
    .row:last-child { border-bottom: 0; }
    .muted { color: #6B7280; font-size: 12px; }
    .total { font-size: 1.35rem; font-weight: 700; color: #059669; }
    .note { margin-top: 1.25rem; background: #F8FAFC; border-radius: 12px; padding: .9rem 1rem; font-size: 12px; color: #475569; }
  </style>
</head>
<body>
  <div class="card">
    <div class="head">
      <p style="margin:0;opacity:.85;font-size:12px;letter-spacing:.04em;text-transform:uppercase">Comprobante de pago</p>
      <h1 style="margin:.35rem 0 0;font-size:1.35rem">${company.name}</h1>
      <p style="margin:.35rem 0 0;font-size:13px;opacity:.9">RUT ${company.rut}</p>
    </div>
    <div class="body">
      <p class="muted">Código ${voucher.code} · ${formatDate(voucher.issuedAt)}</p>
      <div class="row"><span>Cliente</span><strong>${voucher.clientName}</strong></div>
      <div class="row"><span>Email</span><span>${voucher.clientEmail || '—'}</span></div>
      <div class="row"><span>Servicio</span><span>${voucher.serviceName}</span></div>
      <div class="row"><span>Dirección</span><span>${voucher.address}</span></div>
      <div class="row"><span>Método</span><span>${methodLabel}</span></div>
      <div class="row"><span>ID pago</span><span>${voucher.paymentId || '—'}</span></div>
      <div class="row"><span>Solicitud</span><span>${voucher.requestId}</span></div>
      <p class="total" style="margin:1.25rem 0 .25rem">Total pagado: ${formatCLP(voucher.amount)}</p>
      <div class="note">
        Este es un <strong>comprobante de pago</strong> de Fundez (acuse de recibo).
        La <strong>boleta o factura electrónica</strong> ante el SII se envía aparte al correo de facturación
        cuando el emisor tributario esté configurado (<code>DTE_PROVIDER</code>).
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Genera y persiste el voucher de un pago aprobado.
 * @returns {{ voucher: object } | { error: string }}
 */
function issuePaymentVoucher({ request, client, amount }) {
  if (!request) return { error: 'Solicitud no encontrada' };
  const paid = Math.round(amount || request.visitPricePaid || request.amountDue || 0);
  if (paid <= 0) return { error: 'Monto inválido para comprobante' };

  if (Array.isArray(request.vouchers)) {
    const existing = request.vouchers.find((v) => v.phase === 'payment');
    if (existing) return { voucher: existing, existing: true };
  }

  ensureDir();
  const id = `vch-${uuidv4().slice(0, 12)}`;
  const code = `FUNDEZ-${String(request.id).slice(0, 8).toUpperCase()}`;
  const issuedAt = new Date().toISOString();
  const voucher = {
    id,
    code,
    phase: 'payment',
    requestId: request.id,
    amount: paid,
    currency: 'CLP',
    clientName: client?.name || request.clientName || 'Cliente',
    clientEmail: client?.email || request.billingSnapshot?.invoiceEmail || null,
    serviceName: request.serviceName,
    address: request.address,
    paymentMethod: request.paymentMethod || request.paymentGateway || null,
    paymentId: request.paymentId || null,
    issuedAt,
    url: `/documentos/comprobantes/${id}`,
    status: 'issued'
  };

  fs.writeFileSync(path.join(VOUCHER_DIR, `${id}.html`), buildHtml(voucher), 'utf8');
  return { voucher };
}

function getVoucherFilePath(voucherId) {
  return path.join(VOUCHER_DIR, `${voucherId}.html`);
}

module.exports = {
  issuePaymentVoucher,
  getVoucherFilePath,
  VOUCHER_DIR,
  buildHtml
};
