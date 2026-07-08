const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const store = require('../models/store');
const company = require('../config/company');
const backup = require('../lib/backup');
const { requireRole } = require('../middleware/auth');

router.get('/', requireRole('admin'), (req, res) => {
  const allRequests = store.getAllRequests();
  const providers = store.USERS.filter(u => u.role === 'provider');
  const clients = store.USERS.filter(u => u.role === 'client');
  const onlineCount = providers.filter(p => p.online).length;
  const adminStats = store.getAdminStats();

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
    requests: allRequests.slice(0, 30),
    payments: store.getPayments(),
    payouts: store.getProviderPayouts(),
    complaints: store.COMPLAINTS,
    chats: store.CHATS,
    consents: store.consentRecords.slice(0, 20),
    securityLogs: store.securityLogs.slice(0, 25),
    providers,
    company,
    formatCLP: store.formatCLP,
    backupConfig: backup.loadConfig(),
    backups: backup.listBackups().slice(0, 20),
    backupRetention: backup.getRetentionSummary(),
    formatBytes: backup.formatBytes
  });
});

router.post('/toggle-service', requireRole('admin'), (req, res) => {
  const { serviceId, enabled } = req.body;
  const service = store.toggleService(serviceId, enabled === true || enabled === 'true');
  if (!service) return res.status(404).json({ error: 'Servicio no encontrado' });

  store.logSecurityEvent('service_toggle', `${serviceId}=${enabled}`, req);
  req.app.get('io').emit('services_updated', { services: store.SERVICES });
  res.json({ success: true, service });
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

module.exports = router;
