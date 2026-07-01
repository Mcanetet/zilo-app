const store = require('../models/store');

function buildRequestPayload(request) {
  return {
    request,
    service: store.getServiceById(request.serviceId),
    client: store.getUserById(request.clientId)
  };
}

function notifyProvidersForRequest(io, request) {
  const payload = buildRequestPayload(request);
  store.getOnlineProviders(request.serviceId).forEach(provider => {
    const socketId = store.providerSockets.get(provider.id);
    if (socketId) {
      io.to(socketId).emit('new_request', payload);
    }
  });
}

function dispatchPendingToProvider(io, providerId) {
  const provider = store.getUserById(providerId);
  if (!provider || !provider.online) return 0;

  const socketId = store.providerSockets.get(providerId);
  if (!socketId) return 0;

  const pending = store.getPendingRequestsForProvider(providerId);
  if (pending.length === 0) return 0;

  const request = pending[0];
  io.to(socketId).emit('new_request', buildRequestPayload(request));
  return pending.length;
}

module.exports = { notifyProvidersForRequest, dispatchPendingToProvider };
