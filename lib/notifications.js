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
  'service.no_provider': (ctx) => ({
    subject: `Aún no encontramos un socio — ${ctx.request.serviceName}`,
    text: `Hola ${ctx.client?.name || 'cliente'},\n\nAland IA te informa que todavía no hemos encontrado un socio para realizar tu servicio de ${ctx.request.serviceName}.\n\nPuedes elegir:\n1. Solicitar la devolución del dinero, que quedará programada para el siguiente día hábil.\n2. Seguir intentando encontrar un socio.\n\nElegir devolución: ${ctx.refundUrl}\nSeguir intentando: ${ctx.continueUrl}\n\nTambién puedes elegir desde la app de Fundez.`,
    html: `
      <p>Hola <strong>${ctx.client?.name || 'cliente'}</strong>,</p>
      <p><strong>Aland IA</strong> te informa que todavía no hemos encontrado un socio para realizar tu servicio de <strong>${ctx.request.serviceName}</strong>.</p>
      <p>Puedes solicitar la devolución, que quedará programada para el siguiente día hábil, o pedirnos que sigamos intentando.</p>
      <p style="margin:20px 0">
        <a href="${ctx.refundUrl}" style="display:inline-block;background:#DC2626;color:#fff;text-decoration:none;padding:11px 16px;border-radius:10px;font-weight:600;margin:0 8px 8px 0">Solicitar devolución</a>
        <a href="${ctx.continueUrl}" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;padding:11px 16px;border-radius:10px;font-weight:600">Seguir intentando</a>
      </p>
      <p style="color:#6B7280;font-size:13px">También puedes elegir desde la app de Fundez.</p>
    `
  }),
  'service.assigned': (ctx) => ({
    subject: `Socio asignado — ${ctx.request.serviceName}`,
    text: `Hola ${ctx.client.name},\n\n${ctx.provider.name} fue asignado a tu servicio de ${ctx.request.serviceName}.\n\nSeguimiento en vivo: ${trackUrl(ctx.request)}`
  }),
  'provider.job_assigned': (ctx) => ({
    subject: `Trabajo asignado — ${ctx.request.serviceName}`,
    text: `Hola ${ctx.provider?.name || 'socio'},\n\nTe asignaron una solicitud de ${ctx.request.serviceName}.\nCliente: ${ctx.client?.name || ctx.request.clientName}\nDirección: ${ctx.request.address}\n${ctx.request.technicianName ? `Técnico: ${ctx.request.technicianName}\n` : ''}Ingresa a tu panel Fundez para gestionarla.`
  }),
  'technician.job_assigned': (ctx) => ({
    subject: `Te asignaron un trabajo — ${ctx.request.serviceName}`,
    text: `Hola ${ctx.request.technicianName || 'técnico'},\n\nTe asignaron una visita de ${ctx.request.serviceName}.\nDirección: ${ctx.request.address}\nCliente: ${ctx.client?.name || ctx.request.clientName}\n\nRevisa el detalle en tu panel Fundez.`
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
  'technician.on_site': (ctx) => ({
    subject: `Técnico en sitio — ${ctx.request.serviceName}`,
    text: `Hola ${ctx.client?.name || 'cliente'},\n\n${ctx.request.technicianName || 'El técnico'} ya está en tu domicilio e inicia el diagnóstico de ${ctx.request.serviceName}.\n\nSeguimiento: ${trackUrl(ctx.request)}`
  }),
  'budget.sent': (ctx) => ({
    subject: `Presupuesto pendiente — ${ctx.request.serviceName}`,
    text: `Hola ${ctx.client.name},\n\nEl técnico envió un presupuesto de ${formatCLP(ctx.amount)} para tu servicio.\n\nIngresa a Fundez para aprobar o rechazar: ${trackUrl(ctx.request)}`
  }),
  'budget.approved': (ctx) => ({
    subject: `Presupuesto aprobado — ${ctx.request.serviceName}`,
    text: `Hola ${ctx.provider?.name || ctx.request.technicianName || 'equipo'},\n\nEl cliente aprobó el presupuesto de ${formatCLP(ctx.amount)} para ${ctx.request.serviceName}.\n${ctx.pendingPayment ? 'Queda pendiente el pago del ajuste en la app.\n' : 'Puedes continuar el trabajo.\n'}Dirección: ${ctx.request.address}`
  }),
  'budget.rejected': (ctx) => ({
    subject: `Presupuesto rechazado — ${ctx.request.serviceName}`,
    text: `Hola ${ctx.provider?.name || ctx.request.technicianName || 'equipo'},\n\nEl cliente rechazó el presupuesto de ${formatCLP(ctx.amount)} para ${ctx.request.serviceName}. La visita quedó cerrada.\nDirección: ${ctx.request.address}`
  }),
  'budget.rejected_client': (ctx) => ({
    subject: `Presupuesto rechazado — ${ctx.request.serviceName}`,
    text: `Hola ${ctx.client?.name || 'cliente'},\n\nRegistramos el rechazo del presupuesto de ${formatCLP(ctx.amount)} para ${ctx.request.serviceName}. La visita quedó finalizada.\n\nSi necesitas otro servicio, puedes solicitarlo desde la app Fundez.`
  }),
  'activity.change_proposed': (ctx) => ({
    subject: `Cambio de servicio propuesto — ${ctx.request.serviceName}`,
    text: `Hola ${ctx.client?.name || 'cliente'},\n\nEl técnico indica que el trabajo es distinto.\nAntes: ${ctx.fromActivityName || '—'}\nAhora: ${ctx.activityName || '—'}\nNuevo valor: ${formatCLP(ctx.amount)}\n\nDebes aprobar o rechazar en la app:\n${trackUrl(ctx.request)}\n\nFundez`
  }),
  'activity.change_resolved': (ctx) => ({
    subject: `Cambio de servicio ${ctx.approved ? 'aprobado' : 'rechazado'} — ${ctx.request.serviceName}`,
    text: `Hola ${ctx.provider?.name || ctx.request.technicianName || 'equipo'},\n\nEl cliente ${ctx.approved ? 'aprobó' : 'rechazó'} el cambio de servicio.\nAntes: ${ctx.fromActivityName || '—'}\nAhora: ${ctx.activityName || '—'}\n${ctx.approved && ctx.pendingPayment ? 'Queda pendiente el pago del ajuste.\n' : ctx.approved ? 'Puedes continuar con el trabajo actualizado.\n' : 'Mantén el servicio original acordado.\n'}Dirección: ${ctx.request.address}`
  }),
  'payment.additional_approved': (ctx) => ({
    subject: `Pago de ajuste confirmado — ${ctx.request.serviceName}`,
    text: `Hola ${ctx.client?.name || 'cliente'},\n\nConfirmamos tu pago de ajuste de ${formatCLP(ctx.amount)} por ${ctx.request.serviceName}.\nMotivo: ${ctx.description || 'Ajuste de servicio'}\n\nSeguimiento: ${trackUrl(ctx.request)}`
  }),
  'payment.additional_provider': (ctx) => ({
    subject: `Cliente pagó el ajuste — ${ctx.request.serviceName}`,
    text: `Hola ${ctx.provider?.name || ctx.request.technicianName || 'equipo'},\n\nEl cliente pagó el ajuste de ${formatCLP(ctx.amount)} (${ctx.description || 'ajuste'}).\nPuedes continuar el trabajo de ${ctx.request.serviceName}.\nDirección: ${ctx.request.address}`
  }),
  'material.added': (ctx) => ({
    subject: `Material registrado — ${ctx.request.serviceName}`,
    text: `Hola ${ctx.client?.name || 'cliente'},\n\nSe registró un material en tu servicio de ${ctx.request.serviceName}:\n${ctx.description || 'Material'}: ${formatCLP(ctx.amount)}\n\nSeguimiento: ${trackUrl(ctx.request)}`
  }),
  'service.cancelled_refund': (ctx) => ({
    subject: `Devolución solicitada — ${ctx.request.serviceName}`,
    text: `Hola ${ctx.client?.name || 'cliente'},\n\nConfirmamos tu solicitud de devolución por ${ctx.request.serviceName}.\nMonto: ${formatCLP(ctx.amount)}\nFecha comprometida (día hábil): ${ctx.refundDate || 'próximo día hábil'}\n\nAdministración procesará el abono al mismo medio de pago. Te avisaremos cuando quede liquidada.`
  }),
  'service.keep_searching': (ctx) => ({
    subject: `Seguimos buscando socio — ${ctx.request.serviceName}`,
    text: `Hola ${ctx.client?.name || 'cliente'},\n\nRecibimos tu elección: seguiremos buscando un socio para ${ctx.request.serviceName}.\nTe avisaremos apenas alguien tome la solicitud.\n\nSeguimiento: ${trackUrl(ctx.request)}`
  }),
  'service.completed': (ctx) => ({
    subject: `Servicio completado — ${ctx.request.serviceName}`,
    text: `Hola ${ctx.client.name},\n\nTu servicio de ${ctx.request.serviceName} fue completado.\n\nGracias por usar Fundez.`
  }),
  'payout.scheduled': (ctx) => ({
    subject: `Pago programado para el ${ctx.payDateLabel} — ${formatCLP(ctx.amount)}`,
    text: `Hola ${ctx.provider?.name || 'socio'},\n\nLa liquidación de ${ctx.request.serviceName} quedó programada.\n\nMonto a recibir: ${formatCLP(ctx.amount)}\nFecha de pago: ${ctx.payDateLabel}\nCorte aplicado: miércoles 12:00 (hora de Chile).\n\nLos trabajos cerrados después del corte pasan al viernes de la semana siguiente.\n\nRevisa el detalle y tu paquete de facturación en el panel Fundez.`
  }),
  'payout.paid': (ctx) => ({
    subject: `Pago liquidado — ${formatCLP(ctx.amount)}`,
    text: `Hola ${ctx.provider?.name || 'socio'},\n\nMarcamos como pagada la liquidación de ${ctx.request.serviceName}.\nMonto: ${formatCLP(ctx.amount)}\nFecha: ${ctx.paidAtLabel || 'hoy'}\n\nRevisa el detalle en tu panel Fundez.`
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
