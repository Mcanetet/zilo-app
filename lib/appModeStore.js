const appMode = require('./appMode');
const db = require('./db');

const KEY = 'app_mode_override';

async function hydrateAppModeOverride() {
  if (!db.isConfigured()) return null;
  try {
    const res = await db.query(
      'SELECT setting_value FROM app_settings WHERE setting_key = ? LIMIT 1',
      [KEY]
    );
    const raw = res.rows?.[0]?.setting_value;
    if (!raw) return null;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const mode = parsed?.mode;
    if (mode === 'demo' || mode === 'production') {
      appMode.setRuntimeOverride(mode);
      return mode;
    }
    if (mode === null || mode === 'env') {
      appMode.clearRuntimeOverride();
      return null;
    }
  } catch (_) { /* noop */ }
  return null;
}

async function persistAppModeOverride(mode) {
  if (!db.isConfigured()) throw new Error('Base de datos no configurada');
  const payload = JSON.stringify({
    mode: mode == null || mode === 'env' ? null : mode,
    updatedAt: new Date().toISOString()
  });
  await db.query(
    `INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [KEY, payload]
  );
  if (mode == null || mode === 'env') appMode.clearRuntimeOverride();
  else appMode.setRuntimeOverride(mode);
  return appMode.getPublicStatus();
}

module.exports = {
  hydrateAppModeOverride,
  persistAppModeOverride
};
