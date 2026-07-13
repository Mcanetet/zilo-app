require('dotenv').config();

const express = require('express');
const session = require('express-session');
const { Server } = require('socket.io');
const http = require('http');
const path = require('path');

const store = require('./models/store');
const company = require('./config/company');
const { getAppVersionInfo } = require('./lib/version');
const { dispatchPendingToProvider, dispatchPendingToTechnician } = require('./lib/dispatch');
const { securityHeaders, rateLimitSimple } = require('./middleware/security');
const backup = require('./lib/backup');
const { i18nMiddleware } = require('./middleware/i18n');

const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/client');
const providerRoutes = require('./routes/provider');
const tecnicoRoutes = require('./routes/tecnico');
const adminRoutes = require('./routes/admin');
const paymentRoutes = require('./routes/payments');
const legalRoutes = require('./routes/legal');
const trackingRoutes = require('./routes/tracking');
const documentosRoutes = require('./routes/documentos');
const langRoutes = require('./routes/lang');
const alandRoutes = require('./routes/aland');
const { localizeServices } = require('./lib/i18n-admin');
const { buildPageMeta } = require('./lib/seo');
const seoRoutes = require('./routes/seo');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('io', io);

app.get('/health', async (req, res) => {
  const dbConfigured = require('./lib/db').isConfigured();
  const requiredVars = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
  const missingVars = requiredVars.filter((k) => !process.env[k]);
  let dbOk = false;
  if (dbConfigured && store.isReady()) {
    try {
      dbOk = await require('./lib/db').ping();
    } catch (_) {
      dbOk = false;
    }
  }
  const version = getAppVersionInfo();
  res.status(200).json({
    ok: store.isReady() && dbOk,
    app: 'fundez',
    version: version.version,
    gitCommit: version.gitCommit,
    ready: store.isReady(),
    database: dbOk ? 'connected' : (dbConfigured ? 'connecting' : 'not_configured'),
    dbHost: process.env.DB_HOST || null,
    dbName: process.env.DB_NAME || null,
    missingVars,
    port: PORT,
    uptime: process.uptime(),
    initError: global.__ziloInitError || null
  });
});

app.use(securityHeaders);
app.use(rateLimitSimple(150));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(express.json({ limit: '25mb' }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'zilo-dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  name: 'zilo.sid',
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

app.use(i18nMiddleware);

app.use(seoRoutes);

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.currentPath = req.path;
  res.locals.currentQuery = req.url.includes('?') ? req.url.split('?')[1] : '';
  res.locals.company = company;
  res.locals.mod = (id) => (store.isReady() ? store.isModuleEnabled(id) : true);
  next();
});

app.get('/', (req, res) => {
  if (req.query.ref) {
    req.session.pendingReferral = String(req.query.ref).trim().toUpperCase();
  }
  if (req.session.user) {
    const dashboards = { client: '/cliente', provider: '/proveedor', tecnico: '/tecnico', admin: '/admin' };
    return res.redirect(dashboards[req.session.user.role] || '/login');
  }
  res.render('landing', {
    title: req.t('app.name') + ' — ' + (req.locale === 'en' ? 'Premium home services' : 'Servicios premium a domicilio'),
    seo: buildPageMeta('home', req),
    services: localizeServices(store.getLandingServices(), req.t),
    referralBanner: req.session.pendingReferral || null
  });
});

app.get('/quienes-somos', (req, res) => {
  res.render('quienes-somos', {
    title: req.t('about.page_title') + ' — Fundez',
    seo: buildPageMeta('about', req)
  });
});

app.use('/', authRoutes);
app.use('/cliente', clientRoutes);
app.use('/proveedor', providerRoutes);
app.use('/tecnico', tecnicoRoutes);
app.use('/admin', adminRoutes);
app.use('/pagos', paymentRoutes);
app.use('/legal', legalRoutes);
app.use('/seguimiento', trackingRoutes);
app.use('/documentos', documentosRoutes);
app.use('/lang', langRoutes);
app.use('/aland', alandRoutes);

app.use((req, res, next) => {
  if (store.isReady() || req.path === '/health') return next();
  return res.status(503).render('error', {
    title: req.t('error.connecting.title'),
    message: req.t('error.connecting.message'),
    code: 503
  });
});

io.on('connection', (socket) => {
  socket.on('register_provider', (providerId) => {
    store.providerSockets.set(providerId, socket.id);
    socket.providerId = providerId;
    dispatchPendingToProvider(io, providerId);
  });

  socket.on('register_client', (requestId) => {
    socket.join(`request_${requestId}`);
    socket.requestId = requestId;
  });

  socket.on('provider_location_broadcast', ({ requestId, lat, lng }) => {
    if (!socket.providerId || !requestId) return;
    store.updateProviderLocation(socket.providerId, lat, lng);
    io.to(`request_${requestId}`).emit(`provider_location_${requestId}`, {
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      updatedAt: new Date().toISOString()
    });
  });

  socket.on('register_technico', (tecnicoId) => {
    store.technicianSockets.set(tecnicoId, socket.id);
    socket.tecnicoId = tecnicoId;
    dispatchPendingToTechnician(io, tecnicoId);
  });

  socket.on('aland_join', ({ conversationId, clientId, providerId, admin }) => {
    if (conversationId) socket.join(`aland_conv_${conversationId}`);
    if (clientId) socket.join(`aland_client_${clientId}`);
    if (providerId) socket.join(`aland_provider_${providerId}`);
    if (admin) socket.join('aland_admin');
  });

  socket.on('disconnect', () => {
    if (socket.providerId) {
      store.providerSockets.delete(socket.providerId);
    }
    if (socket.tecnicoId) {
      store.technicianSockets.delete(socket.tecnicoId);
    }
  });
});

app.use((err, req, res, next) => {
  console.error('[ERROR]', req.method, req.path, err.message);
  if (err.stack) console.error(err.stack);
  if (res.headersSent) return next(err);
  res.status(500).render('error', {
    title: req.t('error.internal.title'),
    message: req.t('error.internal.message'),
    code: 500
  });
});

app.use((req, res) => {
  res.status(404).render('error', {
    title: req.t('error.not_found.title'),
    message: req.t('error.not_found.message'),
    code: 404
  });
});

async function initDatabase() {
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      await store.init();
      global.__ziloInitError = null;
      await aland.ensureConfig();
      await aland.syncKnowledgeFromApp(store);
      await backup.ensureStartupBackup(store);
      aland.startEscalationWatcher(store, io);
      backup.startBackupScheduler(store, (event, detail) => {
        store.logSecurityEvent(event, detail, null);
      });
      const cfg = backup.loadConfig();
      if (cfg.enabled && cfg.autoBackup) {
        console.log(`💾 Backups automáticos: ${String(cfg.scheduleHour).padStart(2, '0')}:${String(cfg.scheduleMinute).padStart(2, '0')}`);
      }
      console.log('✓ Base de datos conectada');
      return;
    } catch (err) {
      global.__ziloInitError = err.message;
      console.error(`Intento ${attempt}/8 — MySQL:`, err.message, err.code || '');
      if (attempt < 8) {
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }
}

async function start() {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor escuchando en puerto ${PORT}`);
    console.log('DB_HOST:', process.env.DB_HOST || '(no definido)');
    console.log('DB_NAME:', process.env.DB_NAME || '(no definido)');
    console.log('DB_USER:', process.env.DB_USER || '(no definido)');
  });
  initDatabase();
  return { app, server, io };
}

start().catch((err) => {
  console.error('❌ Error fatal al arrancar:', err.message);
  if (err.stack) console.error(err.stack);
});

module.exports = { app, server, io, start };
