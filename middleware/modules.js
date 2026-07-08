const store = require('../models/store');

function requireModule(moduleId) {
  return (req, res, next) => {
    if (!store.isModuleEnabled(moduleId)) {
      const wantsJson = req.xhr || (req.get('accept') || '').includes('application/json');
      if (wantsJson) {
        return res.status(403).json({ success: false, error: 'Esta función no está habilitada en este momento.', moduleId });
      }
      return res.status(403).render('error', {
        title: 'No disponible',
        message: 'Esta función no está habilitada en este momento. Contacta a soporte si necesitas ayuda.',
        code: 403
      });
    }
    next();
  };
}

module.exports = { requireModule };
