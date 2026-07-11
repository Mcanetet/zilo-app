const express = require('express');
const router = express.Router();
const store = require('../models/store');
const mp = require('../lib/mercadopago');
const transbank = require('../lib/transbank');
const gateways = require('../lib/payments/gateways');
const cardCheckout = require('../lib/payments/cardCheckout');
const { notifyProvidersForRequest } = require('../lib/dispatch');
const { requireRole } = require('../middleware/auth');
const company = require('../config/company');

function getBaseUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

function notifyProviders(req, request) {
  notifyProvidersForRequest(req.app.get('io'), request);
}

function ensureBillingForPayment(userId, requestId, billingData) {
  if (billingData) {
    const saved = store.updateUserBilling(userId, billingData);
    if (saved.error) return saved;
  }
  return store.setRequestBillingSnapshot(requestId, userId, billingData);
}

router.get('/checkout', requireRole('client'), (req, res) => {
  const request = store.requests.find(r => r.id === req.query.ref);
  if (!request || request.clientId !== req.session.user.id) {
    return res.redirect('/cliente');
  }
  if (request.paymentStatus === 'approved') {
    return res.redirect(`/pagos/exito?ref=${request.id}`);
  }
  if (request.paymentStatus === 'pending_transfer') {
    return res.redirect(`/pagos/transferencia?ref=${request.id}`);
  }

  const pricing = store.getPricingConfig();

  if (!request.paymentMethod) {
    store.applyCheckoutDiscounts(req.session.user.id, request.id, { paymentMethod: 'card' });
  }

  const summary = store.getCheckoutSummary(req.session.user.id, request.id);
  const referral = store.getReferralStats(req.session.user.id);
  const profile = store.getUserById(req.session.user.id);
  const gatewayStatus = gateways.getGatewayStatus(pricing);
  const enabledCardGateways = gateways.getEnabledCardGateways(pricing);

  res.render('payments/checkout', {
    title: 'Checkout — Fundez',
    request,
    summary,
    referral,
    profile,
    service: store.getServiceById(request.serviceId),
    formatCLP: store.formatCLP,
    pointsValue: store.POINTS_VALUE_CLP,
    mpConfigured: cardCheckout.isAnyCardGatewayConfigured(pricing),
    cardGateway: gateways.getActiveCardGateway(pricing),
    enabledCardGateways,
    gatewayStatus,
    company,
    pricing,
    trustStats: store.getClientTrustStats()
  });
});

router.post('/calcular', requireRole('client'), (req, res) => {
  const { requestId, promoCode, paymentMethod } = req.body;
  const puntosOn = store.isModuleEnabled('client_puntos');
  const result = store.applyCheckoutDiscounts(req.session.user.id, requestId, {
    useCredits: puntosOn && Boolean(req.body.useCredits),
    usePoints: puntosOn && Boolean(req.body.usePoints),
    promoCode,
    paymentMethod: paymentMethod || 'card'
  });
  if (result.error) return res.status(400).json(result);
  res.json({ success: true, summary: result.summary });
});

router.post('/facturacion', requireRole('client'), (req, res) => {
  const { requestId, billing } = req.body;
  const billingResult = ensureBillingForPayment(req.session.user.id, requestId, billing);
  if (billingResult.error) return res.status(400).json({ success: false, error: billingResult.error });
  res.json({ success: true, billingSnapshot: billingResult.billingSnapshot });
});

router.post('/crear', requireRole('client'), async (req, res) => {
  const { requestId, promoCode, paymentMethod, billing } = req.body;
  const puntosOn = store.isModuleEnabled('client_puntos');
  const useCredits = puntosOn && Boolean(req.body.useCredits);
  const usePoints = puntosOn && Boolean(req.body.usePoints);
  const request = store.requests.find(r => r.id === requestId);

  if (!request || request.clientId !== req.session.user.id) {
    return res.status(404).json({ error: 'Solicitud no encontrada' });
  }

  const billingResult = ensureBillingForPayment(req.session.user.id, requestId, billing);
  if (billingResult.error) {
    return res.status(400).json({ success: false, error: billingResult.error });
  }

  const method = paymentMethod || 'card';
  const discountResult = store.applyCheckoutDiscounts(req.session.user.id, requestId, {
    useCredits: Boolean(useCredits),
    usePoints: Boolean(usePoints),
    promoCode,
    paymentMethod: method
  });
  if (discountResult.error) return res.status(400).json(discountResult);

  const updated = store.requests.find(r => r.id === requestId);
  const baseUrl = getBaseUrl(req);
  const pricing = store.getPricingConfig();

  if (updated.amountDue === 0) {
    store.markPaymentApproved(requestId, 'credits');
    store.activateRequest(requestId);
    notifyProviders(req, store.requests.find(r => r.id === requestId));
    return res.json({
      success: true,
      free: true,
      redirect: `/pagos/exito?ref=${requestId}`
    });
  }

  if (method === 'transfer') {
    return res.json({
      success: true,
      transfer: true,
      redirect: `${baseUrl}/pagos/transferencia?ref=${request.id}`
    });
  }

  const service = store.getServiceById(request.serviceId);
  try {
    const payment = await cardCheckout.createCardPayment({
      request: updated,
      service,
      baseUrl,
      pricingConfig: pricing,
      gatewayId: req.body.cardGateway || null
    });

    if (payment.mode === 'demo') {
      return res.json({
        success: true,
        demo: true,
        checkoutUrl: `${baseUrl}/pagos/demo?ref=${request.id}`
      });
    }

    if (payment.mode === 'transbank') {
      store.setCardPaymentSession(request.id, {
        gateway: 'transbank',
        token: payment.token,
        paymentUrl: payment.paymentUrl,
        buyOrder: payment.buyOrder
      });
      return res.json({
        success: true,
        transbank: true,
        redirect: `${baseUrl}${payment.redirectPath}`
      });
    }

    if (payment.mode === 'mercadopago') {
      store.setCardPaymentSession(request.id, {
        gateway: 'mercadopago',
        preferenceId: payment.preferenceId
      });
      return res.json({
        success: true,
        demo: false,
        checkoutUrl: payment.checkoutUrl,
        preferenceId: payment.preferenceId
      });
    }

    if (payment.mode === 'paypal') {
      store.setCardPaymentSession(request.id, {
        gateway: 'paypal',
        paypalOrderId: payment.orderId
      });
      return res.json({
        success: true,
        paypal: true,
        checkoutUrl: payment.checkoutUrl
      });
    }

    return res.status(500).json({ error: 'No hay pasarela de pago disponible' });
  } catch (err) {
    console.error('Error creando pago con tarjeta:', err.message);
    res.status(500).json({ error: 'No se pudo crear el pago. Intenta nuevamente.' });
  }
});

router.get('/paypal/retorno', requireRole('client'), async (req, res) => {
  const ref = req.query.ref;
  const orderId = req.query.token;
  const request = store.requests.find(r => r.id === ref && r.clientId === req.session.user.id);
  if (!request) return res.redirect('/cliente');

  if (!orderId) {
    return res.redirect(`/pagos/error?ref=${ref}&motivo=cancelado`);
  }

  try {
    const paypal = require('../lib/paypal');
    const result = await paypal.captureOrder(orderId);
    const expectedAmount = Math.round(Number(request.amountDue ?? request.estimatedVisit ?? 0));
    const paidAmount = paypal.getCaptureAmount(result);

    if (
      paypal.isCaptureApproved(result) &&
      (paidAmount == null || paidAmount === expectedAmount)
    ) {
      const paymentId = paypal.getCaptureId(result) || orderId;
      store.markPaymentApproved(request.id, String(paymentId));
      store.activateRequest(request.id);
      notifyProviders(req, request);
      return res.redirect(`/pagos/exito?ref=${ref}`);
    }

    return res.redirect(`/pagos/error?ref=${ref}`);
  } catch (err) {
    console.error('PayPal capture error:', err.message);
    return res.redirect(`/pagos/error?ref=${ref}`);
  }
});

router.get('/transbank/iniciar', requireRole('client'), (req, res) => {
  const request = store.requests.find(r => r.id === req.query.ref);
  if (!request || request.clientId !== req.session.user.id) {
    return res.redirect('/cliente');
  }
  if (!request.transbankToken || !request.paymentUrl) {
    return res.redirect(`/pagos/checkout?ref=${request.id}`);
  }

  res.render('payments/transbank-iniciar', {
    title: 'Webpay Plus — Fundez',
    token: request.transbankToken,
    paymentUrl: request.paymentUrl
  });
});

router.post('/transbank/retorno', requireRole('client'), async (req, res) => {
  const ref = req.query.ref;
  const request = store.requests.find(r => r.id === ref && r.clientId === req.session.user.id);
  if (!request) return res.redirect('/cliente');

  const token = req.body.token_ws;
  if (!token) {
    return res.redirect(`/pagos/error?ref=${ref}&motivo=cancelado`);
  }

  try {
    const result = await transbank.commitTransaction(token);
    const expectedAmount = Math.round(Number(request.amountDue ?? request.estimatedVisit ?? 0));
    const paidAmount = transbank.getCommittedAmount(result);

    if (
      transbank.isApproved(result) &&
      (paidAmount == null || paidAmount === expectedAmount)
    ) {
      const paymentId = transbank.getAuthorizationId(result) || `tbk-${Date.now()}`;
      store.markPaymentApproved(request.id, String(paymentId));
      store.activateRequest(request.id);
      notifyProviders(req, request);
      return res.redirect(`/pagos/exito?ref=${ref}`);
    }

    console.warn('Transbank no autorizado:', result?.response_code, result?.status);
    return res.redirect(`/pagos/error?ref=${ref}`);
  } catch (err) {
    console.error('Transbank commit error:', err.message);
    return res.redirect(`/pagos/error?ref=${ref}`);
  }
});

router.get('/transferencia', requireRole('client'), (req, res) => {
  const request = store.requests.find(r => r.id === req.query.ref);
  if (!request || request.clientId !== req.session.user.id) {
    return res.redirect('/cliente');
  }
  if (request.paymentStatus === 'approved') {
    return res.redirect(`/pagos/exito?ref=${request.id}`);
  }

  const pricing = store.getPricingConfig();
  res.render('payments/transfer', {
    title: 'Transferencia bancaria — Fundez',
    request,
    summary: store.getCheckoutSummary(req.session.user.id, request.id),
    bank: pricing.bankTransfer,
    query: req.query,
    formatCLP: store.formatCLP,
    company
  });
});

router.post('/transferencia/confirmar', requireRole('client'), (req, res) => {
  const result = store.submitTransferPayment(req.body.requestId, req.session.user.id);
  if (result.error) return res.status(400).json({ success: false, error: result.error });
  res.json({
    success: true,
    redirect: `/pagos/transferencia?ref=${req.body.requestId}&enviado=1`
  });
});

router.get('/demo', requireRole('client'), (req, res) => {
  const request = store.requests.find(r => r.id === req.query.ref);
  if (!request || request.clientId !== req.session.user.id) {
    return res.redirect('/cliente');
  }
  res.render('payments/demo', {
    title: 'Pago — Fundez',
    request,
    service: store.getServiceById(request.serviceId),
    formatCLP: store.formatCLP,
    company
  });
});

router.post('/demo/confirmar', requireRole('client'), (req, res) => {
  const request = store.requests.find(r => r.id === req.body.requestId);
  if (!request || request.clientId !== req.session.user.id) {
    return res.status(404).json({ error: 'Solicitud no encontrada' });
  }

  store.markPaymentApproved(request.id, 'demo');
  store.activateRequest(request.id);
  notifyProviders(req, store.requests.find(r => r.id === request.id));

  res.json({ success: true, redirect: `/pagos/exito?ref=${request.id}` });
});

router.get('/exito', requireRole('client'), (req, res) => {
  const request = store.requests.find(r => r.id === req.query.ref);
  if (!request || request.clientId !== req.session.user.id) {
    return res.redirect('/cliente');
  }

  if (req.query.payment_id && request.paymentStatus !== 'approved') {
    store.markPaymentApproved(request.id, req.query.payment_id);
    store.activateRequest(request.id);
    notifyProviders(req, request);
  }

  const beneficiaryWhatsapp = company.beneficiaryWhatsappLink(request);
  const guardianUrl = company.guardianShareLink(request);

  res.render('payments/success', {
    title: 'Pago exitoso — Fundez',
    request,
    formatCLP: store.formatCLP,
    beneficiaryWhatsapp,
    guardianUrl,
    company,
    checkoutStep: 3
  });
});

router.get('/error', requireRole('client'), (req, res) => {
  const request = store.requests.find(r => r.id === req.query.ref);
  if (request && request.clientId !== req.session.user.id) {
    return res.redirect('/cliente');
  }
  res.render('payments/failure', { title: 'Pago fallido — Fundez', request, query: req.query });
});

router.get('/pendiente', requireRole('client'), (req, res) => {
  const request = store.requests.find(r => r.id === req.query.ref);
  if (request && request.clientId !== req.session.user.id) {
    return res.redirect('/cliente');
  }
  res.render('payments/pending', { title: 'Pago pendiente — Fundez', request });
});

router.post('/webhook', async (req, res) => {
  const { type, data } = req.body;

  if (type === 'payment' && data?.id) {
    try {
      const payment = await mp.getPaymentInfo(data.id);
      const ref = payment?.external_reference;
      const request = store.requests.find(r => r.id === ref);

      if (request && payment.status === 'approved') {
        store.markPaymentApproved(request.id, String(data.id));
        store.activateRequest(request.id);
        const io = req.app.get('io');
        if (io) notifyProvidersForRequest(io, request);
      }
    } catch (err) {
      console.error('Webhook error:', err.message);
    }
  }

  res.sendStatus(200);
});

module.exports = router;
