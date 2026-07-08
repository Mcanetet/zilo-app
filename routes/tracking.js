const express = require('express');
const router = express.Router();
const store = require('../models/store');
const company = require('../config/company');

router.get('/:token', (req, res) => {
  const request = store.getRequestByGuardianToken(req.params.token);
  if (!request) {
    return res.status(404).render('error', {
      title: 'Enlace no válido',
      message: 'Este enlace de seguimiento no existe o ha expirado.',
      code: 404
    });
  }

  let provider = null;
  if (request.providerId) provider = store.getUserById(request.providerId);

  res.render('tracking/guardian', {
    title: 'Modo Guardián — Fundez',
    request,
    provider,
    formatCLP: store.formatCLP,
    company
  });
});

router.get('/:token/estado', (req, res) => {
  const request = store.getRequestByGuardianToken(req.params.token);
  if (!request) return res.status(404).json({ error: 'No encontrado' });

  let provider = null;
  if (request.providerId) {
    const p = store.getUserById(request.providerId);
    provider = { name: p.name, rating: p.rating, phone: p.phone };
  }

  res.json({
    request: {
      id: request.id,
      serviceName: request.serviceName,
      address: request.address,
      status: request.status,
      beneficiaryName: request.beneficiaryName,
      isGift: request.isGift,
      coords: request.coords
    },
    provider
  });
});

module.exports = router;
