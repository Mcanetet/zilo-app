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

function loginRenderOptions(req, extra = {}) {
  return {
    title: 'Iniciar sesión',
    seo: buildPageMeta('login', req),
    demoAccounts: store.getDemoAccounts(),
    referralCode: req.session.pendingReferral || null,
    ...extra
  };
}

router.get('/login', (req, res) => {
  if (req.session.user) {
    const user = store.getUserById(req.session.user.id);
    if (user && !store.isEmailVerified(user)) return res.redirect('/verificar-email');
    return res.redirect(getDashboardPath(req.session.user.role));
  }
  res.render('login', loginRenderOptions(req, { error: null }));
});

router.post('/login', rateLimitLogin(12), async (req, res) => {
  const { email, password } = req.body;
  const result = await store.authenticateUser(email, password, { allowedRoles: PUBLIC_ROLES });

  if (result.error === 'wrong_portal') {
    store.logSecurityEvent('login_admin_blocked_public', email, req);
    return res.render('login', loginRenderOptions(req, {
      error: 'Las cuentas de administración usan el portal corporativo en /admin/login'
    }));
  }

  if (result.error === 'blocked') {
    store.logSecurityEvent('login_blocked', email, req);
    return res.render('login', loginRenderOptions(req, {
      error: 'Esta cuenta está desactivada. Escribe a soporte@fundez.cl para reactivarla.'
    }));
  }

  if (result.error) {
    store.logSecurityEvent('login_fail', email, req);
    return res.render('login', loginRenderOptions(req, {
      error: 'Credenciales incorrectas. Intenta nuevamente.'
    }));
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

const { buildPageMeta } = require('../lib/seo');
const { PROVIDER_REGISTRATION_DOC_KEYS } = require('../lib/contracts');
const { getCommune, getRegionCommunes } = require('../lib/chile-geo');
const { buildCoverageResult } = require('../lib/coverage');
const {
  searchAddressSuggestions,
  geocodeAddress,
  geocodeCommuneCenter,
  withCommuneContext,
  coordsMatchAddress
} = require('../lib/geocode');

const REGISTRATION_REGION = 'region-metropolitana';

function wantsJson(req) {
  return req.is('application/json') || (req.get('Accept') || '').includes('application/json');
}

function providerRegistrationDocsForView(t) {
  return PROVIDER_REGISTRATION_DOC_KEYS.map((key) => ({
    key,
    label: t(`register.doc_${key}`),
    hint: t(`register.doc_${key}_hint`)
  }));
}

function registerRenderOptions(req, extra = {}) {
  const form = extra.form || {};
  const pageId = form.role === 'provider' || req.query.role === 'provider' ? 'register_provider' : 'register';
  return {
    services: store.getActiveServices(),
    referralCode: req.session.pendingReferral || null,
    useMap: true,
    pageScript: '/js/register-address.js',
    providerRegistrationDocs: providerRegistrationDocsForView(req.t.bind(req)),
    registrationCommunes: getRegionCommunes(REGISTRATION_REGION),
    seo: buildPageMeta(pageId, req),
    ...extra
  };
}

function resolveRegisterError(req, result) {
  if (result.errorKey) return req.t(result.errorKey);
  return result.error || req.t('register.error_generic');
}

function registerFormFromBody(body) {
  const rawSpecialties = body.specialties || [];
  return {
    name: body.name,
    email: body.email,
    password: body.password,
    phone: body.phone,
    role: body.role === 'provider' ? 'provider' : 'client',
    address: body.address,
    addressUnit: body.address_unit || body.addressUnit,
    addressLat: body.address_lat || body.addressLat,
    addressLng: body.address_lng || body.addressLng,
    addressPlaceId: body.address_place_id || body.addressPlaceId,
    addressCommune: body.address_commune || body.addressCommune,
    specialties: (Array.isArray(rawSpecialties) ? rawSpecialties : [rawSpecialties]).filter(Boolean),
    companyRut: body.company_rut || body.companyRut,
    companyLegalName: body.company_legal_name || body.companyLegalName,
    repRut: body.rep_rut || body.repRut,
    clientBillingType: body.client_billing_type || body.clientBillingType || 'natural',
    clientRut: body.client_rut || body.clientRut,
    clientLegalName: body.client_legal_name || body.clientLegalName,
    clientGiro: body.client_giro || body.clientGiro
  };
}

router.get('/registro/comunas/:communeCode', async (req, res) => {
  const commune = getCommune(REGISTRATION_REGION, req.params.communeCode);
  if (!commune) return res.status(404).json({ error: 'commune_not_found' });

  const center = await geocodeCommuneCenter(commune.name, commune.regionName);
  const coverage = buildCoverageResult(commune, store.getCoverageMap());

  res.json({
    code: commune.code,
    name: commune.name,
    lat: center.lat,
    lng: center.lng,
    coverage: {
      covered: coverage.covered,
      unknown: coverage.unknown,
      communeName: coverage.communeName,
      regionName: coverage.regionName,
      message: coverage.covered ? null : req.t(coverage.messageKey || 'coverage.not_available')
    }
  });
});

router.get('/registro/direcciones', async (req, res) => {
  const q = (req.query.q || '').trim();
  const communeCode = (req.query.commune || '').trim();
  if (q.length < 3 || !communeCode) return res.json({ suggestions: [] });

  const commune = getCommune(REGISTRATION_REGION, communeCode);
  if (!commune) return res.json({ suggestions: [] });

  const suggestions = await searchAddressSuggestions(q, {
    communeName: commune.name,
    regionName: commune.regionName
  });
  res.json({ suggestions });
});

router.post('/registro/direcciones/validar', async (req, res) => {
  const { address, lat, lng, communeCode } = req.body || {};
  const addr = (address || '').trim();
  if (!addr) return res.status(400).json({ error: 'address_required' });

  const commune = communeCode ? getCommune(REGISTRATION_REGION, communeCode) : null;
  if (!commune) {
    return res.status(400).json({
      success: false,
      error: req.t('register.error_commune_required')
    });
  }

  const fullAddress = withCommuneContext(addr, commune.name);
  const geo = await geocodeAddress(fullAddress, { strict: true, communeName: commune.name });
  if (!geo.found || !geo.hasStreetNumber) {
    return res.status(400).json({
      success: false,
      error: req.t('register.error_address_street_number')
    });
  }

  const submittedLat = parseFloat(lat);
  const submittedLng = parseFloat(lng);
  const coordCheck = await coordsMatchAddress({
    lat: submittedLat,
    lng: submittedLng,
    geo,
    communeName: commune.name
  });
  if (!coordCheck.ok) {
    return res.status(400).json({
      success: false,
      error: req.t('register.error_address_mismatch')
    });
  }

  const coverage = buildCoverageResult(commune, store.getCoverageMap());

  res.json({
    success: true,
    coords: {
      lat: Number.isFinite(submittedLat) ? submittedLat : geo.lat,
      lng: Number.isFinite(submittedLng) ? submittedLng : geo.lng
    },
    coverage: {
      covered: coverage.covered,
      unknown: coverage.unknown,
      communeName: coverage.communeName,
      regionName: coverage.regionName,
      message: coverage.covered ? null : req.t(coverage.messageKey || 'coverage.not_available')
    }
  });
});

router.get('/registro', (req, res) => {
  if (req.session.user) {
    const user = store.getUserById(req.session.user.id);
    if (user && !store.isEmailVerified(user)) return res.redirect('/verificar-email');
    return res.redirect(getDashboardPath(req.session.user.role));
  }
  const defaultRole = req.query.role === 'provider' || req.query.socio ? 'provider' : 'client';
  res.render('registro', registerRenderOptions(req, {
    title: 'Crear cuenta',
    error: null,
    form: { role: defaultRole, specialties: [] }
  }));
});

router.post('/registro', async (req, res) => {
  const form = registerFormFromBody(req.body);
  const { name, email, password, phone, role, address, addressUnit, addressLat, addressLng, addressPlaceId, addressCommune, specialties,
    companyRut, companyLegalName, repRut, clientBillingType, clientRut, clientLegalName, clientGiro } = form;
  const providerDocuments = req.body.provider_documents || req.body.providerDocuments;

  const consentCheck = validateRegistrationConsents(req.body);
  if (!consentCheck.ok) {
    const payload = registerRenderOptions(req, {
      title: 'Crear cuenta',
      error: req.t(consentCheck.errorKey || 'register.error_consents'),
      form
    });
    if (wantsJson(req)) return res.status(400).json({ error: payload.error });
    return res.status(400).render('registro', payload);
  }

  const result = await store.registerUser({
    name, email, password, phone, role, address,
    addressUnit, addressLat, addressLng, addressPlaceId, addressCommune, specialties,
    companyRut, companyLegalName, repRut, providerDocuments,
    clientBillingType, clientRut, clientLegalName, clientGiro
  });

  if (!result.success) {
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

      return res.status(409).render('login', loginRenderOptions(req, {
        error: 'Ya existe una cuenta con ese correo. Ingresa con tu contraseña o usa otro correo para crear una cuenta nueva.'
      }));
    }

    const errMsg = resolveRegisterError(req, result);
    if (wantsJson(req)) return res.status(400).json({ error: errMsg });
    return res.status(400).render('registro', registerRenderOptions(req, {
      title: 'Crear cuenta',
      error: errMsg,
      form
    }));
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

  const issue = await store.issueEmailVerification(user.id, { locale: req.locale || 'es' });
  if (wantsJson(req)) {
    return res.json({
      success: true,
      redirect: '/verificar-email',
      mailDemo: Boolean(issue.demo),
      mailError: issue.error || null
    });
  }
  if (issue.error && !issue.demo) {
    return res.redirect('/verificar-email?mail=error');
  }
  if (issue.demo) {
    return res.redirect('/verificar-email?mail=demo');
  }
  res.redirect('/verificar-email');
});

router.get('/verificar-email', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const user = store.getUserById(req.session.user.id);
  if (!user) return res.redirect('/logout');
  if (store.isEmailVerified(user)) {
    return res.redirect(getDashboardPath(user.role));
  }

  let success = null;
  let error = null;
  if (req.query.mail === 'error') {
    error = 'No pudimos enviar el correo de verificación. Revisa spam o pulsa Reenviar. Si el problema continúa, el SMTP de Hostinger puede estar rechazando el envío (revisa /health?smtp=1).';
  } else if (req.query.mail === 'demo') {
    success = 'Modo demo: faltan SMTP_HOST / SMTP_USER / SMTP_PASS en el servidor. El código está en los logs ([verify:demo]).';
  }

  res.render('verificar-email', {
    title: 'Verificar correo — Fundez',
    email: user.email,
    company,
    error,
    success,
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
    const status = result.cooldown ? 429 : 502;
    return res.status(status).json({ success: false, error: result.error, cooldown: result.cooldown || 0 });
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
