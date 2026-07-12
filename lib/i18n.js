const fs = require('fs');
const path = require('path');

const SUPPORTED = ['es', 'en'];
const DEFAULT_LOCALE = 'es';
const LOCALE_DIR = path.join(__dirname, '../locales');

const bundles = {};
for (const code of SUPPORTED) {
  const base = JSON.parse(fs.readFileSync(path.join(LOCALE_DIR, `${code}.json`), 'utf8'));
  const panelsPath = path.join(LOCALE_DIR, `panels-${code}.json`);
  let panels = {};
  if (fs.existsSync(panelsPath)) {
    panels = JSON.parse(fs.readFileSync(panelsPath, 'utf8'));
  }
  const portalPath = path.join(LOCALE_DIR, `portal-${code}.json`);
  let portal = {};
  if (fs.existsSync(portalPath)) {
    portal = JSON.parse(fs.readFileSync(portalPath, 'utf8'));
  }
  bundles[code] = { ...base, ...panels, ...portal };
}

const JS_BUNDLE_PREFIXES = [
  'js.', 'client.js.', 'client.historial.', 'provider.js.', 'tecnico.js.', 'status.', 'coverage.', 'error.'
];

const LOCALES = {
  es: { code: 'es', label: 'Español', flag: 'ES' },
  en: { code: 'en', label: 'English', flag: 'EN' }
};

function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie || '';
  header.split(';').forEach((part) => {
    const trimmed = part.trim();
    if (!trimmed) return;
    const eq = trimmed.indexOf('=');
    if (eq === -1) return;
    const key = trimmed.slice(0, eq);
    const val = trimmed.slice(eq + 1);
    try {
      out[key] = decodeURIComponent(val);
    } catch {
      out[key] = val;
    }
  });
  return out;
}

function normalizeLocale(raw) {
  const code = String(raw || '').trim().toLowerCase().slice(0, 2);
  return SUPPORTED.includes(code) ? code : DEFAULT_LOCALE;
}

function resolveLocale(req) {
  if (req.query?.lang) return normalizeLocale(req.query.lang);
  if (req.session?.locale) return normalizeLocale(req.session.locale);
  const cookies = parseCookies(req);
  if (cookies.fundez_lang) return normalizeLocale(cookies.fundez_lang);
  const accept = req.headers['accept-language'] || '';
  if (accept.toLowerCase().startsWith('en')) return 'en';
  return DEFAULT_LOCALE;
}

function lookup(obj, key) {
  if (!obj || !key) return undefined;
  if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
  const parts = key.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[p];
  }
  return typeof cur === 'string' ? cur : undefined;
}

function interpolate(str, vars) {
  if (!vars || typeof str !== 'string') return str;
  return str.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''));
}

function createTranslator(locale) {
  const active = normalizeLocale(locale);
  const fallback = bundles[DEFAULT_LOCALE];
  const primary = bundles[active] || fallback;

  return function t(key, vars) {
    const raw = lookup(primary, key) ?? lookup(fallback, key) ?? key;
    return interpolate(raw, vars);
  };
}

function setLocaleCookie(res, locale, req) {
  const secure = process.env.NODE_ENV === 'production';
  const maxAge = 60 * 60 * 24 * 365;
  let cookie = `fundez_lang=${encodeURIComponent(locale)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
  if (secure) cookie += '; Secure';
  res.append('Set-Cookie', cookie);
}

function getClientBundle(locale) {
  const code = normalizeLocale(locale);
  const bundle = bundles[code] || bundles[DEFAULT_LOCALE];
  const out = {};
  for (const key of Object.keys(bundle)) {
    if (JS_BUNDLE_PREFIXES.some((p) => key.startsWith(p))) {
      out[key] = bundle[key];
    }
  }
  const t = createTranslator(locale);
  ['provider.online', 'provider.offline', 'provider.status_online_sub', 'provider.status_offline_sub',
    'tecnico.online', 'tecnico.offline', 'tecnico.online_sub', 'tecnico.offline_sub'].forEach((k) => {
    out[k] = t(k);
  });
  return out;
}

function formatDate(date, locale, options) {
  const d = date instanceof Date ? date : new Date(date);
  const loc = locale === 'en' ? 'en-US' : 'es-CL';
  return d.toLocaleDateString(loc, options);
}

module.exports = {
  SUPPORTED,
  DEFAULT_LOCALE,
  LOCALES,
  resolveLocale,
  createTranslator,
  setLocaleCookie,
  getClientBundle,
  formatDate,
  t: (locale, key, vars) => createTranslator(locale)(key, vars)
};
