const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const store = require('../models/store');
const company = require('../config/company');
const backup = require('../lib/backup');
const { getAppVersionInfo } = require('../lib/version');
const { requireRole } = require('../middleware/auth');
const {
  attachAdminAccess,
  requireAdminPermission,
  refreshSessionAdminAccess,
  canAccessPanel,
  getFirstAccessiblePanel
} = require('../middleware/adminAccess');
const { hasPermission } = require('../lib/adminPermissions');
const {
  getNavForAccess,
  getPermissionGroups,
  getProfilesList
} = require('../lib/adminPermissions');
const {
  getAdminStrings,
  localizeModules,
  localizeServices,
  getNavForLocale
} = require('../lib/i18n-admin');
const { rateLimitLogin, adminIpAllowlist, getClientIp, parseAdminIpAllowlist } = require('../middleware/security');
const { qrDataUrl } = require('../lib/mfa');
const notifications = require('../lib/notifications');
const events = require('../lib/events');

router.use(adminIpAllowlist());
router.use(attachAdminAccess);

const ADMIN_SESSION_MS = 4 * 60 * 60 * 1000;
const MFA_PENDING_MS = 5 * 60 * 1000;

function completeAdminSession(req, user) {
  req.session.user = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role
  };
  refreshSessionAdminAccess(req, user);
  req.session.isAdminSession = true;
  req.session.adminMfaVerified = true;
  delete req.session.pendingAdminMfa;
  if (req.session.cookie) {
    req.session.cookie.maxAge = ADMIN_SESSION_MS;
  }
}

function getPendingMfa(req) {
  const pending = req.session.pendingAdminMfa;
  if (!pending) return null;
  if (Date.now() > pending.expiresAt) {
    delete req.session.pendingAdminMfa;
    return null;
  }
  return pending;
}

router.get('/login', (req, res) => {
  if (req.session.user?.role === 'admin' && req.session.adminMfaVerified) {
    return res.redirect('/admin');
  }
  const expired = req.query.expired === '1';
  res.render('admin/login', {
    title: 'Admin — Fundez',
    error: expired ? 'La verificación MFA expiró. Ingresa nuevamente.' : null
  });
});

router.post('/login', rateLimitLogin(8), async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const result = await store.authenticateUser(email, password, { allowedRoles: ['admin'] });

  if (result.error === 'wrong_portal') {
    store.logSecurityEvent('admin_login_wrong_role', email, req);
    return res.render('admin/login', {
      title: 'Admin — Fundez',
      error: 'Credenciales no válidas para administración.'
    });
  }

  if (result.error === 'blocked') {
    store.logSecurityEvent('admin_login_blocked', email, req);
    return res.render('admin/login', {
      title: 'Admin — Fundez',
      error: 'Esta cuenta está desactivada.'
    });
  }

  if (result.error) {
    store.logSecurityEvent('admin_login_fail', email, req);
    return res.render('admin/login', {
      title: 'Admin — Fundez',
      error: 'Credenciales incorrectas.'
    });
  }

  const user = result.user;

  if (store.isMfaEnabled(user.id)) {
    req.session.pendingAdminMfa = {
      userId: user.id,
      email: user.email,
      expiresAt: Date.now() + MFA_PENDING_MS
    };
    delete req.session.user;
    delete req.session.adminMfaVerified;
    store.logSecurityEvent('admin_login_mfa_required', email, req);
    return res.redirect('/admin/mfa');
  }

  completeAdminSession(req, user);
  store.logSecurityEvent('admin_login_ok', email, req);
  res.redirect('/admin');
});

router.get('/mfa', (req, res) => {
  const pending = getPendingMfa(req);
  if (!pending) {
    return res.redirect('/admin/login');
  }
  res.render('admin/mfa', {
    title: 'Verificación MFA — Fundez',
    email: pending.email,
    error: null
  });
});

router.post('/mfa', rateLimitLogin(6), async (req, res) => {
  const pending = getPendingMfa(req);
  if (!pending) {
    return res.redirect('/admin/login?expired=1');
  }

  const code = req.body.code;
  if (!(await store.verifyMfaCode(pending.userId, code))) {
    store.logSecurityEvent('admin_mfa_fail', pending.email, req);
    return res.render('admin/mfa', {
      title: 'Verificación MFA — Fundez',
      email: pending.email,
      error: 'Código incorrecto o expirado.'
    });
  }

  const user = store.getUserById(pending.userId);
  if (!user) {
    delete req.session.pendingAdminMfa;
    return res.redirect('/admin/login');
  }

  completeAdminSession(req, user);
  store.logSecurityEvent('admin_mfa_ok', user.email, req);
  res.redirect('/admin');
});

router.get('/mfa/setup', requireRole('admin'), async (req, res) => {
  const status = store.getAdminMfaStatus(req.session.user.id);
  if (status.enabled) {
    return res.redirect('/admin?tab=seguridad');
  }

  const setup = await store.beginMfaSetup(req.session.user.id);
  if (setup.error) {
    return res.redirect('/admin?tab=seguridad');
  }

  const qr = await qrDataUrl(setup.otpauthUrl);
  res.render('admin/mfa-setup', {
    title: 'Activar MFA — Fundez',
    qrDataUrl: qr,
    secret: setup.secret,
    email: req.session.user.email,
    error: null
  });
});

router.post('/mfa/setup', requireRole('admin'), async (req, res) => {
  const result = await store.confirmMfaSetup(req.session.user.id, req.body.code);
  if (result.error) {
    return res.status(400).render('admin/mfa-setup', {
      title: 'Activar MFA — Fundez',
      qrDataUrl: null,
      secret: null,
      email: req.session.user.email,
      error: result.error,
      needsRestart: true
    });
  }

  req.session.adminMfaVerified = true;
  store.logSecurityEvent('admin_mfa_enabled', req.session.user.email, req);
  res.redirect('/admin?tab=seguridad&mfa=enabled');
});

router.post('/mfa/disable', requireRole('admin'), async (req, res) => {
  const { password, code } = req.body;
  const result = await store.disableMfa(req.session.user.id, password, code);
  if (result.error) {
    return res.redirect('/admin?tab=seguridad&mfa_error=' + encodeURIComponent(result.error));
  }

  delete req.session.adminMfaVerified;
  store.logSecurityEvent('admin_mfa_disabled', req.session.user.email, req);
  res.redirect('/admin?tab=seguridad&mfa=disabled');
});

router.get('/', requireRole('admin'), async (req, res) => {
  try {
  if (!store.isReady()) {
    return res.status(503).render('error', {
      title: 'Base de datos',
      message: 'La base de datos aún no está lista. Espera unos segundos y recarga.',
      code: 503
    });
  }

  await store.reloadFromDatabase();

  const allRequests = store.getAllRequests();
  const providers = store.USERS.filter(u => u.role === 'provider');
  const clients = store.USERS.filter(u => u.role === 'client');
  const onlineCount = providers.filter(p => p.online).length;
  const adminStats = store.getAdminStats();
  const pricing = store.getPricingConfig();
  const access = req.adminAccess || store.resolveAdminAccess(store.getUserById(req.session.user.id));
  const requestedTab = req.query.tab || null;
  const initialTab = requestedTab && canAccessPanel(access, requestedTab)
    ? requestedTab
    : getFirstAccessiblePanel(access);

  const stats = {
    totalRequests: allRequests.length,
    activeRequests: allRequests.filter(r => ['searching', 'assigned', 'in_progress'].includes(r.status)).length,
    completedRequests: allRequests.filter(r => r.status === 'completed').length,
    onlineProviders: onlineCount,
    totalProviders: providers.length,
    totalClients: clients.length,
    activeServices: store.getActiveServices().length,
    totalServices: store.SERVICES.length,
    ...adminStats
  };

  res.render('admin/dashboard', {
    title: 'Fundez — Admin',
    user: req.session.user,
    stats,
    services: localizeServices(store.SERVICES, req.t),
    modules: store.getModules(),
    promos: store.getAllPromos(),
    clientModules: localizeModules(store.getModulesByAudience('client'), req.t),
    providerModules: localizeModules(store.getModulesByAudience('provider'), req.t),
    coverageRegions: store.getCoverageForAdmin(),
    coverageStats: store.getCoverageStats(),
    requests: allRequests.slice(0, 30),
    payments: store.getPayments(),
    payouts: store.getProviderPayouts(),
    pendingTransfers: store.getAllRequests().filter(r => r.paymentStatus === 'pending_transfer'),
    complaints: store.COMPLAINTS,
    chats: store.CHATS,
    consents: store.consentRecords.slice(0, 20),
    securityLogs: store.securityLogs.slice(0, 25),
    providers,
    demoAccounts: store.getDemoAccounts(),
    company,
    pricing,
    formatCLP: store.formatCLP,
    backupConfig: await backup.loadConfigAsync(),
    backups: await backup.listBackups(),
    backupRetention: backup.getRetentionSummary(),
    formatBytes: backup.formatBytes,
    appVersion: getAppVersionInfo(),
    mfaStatus: store.getAdminMfaStatus(req.session.user.id),
    mfaMessage: req.query.mfa || null,
    mfaError: req.query.mfa_error || null,
    financialReport: store.getFinancialReport(),
    clientIp: getClientIp(req),
    adminIpAllowlist: parseAdminIpAllowlist(),
    dteDocuments: store.getAllDteDocuments().slice(0, 40),
    dteStatus: events.getDteStatus(),
    notificationStats: notifications.getStats(),
    recentNotifications: notifications.getRecent(30),
    providerContracts: store.getAllProviderContracts(),
    contractStats: store.getContractStats(),
    documentCatalog: require('../lib/contracts').DOCUMENT_CATALOG,
    adminNav: getNavForLocale(access, req.t),
    adminStrings: getAdminStrings(req.t),
    adminAccess: access,
    adminTeam: store.getAdminTeamUsers(),
    adminProfiles: getProfilesList(),
    adminPermissionGroups: getPermissionGroups(),
    canAccessPanel: (panelId) => canAccessPanel(access, panelId),
    initialTab
  });
  } catch (err) {
    console.error('[admin/dashboard]', err.message);
    if (err.stack) console.error(err.stack);
    return res.status(500).render('error', {
      title: 'Error en el panel',
      message: 'No se pudo cargar el panel de administración. Si acabas de actualizar, redeploya la app completa en Hostinger.',
      code: 500
    });
  }
});

router.get('/team/meta', requireRole('admin'), requireAdminPermission('equipo.view'), (req, res) => {
  res.json({ success: true, ...store.getAdminPermissionMeta(), team: store.getAdminTeamUsers() });
});

router.post('/team', requireRole('admin'), requireAdminPermission('equipo.manage'), async (req, res) => {
  const { name, email, password, profileId, permissions, isSuperAdmin } = req.body;
  const result = await store.createAdminUser({
    name,
    email,
    password,
    profileId,
    permissions: Array.isArray(permissions) ? permissions : undefined,
    isSuperAdmin: isSuperAdmin === true || isSuperAdmin === 'true'
  }, req.session.user.id);

  if (result.error) return res.status(400).json({ error: result.error });
  store.logSecurityEvent('admin_team_create', email, req);
  res.json({ success: true, user: result.user });
});

router.put('/team/:id', requireRole('admin'), requireAdminPermission('equipo.manage'), async (req, res) => {
  const { name, profileId, permissions, isSuperAdmin, password } = req.body;
  if (req.params.id === req.session.user.id && isSuperAdmin === false) {
    return res.status(400).json({ error: 'No puedes quitarte el rol de superadministrador a ti mismo.' });
  }

  const result = await store.updateAdminUserAccess(req.params.id, {
    name,
    profileId,
    permissions: Array.isArray(permissions) ? permissions : undefined,
    isSuperAdmin: isSuperAdmin === true || isSuperAdmin === 'true',
    password: password || undefined
  }, req.session.user.id);

  if (result.error) return res.status(400).json({ error: result.error });
  store.logSecurityEvent('admin_team_update', req.params.id, req);

  if (req.params.id === req.session.user.id) {
    const user = store.getUserById(req.session.user.id);
    refreshSessionAdminAccess(req, user);
  }

  res.json({ success: true, user: result.user });
});

router.post('/team/:id/toggle', requireRole('admin'), requireAdminPermission('equipo.manage'), (req, res) => {
  const { active } = req.body;
  const enable = active === true || active === 'true';

  if (req.params.id === req.session.user.id && !enable) {
    return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta.' });
  }

  const user = store.setUserActive(req.params.id, enable);
  if (!user || user.role !== 'admin') return res.status(404).json({ error: 'Administrador no encontrado' });

  store.logSecurityEvent('admin_team_toggle', `${req.params.id}=${enable}`, req);
  res.json({ success: true, user: store.getAdminTeamUsers().find((u) => u.id === user.id) });
});

router.post('/contratos/:providerId/review', requireRole('admin'), requireAdminPermission('contratos.review'), (req, res) => {
  const { action, notes, rejectionReason, requestedDocs } = req.body;
  const result = store.reviewProviderContract(
    req.params.providerId,
    { action, notes, rejectionReason, requestedDocs },
    req.session.user.email
  );
  if (result.error) return res.status(400).json({ error: result.error });
  store.logSecurityEvent(`contrato_${action}`, req.params.providerId, req);
  res.json({ success: true, provider: result.provider });
});

router.get('/contratos/:providerId', requireRole('admin'), requireAdminPermission('contratos.view'), (req, res) => {
  const provider = store.getAllProviderContracts().find((p) => p.id === req.params.providerId);
  if (!provider) return res.status(404).json({ error: 'Socio no encontrado' });
  res.json({ success: true, provider });
});

router.get('/finanzas/export.csv', requireRole('admin'), requireAdminPermission('finanzas.export'), (req, res) => {
  const report = store.getFinancialReport();
  const payments = store.getPayments();
  const lines = [
    'id,servicio,cliente,socio,monto,comision,socio_pago,metodo,urgencia,estado,pagado_en'
  ];

  payments.forEach((p) => {
    const reqRow = store.getAllRequests().find((r) => r.id === p.id) || {};
    lines.push([
      p.id,
      csvEscape(p.serviceName),
      csvEscape(p.clientName),
      csvEscape(p.providerName),
      p.amount,
      p.commission,
      p.providerPayout,
      csvEscape(reqRow.paymentMethod || ''),
      csvEscape(p.urgencyTierLabel || ''),
      csvEscape(p.status),
      csvEscape(p.paidAt || '')
    ].join(','));
  });

  lines.push('');
  lines.push('Resumen');
  lines.push(`Visitas cobradas,${report.summary.visitsCollected}`);
  lines.push(`Recargos tarjeta,${report.summary.cardSurcharges}`);
  lines.push(`Comisión Fundez,${report.summary.appCommission}`);
  lines.push(`Pendiente socios,${report.summary.providerPending}`);
  lines.push(`Transferencias pendientes,${report.summary.pendingTransferCount}`);

  store.logSecurityEvent('finanzas_export', `${payments.length} filas`, req);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="fundez-finanzas.csv"');
  res.send('\uFEFF' + lines.join('\n'));
});

function csvEscape(value) {
  const str = String(value ?? '');
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

router.post('/dte/retry', requireRole('admin'), requireAdminPermission('documentos.manage'), async (req, res) => {
  const { requestId, phase } = req.body;
  if (!requestId || !phase) {
    return res.status(400).json({ error: 'Faltan requestId y phase' });
  }
  const result = await events.retryDte(requestId, phase);
  if (result.error) return res.status(400).json({ error: result.error });
  store.logSecurityEvent('dte_retry', `${requestId}:${phase}`, req);
  res.json({ success: true, document: result.document });
});

router.post('/toggle-service', requireRole('admin'), requireAdminPermission('servicios.manage'), (req, res) => {
  const { serviceId, enabled } = req.body;
  const service = store.toggleService(serviceId, enabled === true || enabled === 'true');
  if (!service) return res.status(404).json({ error: 'Servicio no encontrado' });

  store.logSecurityEvent('service_toggle', `${serviceId}=${enabled}`, req);
  req.app.get('io').emit('services_updated', { services: store.getActiveServices() });
  res.json({ success: true, service });
});

router.post('/toggle-module', requireRole('admin'), requireAdminPermission('modulos.manage'), (req, res) => {
  const { moduleId, enabled } = req.body;
  const mod = store.toggleModule(moduleId, enabled === true || enabled === 'true');
  if (!mod) return res.status(404).json({ error: 'Módulo no encontrado' });

  store.logSecurityEvent('module_toggle', `${moduleId}=${enabled}`, req);
  req.app.get('io').emit('modules_updated', { modules: store.MODULES });
  res.json({ success: true, module: mod });
});

router.post('/promos', requireRole('admin'), requireAdminPermission('promos.manage'), (req, res) => {
  const result = store.upsertPromo({
    id: req.body.id,
    title: req.body.title,
    desc: req.body.desc || req.body.description,
    code: req.body.code,
    color: req.body.color,
    sortOrder: req.body.sortOrder,
    enabled: req.body.enabled,
    discountPercent: req.body.discountPercent,
    showBanner: req.body.showBanner,
    checkoutEnabled: req.body.checkoutEnabled
  });
  if (result.error) return res.status(400).json({ error: result.error });
  store.logSecurityEvent('promo_upsert', result.promo.id, req);
  res.json({ success: true, promo: result.promo, promos: store.getAllPromos() });
});

router.post('/promos/:id/toggle', requireRole('admin'), requireAdminPermission('promos.manage'), (req, res) => {
  const promo = store.togglePromo(req.params.id, req.body.enabled === true || req.body.enabled === 'true');
  if (!promo) return res.status(404).json({ error: 'Promoción no encontrada' });
  store.logSecurityEvent('promo_toggle', `${promo.id}=${promo.enabled}`, req);
  res.json({ success: true, promo, promos: store.getAllPromos() });
});

router.post('/promos/:id/delete', requireRole('admin'), requireAdminPermission('promos.manage'), (req, res) => {
  const result = store.deletePromo(req.params.id);
  if (result.error) return res.status(400).json({ error: result.error });
  store.logSecurityEvent('promo_delete', req.params.id, req);
  res.json({ success: true, promos: store.getAllPromos() });
});

router.post('/toggle-coverage', requireRole('admin'), requireAdminPermission('cobertura.manage'), (req, res) => {
  const { regionCode, communeCode, enabled, regionOnly } = req.body;
  const isEnabled = enabled === true || enabled === 'true';

  if (regionOnly && regionCode) {
    const region = store.toggleCoverageRegion(regionCode, isEnabled);
    if (!region) return res.status(404).json({ error: 'Región no encontrada' });
    store.logSecurityEvent('coverage_region_toggle', `${regionCode}=${isEnabled}`, req);
    return res.json({ success: true, region, stats: store.getCoverageStats() });
  }

  if (!regionCode || !communeCode) {
    return res.status(400).json({ error: 'Región y comuna requeridas' });
  }

  const result = store.toggleCoverageCommune(regionCode, communeCode, isEnabled);
  if (result?.error) return res.status(400).json({ error: result.error });
  if (!result) return res.status(404).json({ error: 'Comuna no encontrada' });

  store.logSecurityEvent('coverage_commune_toggle', `${regionCode}/${communeCode}=${isEnabled}`, req);
  res.json({ success: true, commune: result, stats: store.getCoverageStats() });
});

router.post('/toggle-user', requireRole('admin'), requireAdminPermission('demo.manage'), (req, res) => {
  const { userId, active } = req.body;
  const enable = active === true || active === 'true';

  if (userId === req.session.user.id && !enable) {
    return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta con la que iniciaste sesión.' });
  }

  const user = store.setUserActive(userId, enable);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  store.logSecurityEvent('user_toggle', `${userId}=${enable ? 'activo' : 'inactivo'}`, req);
  res.json({ success: true, id: user.id, active: user.active !== false });
});

router.post('/complaint/:id/status', requireRole('admin'), requireAdminPermission('reclamos.manage'), (req, res) => {
  const complaint = store.updateComplaintStatus(req.params.id, req.body.status);
  if (!complaint) return res.status(404).json({ error: 'Reclamo no encontrado' });
  store.logSecurityEvent('complaint_update', `${req.params.id}=${req.body.status}`, req);
  res.json({ success: true, complaint });
});

router.post('/payout/:requestId', requireRole('admin'), requireAdminPermission('pagos.manage'), (req, res) => {
  const req_ = store.markPayoutPaid(req.params.requestId);
  if (!req_) return res.status(404).json({ error: 'Solicitud no encontrada' });
  store.logSecurityEvent('payout_marked', req.params.requestId, req);
  res.json({ success: true, request: req_ });
});

router.get('/backups/config', requireRole('admin'), async (req, res) => {
  res.json({
    success: true,
    config: backup.loadConfig(),
    retention: backup.getRetentionSummary(),
    backups: await backup.listBackups()
  });
});

router.post('/backups/config', requireRole('admin'), requireAdminPermission('backups.manage'), async (req, res) => {
  const allowed = [
    'enabled', 'autoBackup', 'autoRetention', 'scheduleHour', 'scheduleMinute',
    'dailyRetentionDays', 'weeklyRetentionWeeks', 'monthlyRetentionMonths',
    'includeUploads', 'includeSecurityLogs'
  ];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] === undefined) continue;
    if (key === 'enabled' || key === 'autoBackup' || key === 'autoRetention' || key === 'includeUploads' || key === 'includeSecurityLogs') {
      updates[key] = req.body[key] === true || req.body[key] === 'on' || req.body[key] === 'true';
    } else {
      updates[key] = req.body[key];
    }
  }
  if (updates.scheduleHour != null) updates.scheduleHour = Math.min(23, Math.max(0, parseInt(updates.scheduleHour, 10)));
  if (updates.scheduleMinute != null) updates.scheduleMinute = Math.min(59, Math.max(0, parseInt(updates.scheduleMinute, 10)));
  if (updates.dailyRetentionDays != null) updates.dailyRetentionDays = Math.min(90, Math.max(1, parseInt(updates.dailyRetentionDays, 10)));
  if (updates.weeklyRetentionWeeks != null) updates.weeklyRetentionWeeks = Math.min(52, Math.max(1, parseInt(updates.weeklyRetentionWeeks, 10)));
  if (updates.monthlyRetentionMonths != null) updates.monthlyRetentionMonths = Math.min(84, Math.max(1, parseInt(updates.monthlyRetentionMonths, 10)));

  const config = await backup.saveConfig(updates);
  store.logSecurityEvent('backup_config_update', JSON.stringify(updates), req);
  res.json({ success: true, config, retention: backup.getRetentionSummary(config) });
});

router.post('/backups/run', requireRole('admin'), requireAdminPermission('backups.manage'), async (req, res) => {
  try {
    const result = await backup.createBackup(store, 'manual', req.session.user.email);
    const removed = await backup.applyRetention();
    store.logSecurityEvent('backup_manual', result.manifest.id, req);
    res.json({
      success: true,
      backup: result.manifest,
      removed,
      config: backup.loadConfig(),
      backups: await backup.listBackups()
    });
  } catch (err) {
    await backup.saveConfig({ lastBackupStatus: 'error', lastBackupError: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/backups/retention', requireRole('admin'), requireAdminPermission('backups.manage'), async (req, res) => {
  const config = backup.loadConfig();
  if (config.autoRetention === false) {
    return res.json({
      success: true,
      removed: 0,
      skipped: true,
      message: 'La limpieza automática está desactivada. El historial se conserva.',
      backups: await backup.listBackups()
    });
  }
  const removed = await backup.applyRetention();
  store.logSecurityEvent('backup_retention_purge', `removed=${removed}`, req);
  res.json({ success: true, removed, backups: await backup.listBackups() });
});

router.post('/backups/import', requireRole('admin'), requireAdminPermission('backups.manage'), async (req, res) => {
  const mode = String(req.body.mode || 'history').toLowerCase();
  const snapshot = req.body.snapshot;

  if (!store.isReady()) {
    return res.status(503).json({ success: false, error: 'La base de datos no está lista' });
  }

  try {
    if (mode === 'restore') {
      const access = req.adminAccess || req.session?.adminAccess;
      if (!access?.isSuperAdmin && !hasPermission(access, 'backups.restore')) {
        return res.status(403).json({ success: false, error: 'No tienes permiso para restaurar backups' });
      }
      const confirm = String(req.body.confirm || '').trim().toUpperCase();
      if (confirm !== 'RESTAURAR') {
        return res.status(400).json({ success: false, error: 'Escribe RESTAURAR para confirmar la restauración' });
      }
      const result = await backup.restoreFromSnapshotData(store, snapshot, {
        triggeredBy: req.session.user.email,
        saveImport: true
      });
      store.logSecurityEvent('backup_import_restore', result.importedBackupId || 'json', req);
      return res.json({ success: true, mode: 'restore', ...result });
    }

    const result = await backup.importSnapshotFile(snapshot, req.session.user.email);
    store.logSecurityEvent('backup_import_history', result.manifest.id, req);
    res.json({ success: true, mode: 'history', backup: result.manifest });
  } catch (err) {
    store.logSecurityEvent('backup_import_failed', err.message, req);
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/backups/:id/download', requireRole('admin'), async (req, res) => {
  const item = await backup.getBackupById(req.params.id);
  if (!item) return res.status(404).json({ error: 'Backup no encontrado' });

  const ver = item.appVersion || 'backup';
  const filename = `fundez-backup-v${ver}-${String(item.createdAt).slice(0, 10)}.json`;
  const snapshotPath = item.folderPath ? path.join(item.folderPath, 'snapshot.json') : null;

  if (snapshotPath && fs.existsSync(snapshotPath)) {
    return res.download(snapshotPath, filename);
  }

  const snapshot = await backup.readSnapshot(req.params.id);
  if (!snapshot) return res.status(404).json({ error: 'Archivo no encontrado' });

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(JSON.stringify(snapshot, null, 2));
});

router.post('/backups/:id/restore', requireRole('admin'), requireAdminPermission('backups.restore'), async (req, res) => {
  const confirm = String(req.body.confirm || '').trim().toUpperCase();
  if (confirm !== 'RESTAURAR') {
    return res.status(400).json({ error: 'Escribe RESTAURAR para confirmar la restauración' });
  }

  if (!store.isReady()) {
    return res.status(503).json({ error: 'La base de datos no está lista' });
  }

  try {
    const result = await backup.restoreBackup(store, req.params.id, {
      triggeredBy: req.session.user.email,
      restoreUploads: req.body.restoreUploads !== false
    });
    store.logSecurityEvent('backup_restore', `${req.params.id} → pre:${result.preRestoreBackupId}`, req);
    res.json({ success: true, ...result });
  } catch (err) {
    store.logSecurityEvent('backup_restore_failed', err.message, req);
    res.status(400).json({ error: err.message });
  }
});

router.delete('/backups/:id', requireRole('admin'), requireAdminPermission('backups.manage'), async (req, res) => {
  const ok = await backup.deleteBackup(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Backup no encontrado' });
  store.logSecurityEvent('backup_delete', req.params.id, req);
  res.json({ success: true, backups: await backup.listBackups() });
});

router.get('/precios', requireRole('admin'), requireAdminPermission('precios.view', 'precios.manage'), (req, res) => {
  const pricing = store.getPricingConfig();
  const gateways = require('../lib/payments/gateways');
  res.render('admin/precios', {
    title: 'Configuración de precios — Fundez Admin',
    user: req.session.user,
    pricing,
    serviceCatalog: store.getServiceCatalog(),
    catalogRows: store.getCatalogPriceRows(),
    gatewayStatus: gateways.getGatewayStatus(pricing),
    query: req.query,
    formatCLP: store.formatCLP
  });
});

router.post('/precios', requireRole('admin'), requireAdminPermission('precios.manage'), (req, res) => {
  const body = req.body;
  const tiers = [];
  const tierIds = Array.isArray(body.tierId) ? body.tierId : (body.tierId ? [body.tierId] : []);
  const tierLabels = Array.isArray(body.tierLabel) ? body.tierLabel : (body.tierLabel ? [body.tierLabel] : []);
  const tierDescs = Array.isArray(body.tierDesc) ? body.tierDesc : (body.tierDesc ? [body.tierDesc] : []);
  const tierPercents = Array.isArray(body.tierPercent) ? body.tierPercent : (body.tierPercent ? [body.tierPercent] : []);
  const tierMinutes = Array.isArray(body.tierMinutes) ? body.tierMinutes : (body.tierMinutes ? [body.tierMinutes] : []);
  const tierEnabledRaw = body.tierEnabled;
  const enabledSet = new Set(Array.isArray(tierEnabledRaw) ? tierEnabledRaw : (tierEnabledRaw ? [tierEnabledRaw] : []));
  const tierOrders = Array.isArray(body.tierOrder) ? body.tierOrder : (body.tierOrder ? [body.tierOrder] : []);

  for (let i = 0; i < tierIds.length; i++) {
    const surchargePercent = parseInt(tierPercents[i], 10);
    tiers.push({
      id: tierIds[i],
      label: tierLabels[i] || `Opción ${i + 1}`,
      description: tierDescs[i] || '',
      responseMinutes: parseInt(tierMinutes[i], 10) || 180,
      surchargePercent: Number.isFinite(surchargePercent) ? surchargePercent : 0,
      adjustmentPercent: Number.isFinite(surchargePercent) ? surchargePercent : 0,
      enabled: enabledSet.has(tierIds[i]),
      sortOrder: parseInt(tierOrders[i], 10) || i + 1
    });
  }

  const gwIds = Array.isArray(body.gwId) ? body.gwId : (body.gwId ? [body.gwId] : []);
  const gwEnabledRaw = body.gwEnabled;
  const gwEnabledSet = new Set(Array.isArray(gwEnabledRaw) ? gwEnabledRaw : (gwEnabledRaw ? [gwEnabledRaw] : []));
  const gwOrders = Array.isArray(body.gwOrder) ? body.gwOrder : (body.gwOrder ? [body.gwOrder] : []);
  const paymentGateways = {};
  for (let i = 0; i < gwIds.length; i++) {
    paymentGateways[gwIds[i]] = {
      enabled: gwEnabledSet.has(gwIds[i]),
      sortOrder: parseInt(gwOrders[i], 10) || i + 1
    };
  }

  const catalogPrices = {};
  const catalogIds = Array.isArray(body.catalogActivityId)
    ? body.catalogActivityId
    : (body.catalogActivityId ? [body.catalogActivityId] : []);
  const catalogBasePrices = Array.isArray(body.catalogBasePrice)
    ? body.catalogBasePrice
    : (body.catalogBasePrice ? [body.catalogBasePrice] : []);
  for (let i = 0; i < catalogIds.length; i++) {
    const id = catalogIds[i];
    const price = parseInt(catalogBasePrices[i], 10);
    if (id && Number.isFinite(price) && price > 0) catalogPrices[id] = price;
  }

  const updated = store.updatePricingConfig({
    visitPrice: parseInt(body.visitPrice, 10),
    servicePrice: parseInt(body.servicePrice, 10),
    cancellationFee: parseInt(body.cancellationFee, 10),
    laborCommissionRate: parseFloat(body.laborCommissionPercent) / 100,
    materialsCommissionRate: parseFloat(body.materialsCommissionPercent) / 100,
    merchantCardFeePercent: parseInt(body.merchantCardFeePercent, 10),
    ivaRate: parseFloat(body.ivaPercent) / 100,
    cardSurchargePercent: parseInt(body.cardSurchargePercent, 10),
    cardEnabled: body.cardEnabled === 'on',
    transferEnabled: body.transferEnabled === 'on',
    bankTransfer: {
      bankName: body.bankName || '',
      accountType: body.bankAccountType || '',
      accountNumber: body.bankAccountNumber || '',
      holderName: body.bankHolderName || '',
      holderRut: body.bankHolderRut || '',
      email: body.bankEmail || ''
    },
    paymentGateways: Object.keys(paymentGateways).length ? paymentGateways : undefined,
    scheduleSurcharges: {
      normalPercent: parseInt(body.scheduleNormalPercent, 10),
      tardePercent: parseInt(body.scheduleTardePercent, 10),
      nocturnoPercent: parseInt(body.scheduleNocturnoPercent, 10)
    },
    urgencyTiers: tiers.length ? tiers : undefined,
    catalogPrices
  });

  store.logSecurityEvent('pricing_update', 'config', req);

  if (req.xhr || (req.get('accept') || '').includes('application/json')) {
    return res.json({ success: true, pricing: updated });
  }
  res.redirect('/admin/precios?ok=1');
});

router.post('/transfer/:requestId/aprobar', requireRole('admin'), requireAdminPermission('pagos.manage'), (req, res) => {
  const request = store.approveTransferPayment(req.params.requestId);
  if (!request) return res.status(404).json({ error: 'Transferencia no encontrada o ya procesada' });
  store.logSecurityEvent('transfer_approved', req.params.requestId, req);
  const io = req.app.get('io');
  if (io) require('../lib/dispatch').notifyProvidersForRequest(io, request);
  res.json({ success: true, requestId: request.id });
});

module.exports = router;
