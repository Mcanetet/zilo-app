const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, '../data');
const CONFIG_PATH = path.join(DATA_DIR, 'backup-config.json');
const BACKUPS_ROOT = path.join(DATA_DIR, 'backups');
const UPLOADS_ROOT = path.join(__dirname, '../public/uploads/providers');

/** Política GFS alineada al mercado SaaS (referencia industria 2024-2026) */
const MARKET_DEFAULTS = {
  dailyRetentionDays: 14,       // mercado: 7–30 días
  weeklyRetentionWeeks: 8,      // mercado: 4–12 semanas
  monthlyRetentionMonths: 12,   // mercado: 12–36 meses
  scheduleHour: 3,
  scheduleMinute: 0
};

const DEFAULT_CONFIG = {
  enabled: true,
  autoBackup: true,
  scheduleHour: MARKET_DEFAULTS.scheduleHour,
  scheduleMinute: MARKET_DEFAULTS.scheduleMinute,
  dailyRetentionDays: MARKET_DEFAULTS.dailyRetentionDays,
  weeklyRetentionWeeks: MARKET_DEFAULTS.weeklyRetentionWeeks,
  monthlyRetentionMonths: MARKET_DEFAULTS.monthlyRetentionMonths,
  includeUploads: true,
  includeSecurityLogs: true,
  lastBackupAt: null,
  lastBackupStatus: null,
  lastBackupError: null,
  nextBackupAt: null
};

function ensureDirs() {
  fs.mkdirSync(BACKUPS_ROOT, { recursive: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadConfig() {
  ensureDirs();
  if (!fs.existsSync(CONFIG_PATH)) {
    const cfg = { ...DEFAULT_CONFIG, nextBackupAt: computeNextBackupAt(DEFAULT_CONFIG) };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
    return cfg;
  }
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
  } catch (_) {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(updates) {
  const current = loadConfig();
  const next = { ...current, ...updates };
  next.nextBackupAt = computeNextBackupAt(next);
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2));
  return next;
}

function computeNextBackupAt(cfg) {
  if (!cfg.enabled || !cfg.autoBackup) return null;
  const now = new Date();
  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setHours(cfg.scheduleHour ?? 3, cfg.scheduleMinute ?? 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.toISOString();
}

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return 0;
  fs.mkdirSync(dest, { recursive: true });
  let bytes = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      bytes += copyDirRecursive(s, d);
    } else {
      fs.copyFileSync(s, d);
      bytes += fs.statSync(d).size;
    }
  }
  return bytes;
}

function dirSize(dir) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    total += entry.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return total;
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function createBackup(store, type = 'manual', triggeredBy = 'admin') {
  ensureDirs();
  const config = loadConfig();
  const id = uuidv4();
  const createdAt = new Date();
  const stamp = createdAt.toISOString().replace(/[:.]/g, '-');
  const folderName = `${type}-${stamp}-${id.slice(0, 8)}`;
  const folderPath = path.join(BACKUPS_ROOT, folderName);

  fs.mkdirSync(folderPath, { recursive: true });

  const snapshot = store.exportDataSnapshot({
    includeSecurityLogs: config.includeSecurityLogs !== false
  });

  const dataPath = path.join(folderPath, 'snapshot.json');
  fs.writeFileSync(dataPath, JSON.stringify(snapshot, null, 2));
  let uploadsBytes = 0;

  if (config.includeUploads) {
    uploadsBytes = copyDirRecursive(UPLOADS_ROOT, path.join(folderPath, 'uploads'));
  }

  const manifest = {
    id,
    type,
    triggeredBy,
    createdAt: createdAt.toISOString(),
    version: snapshot.version,
    includesUploads: !!config.includeUploads,
    includesSecurityLogs: config.includeSecurityLogs !== false,
    stats: {
      users: snapshot.users?.length || 0,
      requests: snapshot.requests?.length || 0,
      consents: snapshot.consentRecords?.length || 0,
      dataBytes: fs.statSync(dataPath).size,
      uploadsBytes,
      totalBytes: fs.statSync(dataPath).size + uploadsBytes + dirSize(path.join(folderPath, 'uploads'))
    }
  };

  fs.writeFileSync(path.join(folderPath, 'manifest.json'), JSON.stringify(manifest, null, 2));

  saveConfig({
    lastBackupAt: manifest.createdAt,
    lastBackupStatus: 'success',
    lastBackupError: null
  });

  return { manifest, folderPath, folderName };
}

function listBackups() {
  ensureDirs();
  const items = [];
  for (const name of fs.readdirSync(BACKUPS_ROOT)) {
    const folderPath = path.join(BACKUPS_ROOT, name);
    if (!fs.statSync(folderPath).isDirectory()) continue;
    const manifestPath = path.join(folderPath, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      items.push({ ...manifest, folderName: name, folderPath });
    } catch (_) {}
  }
  return items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getBackupById(id) {
  return listBackups().find(b => b.id === id) || null;
}

function deleteBackup(id) {
  const backup = getBackupById(id);
  if (!backup) return false;
  fs.rmSync(backup.folderPath, { recursive: true, force: true });
  return true;
}

function applyRetention() {
  const config = loadConfig();
  const backups = listBackups();
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  let removed = 0;

  const dailyCutoff = now - config.dailyRetentionDays * dayMs;
  const weeklyCutoff = now - config.weeklyRetentionWeeks * 7 * dayMs;
  const monthlyCutoff = now - config.monthlyRetentionMonths * 30 * dayMs;

  for (const b of backups) {
    const t = new Date(b.createdAt).getTime();
    let shouldDelete = false;

    if (b.type === 'daily' && t < dailyCutoff) shouldDelete = true;
    if (b.type === 'weekly' && t < weeklyCutoff) shouldDelete = true;
    if (b.type === 'monthly' && t < monthlyCutoff) shouldDelete = true;
    // manual: no auto-delete

    if (shouldDelete) {
      fs.rmSync(b.folderPath, { recursive: true, force: true });
      removed++;
    }
  }

  return removed;
}

function runScheduledBackups(store) {
  const config = loadConfig();
  if (!config.enabled || !config.autoBackup) return null;

  const now = new Date();
  const results = [];

  results.push(createBackup(store, 'daily', 'scheduler'));

  if (now.getDay() === 0) {
    results.push(createBackup(store, 'weekly', 'scheduler'));
  }
  if (now.getDate() === 1) {
    results.push(createBackup(store, 'monthly', 'scheduler'));
  }

  const removed = applyRetention();
  const updated = saveConfig({
    lastBackupAt: results[0]?.manifest?.createdAt || config.lastBackupAt,
    lastBackupStatus: 'success',
    nextBackupAt: computeNextBackupAt(config)
  });

  return { results, removed, config: updated };
}

function shouldRunNow(config) {
  if (!config.enabled || !config.autoBackup) return false;
  const now = new Date();
  return now.getHours() === (config.scheduleHour ?? 3)
    && now.getMinutes() === (config.scheduleMinute ?? 0);
}

function startBackupScheduler(store, logEvent) {
  ensureDirs();
  const config = loadConfig();
  if (!config.nextBackupAt) {
    saveConfig({ nextBackupAt: computeNextBackupAt(config) });
  }

  let lastRunKey = null;

  setInterval(() => {
    const cfg = loadConfig();
    if (!shouldRunNow(cfg)) return;

    const runKey = new Date().toISOString().slice(0, 16);
    if (lastRunKey === runKey) return;
    lastRunKey = runKey;

    try {
      const result = runScheduledBackups(store);
      if (logEvent) {
        logEvent('backup_scheduled', `daily+${result.results.length - 1} extra, removed=${result.removed}`);
      }
      console.log(`[Fundez Backup] Completado: ${result.results.length} copia(s), ${result.removed} antigua(s) eliminada(s)`);
    } catch (err) {
      saveConfig({ lastBackupStatus: 'error', lastBackupError: err.message });
      console.error('[Fundez Backup] Error:', err.message);
    }
  }, 60 * 1000);
}

function getRetentionSummary(config) {
  config = config || loadConfig();
  return {
    policy: 'GFS (Grandfather-Father-Son)',
    marketReference: {
      daily: '7–30 días (Fundez: 14 por defecto)',
      weekly: '4–12 semanas (Fundez: 8 por defecto)',
      monthly: '12–36 meses (Fundez: 12 por defecto)',
      note: 'Estándar SaaS para apps de servicios. Ajusta según Ley 19.628 y retención mínima necesaria.'
    },
    configured: {
      dailyRetentionDays: config.dailyRetentionDays,
      weeklyRetentionWeeks: config.weeklyRetentionWeeks,
      monthlyRetentionMonths: config.monthlyRetentionMonths
    }
  };
}

module.exports = {
  MARKET_DEFAULTS,
  DEFAULT_CONFIG,
  loadConfig,
  saveConfig,
  createBackup,
  listBackups,
  getBackupById,
  deleteBackup,
  applyRetention,
  runScheduledBackups,
  startBackupScheduler,
  computeNextBackupAt,
  getRetentionSummary,
  formatBytes,
  BACKUPS_ROOT
};
