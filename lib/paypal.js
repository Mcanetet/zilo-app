let cachedToken = null;
let tokenExpiresAt = 0;

function isConfigured() {
  return Boolean(
    process.env.PAYPAL_CLIENT_ID?.trim() &&
    process.env.PAYPAL_CLIENT_SECRET?.trim()
  );
}

function useSandbox() {
  return process.env.PAYPAL_ENV !== 'production';
}

function getApiBase() {
  return useSandbox()
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';
}

async function getAccessToken() {
  if (!isConfigured()) throw new Error('PayPal no configurado');
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedToken;
  }

  const credentials = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID.trim()}:${process.env.PAYPAL_CLIENT_SECRET.trim()}`
  ).toString('base64');

  const res = await fetch(`${getApiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.error || 'Error autenticando PayPal');
  }

  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in || 300) * 1000;
  return cachedToken;
}

async function createOrder({ request, service, baseUrl }) {
  const amount = Math.round(Number(request.amountDue ?? request.estimatedVisit ?? 0));
  if (!Number.isFinite(amount) || amount < 50) {
    throw new Error('Monto inválido para PayPal');
  }

  const token = await getAccessToken();
  const reference = request.paymentReference || request.id;
  const chargeQuery = request.additionalChargeId
    ? `&charge=${encodeURIComponent(request.additionalChargeId)}`
    : '';
  const description = request.additionalChargeId
    ? `Fundez — Ajuste de servicio: ${service?.name || 'Servicio'}`
    : `Fundez — Visita técnica: ${service?.name || 'Servicio'}`;
  const res = await fetch(`${getApiBase()}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: String(reference).slice(0, 256),
        description,
        custom_id: reference,
        amount: {
          currency_code: 'CLP',
          value: String(amount)
        }
      }],
      application_context: {
        brand_name: 'Fundez',
        landing_page: 'NO_PREFERENCE',
        user_action: 'PAY_NOW',
        return_url: `${baseUrl}/pagos/paypal/retorno?ref=${encodeURIComponent(request.id)}${chargeQuery}`,
        cancel_url: `${baseUrl}/pagos/error?ref=${encodeURIComponent(request.id)}&motivo=cancelado${chargeQuery}`
      }
    })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.details?.[0]?.description || 'Error creando orden PayPal');
  }

  const approveUrl = (data.links || []).find((l) => l.rel === 'approve')?.href;
  if (!approveUrl) throw new Error('PayPal no devolvió URL de aprobación');

  return {
    orderId: data.id,
    approveUrl,
    amount
  };
}

async function captureOrder(orderId) {
  if (!orderId) throw new Error('Orden PayPal requerida');
  const token = await getAccessToken();
  const res = await fetch(`${getApiBase()}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.details?.[0]?.description || 'Error capturando pago PayPal');
  }
  return data;
}

function isCaptureApproved(captureResponse) {
  return captureResponse?.status === 'COMPLETED';
}

function getCaptureAmount(captureResponse) {
  const unit = captureResponse?.purchase_units?.[0];
  const capture = unit?.payments?.captures?.[0];
  if (!capture?.amount?.value) return null;
  return Math.round(Number(capture.amount.value));
}

function getCaptureId(captureResponse) {
  const unit = captureResponse?.purchase_units?.[0];
  return unit?.payments?.captures?.[0]?.id || captureResponse?.id || null;
}

module.exports = {
  isConfigured,
  useSandbox,
  createOrder,
  captureOrder,
  isCaptureApproved,
  getCaptureAmount,
  getCaptureId
};
