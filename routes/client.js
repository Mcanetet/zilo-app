const express = require('express');
const router = express.Router();
const store = require('../models/store');
const company = require('../config/company');
const { getClientOnboardingSteps } = require('../lib/onboarding');
const { requireRole } = require('../middleware/auth');

function syncSessionUser(req, user) {
  req.session.user.name = user.name;
}

router.get('/', requireRole('client'), (req, res) => {
  const profile = store.getUserById(req.session.user.id);
  const referralBonus = req.session.referralBonus;
  if (referralBonus) delete req.session.referralBonus;
  res.render('client/dashboard', {
    title: 'Zilo — Servicios',
    user: req.session.user,
    profile,
    services: store.getActiveServices(),
    promos: store.PROMOS,
    referral: store.getReferralStats(req.session.user.id),
    passport: store.getHomePassport(req.session.user.id),
    referralBonus,
    formatCLP: store.formatCLP,
    navActive: 'inicio',
    activeRequests: store.getRequestsByClient(req.session.user.id).slice(0, 3),
    showOnboarding: store.needsOnboarding(profile),
    onboardingSteps: getClientOnboardingSteps(),
    onboardingCompleteUrl: '/cliente/onboarding/complete'
  });
});

router.post('/onboarding/complete', requireRole('client'), (req, res) => {
  const user = store.completeOnboarding(req.session.user.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  store.logSecurityEvent('onboarding_complete', req.body.skipped ? 'skipped' : 'finished', req);
  res.json({ success: true });
});

router.get('/perfil', requireRole('client'), (req, res) => {
  const profile = store.getUserById(req.session.user.id);
  const referral = store.getReferralStats(req.session.user.id);
  res.render('client/profile', {
    title: 'Mi perfil — Zilo',
    user: req.session.user,
    profile,
    referral,
    formatCLP: store.formatCLP,
    navActive: 'perfil'
  });
});

router.post('/perfil', requireRole('client'), (req, res) => {
  const user = store.updateUserProfile(req.session.user.id, req.body);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  syncSessionUser(req, user);
  res.json({ success: true, user: { name: user.name, phone: user.phone, address: user.address } });
});

router.get('/hogar', requireRole('client'), (req, res) => {
  const passport = store.getHomePassport(req.session.user.id);
  res.render('client/hogar', {
    title: 'Pasaporte Hogar — Zilo',
    user: req.session.user,
    passport,
    formatCLP: store.formatCLP,
    navActive: 'hogar'
  });
});

router.get('/historial', requireRole('client'), (req, res) => {
  const requests = store.getRequestsByClient(req.session.user.id);
  res.render('client/historial', {
    title: 'Historial — Zilo',
    user: req.session.user,
    requests,
    formatCLP: store.formatCLP,
    navActive: 'historial'
  });
});

router.get('/invitar', requireRole('client'), (req, res) => {
  const profile = store.getUserById(req.session.user.id);
  const referral = store.getReferralStats(req.session.user.id);
  const shareUrl = `${company.appUrl}/?ref=${referral.code}`;
  res.render('client/invitar', {
    title: 'Invitar amigos — Zilo',
    user: req.session.user,
    profile,
    referral,
    shareUrl,
    formatCLP: store.formatCLP,
    navActive: 'invitar'
  });
});

router.post('/aplicar-codigo', requireRole('client'), (req, res) => {
  const result = store.applyReferralCode(req.session.user.id, req.body.code?.trim().toUpperCase());
  if (result.error) return res.status(400).json(result);
  res.json({ success: true, bonus: result.bonus, message: `¡$${result.bonus.toLocaleString('es-CL')} de crédito agregado!` });
});

router.get('/servicio/:id', requireRole('client'), (req, res) => {
  const service = store.getServiceById(req.params.id);
  if (!service || !service.enabled) {
    return res.status(404).render('error', {
      title: 'No disponible',
      message: 'Este servicio no está disponible en este momento.',
      code: 404
    });
  }
  const profile = store.getUserById(req.session.user.id);
  res.render('client/service', {
    title: `${service.name} — Zilo`,
    user: req.session.user,
    profile,
    service,
    formatCLP: store.formatCLP,
    tracking: req.query.tracking || null
  });
});

router.post('/solicitar', requireRole('client'), async (req, res) => {
  const { serviceId, address, notes, lat, lng, gift } = req.body;
  const service = store.getServiceById(serviceId);
  if (!service || !service.enabled) {
    return res.status(400).json({ error: 'Servicio no disponible' });
  }
  try {
    const request = await store.createRequest({
      clientId: req.session.user.id,
      serviceId,
      address,
      notes,
      coords: lat && lng ? { lat, lng } : null,
      gift: gift?.name ? gift : null
    });
    res.json({ success: true, request });
  } catch (err) {
    console.error('Error creando solicitud:', err.message);
    res.status(500).json({ error: 'Error al crear la solicitud' });
  }
});

router.post('/geocode', requireRole('client'), async (req, res) => {
  const { geocodeAddress } = require('../lib/geocode');
  const { address } = req.body;
  if (!address) return res.status(400).json({ error: 'Dirección requerida' });
  const result = await geocodeAddress(address);
  res.json({ success: true, coords: { lat: result.lat, lng: result.lng }, displayName: result.displayName });
});

router.get('/solicitud/:id', requireRole('client'), (req, res) => {
  const request = store.requests.find(r => r.id === req.params.id);
  if (!request || request.clientId !== req.session.user.id) {
    return res.status(404).json({ error: 'Solicitud no encontrada' });
  }
  let provider = null;
  if (request.providerId) {
    provider = store.getPublicProviderProfile(store.getUserById(request.providerId));
  }
  res.json({ request, provider });
});

module.exports = router;
