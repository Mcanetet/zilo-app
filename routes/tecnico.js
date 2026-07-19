const express = require('express');
const { dispatchPendingToTechnician, broadcastRequestTaken, buildWorkWallPayload } = require('../lib/dispatch');
const router = express.Router();
const store = require('../models/store');
const { requireRole, requireVerifiedEmail } = require('../middleware/auth');
const { requireModule } = require('../middleware/modules');
const { saveRequestFile } = require('../lib/uploads');

router.use(requireRole('tecnico'), requireVerifiedEmail);

function getTechLabels(t) {
  return {
    asignado: t('status.tech.asignado'),
    aceptado: t('status.tech.aceptado'),
    en_camino: t('status.tech.en_camino'),
    en_sitio: t('status.tech.en_sitio'),
    diagnostico: t('status.tech.diagnostico_label'),
    reparando: t('status.tech.reparando'),
    comprando: t('status.tech.comprando'),
    presupuesto_pendiente: t('status.tech.presupuesto_pendiente'),
    presupuesto_aprobado: t('status.tech.presupuesto_aprobado'),
    completado: t('status.tech.completado')
  };
}

function serializeJob(request) {
  const service = store.getServiceById(request.serviceId);
  return {
    id: request.id,
    serviceId: request.serviceId,
    serviceName: request.serviceName || (service ? service.name : request.serviceId),
    activityId: request.activityId || null,
    activityName: request.activityName || null,
    clientName: request.clientName || '—',
    address: request.address || '',
    notes: request.notes || '',
    clientPhotoUrl: request.clientPhotoUrl || null,
    clientBrandPhotoUrl: request.clientBrandPhotoUrl || null,
    brandNotVisible: Boolean(request.brandNotVisible),
    status: request.status,
    techStatus: request.techStatus || 'asignado',
    siteReport: request.siteReport || null,
    coords: request.coords || null,
    isGift: !!request.isGift,
    beneficiaryName: request.beneficiaryName || null
  };
}

router.get('/', requireRole('tecnico'), (req, res) => {
  const tecnico = store.getUserById(req.session.user.id);
  const socio = tecnico?.parentId ? store.getUserById(tecnico.parentId) : null;
  const jobs = store.getRequestsByTechnician(tecnico.id)
    .filter(r => r.techStatus !== 'completado' && r.status !== 'completed')
    .map(serializeJob);

  res.render('tecnico/dashboard', {
    title: 'Fundez — Panel Técnico',
    user: req.session.user,
    tecnico,
    socio,
    jobs,
    techLabels: getTechLabels(req.t),
    services: store.SERVICES,
    formatCLP: store.formatCLP
  });
});

router.get('/trabajo/:requestId', requireRole('tecnico'), (req, res) => {
  const tecnico = store.getUserById(req.session.user.id);
  const request = store.getRequestForTechnician(req.params.requestId, tecnico.id);
  if (!request || request.techStatus === 'completado' || request.status === 'completed') {
    return res.redirect(req.session.user.role === 'provider' ? '/proveedor/mando' : '/tecnico');
  }

  res.render('tecnico/trabajo', {
    title: 'Visita en terreno — Fundez',
    user: req.session.user,
    tecnico,
    request: serializeJob(request),
    returnUrl: req.session.user.role === 'provider' ? '/proveedor/mando' : '/tecnico',
    techLabels: getTechLabels(req.t),
    formatCLP: store.formatCLP
  });
});

router.get('/muro', requireRole('tecnico'), (req, res) => {
  res.json({ success: true, items: buildWorkWallPayload(req.session.user.id) });
});

router.post('/toggle-online', requireRole('tecnico'), (req, res) => {
  const online = req.body.online === 'true' || req.body.online === true;
  const tecnico = store.setTechnicianOnline(req.session.user.id, online);
  if (!tecnico) {
    const check = store.canTechnicianOperate(store.getUserById(req.session.user.id));
    return res.status(400).json({
      success: false,
      error: `Tu expediente está incompleto: ${check.missing.join(', ')}. Pide al socio que cargue los documentos.`
    });
  }

  let synced = 0;
  if (online) {
    synced = dispatchPendingToTechnician(req.app.get('io'), req.session.user.id);
  }

  res.json({ success: true, online, synced });
});

router.post('/accept/:requestId', requireRole('tecnico'), (req, res) => {
  const result = store.tryAcceptRequest(req.params.requestId, req.session.user.id);
  if (result.error) {
    return res.status(result.code === 'taken' ? 409 : 400).json({ success: false, error: result.error });
  }

  const request = result.request;
  const socio = store.getUserById(request.providerId);
  const io = req.app.get('io');
  broadcastRequestTaken(io, request.id, req.session.user.id);
  io.emit(`request_update_${request.id}`, {
    request,
    provider: store.getPublicProviderProfile(socio)
  });
  io.to(store.technicianSockets.get(req.session.user.id) || '').emit(`tecnico_assignment_${req.session.user.id}`, { request: serializeJob(request) });

  res.json({ success: true, request: serializeJob(request) });
});

router.post('/status/:requestId', requireRole('tecnico'), (req, res) => {
  const { techStatus } = req.body;
  const valid = ['aceptado', 'en_camino', 'en_sitio'];
  if (!valid.includes(techStatus)) return res.status(400).json({ success: false, error: 'Estado inválido' });

  const request = store.updateTechStatus(req.params.requestId, req.session.user.id, techStatus);
  if (!request) return res.status(404).json({ success: false, error: 'Solicitud no encontrada' });

  const io = req.app.get('io');
  io.emit(`request_update_${request.id}`, { request });

  res.json({ success: true, request: { id: request.id, status: request.status, techStatus: request.techStatus } });
});

router.post('/trabajo/:requestId/llegada', requireRole('tecnico'), (req, res) => {
  const { diagnosis, photoStart } = req.body;
  let photoUrl = null;
  if (photoStart) {
    try {
      photoUrl = saveRequestFile(req.params.requestId, 'inicio', photoStart);
    } catch (err) {
      return res.status(400).json({ success: false, error: 'No se pudo guardar la foto inicial' });
    }
  }
  const result = store.recordSiteArrival(req.params.requestId, req.session.user.id, { diagnosis, photoStart: photoUrl });
  if (result.error) return res.status(400).json({ success: false, error: result.error });

  req.app.get('io').emit(`request_update_${result.request.id}`, { request: result.request });
  res.json({ success: true, request: serializeJob(result.request) });
});

router.post('/trabajo/:requestId/accion', requireRole('tecnico'), (req, res) => {
  const result = store.setSiteAction(req.params.requestId, req.session.user.id, req.body.action);
  if (result.error) return res.status(400).json({ success: false, error: result.error });
  req.app.get('io').emit(`request_update_${result.request.id}`, { request: result.request });
  res.json({ success: true, request: serializeJob(result.request) });
});

router.post('/trabajo/:requestId/presupuesto', requireRole('tecnico'), (req, res) => {
  const result = store.submitSiteBudget(req.params.requestId, req.session.user.id, req.body);
  if (result.error) return res.status(400).json({ success: false, error: result.error });
  req.app.get('io').emit(`request_update_${result.request.id}`, { request: result.request });
  res.json({ success: true, request: serializeJob(result.request) });
});

router.get('/trabajo/:requestId/subservicios', requireRole('tecnico'), (req, res) => {
  const job = store.getRequestForTechnician(req.params.requestId, req.session.user.id);
  if (!job) return res.status(404).json({ success: false, error: 'Solicitud no encontrada' });
  const activities = store.getActivitiesForService(job.serviceId);
  res.json({
    success: true,
    currentActivityId: job.activityId || null,
    activities: activities.map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      basePrice: a.basePrice,
      basePriceLabel: store.formatCLP(a.basePrice)
    }))
  });
});

router.post('/trabajo/:requestId/cambio-servicio', requireRole('tecnico'), (req, res) => {
  let photoUrl = null;
  if (req.body.photo) {
    try {
      photoUrl = saveRequestFile(req.params.requestId, 'cambio', req.body.photo);
    } catch (err) {
      return res.status(400).json({ success: false, error: 'No se pudo guardar la foto del cambio' });
    }
  }
  const result = store.proposeActivityChange(req.params.requestId, req.session.user.id, {
    activityId: req.body.activityId,
    photoUrl,
    notes: req.body.notes,
    customName: req.body.customName,
    customBasePrice: req.body.customBasePrice
  });
  if (result.error) return res.status(400).json({ success: false, error: result.error });
  req.app.get('io').emit(`request_update_${result.request.id}`, { request: result.request });
  res.json({ success: true, request: serializeJob(result.request), activityChange: result.activityChange });
});

router.post('/trabajo/:requestId/material', requireRole('tecnico'), (req, res) => {
  let receiptUrl = null;
  if (req.body.receipt) {
    try {
      receiptUrl = saveRequestFile(req.params.requestId, 'boleta', req.body.receipt);
    } catch (err) {
      return res.status(400).json({ success: false, error: 'No se pudo guardar la boleta' });
    }
  }
  const result = store.addSiteMaterial(req.params.requestId, req.session.user.id, {
    description: req.body.description,
    amount: req.body.amount,
    receiptUrl
  });
  if (result.error) return res.status(400).json({ success: false, error: result.error });
  res.json({ success: true, material: result.material, materials: result.request.siteReport.materials });
});

router.post('/trabajo/:requestId/completar', requireRole('tecnico'), (req, res) => {
  let photoUrl = null;
  if (req.body.photoEnd) {
    try {
      photoUrl = saveRequestFile(req.params.requestId, 'fin', req.body.photoEnd);
    } catch (err) {
      return res.status(400).json({ success: false, error: 'No se pudo guardar la foto final' });
    }
  }
  const result = store.completeSiteWork(req.params.requestId, req.session.user.id, {
    workNotes: req.body.workNotes,
    photoEnd: photoUrl
  });
  if (result.error) return res.status(400).json({ success: false, error: result.error });
  req.app.get('io').emit(`request_update_${result.request.id}`, { request: result.request });
  const enriched = store.enrichRequestForProvider(result.request);
  res.json({ success: true, request: serializeJob(result.request), settlement: enriched.financialsVisible });
});

router.post('/ubicacion', requireRole('tecnico'), requireModule('provider_ubicacion'), (req, res) => {
  const { lat, lng, requestId } = req.body;
  if (lat == null || lng == null) return res.status(400).json({ success: false, error: 'Coordenadas requeridas' });

  const loc = store.updateTechnicianLocation(req.session.user.id, lat, lng);
  if (!loc) return res.status(403).json({ success: false, error: 'No se pudo actualizar la ubicación' });

  let eta = null;
  if (requestId) {
    const request = store.requests.find(r => r.id === requestId);
    if (request && request.technicianId === req.session.user.id) {
      if (request.coords) {
        eta = store.computeEtaMinutes(loc.lat, loc.lng, request.coords.lat, request.coords.lng);
      }
      const io = req.app.get('io');
      io.to(`request_${requestId}`).emit(`provider_location_${requestId}`, {
        lat: loc.lat,
        lng: loc.lng,
        updatedAt: loc.updatedAt,
        etaMinutes: eta ? eta.etaMinutes : null,
        distanceKm: eta ? eta.distanceKm : null
      });
    }
  }

  res.json({ success: true, location: loc, eta });
});

module.exports = router;
