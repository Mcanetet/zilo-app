const db = require('./db');

const SETTING_KEY = 'admin_custom_profiles';

async function loadCustomProfiles() {
  if (!db.isConfigured()) return [];
  try {
    const res = await db.query(
      'SELECT setting_value FROM app_settings WHERE setting_key = ? LIMIT 1',
      [SETTING_KEY]
    );
    const raw = res.rows?.[0]?.setting_value;
    if (!raw) return [];
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

async function saveCustomProfiles(list) {
  if (!db.isConfigured()) {
    throw new Error('Base de datos no configurada');
  }
  const payload = JSON.stringify(Array.isArray(list) ? list : []);
  await db.query(
    `INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [SETTING_KEY, payload]
  );
  return true;
}

module.exports = {
  SETTING_KEY,
  loadCustomProfiles,
  saveCustomProfiles
};
