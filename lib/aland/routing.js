/**
 * Enrutado de intenciones Aland: servicio → socio, pagos → admin + WhatsApp.
 */
const PAYMENTS_WHATSAPP = String(process.env.ALAND_PAYMENTS_WHATSAPP || '56935038343').replace(/\D/g, '');

const PAYMENT_PATTERNS = [
  /\bpago(s)?\b/i,
  /\bpagar\b/i,
  /\bcobro(s)?\b/i,
  /\bcobr[oó]\b/i,
  /\bfactura(s)?\b/i,
  /\bboleta(s)?\b/i,
  /\btransferencia(s)?\b/i,
  /\btarjeta\b/i,
  /\bmercado\s*pago\b/i,
  /\bwebpay\b/i,
  /\breembolso\b/i,
  /\bdevoluci[oó]n\b/i,
  /\bcargo\b/i,
  /\bmonto\b/i,
  /\bprecio\s+(mal|incorrecto|cobrado)/i,
  /\bno\s+me\s+cobr/i,
  /\bdoble\s+cobro\b/i,
  /\bcomprobante\b/i,
  /\bvoucher\b/i
];

const SERVICE_PATTERNS = [
  /\bt[eé]cnico\b/i,
  /\bvisita\b/i,
  /\binstalaci[oó]n\b/i,
  /\breparaci[oó]n\b/i,
  /\bfiltraci[oó]n\b/i,
  /\bno\s+(me\s+)?(funciona|prende|enciende)\b/i,
  /\burgente\b/i,
  /\bpresupuesto\b/i,
  /\bcotizaci[oó]n\b/i,
  /\bgasfiter/i,
  /\belectric/i,
  /\bcerradur/i,
  /\bcaldera/i,
  /\bgenerador/i,
  /\bespecialista\b/i,
  /\bsocio\b/i,
  /\ben\s+terreno\b/i
];

function classifyTopic(text) {
  const raw = String(text || '');
  if (PAYMENT_PATTERNS.some((re) => re.test(raw))) return 'payment';
  if (SERVICE_PATTERNS.some((re) => re.test(raw))) return 'service';
  return 'general';
}

function paymentsWhatsAppUrl({ clientName, clientEmail, clientPhone, serviceName, message, conversationId }) {
  const body = [
    'Hola Fundez — consulta de PAGOS vía Aland IA',
    `Cliente: ${clientName || '—'}`,
    clientEmail ? `Email: ${clientEmail}` : null,
    clientPhone ? `Tel: ${clientPhone}` : null,
    serviceName ? `Servicio: ${serviceName}` : null,
    conversationId ? `Conversación: ${conversationId}` : null,
    '',
    'Mensaje:',
    String(message || '').slice(0, 800)
  ].filter(Boolean).join('\n');

  return `https://wa.me/${PAYMENTS_WHATSAPP}?text=${encodeURIComponent(body)}`;
}

const ROUTING_PROMPT = `
ENRUTADO DE CASOS (obligatorio):
- Si el cliente habla de un problema técnico o del servicio (visita, reparación, filtración, técnico, presupuesto en terreno), ayúdalo primero y, cuando corresponda derivar, termina con [DERIVAR_PROVEEDOR].
- Si el cliente habla de pagos, cobros, transferencias, tarjeta, factura, boleta, reembolso o comprobantes, explícalo con claridad y termina con [DERIVAR_PAGOS] (eso avisa a administración y abre WhatsApp de pagos).
- No uses ambas etiquetas a la vez. Prioriza [DERIVAR_PAGOS] si el núcleo es dinero/cobro.
`.trim();

module.exports = {
  PAYMENTS_WHATSAPP,
  classifyTopic,
  paymentsWhatsAppUrl,
  ROUTING_PROMPT
};
