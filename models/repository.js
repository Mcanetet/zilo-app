const fs = require('fs');
const path = require('path');
const db = require('../lib/db');

const SCHEMA_PATH = path.join(__dirname, '../db/schema.sql');

const SEED_SERVICES = [
  { id: 'electrico', name: 'Eléctrico', icon: 'electrico', color: '#F59E0B', visitPrice: 25000, basicMin: 40000, basicMax: 60000, description: 'Instalaciones, cortocircuitos, tableros y emergencias eléctricas.', enabled: true },
  { id: 'gasfiter', name: 'Gásfiter', icon: 'gasfiter', color: '#3B82F6', visitPrice: 25000, basicMin: 45000, basicMax: 70000, description: 'Fugas, cañerías, grifería y destapes en baño y cocina.', enabled: true },
  { id: 'cerrajero', name: 'Cerrajero', icon: 'cerrajero', color: '#8B5CF6', visitPrice: 30000, basicMin: 50000, basicMax: 90000, description: 'Apertura de puertas, cambio de cerraduras y copias de llaves.', enabled: true },
  { id: 'termos', name: 'Reparación de Termos', icon: 'termos', color: '#EF4444', visitPrice: 28000, basicMin: 55000, basicMax: 120000, description: 'Mantención, cambio de resistencia y reparación de termos eléctricos.', enabled: true },
  { id: 'lavavajillas', name: 'Lavavajillas', icon: 'lavavajillas', color: '#06B6D4', visitPrice: 25000, basicMin: 45000, basicMax: 85000, description: 'Reparación de bombas, fugas y programas de lavado.', enabled: true },
  { id: 'lavadora', name: 'Lavadora', icon: 'lavadora', color: '#10B981', visitPrice: 25000, basicMin: 40000, basicMax: 80000, description: 'Centrifugado, drenaje, tambor y tarjetas electrónicas.', enabled: true }
];

function defaultProviderVerification() {
  return {
    status: 'incomplete',
    idCardFront: null,
    idCardBack: null,
    certificates: [],
    selfie: null,
    faceVerified: false,
    faceScore: null,
    faceVerifiedAt: null,
    submittedAt: null
  };
}

function defaultLocationShare() {
  return {
    consent: false,
    consentAt: null,
    lat: null,
    lng: null,
    updatedAt: null
  };
}

function pedroVerification() {
  return {
    status: 'verified',
    idCardFront: 'demo',
    idCardBack: 'demo',
    certificates: [],
    selfie: null,
    faceVerified: true,
    faceScore: 94,
    faceVerifiedAt: '2025-10-01T12:00:00.000Z',
    submittedAt: '2025-10-01T12:00:00.000Z'
  };
}

function pedroLocationShare() {
  return {
    consent: true,
    consentAt: '2025-10-01T12:00:00.000Z',
    lat: -33.442,
    lng: -70.654,
    updatedAt: new Date().toISOString()
  };
}

const SEED_USERS = [
  {
    id: 'client-1',
    email: 'cliente@zilo.cl',
    password: 'cliente123',
    name: 'María González',
    role: 'client',
    phone: '+56 9 8765 4321',
    address: 'Av. Providencia 2650, Providencia, Santiago',
    referralCode: 'MARIA2026',
    ziloPoints: 350,
    creditsCLP: 5000,
    referralsCount: 2,
    servicesCount: 4,
    usedWelcomePromo: false,
    memberSince: '2025-11-01'
  },
  {
    id: 'provider-pedro',
    email: 'pedro@zilo.cl',
    password: 'proveedor123',
    name: 'Pedro Gómez',
    role: 'provider',
    phone: '+56 9 2234 5678',
    specialties: ['gasfiter'],
    rating: 4.8,
    reviewsCount: 94,
    online: false,
    avatar: 'PG',
    bio: 'Gásfiter maestro con 10 años de experiencia en edificios y hogares de Santiago.',
    reviews: [
      { author: 'Camila T.', rating: 5, text: 'Excelente disposición, solucionó la filtración del lavaplatos muy rápido', date: '2025-05-18' },
      { author: 'Diego M.', rating: 5, text: 'Muy puntual y dejó todo limpio después del trabajo.', date: '2025-04-30' },
      { author: 'Sofía L.', rating: 4, text: 'Buen precio y trabajo bien hecho en la cañería.', date: '2025-04-12' }
    ],
    verification: pedroVerification(),
    locationShare: pedroLocationShare()
  },
  {
    id: 'provider-marta',
    email: 'marta@zilo.cl',
    password: 'proveedor123',
    name: 'Marta Quiroz',
    role: 'provider',
    phone: '+56 9 3345 6789',
    specialties: ['electrico'],
    rating: 4.9,
    reviewsCount: 112,
    online: false,
    avatar: 'MQ',
    bio: 'Electricista certificada SEC. Especialista en instalaciones residenciales y comerciales.',
    reviews: [
      { author: 'Andrés P.', rating: 5, text: 'Certificada SEC, instaló las luminarias del pasillo de forma impecable', date: '2025-05-22' },
      { author: 'Valentina R.', rating: 5, text: 'Profesional y muy clara al explicar el trabajo realizado.', date: '2025-05-05' },
      { author: 'Jorge H.', rating: 5, text: 'Solucionó un cortocircuito complejo en menos de una hora.', date: '2025-04-20' }
    ],
    verification: defaultProviderVerification(),
    locationShare: defaultLocationShare()
  },
  {
    id: 'provider-juan',
    email: 'juancarlos@zilo.cl',
    password: 'proveedor123',
    name: 'Juan Carlos',
    role: 'provider',
    phone: '+56 9 4456 7890',
    specialties: ['cerrajero'],
    rating: 4.7,
    reviewsCount: 78,
    online: false,
    avatar: 'JC',
    bio: 'Cerrajero profesional 24/7. Apertura sin daños y cambio de cerraduras de seguridad.',
    reviews: [
      { author: 'Patricia N.', rating: 5, text: 'Llegó en 20 minutos y abrió la puerta del departamento sin daños', date: '2025-05-15' },
      { author: 'Felipe A.', rating: 4, text: 'Rápido y eficiente, cambió la cerradura completa.', date: '2025-04-28' },
      { author: 'Daniela C.', rating: 5, text: 'Muy confiable, lo llamaré de nuevo sin dudarlo.', date: '2025-04-10' }
    ],
    verification: defaultProviderVerification(),
    locationShare: defaultLocationShare()
  },
  {
    id: 'provider-ana',
    email: 'ana@zilo.cl',
    password: 'proveedor123',
    name: 'Ana Rojas',
    role: 'provider',
    phone: '+56 9 5567 8901',
    specialties: ['termos', 'lavavajillas', 'lavadora'],
    rating: 4.9,
    reviewsCount: 67,
    online: false,
    avatar: 'AR',
    bio: 'Técnica certificada en electrodomésticos. Especialista en termos, lavadoras y lavavajillas.',
    reviews: [
      { author: 'Luis V.', rating: 5, text: 'Reparó el termo el mismo día, muy profesional.', date: '2025-05-20' },
      { author: 'Carmen S.', rating: 5, text: 'Excelente con la lavadora, explicó todo con claridad.', date: '2025-05-08' }
    ],
    verification: defaultProviderVerification(),
    locationShare: defaultLocationShare()
  },
  {
    id: 'admin-1',
    email: 'admin@zilo.cl',
    password: 'admin123',
    name: 'Admin Fundez',
    role: 'admin',
    phone: '+56 9 0000 0000'
  }
];

const SEED_LOGBOOK = [
  { id: 'log-001', clientId: 'client-1', address: 'Av. Providencia 2650, Providencia, Santiago', serviceName: 'Gásfiter', category: 'gasfiter', date: '2025-11-15', note: 'Revisión de cañería bajo lavaplatos — sin fugas detectadas', healthImpact: 8, providerName: 'Pedro Gómez' },
  { id: 'log-002', clientId: 'client-1', address: 'Av. Providencia 2650, Providencia, Santiago', serviceName: 'Eléctrico', category: 'electrico', date: '2026-01-20', note: 'Instalación de luminarias LED en pasillo y verificación de tablero', healthImpact: 10, providerName: 'Marta Quiroz' },
  { id: 'log-003', clientId: 'client-1', address: 'Av. Providencia 2650, Providencia, Santiago', serviceName: 'Reparación de Termos', category: 'termos', date: '2026-03-08', note: 'Cambio de resistencia y limpieza de sedimentos', healthImpact: 12, providerName: 'Ana Rojas' }
];

const SEED_COMPLAINTS = [
  { id: 'rec-001', requestId: null, clientName: 'Jorge Muñoz', clientEmail: 'jorge@email.cl', type: 'calidad', subject: 'Trabajo incompleto en instalación eléctrica', description: 'El técnico se fue sin terminar el empalme del tablero.', status: 'abierto', priority: 'alta', createdAt: '2026-06-28T14:30:00.000Z' },
  { id: 'rec-002', requestId: null, clientName: 'Carolina Díaz', clientEmail: 'carolina@email.cl', type: 'cobro', subject: 'Cobro diferente al presupuesto', description: 'Me cobraron $20.000 más de lo acordado en la visita.', status: 'en_revision', priority: 'media', createdAt: '2026-06-27T09:15:00.000Z' },
  { id: 'rec-003', requestId: null, clientName: 'Andrés Vega', clientEmail: 'andres@email.cl', type: 'demora', subject: 'Proveedor no llegó en el tiempo estimado', description: 'Esperé más de 2 horas y nadie llegó.', status: 'resuelto', priority: 'baja', createdAt: '2026-06-25T18:00:00.000Z', resolvedAt: '2026-06-26T10:00:00.000Z' }
];

const SEED_CHATS = [
  { id: 'chat-001', clientName: 'María González', clientPhone: '+56 9 8765 4321', lastMessage: '¿A qué hora llega el técnico?', channel: 'whatsapp', status: 'activo', unread: 2, updatedAt: '2026-06-30T18:00:00.000Z' },
  { id: 'chat-002', clientName: 'Roberto Soto', clientPhone: '+56 9 5555 1234', lastMessage: 'Necesito factura del servicio', channel: 'whatsapp', status: 'activo', unread: 0, updatedAt: '2026-06-30T15:30:00.000Z' },
  { id: 'chat-003', clientName: 'Valentina Ríos', clientPhone: '+56 9 7777 8899', lastMessage: 'Gracias, todo resuelto', channel: 'whatsapp', status: 'cerrado', unread: 0, updatedAt: '2026-06-29T11:00:00.000Z' }
];

const SEED_CONSENTS = [
  { id: 'c-1', userId: 'client-1', type: 'privacidad', granted: true, version: '1.0', createdAt: '2026-06-01T10:00:00.000Z' },
  { id: 'c-2', userId: 'client-1', type: 'cookies', granted: true, version: '1.0', createdAt: '2026-06-01T10:00:00.000Z' },
  { id: 'c-3', userId: null, type: 'cookies', granted: true, version: '1.0', createdAt: '2026-06-15T08:00:00.000Z', ip: '192.168.1.1' }
];

const SEED_SECURITY_LOGS = [
  { id: 'sec-1', event: 'login_ok', user: 'admin@zilo.cl', ip: '10.0.0.1', createdAt: '2026-06-30T08:00:00.000Z' },
  { id: 'sec-2', event: 'login_ok', user: 'cliente@zilo.cl', ip: '10.0.0.2', createdAt: '2026-06-30T09:30:00.000Z' },
  { id: 'sec-3', event: 'pago_demo', detail: 'Pago simulado aprobado', ip: '10.0.0.2', createdAt: '2026-06-30T10:00:00.000Z' }
];

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function rowToUser(row) {
  const user = {
    id: row.id,
    email: row.email,
    password: row.password,
    name: row.name,
    role: row.role,
    phone: row.phone,
    address: row.address,
    referralCode: row.referral_code,
    ziloPoints: row.zilo_points,
    creditsCLP: row.credits_clp,
    referralsCount: row.referrals_count,
    servicesCount: row.services_count,
    usedWelcomePromo: Boolean(row.used_welcome_promo),
    usedReferral: Boolean(row.used_referral),
    memberSince: row.member_since ? String(row.member_since).slice(0, 10) : null,
    onboardingCompleted: Boolean(row.onboarding_completed),
    onboardingCompletedAt: row.onboarding_completed_at ? new Date(row.onboarding_completed_at).toISOString() : null,
    active: row.active == null ? true : Boolean(row.active)
  };

  if (row.role === 'provider') {
    user.specialties = parseJson(row.specialties, []);
    user.rating = row.rating != null ? Number(row.rating) : null;
    user.reviewsCount = row.reviews_count;
    user.online = Boolean(row.online);
    user.avatar = row.avatar;
    user.bio = row.bio;
    user.reviews = parseJson(row.reviews, []);
    user.verification = parseJson(row.verification, defaultProviderVerification());
    user.locationShare = parseJson(row.location_share, defaultLocationShare());
  }

  return user;
}

function userToRow(user) {
  return {
    id: user.id,
    email: user.email,
    password: user.password,
    name: user.name,
    role: user.role,
    phone: user.phone || null,
    address: user.address || null,
    referral_code: user.referralCode || null,
    zilo_points: user.ziloPoints || 0,
    credits_clp: user.creditsCLP || 0,
    referrals_count: user.referralsCount || 0,
    services_count: user.servicesCount || 0,
    used_welcome_promo: Boolean(user.usedWelcomePromo),
    used_referral: Boolean(user.usedReferral),
    member_since: user.memberSince || null,
    onboarding_completed: Boolean(user.onboardingCompleted),
    onboarding_completed_at: user.onboardingCompletedAt || null,
    specialties: JSON.stringify(user.specialties || []),
    rating: user.rating ?? null,
    reviews_count: user.reviewsCount || 0,
    online: Boolean(user.online),
    avatar: user.avatar || null,
    bio: user.bio || null,
    reviews: JSON.stringify(user.reviews || []),
    verification: user.verification ? JSON.stringify(user.verification) : null,
    location_share: user.locationShare ? JSON.stringify(user.locationShare) : null,
    active: user.active === false ? 0 : 1
  };
}

function rowToService(row) {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    color: row.color,
    visitPrice: row.visit_price,
    basicMin: row.basic_min,
    basicMax: row.basic_max,
    description: row.description,
    enabled: Boolean(row.enabled)
  };
}

function rowToRequest(row) {
  const payload = parseJson(row.payload, {});
  return {
    ...payload,
    id: row.id,
    clientId: row.client_id,
    providerId: row.provider_id,
    serviceId: row.service_id,
    status: row.status,
    paymentStatus: row.payment_status,
    createdAt: payload.createdAt || (row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString())
  };
}

function requestToRow(request) {
  const {
    id,
    clientId,
    providerId,
    serviceId,
    status,
    paymentStatus,
    ...rest
  } = request;

  return {
    id,
    client_id: clientId,
    provider_id: providerId || null,
    service_id: serviceId,
    status: status || 'pending_payment',
    payment_status: paymentStatus || 'pending',
    payload: JSON.stringify(rest)
  };
}

async function migrate() {
  const sql = fs.readFileSync(SCHEMA_PATH, 'utf8');
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));

  try {
    await db.raw('SET FOREIGN_KEY_CHECKS = 0');
  } catch (_) { /* ignora si no se puede */ }

  for (const statement of statements) {
    try {
      await db.raw(statement);
    } catch (err) {
      const ignorable = ['ER_TABLE_EXISTS_ERROR', 'ER_DUP_KEYNAME', 'ER_DUP_FIELDNAME'];
      if (!ignorable.includes(err.code)) {
        try { await db.raw('SET FOREIGN_KEY_CHECKS = 1'); } catch (_) { /* noop */ }
        throw err;
      }
    }
  }

  try {
    await db.raw('SET FOREIGN_KEY_CHECKS = 1');
  } catch (_) { /* noop */ }
}

async function upsertSeedUser(user) {
  await saveUser(user);
}

async function ensureDemoServices() {
  for (const service of SEED_SERVICES) {
    await saveService(service);
  }
}

async function ensureDemoUsers() {
  for (const user of SEED_USERS) {
    await upsertSeedUser(user);
  }
}

async function ensureDemoExtras() {
  for (const entry of SEED_LOGBOOK) {
    await db.query(
      `INSERT IGNORE INTO home_logbook (id, client_id, address, service_name, category, entry_date, note, health_impact, provider_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [entry.id, entry.clientId, entry.address, entry.serviceName, entry.category, entry.date, entry.note, entry.healthImpact, entry.providerName]
    );
  }

  for (const c of SEED_COMPLAINTS) {
    await db.query(
      `INSERT IGNORE INTO complaints (id, request_id, client_name, client_email, type, subject, description, status, priority, created_at, resolved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [c.id, c.requestId, c.clientName, c.clientEmail, c.type, c.subject, c.description, c.status, c.priority, c.createdAt, c.resolvedAt || null]
    );
  }

  for (const chat of SEED_CHATS) {
    await db.query(
      `INSERT IGNORE INTO chats (id, client_name, client_phone, last_message, channel, status, unread, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [chat.id, chat.clientName, chat.clientPhone, chat.lastMessage, chat.channel, chat.status, chat.unread, chat.updatedAt]
    );
  }

  for (const consent of SEED_CONSENTS) {
    await db.query(
      `INSERT IGNORE INTO consent_records (id, user_id, ip, type, granted, version, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [consent.id, consent.userId, consent.ip || null, consent.type, consent.granted ? 1 : 0, consent.version, consent.createdAt]
    );
  }

  for (const log of SEED_SECURITY_LOGS) {
    await db.query(
      `INSERT IGNORE INTO security_logs (id, event, detail, \`user\`, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [log.id, log.event, log.detail || null, log.user || null, log.ip || null, log.createdAt]
    );
  }
}

/** Garantiza usuarios demo (cliente, proveedores, admin) aunque la BD ya tenga datos */
async function ensureDemoData() {
  console.log('Verificando datos demo en MySQL...');
  await ensureDemoServices();
  await ensureDemoUsers();
  await ensureDemoExtras();
  console.log(`✓ ${SEED_USERS.length} usuarios demo listos (${SEED_USERS.map((u) => u.email).join(', ')})`);
  return true;
}

/** @deprecated Usar ensureDemoData */
async function seedIfEmpty() {
  return ensureDemoData();
}

async function loadAll() {
  const [usersRes, servicesRes, requestsRes, logbookRes, complaintsRes, chatsRes, consentsRes, logsRes] = await Promise.all([
    db.query('SELECT * FROM users ORDER BY created_at ASC'),
    db.query('SELECT * FROM services ORDER BY name ASC'),
    db.query('SELECT * FROM service_requests ORDER BY created_at DESC'),
    db.query('SELECT * FROM home_logbook ORDER BY entry_date DESC'),
    db.query('SELECT * FROM complaints ORDER BY created_at DESC'),
    db.query('SELECT * FROM chats ORDER BY updated_at DESC'),
    db.query('SELECT * FROM consent_records ORDER BY created_at DESC'),
    db.query('SELECT * FROM security_logs ORDER BY created_at DESC LIMIT 200')
  ]);

  return {
    users: usersRes.rows.map(rowToUser),
    services: servicesRes.rows.map(rowToService),
    requests: requestsRes.rows.map(rowToRequest),
    homeLogbook: logbookRes.rows.map((row) => ({
      id: row.id,
      clientId: row.client_id,
      address: row.address,
      serviceName: row.service_name,
      category: row.category,
      date: row.entry_date ? String(row.entry_date).slice(0, 10) : null,
      note: row.note,
      healthImpact: row.health_impact,
      providerName: row.provider_name
    })),
    complaints: complaintsRes.rows.map((row) => ({
      id: row.id,
      requestId: row.request_id,
      clientName: row.client_name,
      clientEmail: row.client_email,
      type: row.type,
      subject: row.subject,
      description: row.description,
      status: row.status,
      priority: row.priority,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
      resolvedAt: row.resolved_at ? new Date(row.resolved_at).toISOString() : null
    })),
    chats: chatsRes.rows.map((row) => ({
      id: row.id,
      clientName: row.client_name,
      clientPhone: row.client_phone,
      lastMessage: row.last_message,
      channel: row.channel,
      status: row.status,
      unread: row.unread,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
    })),
    consentRecords: consentsRes.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      ip: row.ip,
      type: row.type,
      granted: Boolean(row.granted),
      version: row.version,
      userAgent: row.user_agent,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null
    })),
    securityLogs: logsRes.rows.map((row) => ({
      id: row.id,
      event: row.event,
      detail: row.detail,
      user: row.user,
      ip: row.ip,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null
    }))
  };
}

async function saveUser(user) {
  const row = userToRow(user);
  await db.query(
    `INSERT INTO users (
      id, email, password, name, role, phone, address, referral_code,
      zilo_points, credits_clp, referrals_count, services_count,
      used_welcome_promo, used_referral, member_since,
      onboarding_completed, onboarding_completed_at,
      specialties, rating, reviews_count, online, avatar, bio, reviews, verification, location_share, active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      email = VALUES(email),
      password = VALUES(password),
      name = VALUES(name),
      role = VALUES(role),
      phone = VALUES(phone),
      address = VALUES(address),
      referral_code = VALUES(referral_code),
      zilo_points = VALUES(zilo_points),
      credits_clp = VALUES(credits_clp),
      referrals_count = VALUES(referrals_count),
      services_count = VALUES(services_count),
      used_welcome_promo = VALUES(used_welcome_promo),
      used_referral = VALUES(used_referral),
      member_since = VALUES(member_since),
      onboarding_completed = VALUES(onboarding_completed),
      onboarding_completed_at = VALUES(onboarding_completed_at),
      specialties = VALUES(specialties),
      rating = VALUES(rating),
      reviews_count = VALUES(reviews_count),
      online = VALUES(online),
      avatar = VALUES(avatar),
      bio = VALUES(bio),
      reviews = VALUES(reviews),
      verification = VALUES(verification),
      location_share = VALUES(location_share),
      active = VALUES(active)`,
    [
      row.id, row.email, row.password, row.name, row.role, row.phone, row.address, row.referral_code,
      row.zilo_points, row.credits_clp, row.referrals_count, row.services_count,
      row.used_welcome_promo ? 1 : 0, row.used_referral ? 1 : 0, row.member_since,
      row.onboarding_completed ? 1 : 0, row.onboarding_completed_at,
      row.specialties, row.rating, row.reviews_count, row.online ? 1 : 0, row.avatar, row.bio, row.reviews, row.verification, row.location_share, row.active
    ]
  );
}

async function saveService(service) {
  await db.query(
    `INSERT INTO services (id, name, icon, color, visit_price, basic_min, basic_max, description, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       icon = VALUES(icon),
       color = VALUES(color),
       visit_price = VALUES(visit_price),
       basic_min = VALUES(basic_min),
       basic_max = VALUES(basic_max),
       description = VALUES(description),
       enabled = VALUES(enabled)`,
    [service.id, service.name, service.icon, service.color, service.visitPrice, service.basicMin, service.basicMax, service.description, service.enabled ? 1 : 0]
  );
}

async function saveRequest(request) {
  const row = requestToRow(request);
  await db.query(
    `INSERT INTO service_requests (id, client_id, provider_id, service_id, status, payment_status, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       client_id = VALUES(client_id),
       provider_id = VALUES(provider_id),
       service_id = VALUES(service_id),
       status = VALUES(status),
       payment_status = VALUES(payment_status),
       payload = VALUES(payload)`,
    [row.id, row.client_id, row.provider_id, row.service_id, row.status, row.payment_status, row.payload]
  );
}

async function saveLogbookEntry(entry) {
  await db.query(
    `INSERT IGNORE INTO home_logbook (id, client_id, address, service_name, category, entry_date, note, health_impact, provider_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [entry.id, entry.clientId, entry.address, entry.serviceName, entry.category, entry.date, entry.note, entry.healthImpact, entry.providerName]
  );
}

async function saveComplaint(complaint) {
  await db.query(
    `INSERT INTO complaints (id, request_id, client_name, client_email, type, subject, description, status, priority, created_at, resolved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       status = VALUES(status),
       resolved_at = VALUES(resolved_at)`,
    [
      complaint.id, complaint.requestId, complaint.clientName, complaint.clientEmail,
      complaint.type, complaint.subject, complaint.description, complaint.status,
      complaint.priority, complaint.createdAt, complaint.resolvedAt || null
    ]
  );
}

async function saveConsent(record) {
  await db.query(
    `INSERT IGNORE INTO consent_records (id, user_id, ip, type, granted, version, user_agent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id, record.userId, record.ip || null, record.type, record.granted ? 1 : 0,
      record.version, record.userAgent || null, record.createdAt
    ]
  );
}

async function saveSecurityLog(log) {
  await db.query(
    `INSERT IGNORE INTO security_logs (id, event, detail, \`user\`, ip, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [log.id, log.event, log.detail || null, log.user || null, log.ip || null, log.createdAt]
  );
}

function persist(fn, label) {
  fn().catch((err) => {
    console.error(`Error persistiendo ${label}:`, err.message);
  });
}

module.exports = {
  migrate,
  ensureDemoData,
  seedIfEmpty,
  loadAll,
  saveUser,
  saveService,
  saveRequest,
  saveLogbookEntry,
  saveComplaint,
  saveConsent,
  saveSecurityLog,
  persist,
  defaultProviderVerification,
  defaultLocationShare
};
