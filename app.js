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
    title: 'Zilo — Servicios premium a domicilio',
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

app.get('/health', async (req, res) => {
  let dbOk = false;
  try {
    dbOk = await require('./lib/db').ping();
  } catch (_) {
    dbOk = false;
  }
  const status = dbOk ? 200 : 503;
  res.status(status).json({
    ok: dbOk,
    app: 'zilo',
    database: dbOk ? 'connected' : 'disconnected',
    uptime: process.uptime()
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

async function start() {
  await store.init();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor listo en ${PORT}`);
    backup.startBackupScheduler(store, (event, detail) => {
      store.logSecurityEvent(event, detail, null);
    });
    const cfg = backup.loadConfig();
    if (cfg.enabled && cfg.autoBackup) {
      console.log(`💾 Backups automáticos: ${String(cfg.scheduleHour).padStart(2, '0')}:${String(cfg.scheduleMinute).padStart(2, '0')} · retención ${cfg.dailyRetentionDays}d / ${cfg.weeklyRetentionWeeks}sem / ${cfg.monthlyRetentionMonths}mes`);
    }
  });
  return { app, server, io };
}

start().catch((err) => {
  console.error('❌ No se pudo iniciar Zilo:', err.message);
  if (err.stack) console.error(err.stack);
  if (!process.env.DATABASE_URL && !process.env.DB_HOST) {
    console.error('→ Falta DATABASE_URL o DB_HOST/DB_USER/DB_PASSWORD/DB_NAME en Hostinger → Environment Variables');
  }
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
    console.error('→ No se pudo conectar a MySQL. En Hostinger el host suele ser: localhost');
  }
  if (err.code === 'ER_ACCESS_DENIED_ERROR') {
    console.error('→ Usuario o contraseña MySQL incorrectos');
  }
  process.exit(1);
});

module.exports = { app, server, io, start };
