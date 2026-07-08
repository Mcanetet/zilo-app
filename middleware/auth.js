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
    next();
  };
}

module.exports = { requireAuth, requireRole };
