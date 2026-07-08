function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(self), microphone=(), camera=(self)');
  res.setHeader('X-Powered-By', 'Fundez');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

function rateLimitSimple(maxPerMinute = 120) {
  const hits = new Map();
  return (req, res, next) => {
    const key = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    const window = hits.get(key) || [];
    const recent = window.filter(t => now - t < 60000);
    if (recent.length >= maxPerMinute) {
      return res.status(429).json({ error: 'Demasiadas solicitudes. Intenta en un momento.' });
    }
    recent.push(now);
    hits.set(key, recent);
    next();
  };
}

function rateLimitLogin(maxPerMinute = 10) {
  const hits = new Map();
  return (req, res, next) => {
    const key = `${req.ip || 'unknown'}:${req.path}`;
    const now = Date.now();
    const window = hits.get(key) || [];
    const recent = window.filter(t => now - t < 60000);
    if (recent.length >= maxPerMinute) {
      const message = 'Demasiados intentos. Espera un minuto e intenta de nuevo.';
      if (req.xhr || (req.get('accept') || '').includes('application/json')) {
        return res.status(429).json({ error: message });
      }
      return res.status(429).render('error', {
        title: 'Demasiados intentos',
        message,
        code: 429
      });
    }
    recent.push(now);
    hits.set(key, recent);
    next();
  };
}

function getClientIp(req) {
  const forwarded = req.get('x-forwarded-for');
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function parseAdminIpAllowlist() {
  return String(process.env.ADMIN_IP_ALLOWLIST || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function adminIpAllowlist() {
  return (req, res, next) => {
    const allowed = parseAdminIpAllowlist();
    if (!allowed.length) return next();

    const enforce = process.env.NODE_ENV === 'production'
      || process.env.ADMIN_IP_ALLOWLIST_ENFORCE === 'true';
    if (!enforce) return next();

    const ip = getClientIp(req);
    if (allowed.includes(ip)) return next();

    try {
      const store = require('../models/store');
      store.logSecurityEvent('admin_ip_blocked', ip, req);
    } catch (_) { /* store no listo */ }

    return res.status(403).render('error', {
      title: 'Acceso restringido',
      message: 'Tu dirección IP no está autorizada para el panel de administración.',
      code: 403
    });
  };
}

module.exports = {
  securityHeaders,
  rateLimitSimple,
  rateLimitLogin,
  getClientIp,
  parseAdminIpAllowlist,
  adminIpAllowlist
};
