const store = require('../models/store');
const { sanitizeRequestForWorker } = require('./pricing');

function buildRequestPayload(request) {
  const pricing = store.getPricingConfig();
  const safe = sanitizeRequestForWorker(request, pricing);
  return {
    request: {
      ...safe,
      activityId: request.activityId || null,
      activityName: request.activityName || null,
      notes: request.notes || '',
      clientPhotoUrl: request.clientPhotoUrl || null,
      clientBrandPhotoUrl: request.clientBrandPhotoUrl || null,
      brandNotVisible: Boolean(request.brandNotVisible)
    },
    service: store.getServiceById(request.serviceId),
    client: {
      id: request.clientId,
      name: request.clientName || store.getUserById(request.clientId)?.name || 'Cliente'
    }
  };
}

function buildWorkWallPayload(userId) {
  return store.getWorkWallItems(userId).map(buildRequestPayload);
}

function workerSocketIdsForService(serviceId) {
  const ids = new Set();
  store.getOnlineProviders(serviceId).forEach(p => {
    const sid = store.providerSockets.get(p.id);
    if (sid) ids.add(sid);
  });
  store.getOnlineTechnicians(serviceId).forEach(t => {
    const sid = store.technicianSockets.get(t.id);
    if (sid) ids.add(sid);
  });
  return [...ids];
}

function notifyWorkWallNewRequest(io, request) {
  const payload = buildRequestPayload(request);
  workerSocketIdsForService(request.serviceId).forEach(socketId => {
    io.to(socketId).emit('work_wall_new', payload);
    io.to(socketId).emit('new_request', payload);
  });
}

function syncWorkWallToWorker(io, userId) {
  const user = store.getUserById(userId);
  if (!user) return 0;

  const socketId = user.role === 'provider'
    ? store.providerSockets.get(userId)
    : store.technicianSockets.get(userId);
  if (!socketId) return 0;

  const items = buildWorkWallPayload(userId);
  io.to(socketId).emit('work_wall_sync', { items });
  return items.length;
}

function broadcastRequestTaken(io, requestId, winnerId) {
  const msg = { requestId, winnerId };
  store.providerSockets.forEach(socketId => io.to(socketId).emit('request_taken', msg));
  store.technicianSockets.forEach(socketId => io.to(socketId).emit('request_taken', msg));
}

function notifyProvidersForRequest(io, request) {
  notifyWorkWallNewRequest(io, request);
}

function dispatchPendingToProvider(io, providerId) {
  return syncWorkWallToWorker(io, providerId);
}

function dispatchPendingToTechnician(io, tecnicoId) {
  return syncWorkWallToWorker(io, tecnicoId);
}

module.exports = {
  buildRequestPayload,
  buildWorkWallPayload,
  notifyProvidersForRequest,
  notifyWorkWallNewRequest,
  syncWorkWallToWorker,
  broadcastRequestTaken,
  dispatchPendingToProvider,
  dispatchPendingToTechnician
};
