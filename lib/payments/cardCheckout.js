const gateways = require('./gateways');
const transbank = require('../transbank');
const mp = require('../mercadopago');

function isAnyCardGatewayConfigured() {
  return gateways.isCardPaymentAvailable();
}

async function createCardPayment({ request, service, baseUrl }) {
  const gateway = gateways.getActiveCardGateway();
  if (!gateway) return { mode: 'demo' };

  if (gateway.id === 'transbank') {
    const session = await transbank.createTransaction({ request, baseUrl });
    return {
      mode: 'transbank',
      gateway: 'transbank',
      token: session.token,
      paymentUrl: session.url,
      buyOrder: session.buyOrder,
      redirectPath: `/pagos/transbank/iniciar?ref=${encodeURIComponent(request.id)}`
    };
  }

  if (gateway.id === 'mercadopago') {
    const preference = await mp.createPreference({ request, service, baseUrl });
    if (!preference) return { mode: 'demo' };
    const checkoutUrl = process.env.MP_SANDBOX === 'true'
      ? preference.sandbox_init_point
      : preference.init_point;
    return {
      mode: 'mercadopago',
      gateway: 'mercadopago',
      preferenceId: preference.id,
      checkoutUrl
    };
  }

  return { mode: 'demo' };
}

module.exports = {
  isAnyCardGatewayConfigured,
  createCardPayment
};
