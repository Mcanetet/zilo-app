const express = require('express');
const router = express.Router();
const store = require('../models/store');
const { rateLimitLogin } = require('../middleware/security');

const PUBLIC_ROLES = ['client', 'provider', 'tecnico'];
const ADMIN_SESSION_MS = 4 * 60 * 60 * 1000;
const DEFAULT_SESSION_MS = 24 * 60 * 60 * 1000;

function setSessionUser(req, user, { admin = false } = {}) {
  req.session.user = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role
  };
  req.session.isAdminSession = admin;
  if (req.session.cookie) {
    req.session.cookie.maxAge = admin ? ADMIN_SESSION_MS : DEFAULT_SESSION_MS;
  }
}

router.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect(getDashboardPath(req.session.user.role));
  }
  res.render('login', {
    title: 'Iniciar sesión',
    error: null,
    demoAccounts: store.getDemoAccounts(),
    referralCode: req.session.pendingReferral || null
  });
});

router.post('/login', rateLimitLogin(12), async (req, res) => {
  const { email, password } = req.body;
  const result = await store.authenticateUser(email, password, { allowedRoles: PUBLIC_ROLES });

  if (result.error === 'wrong_portal') {
    store.logSecurityEvent('login_admin_blocked_public', email, req);
    return res.render('login', {
      title: 'Iniciar sesión',
      error: 'Las cuentas de administración usan el portal corporativo en /admin/login',
      demoAccounts: store.getDemoAccounts(),
      referralCode: req.session.pendingReferral || null
    });
  }

  if (result.error === 'blocked') {
    store.logSecurityEvent('login_blocked', email, req);
    return res.render('login', {
      title: 'Iniciar sesión',
      error: 'Esta cuenta está desactivada. Contacta al administrador.',
      demoAccounts: store.getDemoAccounts(),
      referralCode: req.session.pendingReferral || null
    });
  }

  if (result.error) {
    store.logSecurityEvent('login_fail', email, req);
    return res.render('login', {
      title: 'Iniciar sesión',
      error: 'Credenciales incorrectas. Intenta nuevamente.',
      demoAccounts: store.getDemoAccounts(),
      referralCode: req.session.pendingReferral || null
    });
  }

  const user = result.user;
  setSessionUser(req, user);
  store.logSecurityEvent('login_ok', email, req);
  if (req.body.consent) {
    store.recordConsent({ userId: user.id, ip: req.ip, type: 'privacidad', granted: true, version: '1.0', userAgent: req.get('user-agent') });
    req.session.consentGranted = true;
  }

  if (user.role === 'client' && req.session.pendingReferral) {
    const referral = store.applyReferralCode(user.id, req.session.pendingReferral);
    if (referral.success) req.session.referralBonus = referral.bonus;
    delete req.session.pendingReferral;
  }

  res.redirect(getDashboardPath(user.role));
});

router.get('/registro', (req, res) => {
  if (req.session.user) {
    return res.redirect(getDashboardPath(req.session.user.role));
  }
  res.render('registro', {
    title: 'Crear cuenta',
    error: null,
    services: store.getActiveServices(),
    form: { role: 'client', specialties: [] },
    referralCode: req.session.pendingReferral || null
  });
});

router.post('/registro', async (req, res) => {
  const { name, email, password, phone, role, address } = req.body;
  const rawSpecialties = req.body.specialties || [];
  const specialties = Array.isArray(rawSpecialties) ? rawSpecialties : [rawSpecialties];

  const result = await store.registerUser({ name, email, password, phone, role, address, specialties });

  if (result.error) {
    return res.status(400).render('registro', {
      title: 'Crear cuenta',
      error: result.error,
      services: store.getActiveServices(),
      form: { name, email, phone, role: role === 'provider' ? 'provider' : 'client', address, specialties },
      referralCode: req.session.pendingReferral || null
    });
  }

  const user = result.user;
  setSessionUser(req, user);
  store.logSecurityEvent('registro_ok', email, req);
  store.recordConsent({ userId: user.id, ip: req.ip, type: 'privacidad', granted: true, version: '1.0', userAgent: req.get('user-agent') });
  req.session.consentGranted = true;

  if (user.role === 'client' && req.session.pendingReferral) {
    const referral = store.applyReferralCode(user.id, req.session.pendingReferral);
    if (referral.success) req.session.referralBonus = referral.bonus;
    delete req.session.pendingReferral;
  }

  res.redirect(getDashboardPath(user.role));
});

router.get('/logout', (req, res) => {
  const wasAdmin = req.session.user?.role === 'admin' || req.session.isAdminSession;
  req.session.destroy(() => {
    res.redirect(wasAdmin ? '/admin/login' : '/');
  });
});

function getDashboardPath(role) {
  const paths = {
    client: '/cliente',
    provider: '/proveedor',
    tecnico: '/tecnico',
    admin: '/admin'
  };
  return paths[role] || '/';
}

module.exports = router;
