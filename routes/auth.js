const express = require('express');
const router = express.Router();
const store = require('../models/store');
const company = require('../config/company');
const { rateLimitLogin } = require('../middleware/security');
const { validateRegistrationConsents } = require('../lib/consent-policy');
const emailVerification = require('../lib/emailVerification');

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

function getDashboardPath(role) {
  const paths = {
    client: '/cliente',
    provider: '/proveedor',
    tecnico: '/tecnico',
    admin: '/admin'
  };
  return paths[role] || '/';
}

function redirectAfterAuth(req, res, user) {
  if (!store.isEmailVerified(user)) {
    return res.redirect('/verificar-email');
  }
  return res.redirect(getDashboardPath(user.role));
}

router.get('/login', (req, res) => {
  if (req.session.user) {
    const user = store.getUserById(req.session.user.id);
    if (user && !store.isEmailVerified(user)) return res.redirect('/verificar-email');
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
      error: 'Esta cuenta está desactivada. Escribe a soporte@fundez.cl para reactivarla.',
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

  if (req.body.consent_terminos && req.body.consent_privacidad) {
    store.recordRegistrationConsents(req, user.id, req.body);
    req.session.consentGranted = true;
  } else if (req.body.consent) {
    store.recordConsent({
      userId: user.id,
      ip: req.ip,
      type: 'privacidad',
      granted: true,
      userAgent: req.get('user-agent'),
      source: 'login'
    });
    req.session.consentGranted = true;
  }

  if (user.role === 'client' && req.session.pendingReferral) {
    const referral = store.applyReferralCode(user.id, req.session.pendingReferral);
    if (referral.success) req.session.referralBonus = referral.bonus;
    delete req.session.pendingReferral;
  }

  redirectAfterAuth(req, res, user);
});

router.get('/registro', (req, res) => {
  if (req.session.user) {
    const user = store.getUserById(req.session.user.id);
    if (user && !store.isEmailVerified(user)) return res.redirect('/verificar-email');
    return res.redirect(getDashboardPath(req.session.user.role));
  }
  const defaultRole = req.query.role === 'provider' || req.query.socio ? 'provider' : 'client';
  res.render('registro', {
    title: 'Crear cuenta',
    error: null,
    services: store.getActiveServices(),
    form: { role: defaultRole, specialties: [] },
    referralCode: req.session.pendingReferral || null
  });
});

router.post('/registro', async (req, res) => {
  const { name, email, password, phone, role, address } = req.body;
  const rawSpecialties = req.body.specialties || [];
  const specialties = Array.isArray(rawSpecialties) ? rawSpecialties : [rawSpecialties];

  const consentCheck = validateRegistrationConsents(req.body);
  if (consentCheck.error) {
    return res.status(400).render('registro', {
      title: 'Crear cuenta',
      error: consentCheck.error,
      services: store.getActiveServices(),
      form: { name, email, phone, role: role === 'provider' ? 'provider' : 'client', address, specialties },
      referralCode: req.session.pendingReferral || null
    });
  }

  const result = await store.registerUser({ name, email, password, phone, role, address, specialties });

  if (result.error) {
    if (result.code === 'email_exists') {
      const login = await store.authenticateUser(email, password, { allowedRoles: PUBLIC_ROLES });
      if (!login.error) {
        const existingUser = login.user;
        setSessionUser(req, existingUser);
        store.logSecurityEvent('registro_existing_login_ok', email, req);

        if (existingUser.role === 'client' && req.session.pendingReferral) {
          const referral = store.applyReferralCode(existingUser.id, req.session.pendingReferral);
          if (referral.success) req.session.referralBonus = referral.bonus;
          delete req.session.pendingReferral;
        }

        return redirectAfterAuth(req, res, existingUser);
      }

      return res.status(409).render('login', {
        title: 'Iniciar sesión',
        error: 'Ya existe una cuenta con ese correo. Ingresa con tu contraseña o usa otro correo para crear una cuenta nueva.',
        demoAccounts: store.getDemoAccounts(),
        referralCode: req.session.pendingReferral || null
      });
    }

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
  store.recordRegistrationConsents(req, user.id, req.body);
  req.session.consentGranted = true;

  if (user.role === 'client' && req.session.pendingReferral) {
    const referral = store.applyReferralCode(user.id, req.session.pendingReferral);
    if (referral.success) req.session.referralBonus = referral.bonus;
    delete req.session.pendingReferral;
  }

  await store.issueEmailVerification(user.id, { locale: req.locale || 'es' });
  res.redirect('/verificar-email');
});

router.get('/verificar-email', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const user = store.getUserById(req.session.user.id);
  if (!user) return res.redirect('/logout');
  if (store.isEmailVerified(user)) {
    return res.redirect(getDashboardPath(user.role));
  }

  res.render('verificar-email', {
    title: 'Verificar correo — Fundez',
    email: user.email,
    company,
    error: null,
    success: null,
    cooldown: emailVerification.resendCooldownSeconds(user),
    demoHint: !require('../lib/mailer').isConfigured()
  });
});

router.post('/verificar-email', async (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const user = store.getUserById(req.session.user.id);
  if (!user) return res.redirect('/logout');
  if (store.isEmailVerified(user)) {
    return res.redirect(getDashboardPath(user.role));
  }

  const code = (req.body.code || '').trim();
  const result = await store.verifyEmailCode(user.id, code);
  if (result.error) {
    return res.render('verificar-email', {
      title: 'Verificar correo — Fundez',
      email: user.email,
      company,
      error: result.error,
      success: null,
      cooldown: emailVerification.resendCooldownSeconds(user),
      demoHint: !require('../lib/mailer').isConfigured()
    });
  }

  store.logSecurityEvent('email_verificado', user.email, req);
  redirectAfterAuth(req, res, store.getUserById(user.id));
});

router.post('/verificar-email/reenviar', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'No autenticado' });
  const user = store.getUserById(req.session.user.id);
  if (!user) return res.status(401).json({ error: 'No autenticado' });

  const result = await store.resendEmailVerification(user.id, { locale: req.locale || 'es' });
  if (result.error) {
    return res.status(429).json({ success: false, error: result.error, cooldown: result.cooldown || 0 });
  }
  res.json({ success: true, demo: result.demo || false });
});

router.get('/logout', (req, res) => {
  const wasAdmin = req.session.user?.role === 'admin' || req.session.isAdminSession || req.session.pendingAdminMfa;
  delete req.session.pendingAdminMfa;
  delete req.session.adminMfaVerified;
  req.session.destroy(() => {
    res.redirect(wasAdmin ? '/admin/login' : '/');
  });
});

module.exports = router;
