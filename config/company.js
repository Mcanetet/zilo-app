module.exports = {
  name: 'Fundez SpA',
  rut: '77.777.777-7',
  email: 'contacto@zilo.cl',
  address: 'Santiago, Región Metropolitana, Chile',
  whatsapp: process.env.WHATSAPP_NUMBER || '56912345678',
  whatsappDisplay: process.env.WHATSAPP_DISPLAY || '+56 9 1234 5678',
  commissionRate: parseFloat(process.env.PLATFORM_COMMISSION || '0.15'),
  dpoEmail: process.env.DPO_EMAIL || 'privacidad@zilo.cl',
  appUrl: process.env.APP_URL || 'http://localhost:3000',

  whatsappLink(message) {
    const num = this.whatsapp.replace(/\D/g, '');
    const text = encodeURIComponent(message || 'Hola Fundez, necesito ayuda con un servicio.');
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
