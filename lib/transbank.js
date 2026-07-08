const {
  WebpayPlus,
  IntegrationCommerceCodes,
  IntegrationApiKeys
} = require('transbank-sdk');

function useIntegration() {
  const env = (process.env.TRANSBANK_ENV || '').toLowerCase();
  return env === 'integration' || env === 'sandbox' || process.env.TRANSBANK_SANDBOX === 'true';
}

function isConfigured() {
  if (useIntegration()) return true;
  return Boolean(
    process.env.TRANSBANK_COMMERCE_CODE?.trim() &&
    process.env.TRANSBANK_API_KEY?.trim()
  );
}

function getTransaction() {
  if (useIntegration()) {
    const commerceCode = process.env.TRANSBANK_COMMERCE_CODE?.trim() || IntegrationCommerceCodes.WEBPAY_PLUS;
    const apiKey = process.env.TRANSBANK_API_KEY?.trim() || IntegrationApiKeys.WEBPAY;
    return WebpayPlus.Transaction.buildForIntegration(commerceCode, apiKey);
  }

  return WebpayPlus.Transaction.buildForProduction(
    process.env.TRANSBANK_COMMERCE_CODE.trim(),
    process.env.TRANSBANK_API_KEY.trim()
  );
}

function buildBuyOrder(requestId) {
  return String(requestId).replace(/-/g, '').slice(0, 26);
}

async function createTransaction({ request, baseUrl }) {
  const tx = getTransaction();
  const amount = Math.round(Number(request.amountDue ?? request.estimatedVisit ?? 0));
  if (!Number.isFinite(amount) || amount < 50) {
    throw new Error('Monto inválido para Webpay Plus');
  }

  const buyOrder = buildBuyOrder(request.id);
  const sessionId = String(request.id).slice(0, 61);
  const returnUrl = `${baseUrl}/pagos/transbank/retorno?ref=${encodeURIComponent(request.id)}`;
  const response = await tx.create(buyOrder, sessionId, amount, returnUrl);

  return {
    token: response.token,
    url: response.url,
    buyOrder,
    amount
  };
}

async function commitTransaction(token) {
  if (!token) throw new Error('Token Webpay requerido');
  const tx = getTransaction();
  return tx.commit(token);
}

function isApproved(commitResponse) {
  if (!commitResponse) return false;
  if (commitResponse.response_code === 0) return true;
  if (Array.isArray(commitResponse.details) && commitResponse.details[0]?.response_code === 0) {
    return true;
  }
  return false;
}

function getAuthorizationId(commitResponse) {
  if (!commitResponse) return null;
  return commitResponse.authorization_code
    || commitResponse.details?.[0]?.authorization_code
    || commitResponse.buy_order
    || null;
}

function getCommittedAmount(commitResponse) {
  if (!commitResponse) return null;
  const amount = commitResponse.amount ?? commitResponse.details?.[0]?.amount;
  return amount != null ? Math.round(Number(amount)) : null;
}

module.exports = {
  isConfigured,
  useIntegration,
  createTransaction,
  commitTransaction,
  isApproved,
  getAuthorizationId,
  getCommittedAmount,
  buildBuyOrder
};
