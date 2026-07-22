const express = require('express');
const router = express.Router();
const store = require('../models/store');
const { saveRequestFile } = require('../lib/uploads');
const company = require('../config/company');
const { getClientOnboardingSteps } = require('../lib/onboarding');
const { localizeServices } = require('../lib/i18n-admin');
const { getPhotoTips } = require('../lib/photoTips');
const { requireRole, requireVerifiedEmail } = require('../middleware/auth');
const { requireModule } = require('../middleware/modules');
const unassignedRequestWatcher = require('../lib/unassignedRequestWatcher');
const aland = require('../lib/aland');
const notifications = require('../lib/notifications');

function canOpenNoProviderDecision(req, request) {
  if (!request || request.noProviderDecisionStatus !== 'pending') return false;
  if (req.session?.user?.role === 'client' && req.session.user.id === request.clientId) return true;
  const token = String(req.query.token || req.body.token || '');
  return Boolean(token && request.noProviderChoiceTokenHash === unassignedRequestWatcher.hashToken(token));
}

router.get('/solicitud/:id/sin-socio', (req, res) => {
  const request = store.requests.find((item) => item.id === req.params.id);
  if (!canOpenNoProviderDecision(req, request)) {
    return res.status(404).render('error', {
      title: 'Enlace no válido',
      message: 'Este enlace venció o la solicitud ya fue respondida.',
      code: 404
    });
  }
  res.render('client/no-provider-choice', {
    title: 'Elige cómo continuar — Fundez',
    request,
    token: String(req.query.token || ''),
    selectedChoice: ['refund', 'continue'].includes(req.query.choice) ? req.query.choice : null
  });
});

router.post('/solicitud/:id/sin-socio', async (req, res) => {
  const request = store.requests.find((item) => item.id === req.params.id);
  if (!canOpenNoProviderDecision(req, request)) {
    const message = 'El enlace no es válido o la solicitud ya fue respondida.';
    if (req.accepts('json') && !req.accepts('html')) return res.status(403).json({ error: message });
    return res.status(403).render('error', { title: 'No autorizado', message, code: 403 });
  }

  const token = String(req.body.token || '');
  const result = store.respondNoProviderChoice(req.params.id, {
    clientId: req.session?.user?.id || null,
    tokenHash: token ? unassignedRequestWatcher.hashToken(token) : null,
    choice: req.body.choice
  });
  if (result.error) {
    if (req.accepts('json') && !req.accepts('html')) return res.status(400).json(result);
    return res.status(400).render('error', { title: 'No se pudo guardar', message: result.error, code: 400 });
  }

  const updated = result.request;
  if (result.choice === 'refund') {
    notifications.notify({
      event: 'service.refund_requested',
      to: company.supportEmail,
      subject: `Devolución solicitada — ${updated.serviceName}`,
      text: `El cliente ${updated.clientName} solicitó la devolución de la solicitud ${updated.id} porque no hubo socio disponible. Fecha comprometida: ${updated.refundScheduledDate}. Monto pagado: ${store.formatCLP(updated.visitPricePaid || updated.amountDue || 0)}. Procesar al mismo medio de pago.`,
      requestId: updated.id,
      userId: updated.clientId,
      meta: { refundScheduledDate: updated.refundScheduledDate, reason: 'no_provider_available' }
    }).catch(() => {});
  }
  let message = null;
  if (updated.alandConversationId) {
    const body = result.choice === 'refund'
      ? `Recibí tu elección. La devolución de tu servicio ${updated.serviceName} quedó solicitada para el siguiente día hábil (${updated.refundScheduledDate}). Administración procesará el abono al mismo medio de pago.`
      : `Recibí tu elección. Seguiremos intentando encontrar un socio para tu servicio ${updated.serviceName} y te avisaremos apenas alguien lo tome.`;
    try {
      message = await aland.addMessage({
        conversationId: updated.alandConversationId,
        senderType: 'aland',
        senderName: 'Aland IA',
        body,
        meta: { type: 'no_provider_choice_response', requestId: updated.id, choice: result.choice }
      });
    } catch (_) { /* El estado de la solicitud ya quedó guardado. */ }
  }

  const io = req.app.get('io');
  const payload = { request: store.enrichRequestForClient(updated, req.locale || 'es'), message };
  if (io) {
    io.to(`request_${updated.id}`).emit(`request_update_${updated.id}`, payload);
    io.to(`aland_client_${updated.clientId}`).emit('no_provider_choice_resolved', payload);
    io.to('aland_admin').emit('no_provider_choice_resolved', payload);
    if (message) {
      io.to(`aland_client_${updated.clientId}`).emit('aland_message', {
        conversationId: updated.alandConversationId,
        message
      });
    }
  }

  if (req.accepts('json') && !req.accepts('html')) {
    return res.json({ success: true, choice: result.choice, request: payload.request });
  }
  res.render('client/no-provider-choice', {
    title: 'Respuesta recibida — Fundez',
    request: updated,
    token: '',
    selectedChoice: result.choice,
    completed: true
  });
});

router.use(requireRole('client'), requireVerifiedEmail);

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
    promos: store.getPromosForClient(req.session.user.id),
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
  const referral = store.getReferralStats(req.session.user.id) || {
    code: profile?.referralCode || '',
    points: profile?.ziloPoints || 0,
    creditsCLP: profile?.creditsCLP || 0,
    referralsCount: profile?.referralsCount || 0,
    servicesCount: profile?.servicesCount || 0
  };
  res.render('client/profile', {
    title: 'Mi perfil — Fundez',
    user: req.session.user,
    profile,
    referral,
    canSwitchToProvider: req.session.user.primaryRole === 'provider' || profile?.role === 'provider',
    formatCLP: store.formatCLP,
    navActive: 'perfil'
  });
});

router.post('/modo-socio', requireRole('client'), (req, res) => {
  const user = store.getUserById(req.session.user.id);
  if (!user || user.role !== 'provider') {
    return res.status(403).json({ error: 'Esta cuenta no es de socio' });
  }
  req.session.user = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: 'provider',
    primaryRole: 'provider',
    clientEnabled: Boolean(user.clientEnabled)
  };
  store.logSecurityEvent('client_switch_provider', user.email, req);
  res.json({ success: true, redirect: '/proveedor' });
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
  const giftService = store.getActiveServices()[0] || null;
  res.render('client/invitar', {
    title: 'Invitar amigos — Fundez',
    user: req.session.user,
    profile,
    referral,
    shareUrl,
    giftServiceId: giftService?.id || null,
    canUseWelcome: store.canUseWelcomePromo(profile),
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
  const activities = store.getActivitiesForService(serviceRaw.id);
  res.render('client/service', {
    title: `${service.name} — Fundez`,
    user: req.session.user,
    profile,
    service,
    pricing,
    urgencyTiers,
    activities,
    photoTips: getPhotoTips(serviceRaw.id, req.locale),
    trustStats: store.getClientTrustStats(),
    formatCLP: store.formatCLP,
    tracking: req.query.tracking || null
  });
});

router.get('/precio-preview', requireRole('client'), (req, res) => {
  const base = parseInt(req.query.base, 10);
  const valorBase = Number.isFinite(base) && base > 0 ? base : undefined;
  const preview = store.previewVisitPrice(req.query.tier || 'scheduled', valorBase, {
    localTime: req.query.localTime,
    timeZone: req.query.timeZone
  });
  if (!preview) return res.status(400).json({ error: 'Opción de llegada no válida' });
  res.json({
    success: true,
    preview: {
      ...preview,
      formatted: {
        baseVisit: store.formatCLP(preview.baseVisit),
        adjustment: store.formatCLP(preview.adjustmentAmount),
        visitTotal: store.formatCLP(preview.visitTotal),
        servicePrice: store.formatCLP(preview.servicePrice),
        estimatedTotal: store.formatCLP(preview.estimatedTotal),
        diagnosticVisitMin: store.formatCLP(preview.diagnosticVisitMin || 50000)
      }
    }
  });
});

router.get('/subservicios/:serviceId', requireRole('client'), (req, res) => {
  const service = store.getServiceById(req.params.serviceId);
  if (!service || !service.enabled) {
    return res.status(404).json({ error: 'Servicio no disponible' });
  }
  const activities = store.getActivitiesForService(service.id);
  res.json({
    success: true,
    serviceId: service.id,
    serviceName: service.name,
    activities: activities.map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      basePrice: a.basePrice,
      basePriceLabel: store.formatCLP(a.basePrice)
    }))
  });
});

router.post('/solicitar', requireRole('client'), requireModule('client_solicitar'), async (req, res) => {
  const {
    serviceId, address, notes, lat, lng, gift, clientPhoto, clientBrandPhoto,
    brandNotVisible, urgencyTier, activityId, customName, localTime, timeZone
  } = req.body;
  const service = store.getServiceById(serviceId);
  if (!service || !service.enabled) {
    return res.status(400).json({ error: 'Servicio no disponible' });
  }
  if (gift?.name && !store.isModuleEnabled('client_regalo')) {
    return res.status(403).json({ error: 'El módulo de regalos no está habilitado' });
  }
  if (!clientPhoto) {
    return res.status(400).json({ error: 'La foto del problema es obligatoria.' });
  }
  const skipBrand = brandNotVisible === true || brandNotVisible === 'true' || brandNotVisible === 1;
  if (!skipBrand && !clientBrandPhoto) {
    return res.status(400).json({ error: 'Sube la foto de la marca o marca «Sin marca a la vista».' });
  }

  let clientPhotoUrl = null;
  let clientBrandPhotoUrl = null;
  try {
    const tempId = `tmp-${Date.now()}`;
    clientPhotoUrl = saveRequestFile(tempId, 'cliente', clientPhoto);
    if (!skipBrand && clientBrandPhoto) {
      clientBrandPhotoUrl = saveRequestFile(tempId, 'marca', clientBrandPhoto);
    }
  } catch (err) {
    console.error('Error guardando foto cliente:', err.message);
    return res.status(400).json({ error: 'No se pudo guardar la foto. Intenta con otra imagen.' });
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
      clientBrandPhotoUrl,
      brandNotVisible: skipBrand,
      urgencyTier: urgencyTier || 'scheduled',
      activityId,
      customName,
      localTime,
      timeZone
    });

    const fs = require('fs');
    const path = require('path');
    const moveTempPhoto = async (url, prefix, field) => {
      if (!url) return;
      if (!url.includes('/tmp-')) {
        // Ya está en destino final; verificar que el archivo exista
        const finalPath = path.join(__dirname, '../public', url);
        if (!fs.existsSync(finalPath)) {
          console.warn(`[uploads] Foto ausente en disco: ${url}`);
          request[field] = null;
        }
        return;
      }
      const oldPath = path.join(__dirname, '../public', url);
      const newDir = path.join(__dirname, '../public/uploads/requests', request.id);
      fs.mkdirSync(newDir, { recursive: true });
      const newName = `${prefix}-${Date.now()}${path.extname(oldPath) || '.jpg'}`;
      const newPath = path.join(newDir, newName);
      if (fs.existsSync(oldPath)) {
        fs.renameSync(oldPath, newPath);
        request[field] = `/uploads/requests/${request.id}/${newName}`;
      } else {
        console.warn(`[uploads] Temp foto no encontrada: ${url}`);
        request[field] = null;
      }
    };
    await moveTempPhoto(clientPhotoUrl, 'cliente', 'clientPhotoUrl');
    await moveTempPhoto(clientBrandPhotoUrl, 'marca', 'clientBrandPhotoUrl');
    if (request.clientPhotoUrl !== clientPhotoUrl || request.clientBrandPhotoUrl !== clientBrandPhotoUrl) {
      await require('../models/repository').saveRequest(request);
    }

    res.json({ success: true, request });
  } catch (err) {
    console.error('Error creando solicitud:', err.message);
    const isCoverage = /operamos|comuna|trabajando/i.test(err.message || '');
    const isUserError = /Describe|foto|marca|subservicio|urgencia|dirección|cobertura|Opción|Selecciona|mínimo/i.test(err.message || '');
    res.status(isCoverage || isUserError ? 400 : 500).json({
      error: (isCoverage || isUserError)
        ? (err.message || 'No se pudo crear la solicitud')
        : 'No se pudo crear la solicitud. Intenta nuevamente.',
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
  res.json({ request: store.enrichRequestForClient(request, req.locale || 'es'), provider });
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
    redirect: result.additionalCharge ? `/pagos/ajuste?ref=${result.request.id}` : null,
    request: {
      id: result.request.id,
      techStatus: result.request.techStatus,
      status: result.request.status,
      siteReport: result.request.siteReport
    }
  });
});

router.post('/cambio-servicio/:id/responder', requireRole('client'), (req, res) => {
  const approved = req.body.approved === true || req.body.approved === 'true';
  const result = store.respondActivityChange(req.params.id, req.session.user.id, approved);
  if (result.error) return res.status(400).json({ success: false, error: result.error });

  const io = req.app.get('io');
  io.emit(`request_update_${result.request.id}`, { request: result.request });

  res.json({
    success: true,
    approved: result.approved,
    redirect: result.additionalCharge ? `/pagos/ajuste?ref=${result.request.id}` : null,
    request: {
      id: result.request.id,
      activityId: result.request.activityId,
      activityName: result.request.activityName,
      visitTotal: result.request.visitTotal,
      amountDue: result.request.amountDue,
      approvedServicePrice: result.request.approvedServicePrice,
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

router.get('/chat/:requestId', requireRole('client'), (req, res) => {
  const result = store.getRequestChat(req.params.requestId, req.session.user);
  if (result.error) return res.status(result.error === 'No autorizado' ? 403 : 404).json(result);
  res.json(result);
});

router.post('/chat/:requestId', requireRole('client'), (req, res) => {
  const result = store.postRequestChatMessage(req.params.requestId, req.session.user, req.body?.body || req.body?.message);
  if (result.error) return res.status(400).json(result);
  const io = req.app.get('io');
  io.emit(`request_chat_${result.requestId}`, { message: result.message });
  io.emit(`request_update_${result.requestId}`, {
    request: store.requests.find((r) => r.id === result.requestId),
    chatMessage: result.message
  });
  res.json(result);
});

module.exports = router;
