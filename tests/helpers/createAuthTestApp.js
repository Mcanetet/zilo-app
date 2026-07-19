/**
 * App Express mínima para pruebas de integración de auth / verificación.
 * No arranca el servidor HTTP real ni conecta MySQL.
 */
const path = require('path');
const express = require('express');
const session = require('express-session');
const { i18nMiddleware } = require('../../middleware/i18n');
const company = require('../../config/company');

function createAuthTestApp() {
  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '../../views'));

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: 'fundez-test-secret',
      resave: false,
      saveUninitialized: true,
      name: 'fundez.test.sid',
      cookie: { secure: false, httpOnly: true }
    })
  );
  app.use(i18nMiddleware);

  app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.company = company;
    res.locals.assetVersion = 'test';
    res.locals.asset = (url) => url;
    res.locals.mod = () => true;
    res.locals.siteUrl = 'https://www.fundez.cl';
    next();
  });

  // Helper solo para tests: establece sesión sin pasar por login/DB
  app.post('/__test__/session', (req, res) => {
    const { id, email, name, role } = req.body || {};
    if (!id || !email) {
      return res.status(400).json({ success: false, error: 'id y email requeridos' });
    }
    req.session.user = {
      id,
      email,
      name: name || 'Test User',
      role: role || 'client',
      primaryRole: role || 'client',
      clientEnabled: false
    };
    res.json({ success: true, user: req.session.user });
  });

  app.use('/', require('../../routes/auth'));

  return app;
}

module.exports = { createAuthTestApp };
