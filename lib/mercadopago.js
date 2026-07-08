const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');

let mpClient = null;

function isConfigured() {
  return Boolean(process.env.MP_ACCESS_TOKEN);
}

function getClient() {
  if (!isConfigured()) return null;
  if (!mpClient) {
    mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
  }
  return mpClient;
}

async function createPreference({ request, service, baseUrl }) {
  const client = getClient();
  if (!client) return null;

  const preferenceApi = new Preference(client);
  const amount = Number(request.estimatedVisit);

  const result = await preferenceApi.create({
    body: {
      items: [{
        id: request.id,
        title: `Fundez — Visita técnica: ${service.name}`,
        description: request.address,
        quantity: 1,
        unit_price: amount,
        currency_id: 'CLP'
      }],
      payer: {
        name: request.clientName,
        email: process.env.MP_PAYER_EMAIL || 'test@test.com'
      },
      back_urls: {
        success: `${baseUrl}/pagos/exito?ref=${request.id}`,
        failure: `${baseUrl}/pagos/error?ref=${request.id}`,
        pending: `${baseUrl}/pagos/pendiente?ref=${request.id}`
      },
      auto_return: 'approved',
      external_reference: request.id,
      notification_url: `${baseUrl}/pagos/webhook`,
      statement_descriptor: 'FUNDEZ'
    }
  });

  return {
    id: result.id,
    init_point: result.init_point,
    sandbox_init_point: result.sandbox_init_point
  };
}

async function getPaymentInfo(paymentId) {
  const client = getClient();
  if (!client) return null;
  const paymentApi = new Payment(client);
  return paymentApi.get({ id: paymentId });
}

module.exports = {
  isConfigured,
  createPreference,
  getPaymentInfo
};
