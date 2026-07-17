const gateways = require('./gateways');
const transbank = require('../transbank');
const mp = require('../mercadopago');
const paypal = require('../paypal');

function isAnyCardGatewayConfigured(pricingConfig) {
  return gateways.isCardPaymentAvailable(pricingConfig);
}

async function createCardPayment({ request, service, baseUrl, pricingConfig, gatewayId }) {
  let gateway = null;

  if (gatewayId) {
    const status = gateways.getGatewayStatus(pricingConfig);
    gateway = status[gatewayId]?.enabled ? status[gatewayId] : null;
  }
  if (!gateway) {
    gateway = gateways.getActiveCardGateway(pricingConfig);
  }
  if (!gateway) return { mode: 'demo' };

  if (gateway.id === 'transbank') {
    const session = await transbank.createTransaction({ request, baseUrl });
    return {
      mode: 'transbank',
      gateway: 'transbank',
      token: session.token,
      paymentUrl: session.url,
      buyOrder: session.buyOrder,
      redirectPath: `/pagos/transbank/iniciar?ref=${encodeURIComponent(request.id)}${request.additionalChargeId ? `&charge=${encodeURIComponent(request.additionalChargeId)}` : ''}`
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

  if (gateway.id === 'paypal') {
    const order = await paypal.createOrder({ request, service, baseUrl });
    return {
      mode: 'paypal',
      gateway: 'paypal',
      orderId: order.orderId,
      checkoutUrl: order.approveUrl
    };
  }

  return { mode: 'demo' };
}

module.exports = {
  isAnyCardGatewayConfigured,
  createCardPayment
};
