const express = require('express');
const router = express.Router();
const company = require('../config/company');
const store = require('../models/store');

router.get('/privacidad', (req, res) => {
  res.render('legal/privacidad', {
    title: 'Política de Privacidad — Fundez',
    company,
    lastUpdated: '30 de junio de 2026'
  });
});

router.get('/terminos', (req, res) => {
  res.render('legal/terminos', {
    title: 'Términos y Condiciones — Fundez',
    company,
    lastUpdated: '30 de junio de 2026'
  });
});

router.get('/cookies', (req, res) => {
  res.render('legal/cookies', {
    title: 'Política de Cookies — Fundez',
    company,
    lastUpdated: '30 de junio de 2026'
  });
});

router.post('/consent', (req, res) => {
  const { type, granted, version } = req.body;
  const record = store.recordConsent({
    userId: req.session.user?.id || null,
    ip: req.ip,
    type: type || 'cookies',
    granted: granted === true || granted === 'true',
    version: version || '1.0',
    userAgent: req.get('user-agent')
  });
  if (req.session.user) {
    req.session.consentGranted = granted === true || granted === 'true';
  }
  res.json({ success: true, record });
});

router.get('/consent/status', (req, res) => {
  res.json({
    cookies: store.getConsentsSummary(),
    userConsent: req.session.consentGranted || false
  });
});

module.exports = router;
