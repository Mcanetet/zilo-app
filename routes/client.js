const express = require('express');
const router = express.Router();
const store = require('../models/store');
const { saveRequestFile } = require('../lib/uploads');
const company = require('../config/company');
const { getClientOnboardingSteps } = require('../lib/onboarding');
const { localizeServices } = require('../lib/i18n-admin');
const { requireRole } = require('../middleware/auth');
const { requireModule } = require('../middleware/modules');

function syncSessionUser(req, user) {
  req.session.user.name = user.name;
}

router.get('/', requireRole('client'), (req, res) => {
  const profile = store.getUserById(req.session.user.id);
  const referralBonus = req.session.referralBonus;
  if (referralBonus) delete req.session.referralBonus;
  res.render('client/dashboard', {
    title: 'Fundez — Servicios',
    user: req.session.user,
    profile,
    services: localizeServices(store.getActiveServices(), req.t),
    promos: store.PROMOS,
    referral: store.getReferralStats(req.session.user.id),
    passport: store.getHomePassport(req.session.user.id),
    referralBonus,
    formatCLP: store.formatCLP,
    navActive: 'inicio',
    activeRequests: store.getActiveRequestsForClient(req.session.user.id, req.locale),
    lastCompleted: store.getLastCompletedRequest(req.session.user.id, req.locale),
    trustStats: store.getClientTrustStats(),
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
    title: 'Mi perfil — Fundez',
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

router.post('/facturacion', requireRole('client'), (req, res) => {
  const result = store.updateUserBilling(req.session.user.id, req.body);
  if (result.error) return res.status(400).json({ success: false, error: result.error });
  res.json({ success: true, billing: result.billing });
});

router.get('/hogar', requireRole('client'), requireModule('client_pasaporte'), (req, res) => {
  const passport = store.getHomePassport(req.session.user.id);
  res.render('client/hogar', {
    title: 'Pasaporte Hogar — Fundez',
    user: req.session.user,
    passport,
    formatCLP: store.formatCLP,
    navActive: 'hogar'
  });
});

router.get('/historial', requireRole('client'), requireModule('client_historial'), (req, res) => {
  const requests = store.getRequestsByClient(req.session.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(r => store.enrichRequestForClient(r, req.locale));
  res.render('client/historial', {
    title: 'Historial — Fundez',
    user: req.session.user,
    requests,
    formatCLP: store.formatCLP,
    navActive: 'historial'
  });
});

router.get('/invitar', requireRole('client'), requireModule('client_referidos'), (req, res) => {
  const profile = store.getUserById(req.session.user.id);
  const referral = store.getReferralStats(req.session.user.id);
  const shareUrl = `${company.appUrl}/?ref=${referral.code}`;
  res.render('client/invitar', {
    title: 'Invitar amigos — Fundez',
    user: req.session.user,
    profile,
    referral,
    shareUrl,
    formatCLP: store.formatCLP,
    navActive: 'invitar'
  });
});

router.post('/aplicar-codigo', requireRole('client'), requireModule('client_referidos'), (req, res) => {
  const result = store.applyReferralCode(req.session.user.id, req.body.code?.trim().toUpperCase());
  if (result.error) return res.status(400).json(result);
  res.json({ success: true, bonus: result.bonus, message: `¡$${result.bonus.toLocaleString('es-CL')} de crédito agregado!` });
});

router.get('/servicio/:id', requireRole('client'), requireModule('client_solicitar'), (req, res) => {
  const serviceRaw = store.getServiceById(req.params.id);
  if (!serviceRaw || !serviceRaw.enabled) {
    return res.status(404).render('error', {
      title: 'No disponible',
      message: 'Este servicio no está disponible en este momento.',
      code: 404
    });
  }
  const service = localizeServices([serviceRaw], req.t)[0];
  const profile = store.getUserById(req.session.user.id);
  const pricing = store.getPricingConfig();
  const urgencyTiers = store.getUrgencyTiersForClient();
  res.render('client/service', {
    title: `${service.name} — Fundez`,
    user: req.session.user,
    profile,
    service,
    pricing,
    urgencyTiers,
    trustStats: store.getClientTrustStats(),
    formatCLP: store.formatCLP,
    tracking: req.query.tracking || null
  });
});

router.get('/precio-preview', requireRole('client'), (req, res) => {
  const preview = store.previewVisitPrice(req.query.tier || 'tomorrow');
  if (!preview) return res.status(400).json({ error: 'Urgencia no válida' });
  res.json({
    success: true,
    preview: {
      ...preview,
      formatted: {
        baseVisit: store.formatCLP(preview.baseVisit),
        adjustment: store.formatCLP(preview.adjustmentAmount),
        visitTotal: store.formatCLP(preview.visitTotal),
        servicePrice: store.formatCLP(preview.servicePrice),
        estimatedTotal: store.formatCLP(preview.estimatedTotal)
      }
    }
  });
});

router.post('/solicitar', requireRole('client'), requireModule('client_solicitar'), async (req, res) => {
  const { serviceId, address, notes, lat, lng, gift, clientPhoto, urgencyTier } = req.body;
  const service = store.getServiceById(serviceId);
  if (!service || !service.enabled) {
    return res.status(400).json({ error: 'Servicio no disponible' });
  }
  if (gift?.name && !store.isModuleEnabled('client_regalo')) {
    return res.status(403).json({ error: 'El módulo de regalos no está habilitado' });
  }

  let clientPhotoUrl = null;
  if (clientPhoto && store.isModuleEnabled('client_foto')) {
    try {
      const tempId = `tmp-${Date.now()}`;
      clientPhotoUrl = saveRequestFile(tempId, 'cliente', clientPhoto);
    } catch (err) {
      console.error('Error guardando foto cliente:', err.message);
      return res.status(400).json({ error: 'No se pudo guardar la foto. Intenta con otra imagen.' });
    }
  }

  try {
    const request = await store.createRequest({
      clientId: req.session.user.id,
      serviceId,
      address,
      notes,
      coords: lat && lng ? { lat, lng } : null,
      gift: gift?.name ? gift : null,
      clientPhotoUrl,
      urgencyTier: urgencyTier || 'tomorrow'
    });

    if (clientPhotoUrl && clientPhotoUrl.includes('/tmp-')) {
      const fs = require('fs');
      const path = require('path');
      const oldPath = path.join(__dirname, '../public', clientPhotoUrl);
      const newDir = path.join(__dirname, '../public/uploads/requests', request.id);
      fs.mkdirSync(newDir, { recursive: true });
      const newName = `cliente-${Date.now()}${path.extname(oldPath)}`;
      const newPath = path.join(newDir, newName);
      if (fs.existsSync(oldPath)) {
        fs.renameSync(oldPath, newPath);
        request.clientPhotoUrl = `/uploads/requests/${request.id}/${newName}`;
        await require('../models/repository').saveRequest(request);
      }
    }

    res.json({ success: true, request });
  } catch (err) {
    console.error('Error creando solicitud:', err.message);
    const isCoverage = /operamos|comuna|trabajando/i.test(err.message || '');
    res.status(isCoverage ? 400 : 500).json({
      error: err.message || 'Error al crear la solicitud',
      coverageBlocked: isCoverage
    });
  }
});

router.post('/geocode', requireRole('client'), async (req, res) => {
  const { geocodeAddress } = require('../lib/geocode');
  const { formatCoverageMessage } = require('../lib/coverage');
  const { address } = req.body;
  if (!address) return res.status(400).json({ error: 'Dirección requerida' });
  const result = await geocodeAddress(address);
  const coverage = store.validateAddressCoverage({
    address,
    displayName: result.displayName,
    nominatimAddress: result.address
  });
  res.json({
    success: true,
    coords: { lat: result.lat, lng: result.lng },
    displayName: result.displayName,
    coverage: {
      covered: coverage.covered,
      unknown: coverage.unknown,
      regionEnabled: coverage.regionEnabled,
      communeName: coverage.communeName,
      regionName: coverage.regionName,
      message: coverage.covered ? null : formatCoverageMessage(coverage)
    }
  });
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

router.post('/presupuesto/:id/responder', requireRole('client'), (req, res) => {
  const approved = req.body.approved === true || req.body.approved === 'true';
  const result = store.respondSiteBudget(req.params.id, req.session.user.id, approved);
  if (result.error) return res.status(400).json({ success: false, error: result.error });

  const io = req.app.get('io');
  io.emit(`request_update_${result.request.id}`, { request: result.request });

  res.json({
    success: true,
    approved: result.approved,
    request: {
      id: result.request.id,
      techStatus: result.request.techStatus,
      status: result.request.status,
      siteReport: result.request.siteReport
    }
  });
});

router.post('/resena/:id', requireRole('client'), (req, res) => {
  const result = store.submitClientReview(req.params.id, req.session.user.id, {
    rating: req.body.rating,
    text: req.body.text
  });
  if (result.error) return res.status(400).json({ success: false, error: result.error });
  res.json({ success: true, review: result.review });
});

module.exports = router;
