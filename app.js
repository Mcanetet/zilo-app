require('dotenv').config();

const express = require('express');
const session = require('express-session');
const { Server } = require('socket.io');
const http = require('http');
const path = require('path');

const store = require('./models/store');
const company = require('./config/company');
const { getAppVersionInfo, getAssetVersion } = require('./lib/version');
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
const aland = require('./lib/aland');
const unassignedRequestWatcher = require('./lib/unassignedRequestWatcher');
const { localizeServices } = require('./lib/i18n-admin');
const { buildPageMeta, getSiteUrl } = require('./lib/seo');
const seoRoutes = require('./routes/seo');
const appMode = require('./lib/appMode');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const ADMIN_BASE = appMode.getAdminBasePath();

const bootErrors = appMode.assertSecureBoot();
if (bootErrors.length && appMode.isProductionMode() && process.env.ALLOW_INSECURE_BOOT !== 'true') {
  console.error('✗ Arranque inseguro en producción:');
  bootErrors.forEach((e) => console.error('  -', e));
  process.exit(1);
} else if (bootErrors.length) {
  console.warn('⚠ Avisos de seguridad:');
  bootErrors.forEach((e) => console.warn('  -', e));
}

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('io', io);

app.get('/health', async (req, res) => {
  const dbConfigured = require('./lib/db').isConfigured();
  let dbOk = false;
  if (dbConfigured && store.isReady()) {
    try {
      dbOk = await require('./lib/db').ping();
    } catch (_) {
      dbOk = false;
    }
  }
  const version = getAppVersionInfo();
  const mode = appMode.getPublicStatus();
  const payload = {
    ok: store.isReady() && dbOk,
    app: 'fundez',
    version: version.version,
    mode: mode.mode,
    ready: store.isReady(),
    database: dbOk ? 'connected' : (dbConfigured ? 'connecting' : 'not_configured'),
    uptime: process.uptime()
  };
  if (process.env.HEALTH_VERBOSE === 'true') {
    payload.gitCommit = version.gitCommit;
    payload.appUrl = require('./lib/seo').getSiteUrl();
    payload.initError = global.__ziloInitError || null;
  }
  res.json(payload);
});

app.use(securityHeaders);
app.use(rateLimitSimple(150));
// Evita //ruta (p. ej. fundez.cl//ops-.../login) que no matchea el panel admin
app.use((req, res, next) => {
  if (!req.url || !req.url.includes('//')) return next();
  const qIdx = req.url.indexOf('?');
  const pathPart = qIdx >= 0 ? req.url.slice(0, qIdx) : req.url;
  const query = qIdx >= 0 ? req.url.slice(qIdx) : '';
  const cleaned = pathPart.replace(/\/{2,}/g, '/');
  if (cleaned === pathPart) return next();
  return res.redirect(301, cleaned + query);
});
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, filePath) {
    if (/\.(js|css)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    }
  }
}));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(express.json({ limit: appMode.isProductionMode() ? '2mb' : '25mb' }));

const sessionSecret = process.env.SESSION_SECRET || (appMode.isProductionMode() ? null : 'zilo-dev-secret-change-me');
if (!sessionSecret) {
  console.error('✗ SESSION_SECRET es obligatorio');
  process.exit(1);
}

const sessionMiddleware = session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  name: 'fundez.sid',
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000
  }
});
app.use(sessionMiddleware);
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

app.use(i18nMiddleware);

app.use(seoRoutes);

const assetVersion = getAssetVersion();
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.currentPath = req.path;
  res.locals.currentQuery = req.url.includes('?') ? req.url.split('?')[1] : '';
  res.locals.company = company;
  res.locals.siteUrl = getSiteUrl();
  res.locals.assetVersion = assetVersion;
  res.locals.asset = (url) => {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}v=${assetVersion}`;
  };
  res.locals.mod = (id) => (store.isReady() ? store.isModuleEnabled(id) : true);
  res.locals.adminBase = ADMIN_BASE;
  res.locals.adminUrl = appMode.adminUrl;
  res.locals.appModeStatus = appMode.getPublicStatus();
  next();
});

app.get('/', (req, res) => {
  if (req.query.ref) {
    req.session.pendingReferral = String(req.query.ref).trim().toUpperCase();
  }
  if (req.session.user) {
    const dashboards = {
      client: '/cliente',
      provider: '/proveedor',
      tecnico: '/tecnico',
      admin: ADMIN_BASE
    };
    return res.redirect(dashboards[req.session.user.role] || '/login');
  }
  const seo = buildPageMeta('home', req);
  res.render('landing', {
    title: seo.title,
    seo,
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
app.use(ADMIN_BASE, adminRoutes);
if (ADMIN_BASE !== '/admin') {
  app.use('/admin', (req, res) => {
    res.status(404).render('error', {
      title: 'No encontrado',
      message: 'Ruta no disponible.',
      code: 404
    });
  });
}
app.use('/pagos', paymentRoutes);
app.use('/legal', legalRoutes);
app.use('/seguimiento', trackingRoutes);
app.use('/documentos', documentosRoutes);
app.use('/lang', langRoutes);
app.use('/aland', alandRoutes);

app.use((req, res, next) => {
  if (store.isReady() || req.path === '/health') return next();
  // Login/MFA admin pueden renderizarse aunque la DB aún arranque
  if (req.path === ADMIN_BASE || req.path.startsWith(`${ADMIN_BASE}/`)) return next();
  return res.status(503).render('error', {
    title: req.t('error.connecting.title'),
    message: req.t('error.connecting.message'),
    code: 503
  });
});

io.on('connection', (socket) => {
  socket.on('register_provider', (providerId) => {
    const sessionUser = socket.request?.session?.user;
    if (!sessionUser || (sessionUser.role !== 'provider' && sessionUser.role !== 'admin')) return;
    if (sessionUser.role === 'provider' && sessionUser.id !== providerId) return;
    store.providerSockets.set(providerId, socket.id);
    socket.providerId = providerId;
    dispatchPendingToProvider(io, providerId);
  });

  socket.on('register_client', (requestId) => {
    const sessionUser = socket.request?.session?.user;
    if (!sessionUser) return;
    const request = store.isReady() ? store.requests.find((r) => r.id === requestId) : null;
    if (request && sessionUser.role === 'client' && request.clientId !== sessionUser.id) return;
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
    const sessionUser = socket.request?.session?.user;
    if (!sessionUser || (sessionUser.role !== 'tecnico' && sessionUser.role !== 'admin')) return;
    if (sessionUser.role === 'tecnico' && sessionUser.id !== tecnicoId) return;
    store.technicianSockets.set(tecnicoId, socket.id);
    socket.tecnicoId = tecnicoId;
    dispatchPendingToTechnician(io, tecnicoId);
  });

  socket.on('aland_join', ({ conversationId, clientId, providerId, admin }) => {
    const sessionUser = socket.request?.session?.user;
    if (!sessionUser) return;
    if (conversationId) socket.join(`aland_conv_${conversationId}`);
    if (clientId && (sessionUser.id === clientId || sessionUser.role === 'admin')) {
      socket.join(`aland_client_${clientId}`);
    }
    if (providerId && (sessionUser.id === providerId || sessionUser.role === 'admin')) {
      socket.join(`aland_provider_${providerId}`);
    }
    if (admin && sessionUser.role === 'admin') socket.join('aland_admin');
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
      const florencia = require('./lib/florencia');
      await florencia.ensureSchema();
      const openaiUsage = require('./lib/openaiUsage');
      await openaiUsage.ensureSchema();
      florencia.startScheduler(store, io);
      await aland.ensureConfig();
      await aland.syncKnowledgeFromApp(store);
      await backup.ensureStartupBackup(store);
      require('./lib/aland/journey').bind({ store, io });
      aland.startEscalationWatcher(store, io);
      unassignedRequestWatcher.start(store, io, {
        timeoutMinutes: parseInt(process.env.UNASSIGNED_REQUEST_TIMEOUT_MINUTES || '10', 10) || 10
      });
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
    const mode = appMode.getPublicStatus();
    console.log(`Servidor escuchando en puerto ${PORT}`);
    console.log(`Modo: ${mode.label} (${mode.mode})`);
    console.log(`Admin login: ${ADMIN_BASE}/login`);
    if (ADMIN_BASE === '/admin') {
      console.warn('⚠ ADMIN_PATH=/admin es fácil de adivinar. Usa un path secreto en producción.');
    }
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
