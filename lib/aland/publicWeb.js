/**
 * Lectura segura de páginas públicas del sitio Fundez (sin admin ni áreas privadas).
 */
const company = require('../../config/company');

const BLOCKED_PATH_PREFIXES = [
  '/admin',
  '/ops-',
  '/cliente',
  '/proveedor',
  '/tecnico',
  '/aland',
  '/pagos',
  '/seguimiento',
  '/documentos',
  '/health',
  '/verificar-email',
  '/api',
  '/logout',
  '/login'
];

function getAllowedHosts() {
  const hosts = new Set(['fundez.cl', 'www.fundez.cl', 'localhost', '127.0.0.1']);
  try {
    const u = new URL(company.appUrl || process.env.APP_URL || 'https://www.fundez.cl');
    hosts.add(u.hostname.toLowerCase());
    if (u.hostname.startsWith('www.')) hosts.add(u.hostname.slice(4));
    else hosts.add(`www.${u.hostname}`);
  } catch (_) { /* ignore */ }
  return hosts;
}

function isBlockedPath(pathname) {
  const p = String(pathname || '/').toLowerCase();
  try {
    const adminPath = require('../appMode').getAdminBasePath();
    if (adminPath && adminPath !== '/' && (p === adminPath || p.startsWith(`${adminPath}/`))) {
      return true;
    }
  } catch (_) { /* ignore */ }
  return BLOCKED_PATH_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`) || p.startsWith(prefix));
}

function normalizePublicUrl(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  let href = text;
  if (!/^https?:\/\//i.test(href)) {
    if (href.startsWith('/')) href = `${(company.appUrl || 'https://www.fundez.cl').replace(/\/+$/, '')}${href}`;
    else if (/^(www\.)?fundez\.cl/i.test(href)) href = `https://${href.replace(/^https?:\/\//i, '')}`;
    else return null;
  }
  let u;
  try {
    u = new URL(href);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(u.protocol)) return null;
  const host = u.hostname.toLowerCase();
  if (!getAllowedHosts().has(host)) return null;
  if (isBlockedPath(u.pathname)) return null;
  u.hash = '';
  return u.toString();
}

function extractUrls(text) {
  const re = /https?:\/\/[^\s<>"')\]]+|www\.fundez\.cl[^\s<>"')\]]*|fundez\.cl\/[^\s<>"')\]]*/gi;
  const found = String(text || '').match(re) || [];
  return [...new Set(found.map(normalizePublicUrl).filter(Boolean))];
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchPublicPage(url, { maxChars = 4000 } = {}) {
  const safe = normalizePublicUrl(url);
  if (!safe) return { ok: false, error: 'URL no permitida (solo páginas públicas de Fundez).' };

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(safe, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'FundezAlandBot/1.0 (+https://www.fundez.cl)',
        Accept: 'text/html,text/plain;q=0.9'
      },
      redirect: 'follow'
    });
    clearTimeout(timer);

    const finalUrl = normalizePublicUrl(res.url);
    if (!finalUrl) return { ok: false, error: 'Redirección a ruta no pública bloqueada.' };
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };

    const ctype = String(res.headers.get('content-type') || '');
    if (!/text\/html|text\/plain/i.test(ctype)) {
      return { ok: false, error: 'Tipo de contenido no soportado' };
    }

    const raw = await res.text();
    const text = htmlToText(raw).slice(0, maxChars);
    return { ok: true, url: finalUrl, text };
  } catch (err) {
    return { ok: false, error: err.message || 'Error al leer la página' };
  }
}

async function gatherPublicWebContext(texts = []) {
  const urls = [...new Set(texts.flatMap(extractUrls))].slice(0, 3);
  if (!urls.length) return '';

  const chunks = [];
  for (const url of urls) {
    const page = await fetchPublicPage(url);
    if (page.ok && page.text) {
      chunks.push(`### Página pública ${page.url}\n${page.text}`);
    }
  }
  return chunks.join('\n\n');
}

module.exports = {
  normalizePublicUrl,
  extractUrls,
  fetchPublicPage,
  gatherPublicWebContext,
  isBlockedPath
};
