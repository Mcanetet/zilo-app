const express = require('express');
const router = express.Router();
const store = require('../models/store');
const { requireRole } = require('../middleware/auth');

function serializeJob(request) {
  const service = store.getServiceById(request.serviceId);
  return {
    id: request.id,
    serviceId: request.serviceId,
    serviceName: request.serviceName || (service ? service.name : request.serviceId),
    clientName: request.clientName || '—',
    address: request.address || '',
    notes: request.notes || '',
    status: request.status,
    techStatus: request.techStatus || 'asignado',
    coords: request.coords || null,
    isGift: !!request.isGift,
    beneficiaryName: request.beneficiaryName || null
  };
}

router.get('/', requireRole('tecnico'), (req, res) => {
  const tecnico = store.getUserById(req.session.user.id);
  const socio = tecnico && tecnico.parentId ? store.getUserById(tecnico.parentId) : null;
  const jobs = store.getRequestsByTechnician(tecnico.id)
    .filter(r => r.techStatus !== 'completado' && r.status !== 'completed')
    .map(serializeJob);

  res.render('tecnico/dashboard', {
    title: 'Fundez — Panel Técnico',
    user: req.session.user,
    tecnico,
    socio,
    jobs,
    services: store.SERVICES,
    formatCLP: store.formatCLP
  });
});

router.post('/status/:requestId', requireRole('tecnico'), (req, res) => {
  const { techStatus } = req.body;
  const valid = ['aceptado', 'en_camino', 'en_sitio', 'completado'];
  if (!valid.includes(techStatus)) return res.status(400).json({ success: false, error: 'Estado inválido' });

  const request = store.updateTechStatus(req.params.requestId, req.session.user.id, techStatus);
  if (!request) return res.status(404).json({ success: false, error: 'Solicitud no encontrada' });

  const io = req.app.get('io');
  io.emit(`request_update_${request.id}`, { request });

  res.json({ success: true, request: { id: request.id, status: request.status, techStatus: request.techStatus } });
});

router.post('/ubicacion', requireRole('tecnico'), (req, res) => {
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
