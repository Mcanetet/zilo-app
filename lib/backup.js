const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getAppVersionInfo } = require('./version');
const backupStore = require('./backupStore');

const DATA_DIR = path.join(__dirname, '../data');
const CONFIG_PATH = path.join(DATA_DIR, 'backup-config.json');
const BACKUPS_ROOT = path.join(DATA_DIR, 'backups');
const UPLOADS_ROOT = path.join(__dirname, '../public/uploads/providers');
const REQUEST_UPLOADS_ROOT = path.join(__dirname, '../public/uploads/requests');

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
  autoRetention: false,
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
  try {
    fs.mkdirSync(BACKUPS_ROOT, { recursive: true });
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    console.warn('[Fundez Backup] No se pudo crear directorios locales:', err.message);
  }
}

function writeBackupToFilesystem(manifest, snapshot, folderName) {
  ensureDirs();
  const folderPath = path.join(BACKUPS_ROOT, folderName);
  fs.mkdirSync(folderPath, { recursive: true });
  fs.writeFileSync(path.join(folderPath, 'snapshot.json'), JSON.stringify(snapshot, null, 2));
  fs.writeFileSync(path.join(folderPath, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return folderPath;
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

async function loadConfigAsync() {
  if (backupStore.isAvailable()) {
    try {
      const dbConfig = await backupStore.loadConfig(DEFAULT_CONFIG);
      if (dbConfig) {
        const merged = { ...DEFAULT_CONFIG, ...dbConfig };
        merged.nextBackupAt = computeNextBackupAt(merged);
        return merged;
      }
    } catch (err) {
      console.error('[Fundez Backup] loadConfigAsync MySQL:', err.message);
    }
  }
  return loadConfig();
}

async function saveConfig(updates) {
  const current = loadConfig();
  const next = { ...current, ...updates };
  next.nextBackupAt = computeNextBackupAt(next);
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2));
  } catch (err) {
    console.warn('[Fundez Backup] No se pudo escribir config local:', err.message);
  }
  if (backupStore.isAvailable()) {
    await backupStore.saveConfig(next);
  }
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

function normalizeSnapshotInput(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error('Archivo JSON inválido');
  }
  if (snapshot.snapshot && typeof snapshot.snapshot === 'object' && !Array.isArray(snapshot.snapshot)) {
    return snapshot.snapshot;
  }
  return snapshot;
}

function validateSnapshot(snapshot) {
  const data = normalizeSnapshotInput(snapshot);
  if (data.app && data.app !== 'fundez') {
    throw new Error('El archivo no es un backup de Fundez');
  }
  if (
    !Array.isArray(data.users)
    && !Array.isArray(data.services)
    && !Array.isArray(data.requests)
    && data.app !== 'fundez'
  ) {
    throw new Error('El archivo no parece un backup de Fundez (falta users, services o requests)');
  }
  return data;
}

function buildManifestFromSnapshot(snapshot, { id, type, triggeredBy, createdAt, includesUploads = false }) {
  const versionInfo = getAppVersionInfo();
  const dataBytes = Buffer.byteLength(JSON.stringify(snapshot), 'utf8');
  return {
    id,
    type,
    triggeredBy,
    createdAt: createdAt.toISOString(),
    schemaVersion: snapshot.schemaVersion || 1,
    appVersion: snapshot.appVersion || versionInfo.version,
    appVersionLabel: snapshot.appVersionLabel || versionInfo.label,
    gitCommit: snapshot.gitCommit || versionInfo.gitCommit,
    exportedAt: snapshot.exportedAt || createdAt.toISOString(),
    includesUploads,
    includesSecurityLogs: Array.isArray(snapshot.securityLogs) && snapshot.securityLogs.length > 0,
    stats: {
      users: snapshot.users?.length || 0,
      requests: snapshot.requests?.length || 0,
      consents: snapshot.consentRecords?.length || 0,
      dataBytes,
      uploadsBytes: 0,
      totalBytes: dataBytes
    }
  };
}

async function persistBackupRecord(manifest, snapshot, folderName) {
  if (!backupStore.isAvailable()) return false;
  await backupStore.saveBackup({
    id: manifest.id,
    manifest,
    snapshot,
    folderName
  });
  return true;
}

async function hydrateFromDatabase() {
  if (!backupStore.isAvailable()) return;

  try {
    const dbConfig = await backupStore.loadConfig(DEFAULT_CONFIG);
    if (dbConfig) {
      const merged = { ...DEFAULT_CONFIG, ...dbConfig };
      merged.nextBackupAt = computeNextBackupAt(merged);
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2));
    } else if (fs.existsSync(CONFIG_PATH)) {
      await backupStore.saveConfig(loadConfig());
    }

    await backupStore.migrateFromFilesystem();
  } catch (err) {
    console.error('[Fundez Backup] Error hidratando desde MySQL:', err.message);
  }
}
async function importSnapshotFile(snapshot, triggeredBy = 'admin') {
  const normalized = validateSnapshot(snapshot);

  const id = uuidv4();
  const createdAt = new Date();
  const folderName = `imported-${createdAt.toISOString().replace(/[:.]/g, '-')}-${id.slice(0, 8)}`;
  const manifest = buildManifestFromSnapshot(normalized, {
    id,
    type: 'imported',
    triggeredBy,
    createdAt,
    includesUploads: false
  });

  let folderPath = null;
  try {
    folderPath = writeBackupToFilesystem(manifest, normalized, folderName);
  } catch (err) {
    console.warn('[Fundez Backup] Backup importado sin copia en disco:', err.message);
  }

  if (backupStore.isAvailable()) {
    await persistBackupRecord(manifest, normalized, folderName);
  } else if (!folderPath) {
    throw new Error('No se pudo guardar el backup (MySQL no disponible y disco no escribible)');
  }

  return { manifest, folderPath, folderName };
}

async function restoreFromSnapshotData(store, snapshot, { triggeredBy = 'admin', restoreUploads = false, saveImport = true } = {}) {
  const normalized = validateSnapshot(snapshot);

  const preRestore = await createBackup(store, 'pre-restore', triggeredBy);
  const stats = await store.importDataSnapshot(normalized);

  let imported = null;
  if (saveImport) {
    imported = await importSnapshotFile(normalized, triggeredBy);
  }

  return {
    stats,
    preRestoreBackupId: preRestore.manifest.id,
    importedBackupId: imported?.manifest?.id || null,
    appVersion: normalized.appVersion || preRestore.manifest.appVersion,
    uploadsRestored: restoreUploads
  };
}

async function createBackup(store, type = 'manual', triggeredBy = 'admin') {
  const config = loadConfig();
  const id = uuidv4();
  const createdAt = new Date();
  const stamp = createdAt.toISOString().replace(/[:.]/g, '-');
  const folderName = `${type}-${stamp}-${id.slice(0, 8)}`;

  const snapshot = await store.exportDataSnapshot({
    includeSecurityLogs: config.includeSecurityLogs !== false
  });

  if (backupStore.isAvailable()) {
    try {
      const dbConfig = await backupStore.loadConfig(null);
      if (dbConfig) snapshot.backupConfig = dbConfig;
    } catch (err) {
      console.warn('[Fundez Backup] No se pudo incluir config en snapshot:', err.message);
    }
  }

  let uploadsBytes = 0;
  let folderPath = null;
  let dataBytes = Buffer.byteLength(JSON.stringify(snapshot), 'utf8');

  try {
    folderPath = writeBackupToFilesystem(
      buildManifestFromSnapshot(snapshot, {
        id,
        type,
        triggeredBy,
        createdAt,
        includesUploads: !!config.includeUploads
      }),
      snapshot,
      folderName
    );
    const dataPath = path.join(folderPath, 'snapshot.json');
    if (config.includeUploads) {
      uploadsBytes = copyDirRecursive(UPLOADS_ROOT, path.join(folderPath, 'uploads', 'providers'));
      uploadsBytes += copyDirRecursive(REQUEST_UPLOADS_ROOT, path.join(folderPath, 'uploads', 'requests'));
    }
    dataBytes = fs.statSync(dataPath).size;
    const manifestOnDisk = JSON.parse(fs.readFileSync(path.join(folderPath, 'manifest.json'), 'utf8'));
    manifestOnDisk.stats.uploadsBytes = uploadsBytes;
    manifestOnDisk.stats.totalBytes = dataBytes + uploadsBytes + dirSize(path.join(folderPath, 'uploads'));
    fs.writeFileSync(path.join(folderPath, 'manifest.json'), JSON.stringify(manifestOnDisk, null, 2));
  } catch (err) {
    console.warn('[Fundez Backup] Backup sin copia en disco:', err.message);
    folderPath = path.join(BACKUPS_ROOT, folderName);
  }

  const versionInfo = getAppVersionInfo();
  const manifest = {
    id,
    type,
    triggeredBy,
    createdAt: createdAt.toISOString(),
    schemaVersion: snapshot.schemaVersion || 1,
    appVersion: snapshot.appVersion || versionInfo.version,
    appVersionLabel: snapshot.appVersionLabel || versionInfo.label,
    gitCommit: snapshot.gitCommit || versionInfo.gitCommit,
    includesUploads: !!config.includeUploads,
    includesSecurityLogs: config.includeSecurityLogs !== false,
    stats: {
      users: snapshot.users?.length || 0,
      requests: snapshot.requests?.length || 0,
      consents: snapshot.consentRecords?.length || 0,
      dataBytes,
      uploadsBytes,
      totalBytes: dataBytes + uploadsBytes
    }
  };

  if (backupStore.isAvailable()) {
    await persistBackupRecord(manifest, snapshot, folderName);
  } else if (!folderPath || !fs.existsSync(path.join(folderPath, 'snapshot.json'))) {
    throw new Error('No se pudo guardar el backup (MySQL no disponible y disco no escribible)');
  }

  await saveConfig({
    lastBackupAt: manifest.createdAt,
    lastBackupStatus: 'success',
    lastBackupError: null
  });

  return { manifest, folderPath, folderName };
}

function listFilesystemBackups() {
  ensureDirs();
  const items = [];
  if (!fs.existsSync(BACKUPS_ROOT)) return items;
  for (const name of fs.readdirSync(BACKUPS_ROOT)) {
    const folderPath = path.join(BACKUPS_ROOT, name);
    if (!fs.statSync(folderPath).isDirectory()) continue;
    const manifestPath = path.join(folderPath, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      items.push({ ...manifest, folderName: name, folderPath, storage: 'filesystem' });
    } catch (_) {}
  }
  return items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function listBackups() {
  const merged = new Map();

  if (backupStore.isAvailable()) {
    try {
      const dbItems = await backupStore.listBackups();
      for (const item of dbItems) merged.set(item.id, item);
    } catch (err) {
      console.error('[Fundez Backup] listBackups MySQL:', err.message);
    }
  }

  for (const item of listFilesystemBackups()) {
    if (!merged.has(item.id)) merged.set(item.id, item);
  }

  return [...merged.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function getBackupById(id) {
  if (backupStore.isAvailable()) {
    try {
      const item = await backupStore.getBackupById(id);
      if (item) return item;
    } catch (err) {
      console.error('[Fundez Backup] getBackupById MySQL:', err.message);
    }
  }
  return listFilesystemBackups().find((b) => b.id === id) || null;
}

async function deleteBackup(id) {
  const item = await getBackupById(id);
  if (!item) return false;
  if (item.folderPath && fs.existsSync(item.folderPath)) {
    fs.rmSync(item.folderPath, { recursive: true, force: true });
  }
  if (backupStore.isAvailable()) {
    try {
      await backupStore.deleteBackup(id);
    } catch (err) {
      console.error('[Fundez Backup] deleteBackup MySQL:', err.message);
    }
  }
  return true;
}

function getSnapshotPath(backup) {
  if (backup?.folderPath) return path.join(backup.folderPath, 'snapshot.json');
  return null;
}

async function readSnapshot(backupId) {
  if (backupStore.isAvailable()) {
    try {
      const snap = await backupStore.readSnapshot(backupId);
      if (snap) return snap;
    } catch (err) {
      console.error('[Fundez Backup] readSnapshot MySQL:', err.message);
    }
  }
  const backup = await getBackupById(backupId);
  if (!backup) return null;
  const snapshotPath = getSnapshotPath(backup);
  if (!snapshotPath || !fs.existsSync(snapshotPath)) return null;
  return JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
}

function restoreUploadsFromBackup(backup) {
  if (!backup?.folderPath) return false;
  const srcRoot = path.join(backup.folderPath, 'uploads');
  if (!fs.existsSync(srcRoot)) return false;

  const providersSrc = fs.existsSync(path.join(srcRoot, 'providers'))
    ? path.join(srcRoot, 'providers')
    : srcRoot; // compat backups antiguos
  const requestsSrc = path.join(srcRoot, 'requests');

  if (fs.existsSync(UPLOADS_ROOT)) {
    fs.rmSync(UPLOADS_ROOT, { recursive: true, force: true });
  }
  copyDirRecursive(providersSrc, UPLOADS_ROOT);

  if (fs.existsSync(requestsSrc)) {
    if (fs.existsSync(REQUEST_UPLOADS_ROOT)) {
      fs.rmSync(REQUEST_UPLOADS_ROOT, { recursive: true, force: true });
    }
    copyDirRecursive(requestsSrc, REQUEST_UPLOADS_ROOT);
  }
  return true;
}

async function restoreBackup(store, backupId, { triggeredBy = 'admin', restoreUploads = true } = {}) {
  const backupItem = await getBackupById(backupId);
  if (!backupItem) throw new Error('Backup no encontrado');

  const snapshot = await readSnapshot(backupId);
  if (!snapshot) throw new Error('No se encontró snapshot.json en el backup');

  const preRestore = await createBackup(store, 'pre-restore', triggeredBy);
  const stats = await store.importDataSnapshot(snapshot);
  let uploadsRestored = false;
  if (restoreUploads && backupItem.includesUploads && backupItem.folderPath) {
    uploadsRestored = restoreUploadsFromBackup(backupItem);
  }

  return {
    restoredFrom: backupItem.id,
    preRestoreBackupId: preRestore.manifest.id,
    stats,
    uploadsRestored,
    appVersion: backupItem.appVersion || snapshot.appVersion
  };
}

async function applyRetention() {
  const config = loadConfig();
  if (config.autoRetention === false) return 0;

  const backups = await listBackups();
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
      await deleteBackup(b.id);
      removed++;
    }
  }

  return removed;
}

async function runScheduledBackups(store) {
  const config = loadConfig();
  if (!config.enabled || !config.autoBackup) return null;

  const now = new Date();
  const results = [];

  results.push(await createBackup(store, 'daily', 'scheduler'));

  if (now.getDay() === 0) {
    results.push(await createBackup(store, 'weekly', 'scheduler'));
  }
  if (now.getDate() === 1) {
    results.push(await createBackup(store, 'monthly', 'scheduler'));
  }

  const removed = config.autoRetention === false ? 0 : await applyRetention();
  const updated = await saveConfig({
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
    saveConfig({ nextBackupAt: computeNextBackupAt(config) }).catch((err) => {
      console.error('[Fundez Backup] Error guardando nextBackupAt:', err.message);
    });
  }

  let lastRunKey = null;

  setInterval(async () => {
    const cfg = loadConfig();
    if (!shouldRunNow(cfg)) return;

    const runKey = new Date().toISOString().slice(0, 16);
    if (lastRunKey === runKey) return;
    lastRunKey = runKey;

    try {
      const result = await runScheduledBackups(store);
      if (logEvent) {
        logEvent('backup_scheduled', `daily+${result.results.length - 1} extra, removed=${result.removed}`);
      }
      console.log(`[Fundez Backup] Completado: ${result.results.length} copia(s)${result.removed ? `, ${result.removed} antigua(s) eliminada(s)` : ', historial conservado'}`);
    } catch (err) {
      await saveConfig({ lastBackupStatus: 'error', lastBackupError: err.message });
      console.error('[Fundez Backup] Error:', err.message);
    }
  }, 60 * 1000);
}

async function ensureStartupBackup(store) {
  if (!backupStore.isAvailable() || !store?.exportDataSnapshot) return;

  try {
    await backupStore.migrateFromFilesystem();
    const backups = await listBackups();
    const config = loadConfig();
    const lastAt = config.lastBackupAt ? new Date(config.lastBackupAt).getTime() : 0;
    const hoursSinceLast = lastAt ? (Date.now() - lastAt) / (1000 * 60 * 60) : Infinity;

    if (backups.length === 0 || hoursSinceLast >= 6) {
      await createBackup(store, 'startup', 'system');
      console.log('[Fundez Backup] Copia de arranque guardada en MySQL');
    }
  } catch (err) {
    console.error('[Fundez Backup] Copia de arranque fallida:', err.message);
  }
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
      autoRetention: config.autoRetention !== false,
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
  loadConfigAsync,
  saveConfig,
  createBackup,
  listBackups,
  getBackupById,
  readSnapshot,
  restoreBackup,
  restoreFromSnapshotData,
  importSnapshotFile,
  validateSnapshot,
  deleteBackup,
  applyRetention,
  runScheduledBackups,
  startBackupScheduler,
  computeNextBackupAt,
  getRetentionSummary,
  hydrateFromDatabase,
  ensureStartupBackup,
  formatBytes,
  BACKUPS_ROOT
};
