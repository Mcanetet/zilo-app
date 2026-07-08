const express = require('express');
const router = express.Router();
const store = require('../models/store');

router.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect(getDashboardPath(req.session.user.role));
  }
  res.render('login', {
    title: 'Iniciar sesión',
    error: null,
    referralCode: req.session.pendingReferral || null
  });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = store.getUserByEmail(email);

  if (!user || user.password !== password) {
    store.logSecurityEvent('login_fail', email, req);
    return res.render('login', {
      title: 'Iniciar sesión',
      error: 'Credenciales incorrectas. Intenta nuevamente.',
      referralCode: req.session.pendingReferral || null
    });
  }

  req.session.user = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role
  };
  store.logSecurityEvent('login_ok', email, req);
  if (req.body.consent) {
    store.recordConsent({ userId: user.id, ip: req.ip, type: 'privacidad', granted: true, version: '1.0', userAgent: req.get('user-agent') });
    req.session.consentGranted = true;
  }

  if (user.role === 'client' && req.session.pendingReferral) {
    const result = store.applyReferralCode(user.id, req.session.pendingReferral);
    if (result.success) req.session.referralBonus = result.bonus;
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
  req.session.user = { id: user.id, email: user.email, name: user.name, role: user.role };
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
  req.session.destroy(() => {
    res.redirect('/');
  });
});

function getDashboardPath(role) {
  const paths = {
    client: '/cliente',
    provider: '/proveedor',
    admin: '/admin'
  };
  return paths[role] || '/';
}

module.exports = router;
