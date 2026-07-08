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

module.exports = { securityHeaders, rateLimitSimple };
