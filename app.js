require('dotenv').config();

const express = require('express');
const session = require('express-session');
const { Server } = require('socket.io');
const http = require('http');
const path = require('path');

const store = require('./models/store');
const company = require('./config/company');
const { dispatchPendingToProvider } = require('./lib/dispatch');
const { securityHeaders, rateLimitSimple } = require('./middleware/security');
const backup = require('./lib/backup');

const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/client');
const providerRoutes = require('./routes/provider');
const adminRoutes = require('./routes/admin');
const paymentRoutes = require('./routes/payments');
const legalRoutes = require('./routes/legal');
const trackingRoutes = require('./routes/tracking');

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
  res.status(200).json({
    ok: store.isReady() && dbOk,
    app: 'fundez',
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

app.get('/db-test', async (req, res) => {
  const mysql = require('mysql2/promise');
  const base = {
    user: process.env.DB_USER || process.env.MYSQL_USER,
    password: process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || '',
    database: process.env.DB_NAME || process.env.MYSQL_DATABASE,
    port: Number(process.env.DB_PORT || process.env.MYSQL_PORT || 3306),
    connectTimeout: 8000
  };

  const hosts = [process.env.DB_HOST, '127.0.0.1', 'localhost']
    .filter((h, i, arr) => h && arr.indexOf(h) === i);

  const results = [];
  for (const host of hosts) {
    const started = Date.now();
    try {
      const conn = await mysql.createConnection({ ...base, host });
      await conn.query('SELECT 1');
      let usuarios;
      try {
        const [rows] = await conn.query('SELECT COUNT(*) AS c FROM users');
        usuarios = rows[0].c;
      } catch (e) {
        usuarios = `tabla users no encontrada (${e.code})`;
      }
      await conn.end();
      results.push({ host, ok: true, ms: Date.now() - started, usuarios });
    } catch (err) {
      results.push({ host, ok: false, ms: Date.now() - started, code: err.code || null, error: err.message });
    }
  }

  const funciona = results.find((r) => r.ok);
  res.status(200).json({
    resumen: funciona
      ? `✅ Conecta con host "${funciona.host}" (${funciona.usuarios} usuarios). Pon ese valor en DB_HOST y redeploya.`
      : '❌ Ningún host conectó. Revisa usuario, contraseña y nombre de base de datos.',
    dbUser: base.user || null,
    dbName: base.database || null,
    dbPort: base.port,
    dbHostEnv: process.env.DB_HOST || null,
    passwordSet: Boolean(base.password),
    results
  });
});

app.use(securityHeaders);
app.use(rateLimitSimple(150));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(express.json({ limit: '8mb' }));

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

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.currentPath = req.path;
  res.locals.company = company;
  next();
});

app.get('/', (req, res) => {
  if (req.query.ref) {
    req.session.pendingReferral = String(req.query.ref).trim().toUpperCase();
  }
  if (req.session.user) {
    const dashboards = { client: '/cliente', provider: '/proveedor', admin: '/admin' };
    return res.redirect(dashboards[req.session.user.role] || '/login');
  }
  res.render('landing', {
    title: 'Fundez — Servicios premium a domicilio',
    services: store.getActiveServices(),
    referralBanner: req.session.pendingReferral || null
  });
});

app.use('/', authRoutes);
app.use('/cliente', clientRoutes);
app.use('/proveedor', providerRoutes);
app.use('/admin', adminRoutes);
app.use('/pagos', paymentRoutes);
app.use('/legal', legalRoutes);
app.use('/seguimiento', trackingRoutes);

app.use((req, res, next) => {
  if (store.isReady() || req.path === '/health') return next();
  return res.status(503).render('error', {
    title: 'Conectando…',
    message: 'Fundez está conectando con la base de datos. Espera unos segundos y recarga la página.',
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

  socket.on('disconnect', () => {
    if (socket.providerId) {
      store.providerSockets.delete(socket.providerId);
    }
  });
});

app.use((req, res) => {
  res.status(404).render('error', {
    title: 'No encontrado',
    message: 'La página que buscas no existe.',
    code: 404
  });
});

async function initDatabase() {
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      await store.init();
      global.__ziloInitError = null;
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
