const express = require('express');
const router = express.Router();
const company = require('../config/company');
const store = require('../models/store');
const { requireAuth } = require('../middleware/auth');
const { CONSENT_DEFINITIONS, POLICY_VERSION } = require('../lib/consent-policy');
const { buildPageMeta } = require('../lib/seo');

const CONSENT_LABELS = {
  terminos: 'Términos y Condiciones',
  privacidad: 'Política de Privacidad',
  tratamiento_cuenta: 'Tratamiento de datos de cuenta',
  marketing: 'Comunicaciones comerciales',
  cookies_analiticas: 'Cookies analíticas',
  geolocalizacion: 'Geolocalización en servicios',
  datos_sensibles_kyc: 'Verificación de identidad (KYC)',
  contrato_socio: 'Contrato de socio'
};

const MANAGEABLE_TYPES = ['marketing', 'cookies_analiticas', 'geolocalizacion', 'datos_sensibles_kyc'];

function buildConsentDashboard(userId) {
  const status = store.getUserConsentStatus(userId);
  const byType = Object.fromEntries(status.map((c) => [c.type, c]));

  const types = [
    'terminos', 'privacidad', 'tratamiento_cuenta',
    ...MANAGEABLE_TYPES
  ];

  if (byType.contrato_socio) types.push('contrato_socio');

  return types.map((type) => {
    const def = CONSENT_DEFINITIONS[type] || {};
    const row = byType[type];
    return {
      type,
      label: CONSENT_LABELS[type] || type,
      purpose: def.purpose || '',
      legalBasis: def.legalBasis || '—',
      revocable: Boolean(def.revocable),
      granted: Boolean(row?.granted),
      updatedAt: row?.createdAt || null
    };
  });
}

router.get('/privacidad', (req, res) => {
  res.render('legal/privacidad', {
    title: 'Política de Privacidad — Fundez',
    seo: buildPageMeta('privacy', req),
    company,
    lastUpdated: '11 de julio de 2026',
    policyVersion: POLICY_VERSION
  });
});

router.get('/terminos', (req, res) => {
  res.render('legal/terminos', {
    title: 'Términos y Condiciones — Fundez',
    seo: buildPageMeta('terms', req),
    company,
    lastUpdated: '11 de julio de 2026'
  });
});

router.get('/cookies', (req, res) => {
  res.render('legal/cookies', {
    title: 'Política de Cookies — Fundez',
    seo: buildPageMeta('cookies', req),
    company,
    lastUpdated: '11 de julio de 2026'
  });
});

router.get('/mis-datos', requireAuth, (req, res) => {
  const consents = buildConsentDashboard(req.session.user.id);
  res.render('legal/mis-datos', {
    title: 'Mis datos personales — Fundez',
    company,
    user: req.session.user,
    consents,
    policyVersion: POLICY_VERSION
  });
});

router.post('/mis-datos/consent', requireAuth, (req, res) => {
  const { type, granted } = req.body;
  const def = CONSENT_DEFINITIONS[type];
  if (!def || !MANAGEABLE_TYPES.includes(type)) {
    return res.status(400).json({ success: false, error: 'Consentimiento no gestionable desde aquí.' });
  }

  if (granted === true || granted === 'true') {
    store.recordConsent({
      userId: req.session.user.id,
      ip: req.ip,
      type,
      granted: true,
      version: POLICY_VERSION,
      userAgent: req.get('user-agent'),
      purpose: def.purpose,
      legalBasis: def.legalBasis,
      source: 'mis_datos'
    });
    return res.json({ success: true, type, granted: true });
  }

  const result = store.revokeUserConsent(req.session.user.id, type, req);
  if (result.error) return res.status(400).json({ success: false, error: result.error });

  if (type === 'geolocalizacion' && req.session.user.role === 'provider') {
    store.setLocationConsent(req.session.user.id, false);
  }

  return res.json({ success: true, type, granted: false });
});

router.post('/consent', (req, res) => {
  const { type, granted, version } = req.body;
  const def = CONSENT_DEFINITIONS[type] || {};
  const record = store.recordConsent({
    userId: req.session.user?.id || null,
    ip: req.ip,
    type: type || 'cookies',
    granted: granted === true || granted === 'true',
    version: version || POLICY_VERSION,
    userAgent: req.get('user-agent'),
    purpose: def.purpose,
    legalBasis: def.legalBasis,
    source: 'banner'
  });
  if (req.session.user) {
    req.session.consentGranted = granted === true || granted === 'true';
  }
  res.json({ success: true, record });
});

router.get('/consent/status', (req, res) => {
  res.json({
    cookies: store.getConsentsSummary(),
    userConsent: req.session.consentGranted || false,
    policyVersion: POLICY_VERSION
  });
});

module.exports = router;
