const { v4: uuidv4 } = require('uuid');
const mailer = require('./mailer');
const company = require('../config/company');

const repository = require('../models/repository');

let notifications = [];

function bindStore(store) {
  if (store.notifications) notifications = store.notifications;
}

function isEnabled() {
  return process.env.NOTIFICATIONS_ENABLED !== 'false';
}

function formatCLP(amount) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(amount || 0);
}

function trackUrl(request) {
  return `${company.appUrl}/seguimiento/${request.guardianToken}`;
}

function whatsappUrl(phone, message) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 9) return null;
  const num = digits.startsWith('56') ? digits : `56${digits.replace(/^0/, '')}`;
  return `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
}

const TEMPLATES = {
  'payment.approved': (ctx) => ({
    subject: `Pago confirmado — ${ctx.request.serviceName}`,
    text: `Hola ${ctx.client?.name || 'cliente'},\n\nTu pago de ${formatCLP(ctx.amount)} por ${ctx.request.serviceName} fue confirmado.\n\nDirección: ${ctx.request.address}\nSeguimiento: ${trackUrl(ctx.request)}\n\nEn otro correo te enviamos el comprobante de pago y, cuando corresponda, la boleta/factura electrónica.`
  }),
  'payment.voucher': (ctx) => ({
    subject: `Comprobante de pago ${ctx.voucherCode || ''} — Fundez`.trim(),
    text: `Hola ${ctx.client?.name || 'cliente'},\n\nAdjuntamos tu comprobante de pago por ${formatCLP(ctx.amount)}.\nCódigo: ${ctx.voucherCode}\n\nVer comprobante: ${ctx.voucherUrl}\n\nLos documentos tributarios que correspondan se entregan por separado al correo de facturación.\n\nFundez`,
    html: `
      <p>Hola <strong>${ctx.client?.name || 'cliente'}</strong>,</p>
      <p>Tu <strong>comprobante de pago</strong> está listo.</p>
      <p style="font-size:20px;font-weight:700;color:#059669;margin:16px 0">${formatCLP(ctx.amount)}</p>
      <p>Código: <code>${ctx.voucherCode || '—'}</code></p>
      <p><a href="${ctx.voucherUrl}" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px;font-weight:600">Ver comprobante</a></p>
      <p style="color:#6B7280;font-size:13px;margin-top:20px">Este acuse de recibo no reemplaza los documentos tributarios que correspondan a Fundez y al socio prestador.</p>
    `
  }),
  'payment.transfer_pending': (ctx) => ({
    subject: `Transferencia pendiente — ${ctx.request.serviceName}`,
    text: `Hola ${ctx.client.name},\n\nRegistramos tu solicitud de transferencia por ${formatCLP(ctx.amount)}.\nReferencia: FUNDEZ-${ctx.request.id.slice(0, 8).toUpperCase()}\n\nCuando confirmemos el abono, activaremos la búsqueda de técnico.`
  }),
  'service.searching': (ctx) => ({
    subject: `Nueva solicitud — ${ctx.request.serviceName}`,
    text: `Hola ${ctx.provider.name},\n\nHay una nueva solicitud de ${ctx.request.serviceName} en ${ctx.request.address}.\nMonto visita: ${formatCLP(ctx.amount)}.\n\nIngresa a tu panel Fundez para aceptarla.`
  }),
  'service.assigned': (ctx) => ({
    subject: `Socio asignado — ${ctx.request.serviceName}`,
    text: `Hola ${ctx.client.name},\n\n${ctx.provider.name} fue asignado a tu servicio de ${ctx.request.serviceName}.\n\nSeguimiento en vivo: ${trackUrl(ctx.request)}`
  }),
  'technician.assigned': (ctx) => ({
    subject: `Técnico asignado — ${ctx.request.serviceName}`,
    text: `Hola ${ctx.client.name},\n\nEl técnico ${ctx.request.technicianName} fue asignado a tu visita.\nTeléfono: ${ctx.request.technicianPhone || 'disponible en la app'}\n\nSeguimiento: ${trackUrl(ctx.request)}`
  }),
  'technician.en_route': (ctx) => ({
    subject: `Tu técnico va en camino`,
    text: `Hola ${ctx.client.name},\n\n${ctx.request.technicianName || 'Tu técnico'} está en camino a ${ctx.request.address}.\n\nSigue el servicio: ${trackUrl(ctx.request)}`
  }),
  'technician.arrived': (ctx) => ({
    subject: `Técnico en tu domicilio`,
    text: `Hola ${ctx.client.name},\n\n${ctx.request.technicianName || 'El técnico'} llegó a tu domicilio para el servicio de ${ctx.request.serviceName}.`
  }),
  'budget.sent': (ctx) => ({
    subject: `Presupuesto pendiente — ${ctx.request.serviceName}`,
    text: `Hola ${ctx.client.name},\n\nEl técnico envió un presupuesto de ${formatCLP(ctx.amount)} para tu servicio.\n\nIngresa a Fundez para aprobar o rechazar: ${trackUrl(ctx.request)}`
  }),
  'activity.change_proposed': (ctx) => ({
    subject: `Cambio de servicio propuesto — ${ctx.request.serviceName}`,
    text: `Hola ${ctx.client?.name || 'cliente'},\n\nEl técnico indica que el trabajo es distinto.\nAntes: ${ctx.fromActivityName || '—'}\nAhora: ${ctx.activityName || '—'}\nNuevo valor: ${formatCLP(ctx.amount)}\n\nDebes aprobar o rechazar en la app:\n${trackUrl(ctx.request)}\n\nFundez`
  }),
  'service.completed': (ctx) => ({
    subject: `Servicio completado — ${ctx.request.serviceName}`,
    text: `Hola ${ctx.client.name},\n\nTu servicio de ${ctx.request.serviceName} fue completado.\n\nGracias por usar Fundez.`
  }),
  'payout.scheduled': (ctx) => ({
    subject: `Pago programado para el ${ctx.payDateLabel} — ${formatCLP(ctx.amount)}`,
    text: `Hola ${ctx.provider?.name || 'socio'},\n\nLa liquidación de ${ctx.request.serviceName} quedó programada.\n\nMonto a recibir: ${formatCLP(ctx.amount)}\nFecha de pago: ${ctx.payDateLabel}\nCorte aplicado: miércoles 12:00 (hora de Chile).\n\nLos trabajos cerrados después del corte pasan al viernes de la semana siguiente.\n\nRevisa el detalle y tu paquete de facturación en el panel Fundez.`
  }),
  'service.job_voucher': (ctx) => ({
    subject: `Voucher final del trabajo ${ctx.voucherCode} — Fundez`,
    text: `El trabajo de ${ctx.request.serviceName} fue cerrado.\n\nTotal final: ${formatCLP(ctx.amount)}\nVoucher: ${ctx.voucherUrl}\n\nEste comprobante no reemplaza los documentos tributarios correspondientes.`
  }),
  'dte.issued': (ctx) => {
    const link = `${company.appUrl}${ctx.pdfUrl}`;
    const kind = ctx.docKind || 'documento';
    return {
      subject: `Tu ${kind} electrónica N° ${ctx.folio} — Fundez`,
      text: `Hola ${ctx.client?.name || 'cliente'},\n\nEmitimos tu ${kind} electrónica N° ${ctx.folio} por ${formatCLP(ctx.amount)}.\n\nDescárgala: ${link}\n\nSolicitud: ${ctx.request.id}\n\nFundez`,
      html: `
        <p>Hola <strong>${ctx.client?.name || 'cliente'}</strong>,</p>
        <p>Tu <strong>${kind} electrónica</strong> N° <strong>${ctx.folio}</strong> está lista.</p>
        <p style="font-size:18px;font-weight:700;margin:16px 0">${formatCLP(ctx.amount)}</p>
        <p><a href="${link}" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px;font-weight:600">Descargar documento</a></p>
        <p style="color:#6B7280;font-size:12px;margin-top:16px">Documento tributario electrónico (SII). Si usas modo demo, el PDF es de demostración hasta configurar LibreDTE.</p>
      `
    };
  }
};

function persistNotification(record) {
  notifications.unshift(record);
  if (notifications.length > 500) notifications.pop();
  repository.persist(() => repository.saveNotification(record), `notif ${record.id}`);
}

async function deliverEmail({ to, subject, text, html, meta }) {
  try {
    const result = await mailer.sendMail({ to, subject, text, html });
    return {
      status: result.error ? 'failed' : (result.skipped ? 'skipped' : 'sent'),
      error: result.error || null,
      demo: Boolean(result.demo)
    };
  } catch (err) {
    return { status: 'failed', error: err.message };
  }
}

async function notify({ event, to, phone, subject, text, html, requestId, userId, meta = {} }) {
  if (!isEnabled()) return null;

  const record = {
    id: `ntf-${uuidv4().slice(0, 12)}`,
    event,
    channel: 'email',
    status: 'queued',
    recipient: to || null,
    subject,
    body: text,
    meta,
    requestId: requestId || null,
    userId: userId || null,
    error: null,
    createdAt: new Date().toISOString()
  };

  if (to) {
    const emailResult = await deliverEmail({ to, subject, text, html, meta });
    record.status = emailResult.status;
    record.error = emailResult.error;
    if (emailResult.demo) record.meta = { ...meta, demoMail: true };
  } else {
    record.status = 'skipped';
    record.error = 'sin email';
  }

  persistNotification(record);

  if (phone) {
    const wa = whatsappUrl(phone, text);
    if (wa) {
      persistNotification({
        id: `ntf-${uuidv4().slice(0, 12)}`,
        event,
        channel: 'whatsapp',
        status: 'queued',
        recipient: phone,
        subject: null,
        body: text,
        meta: { ...meta, whatsappUrl: wa },
        requestId: requestId || null,
        userId: userId || null,
        error: null,
        createdAt: new Date().toISOString()
      });
    }
  }

  return record;
}

async function sendEvent(event, ctx) {
  const tpl = TEMPLATES[event];
  if (!tpl) return null;
  const { subject, text, html } = tpl(ctx);
  const client = ctx.client;
  return notify({
    event,
    to: ctx.to || client?.email,
    phone: client?.phone || ctx.phone,
    subject,
    text,
    html,
    requestId: ctx.request?.id,
    userId: client?.id,
    meta: ctx.meta || {}
  });
}

function getRecent(limit = 50) {
  return notifications.slice(0, limit);
}

function getStats() {
  const recent = notifications.slice(0, 200);
  return {
    total: notifications.length,
    sent: recent.filter((n) => n.status === 'sent').length,
    failed: recent.filter((n) => n.status === 'failed').length,
    emailConfigured: mailer.isConfigured()
  };
}

module.exports = {
  bindStore,
  notify,
  sendEvent,
  getRecent,
  getStats,
  whatsappUrl,
  isEnabled
};
