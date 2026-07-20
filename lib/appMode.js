/**
 * Modo de operación Fundez: demo (pruebas) vs production (pagos reales).
 *
 * APP_MODE=demo|production
 * - Si no se define: production cuando NODE_ENV=production, si no demo.
 * - En admin, superadmin/admin.mod pueden fijar override persistido (solo si ALLOW_APP_MODE_TOGGLE=true o modo demo).
 *
 * ADMIN_PATH: ruta secreta del panel (ej. /ops-k7m2x9qf). Default /admin.
 */
const crypto = require('crypto');

const VALID = new Set(['demo', 'production']);

let runtimeOverride = null; // null | 'demo' | 'production'

function envMode() {
  const raw = String(process.env.APP_MODE || '').trim().toLowerCase();
  if (VALID.has(raw)) return raw;
  return process.env.NODE_ENV === 'production' ? 'production' : 'demo';
}

function getMode() {
  if (runtimeOverride && VALID.has(runtimeOverride)) return runtimeOverride;
  return envMode();
}

function isDemoMode() {
  return getMode() === 'demo';
}

function isProductionMode() {
  return getMode() === 'production';
}

function setRuntimeOverride(mode) {
  if (mode == null || mode === '' || mode === 'env') {
    runtimeOverride = null;
    return getMode();
  }
  const next = String(mode).trim().toLowerCase();
  if (!VALID.has(next)) throw new Error('Modo inválido');
  runtimeOverride = next;
  return runtimeOverride;
}

function clearRuntimeOverride() {
  runtimeOverride = null;
  return getMode();
}

function canToggleModeFromAdmin() {
  // En producción real solo si se habilita explícitamente (peligroso).
  if (envMode() === 'production') {
    return process.env.ALLOW_APP_MODE_TOGGLE === 'true';
  }
  return true;
}

function normalizeAdminPath(raw) {
  let p = String(raw || '/admin').trim();
  if (!p.startsWith('/')) p = `/${p}`;
  p = p.replace(/\/+$/, '') || '/admin';
  // Solo path relativo seguro (sin query, espacios ni segmentos raros)
  if (!/^\/[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/.test(p)) p = '/admin';
  // Evitar colisiones con rutas públicas
  const blocked = new Set(['/', '/login', '/cliente', '/proveedor', '/tecnico', '/pagos', '/legal', '/health', '/registro', '/aland', '/lang']);
  if (blocked.has(p)) p = '/admin';
  return p;
}

function getAdminBasePath() {
  return normalizeAdminPath(process.env.ADMIN_PATH || '/admin');
}

function adminUrl(suffix = '') {
  const base = getAdminBasePath();
  const s = String(suffix || '');
  if (!s || s === '/') return base;
  if (s.startsWith('?') || s.startsWith('#')) return `${base}${s}`;
  return `${base}${s.startsWith('/') ? s : `/${s}`}`;
}

/** Genera un path sugerido para documentar en .env */
function suggestAdminPath() {
  const token = crypto.randomBytes(8).toString('hex');
  return `/ops-${token}`;
}

function getPublicStatus() {
  const mode = getMode();
  return {
    mode,
    isDemo: mode === 'demo',
    isProduction: mode === 'production',
    label: mode === 'production' ? 'Producción' : 'Modo demo',
    payments: mode === 'production' ? 'real' : 'demo',
    demosVisible: mode === 'demo',
    adminBasePath: getAdminBasePath(),
    envMode: envMode(),
    overrideActive: Boolean(runtimeOverride),
    canToggle: canToggleModeFromAdmin(),
    requireRealPayments: mode === 'production',
    allowDemoPayments: mode === 'demo'
  };
}

function assertSecureBoot() {
  const errors = [];
  if (isProductionMode()) {
    const secret = process.env.SESSION_SECRET || '';
    if (!secret || secret === 'zilo-dev-secret-change-me' || secret.length < 24) {
      errors.push('SESSION_SECRET debe ser una clave aleatoria de al menos 24 caracteres en producción.');
    }
    const adminPass = process.env.ADMIN_PASSWORD || '';
    if (!adminPass || adminPass === 'admin123') {
      errors.push('ADMIN_PASSWORD debe estar definida y no ser admin123 en producción.');
    }
    if (!process.env.APP_URL) {
      errors.push('APP_URL es obligatoria en producción (webhooks y pagos).');
    }
    if (getAdminBasePath() === '/admin') {
      errors.push('ADMIN_PATH no debe ser /admin en producción. Usa: node scripts/print-admin-url.js --suggest');
    }
  }
  return errors;
}

module.exports = {
  getMode,
  isDemoMode,
  isProductionMode,
  setRuntimeOverride,
  clearRuntimeOverride,
  canToggleModeFromAdmin,
  getAdminBasePath,
  adminUrl,
  suggestAdminPath,
  getPublicStatus,
  assertSecureBoot,
  envMode
};
