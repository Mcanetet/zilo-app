const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const store = require('../models/store');
const company = require('../config/company');
const backup = require('../lib/backup');
const { requireRole } = require('../middleware/auth');
const { rateLimitLogin, adminIpAllowlist, getClientIp, parseAdminIpAllowlist } = require('../middleware/security');
const { qrDataUrl } = require('../lib/mfa');

router.use(adminIpAllowlist());

const ADMIN_SESSION_MS = 4 * 60 * 60 * 1000;
const MFA_PENDING_MS = 5 * 60 * 1000;

function completeAdminSession(req, user) {
  req.session.user = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role
  };
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
  const { email, password } = req.body;
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

router.get('/', requireRole('admin'), (req, res) => {
  const allRequests = store.getAllRequests();
  const providers = store.USERS.filter(u => u.role === 'provider');
  const clients = store.USERS.filter(u => u.role === 'client');
  const onlineCount = providers.filter(p => p.online).length;
  const adminStats = store.getAdminStats();
  const pricing = store.getPricingConfig();

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
    services: store.SERVICES,
    modules: store.getModules(),
    clientModules: store.getModulesByAudience('client'),
    providerModules: store.getModulesByAudience('provider'),
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
    backupConfig: backup.loadConfig(),
    backups: backup.listBackups().slice(0, 20),
    backupRetention: backup.getRetentionSummary(),
    formatBytes: backup.formatBytes,
    mfaStatus: store.getAdminMfaStatus(req.session.user.id),
    mfaMessage: req.query.mfa || null,
    mfaError: req.query.mfa_error || null,
    initialTab: req.query.tab || null,
    financialReport: store.getFinancialReport(),
    clientIp: getClientIp(req),
    adminIpAllowlist: parseAdminIpAllowlist()
  });
});

router.get('/finanzas/export.csv', requireRole('admin'), (req, res) => {
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

router.post('/toggle-service', requireRole('admin'), (req, res) => {
  const { serviceId, enabled } = req.body;
  const service = store.toggleService(serviceId, enabled === true || enabled === 'true');
  if (!service) return res.status(404).json({ error: 'Servicio no encontrado' });

  store.logSecurityEvent('service_toggle', `${serviceId}=${enabled}`, req);
  req.app.get('io').emit('services_updated', { services: store.SERVICES });
  res.json({ success: true, service });
});

router.post('/toggle-module', requireRole('admin'), (req, res) => {
  const { moduleId, enabled } = req.body;
  const mod = store.toggleModule(moduleId, enabled === true || enabled === 'true');
  if (!mod) return res.status(404).json({ error: 'Módulo no encontrado' });

  store.logSecurityEvent('module_toggle', `${moduleId}=${enabled}`, req);
  req.app.get('io').emit('modules_updated', { modules: store.MODULES });
  res.json({ success: true, module: mod });
});

router.post('/toggle-user', requireRole('admin'), (req, res) => {
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

router.post('/complaint/:id/status', requireRole('admin'), (req, res) => {
  const complaint = store.updateComplaintStatus(req.params.id, req.body.status);
  if (!complaint) return res.status(404).json({ error: 'Reclamo no encontrado' });
  store.logSecurityEvent('complaint_update', `${req.params.id}=${req.body.status}`, req);
  res.json({ success: true, complaint });
});

router.post('/payout/:requestId', requireRole('admin'), (req, res) => {
  const req_ = store.markPayoutPaid(req.params.requestId);
  if (!req_) return res.status(404).json({ error: 'Solicitud no encontrada' });
  store.logSecurityEvent('payout_marked', req.params.requestId, req);
  res.json({ success: true, request: req_ });
});

router.get('/backups/config', requireRole('admin'), (req, res) => {
  res.json({
    success: true,
    config: backup.loadConfig(),
    retention: backup.getRetentionSummary(),
    backups: backup.listBackups()
  });
});

router.post('/backups/config', requireRole('admin'), (req, res) => {
  const allowed = [
    'enabled', 'autoBackup', 'scheduleHour', 'scheduleMinute',
    'dailyRetentionDays', 'weeklyRetentionWeeks', 'monthlyRetentionMonths',
    'includeUploads', 'includeSecurityLogs'
  ];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  if (updates.scheduleHour != null) updates.scheduleHour = Math.min(23, Math.max(0, parseInt(updates.scheduleHour, 10)));
  if (updates.scheduleMinute != null) updates.scheduleMinute = Math.min(59, Math.max(0, parseInt(updates.scheduleMinute, 10)));
  if (updates.dailyRetentionDays != null) updates.dailyRetentionDays = Math.min(90, Math.max(1, parseInt(updates.dailyRetentionDays, 10)));
  if (updates.weeklyRetentionWeeks != null) updates.weeklyRetentionWeeks = Math.min(52, Math.max(1, parseInt(updates.weeklyRetentionWeeks, 10)));
  if (updates.monthlyRetentionMonths != null) updates.monthlyRetentionMonths = Math.min(84, Math.max(1, parseInt(updates.monthlyRetentionMonths, 10)));

  const config = backup.saveConfig(updates);
  store.logSecurityEvent('backup_config_update', JSON.stringify(updates), req);
  res.json({ success: true, config, retention: backup.getRetentionSummary(config) });
});

router.post('/backups/run', requireRole('admin'), (req, res) => {
  try {
    const result = backup.createBackup(store, 'manual', req.session.user.email);
    const removed = backup.applyRetention();
    store.logSecurityEvent('backup_manual', result.manifest.id, req);
    res.json({
      success: true,
      backup: result.manifest,
      removed,
      config: backup.loadConfig()
    });
  } catch (err) {
    backup.saveConfig({ lastBackupStatus: 'error', lastBackupError: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/backups/retention', requireRole('admin'), (req, res) => {
  const removed = backup.applyRetention();
  store.logSecurityEvent('backup_retention_purge', `removed=${removed}`, req);
  res.json({ success: true, removed, backups: backup.listBackups() });
});

router.get('/backups/:id/download', requireRole('admin'), (req, res) => {
  const item = backup.getBackupById(req.params.id);
  if (!item) return res.status(404).json({ error: 'Backup no encontrado' });

  const snapshotPath = path.join(item.folderPath, 'snapshot.json');
  if (!fs.existsSync(snapshotPath)) return res.status(404).json({ error: 'Archivo no encontrado' });

  res.download(snapshotPath, `zilo-backup-${item.type}-${item.createdAt.slice(0, 10)}.json`);
});

router.delete('/backups/:id', requireRole('admin'), (req, res) => {
  const ok = backup.deleteBackup(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Backup no encontrado' });
  store.logSecurityEvent('backup_delete', req.params.id, req);
  res.json({ success: true, backups: backup.listBackups() });
});

router.get('/precios', requireRole('admin'), (req, res) => {
  const pricing = store.getPricingConfig();
  const gateways = require('../lib/payments/gateways');
  res.render('admin/precios', {
    title: 'Configuración de precios — Fundez Admin',
    user: req.session.user,
    pricing,
    gatewayStatus: gateways.getGatewayStatus(pricing),
    query: req.query,
    formatCLP: store.formatCLP
  });
});

router.post('/precios', requireRole('admin'), (req, res) => {
  const body = req.body;
  const tiers = [];
  const tierIds = Array.isArray(body.tierId) ? body.tierId : (body.tierId ? [body.tierId] : []);
  const tierLabels = Array.isArray(body.tierLabel) ? body.tierLabel : (body.tierLabel ? [body.tierLabel] : []);
  const tierDescs = Array.isArray(body.tierDesc) ? body.tierDesc : (body.tierDesc ? [body.tierDesc] : []);
  const tierPercents = Array.isArray(body.tierPercent) ? body.tierPercent : (body.tierPercent ? [body.tierPercent] : []);
  const tierEnabledRaw = body.tierEnabled;
  const enabledSet = new Set(Array.isArray(tierEnabledRaw) ? tierEnabledRaw : (tierEnabledRaw ? [tierEnabledRaw] : []));
  const tierOrders = Array.isArray(body.tierOrder) ? body.tierOrder : (body.tierOrder ? [body.tierOrder] : []);

  for (let i = 0; i < tierIds.length; i++) {
    tiers.push({
      id: tierIds[i],
      label: tierLabels[i] || `Opción ${i + 1}`,
      description: tierDescs[i] || '',
      adjustmentPercent: parseInt(tierPercents[i], 10) || 0,
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

  const updated = store.updatePricingConfig({
    visitPrice: parseInt(body.visitPrice, 10),
    servicePrice: parseInt(body.servicePrice, 10),
    cancellationFee: parseInt(body.cancellationFee, 10),
    laborCommissionRate: parseFloat(body.laborCommissionPercent) / 100,
    materialsCommissionRate: parseFloat(body.materialsCommissionPercent) / 100,
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
    urgencyTiers: tiers.length ? tiers : undefined
  });

  store.logSecurityEvent('pricing_update', 'config', req);

  if (req.xhr || (req.get('accept') || '').includes('application/json')) {
    return res.json({ success: true, pricing: updated });
  }
  res.redirect('/admin/precios?ok=1');
});

router.post('/transfer/:requestId/aprobar', requireRole('admin'), (req, res) => {
  const request = store.approveTransferPayment(req.params.requestId);
  if (!request) return res.status(404).json({ error: 'Transferencia no encontrada o ya procesada' });
  store.logSecurityEvent('transfer_approved', req.params.requestId, req);
  const io = req.app.get('io');
  if (io) require('../lib/dispatch').notifyProvidersForRequest(io, request);
  res.json({ success: true, requestId: request.id });
});

module.exports = router;
