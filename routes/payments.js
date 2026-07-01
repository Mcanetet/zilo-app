const express = require('express');
const router = express.Router();
const store = require('../models/store');
const mp = require('../lib/mercadopago');
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

router.get('/checkout', requireRole('client'), (req, res) => {
  const request = store.requests.find(r => r.id === req.query.ref);
  if (!request || request.clientId !== req.session.user.id) {
    return res.redirect('/cliente');
  }
  if (request.paymentStatus === 'approved') {
    return res.redirect(`/pagos/exito?ref=${request.id}`);
  }

  const summary = store.getCheckoutSummary(req.session.user.id, request.id);
  const referral = store.getReferralStats(req.session.user.id);

  res.render('payments/checkout', {
    title: 'Checkout — Zilo',
    request,
    summary,
    referral,
    service: store.getServiceById(request.serviceId),
    formatCLP: store.formatCLP,
    pointsValue: store.POINTS_VALUE_CLP,
    mpConfigured: mp.isConfigured(),
    company
  });
});

router.post('/calcular', requireRole('client'), (req, res) => {
  const { requestId, useCredits, usePoints, promoCode } = req.body;
  const result = store.applyCheckoutDiscounts(req.session.user.id, requestId, {
    useCredits: Boolean(useCredits),
    usePoints: Boolean(usePoints),
    promoCode
  });
  if (result.error) return res.status(400).json(result);
  res.json({ success: true, summary: result.summary });
});

router.post('/crear', requireRole('client'), async (req, res) => {
  const { requestId, useCredits, usePoints, promoCode } = req.body;
  const request = store.requests.find(r => r.id === requestId);

  if (!request || request.clientId !== req.session.user.id) {
    return res.status(404).json({ error: 'Solicitud no encontrada' });
  }

  store.applyCheckoutDiscounts(req.session.user.id, requestId, {
    useCredits: Boolean(useCredits),
    usePoints: Boolean(usePoints),
    promoCode
  });

  const updated = store.requests.find(r => r.id === requestId);
  const baseUrl = getBaseUrl(req);

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

  if (!mp.isConfigured()) {
    return res.json({
      success: true,
      demo: true,
      checkoutUrl: `${baseUrl}/pagos/demo?ref=${request.id}`
    });
  }

  const service = store.getServiceById(request.serviceId);
  try {
    const preference = await mp.createPreference({ request: updated, service, baseUrl });
    const checkoutUrl = process.env.MP_SANDBOX === 'true'
      ? preference.sandbox_init_point
      : preference.init_point;

    store.setPaymentPreference(request.id, preference.id);
    res.json({ success: true, demo: false, checkoutUrl, preferenceId: preference.id });
  } catch (err) {
    console.error('Mercado Pago error:', err.message);
    res.status(500).json({ error: 'No se pudo crear el pago. Intenta nuevamente.' });
  }
});

router.get('/demo', requireRole('client'), (req, res) => {
  const request = store.requests.find(r => r.id === req.query.ref);
  if (!request || request.clientId !== req.session.user.id) {
    return res.redirect('/cliente');
  }
  res.render('payments/demo', {
    title: 'Pago — Zilo',
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
  if (!request) return res.redirect('/cliente');

  if (req.query.payment_id && request.paymentStatus !== 'approved') {
    store.markPaymentApproved(request.id, req.query.payment_id);
    store.activateRequest(request.id);
    notifyProviders(req, request);
  }

  const beneficiaryWhatsapp = company.beneficiaryWhatsappLink(request);
  const guardianUrl = company.guardianShareLink(request);

  res.render('payments/success', {
    title: 'Pago exitoso — Zilo',
    request,
    formatCLP: store.formatCLP,
    beneficiaryWhatsapp,
    guardianUrl,
    company
  });
});

router.get('/error', requireRole('client'), (req, res) => {
  const request = store.requests.find(r => r.id === req.query.ref);
  res.render('payments/failure', { title: 'Pago fallido — Zilo', request });
});

router.get('/pendiente', requireRole('client'), (req, res) => {
  const request = store.requests.find(r => r.id === req.query.ref);
  res.render('payments/pending', { title: 'Pago pendiente — Zilo', request });
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
