const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'soporte@fundez.cl';
const DPO_EMAIL = process.env.DPO_EMAIL || 'privacidad@fundez.cl';

module.exports = {
  name: 'Fundez SpA',
  rut: '77.777.777-7',
  supportEmail: SUPPORT_EMAIL,
  email: SUPPORT_EMAIL,
  address: 'Santiago, Región Metropolitana, Chile',
  whatsapp: process.env.WHATSAPP_NUMBER || '56912345678',
  whatsappDisplay: process.env.WHATSAPP_DISPLAY || '+56 9 1234 5678',
  /** WhatsApp operaciones/pagos (Aland deriva aquí temas de cobro). */
  paymentsWhatsapp: String(process.env.ALAND_PAYMENTS_WHATSAPP || '56935038343').replace(/\D/g, ''),
  commissionRate: parseFloat(process.env.PLATFORM_COMMISSION || '0.15'),
  dpoEmail: DPO_EMAIL,
  appUrl: process.env.APP_URL || 'http://localhost:3000',

  whatsappLink(message) {
    const num = this.whatsapp.replace(/\D/g, '');
    const text = encodeURIComponent(message || 'Hola Fundez, necesito ayuda con un servicio.');
    return `https://wa.me/${num}?text=${text}`;
  },

  paymentsWhatsappLink(message) {
    const num = this.paymentsWhatsapp.replace(/\D/g, '') || '56935038343';
    const text = encodeURIComponent(message || 'Hola Fundez, tengo una consulta de pagos.');
    return `https://wa.me/${num}?text=${text}`;
  },

  beneficiaryWhatsappLink(request) {
    const phone = (request.beneficiaryPhone || '').replace(/\D/g, '');
    if (!phone || phone.length < 9) return null;
    const fullPhone = phone.startsWith('56') ? phone : `56${phone.replace(/^0/, '')}`;
    const trackUrl = `${this.appUrl}/seguimiento/${request.guardianToken}`;
    const from = request.clientName;
    const msg = request.isGift
      ? `¡Hola ${request.beneficiaryName}! ${from} te regaló una visita técnica de ${request.serviceName} en Fundez.${request.giftMessage ? ` Mensaje: "${request.giftMessage}"` : ''} Dirección: ${request.address}. Sigue el servicio en vivo: ${trackUrl}`
      : `Hola ${request.beneficiaryName}, tu servicio Fundez de ${request.serviceName} está confirmado. Sigue el estado: ${trackUrl}`;
    return `https://wa.me/${fullPhone}?text=${encodeURIComponent(msg)}`;
  },

  guardianShareLink(request) {
    return `${this.appUrl}/seguimiento/${request.guardianToken}`;
  }
};
