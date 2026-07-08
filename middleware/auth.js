function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) {
      if (roles.includes('admin')) {
        return res.redirect('/admin/login');
      }
      return res.redirect('/login');
    }
    if (!roles.includes(req.session.user.role)) {
      return res.status(403).render('error', {
        title: 'Acceso denegado',
        message: 'No tienes permisos para acceder a esta sección.',
        code: 403
      });
    }
    if (roles.includes('admin') && req.session.user.role === 'admin') {
      try {
        const store = require('../models/store');
        if (store.isMfaEnabled(req.session.user.id) && !req.session.adminMfaVerified) {
          req.session.pendingAdminMfa = {
            userId: req.session.user.id,
            email: req.session.user.email,
            expiresAt: Date.now() + 5 * 60 * 1000
          };
          delete req.session.user;
          return res.redirect('/admin/mfa');
        }
      } catch (_) { /* store no listo */ }
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
