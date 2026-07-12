const express = require('express');
const router = express.Router();
const store = require('../models/store');
const { dispatchPendingToProvider, broadcastRequestTaken, buildWorkWallPayload } = require('../lib/dispatch');
const { requireRole } = require('../middleware/auth');
const { requireModule } = require('../middleware/modules');
const { saveProviderFile } = require('../lib/uploads');
const { verifySelfie } = require('../lib/faceVerify');
const { getProviderOnboardingSteps } = require('../lib/onboarding');
const { getClientIp } = require('../middleware/security');
const {
  ENTITY_TYPES,
  DOCUMENT_CATALOG,
  LEGAL_DECLARATIONS,
  CONTRACT_CLAUSES,
  TEMPLATE_VERSION,
  getDocumentsForEntity,
  getContractSummary
} = require('../lib/contracts');
const company = require('../config/company');

router.get('/mensajes', requireRole('provider'), requireModule('provider_mensajes'), (req, res) => {
  res.render('provider/mensajes', {
    title: 'Mensajes — Fundez',
    user: req.session.user,
    providerId: req.session.user.id
  });
});

router.get('/', requireRole('provider'), (req, res) => {
  const provider = store.getUserById(req.session.user.id);
  const myRequests = store.getRequestsByProvider(req.session.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 10)
    .map(r => store.enrichRequestForProvider(r, req.locale));
  const activeJobs = store.getActiveRequestsForProvider(req.session.user.id, req.locale);
  const pending = store.getPendingRequestsForProvider(req.session.user.id);
  const verificationCheck = store.canProviderGoOnline(provider);
  const contractSummary = getContractSummary(provider.providerContract);
  const providerStats = store.getProviderDashboardStats(req.session.user.id);

  res.render('provider/dashboard', {
    title: 'Fundez — Panel Proveedor',
    user: req.session.user,
    provider,
    verificationCheck,
    contractSummary,
    showContractBanner: !contractSummary.canOperate,
    services: store.SERVICES,
    myRequests,
    activeJobs,
    providerStats,
    workflowStep: store.getProviderWorkflowStep(req.session.user.id),
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
  const items = buildWorkWallPayload(req.session.user.id);
  res.json({
    success: true,
    items,
    pending: items[0] || null
  });
});

router.get('/muro', requireRole('provider'), (req, res) => {
  res.json({ success: true, items: buildWorkWallPayload(req.session.user.id) });
});

router.post('/toggle-online', requireRole('provider'), requireModule('provider_online'), (req, res) => {
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

router.post('/accept/:requestId', requireRole('provider'), requireModule('provider_aceptar'), (req, res) => {
  const result = store.tryAcceptRequest(req.params.requestId, req.session.user.id);
  if (result.error) {
    return res.status(result.code === 'taken' ? 409 : 400).json({ error: result.error });
  }

  const request = result.request;
  const provider = store.getUserById(req.session.user.id);
  const io = req.app.get('io');
  const publicProvider = store.getPublicProviderProfile(provider);

  broadcastRequestTaken(io, request.id, provider.id);
  io.emit(`request_update_${request.id}`, {
    request: store.requests.find(r => r.id === request.id),
    provider: publicProvider
  });

  res.json({ success: true, request: store.requests.find(r => r.id === request.id) });
});

router.post('/status/:requestId', requireRole('provider'), (req, res) => {
  const { status } = req.body;
  const existing = store.requests.find(r => r.id === req.params.requestId);
  if (!existing || existing.providerId !== req.session.user.id) {
    return res.status(404).json({ error: 'Solicitud no encontrada' });
  }
  const allowed = ['in_progress', 'completed'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: 'Estado no válido' });
  }
  const request = store.updateRequestStatus(req.params.requestId, status);
  if (!request) return res.status(404).json({ error: 'Solicitud no encontrada' });

  const io = req.app.get('io');
  io.emit(`request_update_${request.id}`, { request });

  res.json({ success: true, request: store.enrichRequestForProvider(request, req.locale) });
});

router.get('/perfil', requireRole('provider'), requireModule('provider_perfil'), (req, res) => {
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

router.post('/perfil', requireRole('provider'), requireModule('provider_perfil'), (req, res) => {
  const user = store.updateUserProfile(req.session.user.id, req.body);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  req.session.user.name = user.name;
  res.json({
    success: true,
    user: { name: user.name, phone: user.phone, email: user.email, bio: user.bio, avatar: user.avatar }
  });
});

router.post('/verificacion/documento', requireRole('provider'), requireModule('provider_verificacion'), (req, res) => {
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

router.post('/verificacion/selfie', requireRole('provider'), requireModule('provider_verificacion'), (req, res) => {
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

router.post('/verificacion/ubicacion', requireRole('provider'), requireModule('provider_verificacion'), (req, res) => {
  const consent = req.body.consent === true || req.body.consent === 'true';
  const locationShare = store.setLocationConsent(req.session.user.id, consent);
  res.json({ success: true, locationShare, verification: store.getUserById(req.session.user.id).verification });
});

router.post('/ubicacion', requireRole('provider'), requireModule('provider_ubicacion'), (req, res) => {
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

router.get('/equipo', requireRole('provider'), requireModule('provider_equipo'), (req, res) => {
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

router.post('/equipo', requireRole('provider'), requireModule('provider_equipo'), async (req, res) => {
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

router.post('/equipo/:id/toggle', requireRole('provider'), requireModule('provider_equipo'), (req, res) => {
  const tecnico = store.getTechnicianForProvider(req.session.user.id, req.params.id);
  if (!tecnico) return res.status(404).json({ success: false, error: 'Técnico no encontrado' });

  const active = req.body.active === 'true' || req.body.active === true;
  store.setUserActive(tecnico.id, active);
  res.json({ success: true, id: tecnico.id, active });
});

router.get('/mando', requireRole('provider'), requireModule('provider_mando'), (req, res) => {
  const provider = store.getUserById(req.session.user.id);
  const technicians = store.getTechniciansByProvider(provider.id).filter(t => t.active !== false);
  const active = store.getActiveRequestsForProvider(provider.id, req.locale);

  res.render('provider/mando', {
    title: 'Cuadro de mando — Fundez',
    user: req.session.user,
    provider,
    technicians,
    requests: active,
    providerStats: store.getProviderDashboardStats(provider.id),
    workflowStep: 3,
    services: store.SERVICES,
    formatCLP: store.formatCLP
  });
});

router.post('/asignar/:requestId', requireRole('provider'), requireModule('provider_mando'), (req, res) => {
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
    contract: getContractSummary(provider.providerContract),
    check: store.canProviderGoOnline(provider)
  });
});

router.get('/contrato', requireRole('provider'), requireModule('provider_contrato'), (req, res) => {
  const provider = store.getUserById(req.session.user.id);
  const contract = store.getProviderContract(provider.id);
  const summary = getContractSummary(contract);
  res.render('provider/contrato', {
    title: 'Contrato de socio — Fundez',
    user: req.session.user,
    provider,
    contract,
    summary,
    entityTypes: ENTITY_TYPES,
    documentCatalog: DOCUMENT_CATALOG,
    legalDeclarations: LEGAL_DECLARATIONS,
    contractClauses: CONTRACT_CLAUSES,
    templateVersion: TEMPLATE_VERSION,
    company,
    documentsForEntity: contract.entityType ? getDocumentsForEntity(contract.entityType) : []
  });
});

router.post('/contrato/draft', requireRole('provider'), requireModule('provider_contrato'), (req, res) => {
  const result = store.updateProviderContractDraft(req.session.user.id, req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result);
});

router.post('/contrato/documento', requireRole('provider'), requireModule('provider_contrato'), (req, res) => {
  const { docKey, data, label } = req.body;
  if (!docKey || !data) return res.status(400).json({ error: 'Documento inválido.' });
  try {
    const url = saveProviderFile(req.session.user.id, `contract-${docKey}`, data);
    const contract = store.saveContractDocument(req.session.user.id, docKey, url, label);
    res.json({ success: true, url, contract, summary: getContractSummary(contract) });
  } catch (err) {
    res.status(400).json({ error: err.message || 'No se pudo guardar el documento.' });
  }
});

router.post('/contrato/enviar', requireRole('provider'), requireModule('provider_contrato'), (req, res) => {
  const draft = store.updateProviderContractDraft(req.session.user.id, req.body);
  if (draft.error) return res.status(400).json({ error: draft.error });
  const result = store.submitProviderContract(req.session.user.id, {
    signature: req.body.signature || {},
    ip: getClientIp(req),
    userAgent: req.get('user-agent')
  });
  if (result.error) return res.status(400).json({ error: result.error, errors: result.errors });
  store.logSecurityEvent('contrato_enviado', req.session.user.email, req);
  store.recordConsent({
    userId: req.session.user.id,
    type: 'contrato_socio',
    granted: true,
    version: TEMPLATE_VERSION,
    ip: getClientIp(req)
  });
  res.json(result);
});

module.exports = router;
