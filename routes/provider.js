const express = require('express');
const router = express.Router();
const store = require('../models/store');
const { dispatchPendingToProvider } = require('../lib/dispatch');
const { requireRole } = require('../middleware/auth');
const { saveProviderFile } = require('../lib/uploads');
const { verifySelfie } = require('../lib/faceVerify');
const { getProviderOnboardingSteps } = require('../lib/onboarding');

router.get('/', requireRole('provider'), (req, res) => {
  const provider = store.getUserById(req.session.user.id);
  const myRequests = store.getRequestsByProvider(req.session.user.id);
  const pending = store.getPendingRequestsForProvider(req.session.user.id);
  const verificationCheck = store.canProviderGoOnline(provider);

  res.render('provider/dashboard', {
    title: 'Fundez — Panel Proveedor',
    user: req.session.user,
    provider,
    verificationCheck,
    services: store.SERVICES,
    myRequests: myRequests.slice(0, 10),
    pendingCount: pending.length,
    formatCLP: store.formatCLP,
    showOnboarding: store.needsOnboarding(provider),
    onboardingSteps: getProviderOnboardingSteps({ hasVerificationBanner: !verificationCheck.ok }),
    onboardingCompleteUrl: '/proveedor/onboarding/complete'
  });
});

router.post('/onboarding/complete', requireRole('provider'), (req, res) => {
  const user = store.completeOnboarding(req.session.user.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  store.logSecurityEvent('onboarding_complete', req.body.skipped ? 'skipped' : 'finished', req);
  res.json({ success: true });
});

router.get('/pendientes', requireRole('provider'), (req, res) => {
  const pending = store.getPendingRequestsForProvider(req.session.user.id);
  if (pending.length === 0) {
    return res.json({ success: true, pending: null });
  }

  const request = pending[0];
  res.json({
    success: true,
    pending: {
      request,
      service: store.getServiceById(request.serviceId),
      client: store.getUserById(request.clientId)
    }
  });
});

router.post('/toggle-online', requireRole('provider'), (req, res) => {
  const provider = store.getUserById(req.session.user.id);
  const online = req.body.online === 'true' || req.body.online === true;

  if (online) {
    const check = store.canProviderGoOnline(provider);
    if (!check.ok) {
      return res.status(400).json({
        success: false,
        error: 'Debes completar tu verificación antes de ponerte en línea',
        missing: check.missing,
        redirect: '/proveedor/perfil#verificacion'
      });
    }
  }

  store.setProviderOnline(provider.id, online);

  let dispatched = 0;
  if (online) {
    dispatched = dispatchPendingToProvider(req.app.get('io'), provider.id);
  }

  res.json({ success: true, online, dispatched });
});

router.post('/accept/:requestId', requireRole('provider'), (req, res) => {
  const request = store.requests.find(r => r.id === req.params.requestId);

  if (!request || request.status !== 'searching') {
    return res.status(409).json({ error: 'Solicitud ya no está disponible' });
  }

  const provider = store.getUserById(req.session.user.id);
  if (!provider.specialties.includes(request.serviceId)) {
    return res.status(403).json({ error: 'No tienes esta especialidad' });
  }

  store.assignProvider(req.params.requestId, req.session.user.id);

  const io = req.app.get('io');
  const publicProvider = store.getPublicProviderProfile(provider);
  io.emit(`request_update_${request.id}`, {
    request: store.requests.find(r => r.id === request.id),
    provider: publicProvider
  });

  res.json({ success: true, request: store.requests.find(r => r.id === request.id) });
});

router.post('/status/:requestId', requireRole('provider'), (req, res) => {
  const { status } = req.body;
  const request = store.updateRequestStatus(req.params.requestId, status);
  if (!request || request.providerId !== req.session.user.id) {
    return res.status(404).json({ error: 'Solicitud no encontrada' });
  }

  const io = req.app.get('io');
  io.emit(`request_update_${request.id}`, { request });

  res.json({ success: true, request });
});

router.get('/perfil', requireRole('provider'), (req, res) => {
  const provider = store.getUserById(req.session.user.id);
  const verificationCheck = store.canProviderGoOnline(provider);
  res.render('provider/profile', {
    title: 'Mi perfil — Fundez',
    user: req.session.user,
    provider,
    verificationCheck,
    services: store.SERVICES,
    formatCLP: store.formatCLP
  });
});

router.post('/perfil', requireRole('provider'), (req, res) => {
  const user = store.updateUserProfile(req.session.user.id, req.body);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  req.session.user.name = user.name;
  res.json({
    success: true,
    user: { name: user.name, phone: user.phone, email: user.email, bio: user.bio, avatar: user.avatar }
  });
});

router.post('/verificacion/documento', requireRole('provider'), (req, res) => {
  const { type, data, label } = req.body;
  const valid = ['idFront', 'idBack', 'certificate'];
  if (!valid.includes(type) || !data) {
    return res.status(400).json({ error: 'Tipo de documento o archivo inválido' });
  }

  try {
    const url = saveProviderFile(req.session.user.id, type, data);
    const verification = store.saveProviderDocument(req.session.user.id, type, url, label);
    res.json({ success: true, url, verification });
  } catch (err) {
    console.error('Error subiendo documento:', err.message);
    res.status(500).json({ error: 'No se pudo guardar el documento' });
  }
});

router.post('/verificacion/selfie', requireRole('provider'), (req, res) => {
  const { data } = req.body;
  if (!data) return res.status(400).json({ error: 'Imagen requerida' });

  const faceResult = verifySelfie(data);
  if (!faceResult.success) {
    return res.status(400).json(faceResult);
  }

  try {
    const url = saveProviderFile(req.session.user.id, 'selfie', data);
    const verification = store.saveProviderSelfie(req.session.user.id, url, faceResult);
    res.json({ success: true, url, verification, faceResult });
  } catch (err) {
    res.status(500).json({ error: 'Error al guardar la selfie' });
  }
});

router.post('/verificacion/ubicacion', requireRole('provider'), (req, res) => {
  const consent = req.body.consent === true || req.body.consent === 'true';
  const locationShare = store.setLocationConsent(req.session.user.id, consent);
  res.json({ success: true, locationShare, verification: store.getUserById(req.session.user.id).verification });
});

router.post('/ubicacion', requireRole('provider'), (req, res) => {
  const { lat, lng, requestId } = req.body;
  if (lat == null || lng == null) {
    return res.status(400).json({ error: 'Coordenadas requeridas' });
  }

  const loc = store.updateProviderLocation(req.session.user.id, lat, lng);
  if (!loc) return res.status(403).json({ error: 'Ubicación no autorizada' });

  if (requestId) {
    const io = req.app.get('io');
    io.to(`request_${requestId}`).emit(`provider_location_${requestId}`, {
      lat: loc.lat,
      lng: loc.lng,
      updatedAt: loc.updatedAt
    });
  }

  res.json({ success: true, location: loc });
});

router.get('/equipo', requireRole('provider'), (req, res) => {
  const provider = store.getUserById(req.session.user.id);
  const technicians = store.getTechniciansByProvider(provider.id);
  res.render('provider/equipo', {
    title: 'Mi equipo — Fundez',
    user: req.session.user,
    provider,
    technicians,
    services: store.SERVICES,
    error: null,
    ok: null
  });
});

router.post('/equipo', requireRole('provider'), async (req, res) => {
  const { name, email, password, phone } = req.body;
  const result = await store.createTechnician(req.session.user.id, { name, email, password, phone });

  if (result.error) {
    const isJson = req.xhr || (req.get('accept') || '').includes('application/json');
    if (isJson) return res.status(400).json({ success: false, error: result.error });
    const provider = store.getUserById(req.session.user.id);
    return res.status(400).render('provider/equipo', {
      title: 'Mi equipo — Fundez',
      user: req.session.user,
      provider,
      technicians: store.getTechniciansByProvider(provider.id),
      services: store.SERVICES,
      error: result.error,
      ok: null
    });
  }

  store.logSecurityEvent('tecnico_creado', result.tecnico.email, req);
  const isJson = req.xhr || (req.get('accept') || '').includes('application/json');
  if (isJson) {
    return res.json({
      success: true,
      tecnico: { id: result.tecnico.id, name: result.tecnico.name, email: result.tecnico.email, phone: result.tecnico.phone, active: true }
    });
  }
  res.redirect('/proveedor/equipo');
});

router.post('/equipo/:id/toggle', requireRole('provider'), (req, res) => {
  const tecnico = store.getTechnicianForProvider(req.session.user.id, req.params.id);
  if (!tecnico) return res.status(404).json({ success: false, error: 'Técnico no encontrado' });

  const active = req.body.active === 'true' || req.body.active === true;
  store.setUserActive(tecnico.id, active);
  res.json({ success: true, id: tecnico.id, active });
});

router.get('/mando', requireRole('provider'), (req, res) => {
  const provider = store.getUserById(req.session.user.id);
  const technicians = store.getTechniciansByProvider(provider.id).filter(t => t.active !== false);
  const active = store.getRequestsByProvider(provider.id)
    .filter(r => r.status !== 'completed' && r.status !== 'cancelled')
    .sort((a, b) => new Date(b.assignedAt || b.createdAt) - new Date(a.assignedAt || a.createdAt));

  res.render('provider/mando', {
    title: 'Cuadro de mando — Fundez',
    user: req.session.user,
    provider,
    technicians,
    requests: active,
    services: store.SERVICES,
    formatCLP: store.formatCLP
  });
});

router.post('/asignar/:requestId', requireRole('provider'), (req, res) => {
  const { technicianId } = req.body;
  const result = store.assignTechnician(req.params.requestId, req.session.user.id, technicianId);
  if (result.error) return res.status(400).json({ success: false, error: result.error });

  const io = req.app.get('io');
  io.emit(`tecnico_assignment_${result.tecnico.id}`, { requestId: result.request.id });
  io.emit(`request_update_${result.request.id}`, { request: result.request });
  store.logSecurityEvent('tecnico_asignado', `${result.tecnico.email} -> ${result.request.id}`, req);

  res.json({
    success: true,
    request: { id: result.request.id, technicianId: result.tecnico.id, technicianName: result.tecnico.name, techStatus: result.request.techStatus }
  });
});

router.get('/verificacion/estado', requireRole('provider'), (req, res) => {
  const provider = store.getUserById(req.session.user.id);
  res.json({
    success: true,
    verification: provider.verification,
    locationShare: provider.locationShare,
    check: store.canProviderGoOnline(provider)
  });
});

module.exports = router;
