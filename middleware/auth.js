const store = require('../models/store');

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

function requireVerifiedEmail(req, res, next) {
  if (!req.session?.user) return res.redirect('/login');
  const user = store.getUserById(req.session.user.id);
  if (!user || store.isEmailVerified(user)) return next();
  if (user.role === 'admin') return next();
  return res.redirect('/verificar-email');
}

module.exports = { requireAuth, requireRole, requireVerifiedEmail };
