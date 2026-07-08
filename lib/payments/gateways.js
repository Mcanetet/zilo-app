const transbank = require('../transbank');

function maskConfigured(value) {
  return Boolean(value && String(value).trim());
}

function getGatewayStatus() {
  return {
    mercadopago: {
      id: 'mercadopago',
      label: 'Mercado Pago',
      configured: maskConfigured(process.env.MP_ACCESS_TOKEN),
      supports: ['card']
    },
    transbank: {
      id: 'transbank',
      label: 'Transbank Webpay Plus',
      configured: transbank.isConfigured(),
      supports: ['card']
    },
    paypal: {
      id: 'paypal',
      label: 'PayPal',
      configured: maskConfigured(process.env.PAYPAL_CLIENT_ID) && maskConfigured(process.env.PAYPAL_CLIENT_SECRET),
      supports: ['card']
    },
    transfer: {
      id: 'transfer',
      label: 'Transferencia bancaria',
      configured: true,
      supports: ['transfer']
    }
  };
}

function getActiveCardGateway() {
  const gateways = getGatewayStatus();
  if (gateways.transbank.configured) return gateways.transbank;
  if (gateways.mercadopago.configured) return gateways.mercadopago;
  if (gateways.paypal.configured) return gateways.paypal;
  return null;
}

function isCardPaymentAvailable() {
  return Boolean(getActiveCardGateway());
}

module.exports = {
  getGatewayStatus,
  getActiveCardGateway,
  isCardPaymentAvailable
};
