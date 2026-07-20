/**
 * Enrutado de intenciones Aland: servicio → socio, pagos → aviso interno admin (gratis).
 * Sin WhatsApp/Meta hacia clientes (evita costos de mensajería).
 */
const PAYMENT_PATTERNS = [
  /\bpago(s)?\b/i,
  /\bpagar\b/i,
  /\bcobro(s)?\b/i,
  /\bcobr[oaá](r|ron|ndo|do|da)?\b/i,
  /\bfactura(s)?\b/i,
  /\bboleta(s)?\b/i,
  /\btransferencia(s)?\b/i,
  /\btarjeta\b/i,
  /\bmercado\s*pago\b/i,
  /\bwebpay\b/i,
  /\breembolso\b/i,
  /\bdevoluci[oó]n\b/i,
  /\bcargo\b/i,
  /\bdoble\s+cobro\b/i,
  /\bcomprobante\b/i,
  /\bvoucher\b/i,
  /\bno\s+me\s+cobr/i,
  /\bprecio\s+(mal|incorrecto|cobrado)/i
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

const ROUTING_PROMPT = `
ENRUTADO DE CASOS (obligatorio):
- Si el cliente habla de un problema técnico o del servicio (visita, reparación, filtración, técnico, presupuesto en terreno), ayúdalo primero y, cuando corresponda derivar, termina con [DERIVAR_PROVEEDOR].
- Si el cliente habla de pagos, cobros, transferencias, tarjeta, factura, boleta, reembolso o comprobantes, explícalo con claridad y termina con [DERIVAR_PAGOS] (eso AVISA solo a administración Fundez por canales internos gratis; NUNCA indiques WhatsApp ni pidas al cliente escribir a un número).
- No uses ambas etiquetas a la vez. Prioriza [DERIVAR_PAGOS] si el núcleo es dinero/cobro.
- No ofrezcas contactar por WhatsApp, Meta ni redes externas de cobro.
`.trim();

module.exports = {
  classifyTopic,
  ROUTING_PROMPT
};
