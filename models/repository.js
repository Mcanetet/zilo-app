const fs = require('fs');
const path = require('path');
const db = require('../lib/db');
const { DEFAULT_PRICING, normalizePricing } = require('../lib/pricing');
const { normalizeBilling } = require('../lib/billing');
const { normalizeMfa } = require('../lib/mfa');
const { demoApprovedContract, normalizeProviderContract } = require('../lib/contracts');
const { hashPassword } = require('../lib/password');
const { flattenCatalog, flattenRegionsCatalog } = require('../lib/chile-geo');

const SCHEMA_PATH = path.join(__dirname, '../db/schema.sql');

const SEED_SERVICES = [
  { id: 'electrico', name: 'Eléctrico', icon: 'electrico', color: '#F59E0B', visitPrice: 100000, basicMin: 100000, basicMax: 150000, description: 'Instalaciones, cortocircuitos, tableros y emergencias eléctricas.', enabled: true },
  { id: 'gasfiter', name: 'Gásfiter', icon: 'gasfiter', color: '#3B82F6', visitPrice: 105000, basicMin: 105000, basicMax: 160000, description: 'Fugas, cañerías, grifería y destapes en baño y cocina.', enabled: true },
  { id: 'cerrajero', name: 'Cerrajero', icon: 'cerrajero', color: '#8B5CF6', visitPrice: 100000, basicMin: 100000, basicMax: 180000, description: 'Apertura de puertas, cambio de cerraduras y copias de llaves.', enabled: true },
  { id: 'termos', name: 'Reparación de Termos', icon: 'termos', color: '#EF4444', visitPrice: 100000, basicMin: 100000, basicMax: 160000, description: 'Mantención, cambio de resistencia y reparación de termos eléctricos.', enabled: true },
  { id: 'lavavajillas', name: 'Lavavajillas', icon: 'lavavajillas', color: '#06B6D4', visitPrice: 100000, basicMin: 100000, basicMax: 145000, description: 'Reparación de bombas, fugas y programas de lavado.', enabled: true },
  { id: 'lavadora', name: 'Lavadora', icon: 'lavadora', color: '#10B981', visitPrice: 100000, basicMin: 100000, basicMax: 150000, description: 'Centrifugado, drenaje, tambor y tarjetas electrónicas.', enabled: true },
  { id: 'calderas', name: 'Calderas de Edificios', icon: 'calderas', color: '#F97316', visitPrice: 180000, basicMin: 180000, basicMax: 310000, description: 'Mantención, calibración, bombas, quemadores y seguridad de calderas centrales.', enabled: true },
  { id: 'generadores', name: 'Mantenimiento de Generadores', icon: 'generadores', color: '#6366F1', visitPrice: 140000, basicMin: 140000, basicMax: 250000, description: 'Mantención preventiva, pruebas de carga, transferencia y reparación de grupos electrógenos.', enabled: true }
];

const SEED_MODULES = [
  { id: 'client_solicitar', audience: 'client', name: 'Solicitar servicios', description: 'Grid de servicios y formulario de solicitud', sortOrder: 1, enabled: true },
  { id: 'client_pasaporte', audience: 'client', name: 'Pasaporte Hogar', description: 'Historial técnico del inmueble y puntaje de salud', sortOrder: 2, enabled: true },
  { id: 'client_referidos', audience: 'client', name: 'Referidos e invitaciones', description: 'Invitar amigos y ganar crédito', sortOrder: 3, enabled: true },
  { id: 'client_regalo', audience: 'client', name: 'Regalar servicio', description: 'Opción de regalar una visita a otra persona', sortOrder: 4, enabled: true },
  { id: 'client_guardian', audience: 'client', name: 'Modo Guardián', description: 'Enlace de seguimiento para familiares sin cuenta', sortOrder: 5, enabled: true },
  { id: 'client_foto', audience: 'client', name: 'Foto del requerimiento', description: 'Subir foto opcional al solicitar servicio', sortOrder: 6, enabled: true },
  { id: 'client_puntos', audience: 'client', name: 'Puntos y créditos', description: 'Canjear puntos y créditos en checkout', sortOrder: 7, enabled: true },
  { id: 'client_promos', audience: 'client', name: 'Promociones', description: 'Banners de promos en el inicio del cliente', sortOrder: 8, enabled: true },
  { id: 'client_historial', audience: 'client', name: 'Historial', description: 'Ver servicios anteriores del cliente', sortOrder: 9, enabled: true },
  { id: 'client_whatsapp', audience: 'client', name: 'Concierge WhatsApp (legado)', description: 'Solo si Aland IA está OFF: botón WhatsApp clásico', sortOrder: 10, enabled: false },
  { id: 'client_aland', audience: 'client', name: 'Chat Aland IA', description: 'Asistente de soporte: primero IA, luego socio o pagos/WhatsApp', sortOrder: 11, enabled: true },
  { id: 'provider_online', audience: 'provider', name: 'Modo en línea', description: 'Activar disponibilidad para recibir trabajos', sortOrder: 1, enabled: true },
  { id: 'provider_aceptar', audience: 'provider', name: 'Aceptar solicitudes', description: 'Modal de nuevas solicitudes entrantes', sortOrder: 2, enabled: true },
  { id: 'provider_equipo', audience: 'provider', name: 'Gestión de técnicos', description: 'Crear y administrar subusuarios técnicos', sortOrder: 3, enabled: true },
  { id: 'provider_mando', audience: 'provider', name: 'Cuadro de mando', description: 'Asignar trabajos y hacer seguimiento', sortOrder: 4, enabled: true },
  { id: 'provider_verificacion', audience: 'provider', name: 'Verificación KYC', description: 'Carnet, selfie y consentimiento de ubicación', sortOrder: 5, enabled: true },
  { id: 'provider_ubicacion', audience: 'provider', name: 'Ubicación en tiempo real', description: 'Compartir GPS durante el servicio', sortOrder: 6, enabled: true },
  { id: 'provider_perfil', audience: 'provider', name: 'Perfil público', description: 'Editar datos visibles para clientes', sortOrder: 7, enabled: true },
  { id: 'provider_contrato', audience: 'provider', name: 'Contrato de socio', description: 'Firma del contrato de prestación y documentos legales', sortOrder: 8, enabled: true },
  { id: 'provider_mensajes', audience: 'provider', name: 'Mensajes Aland IA', description: 'Consultas derivadas por Aland IA desde clientes', sortOrder: 9, enabled: true }
];

const SEED_PROMOS = [
  { id: 'first', title: '10% en tu 1er servicio', desc: 'Código BIENVENIDO · 10% en tu primer servicio', code: 'BIENVENIDO', color: '#B8956B', sortOrder: 1, enabled: true, discountPercent: 10, showBanner: true, checkoutEnabled: true },
  { id: 'refer', title: 'Invita y gana $5.000', desc: 'Tú y tu amigo reciben crédito', code: null, color: '#8B7355', sortOrder: 2, enabled: true, discountPercent: null, showBanner: true, checkoutEnabled: false },
  { id: 'gift', title: 'Regala un servicio', desc: 'Modo Guardián para tu familia', code: null, color: '#A67C52', sortOrder: 3, enabled: true, discountPercent: null, showBanner: true, checkoutEnabled: false }
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

/** Expediente completo para el técnico demo (requisito del muro). */
function demoTechnicianVerification() {
  return {
    status: 'complete',
    photo: 'demo',
    idCardFront: 'demo',
    idCardBack: 'demo',
    criminalRecord: 'demo',
    studyCertificates: [
      { url: 'demo', label: 'Certificado técnico demo', uploadedAt: '2025-10-01T12:00:00.000Z' }
    ],
    otherCertificates: [],
    updatedAt: '2025-10-01T12:00:00.000Z'
  };
}

function demoServiceIds() {
  return SEED_SERVICES.filter((s) => s.enabled !== false).map((s) => s.id);
}

const SEED_USERS = [
  {
    id: 'client-1',
    email: 'cliente@fundez.cl',
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
    memberSince: '2025-11-01',
    billing: {
      type: 'natural',
      rut: '12.345.678-9',
      legalName: 'María González',
      giro: '',
      fiscalAddress: 'Av. Providencia 2650, Providencia, Santiago',
      invoiceEmail: 'cliente@fundez.cl'
    }
  },
  {
    id: 'provider-pedro',
    email: 'pedro@fundez.cl',
    password: 'proveedor123',
    name: 'Pedro Gómez',
    role: 'provider',
    phone: '+56 9 2234 5678',
    // Cobertura amplia solo en demo para probar el muro con pedidos externos
    specialties: demoServiceIds(),
    rating: 4.8,
    reviewsCount: 94,
    online: false,
    avatar: 'PG',
    bio: 'Socio demo Fundez con cobertura de prueba en todos los servicios del catálogo.',
    reviews: [
      { author: 'Camila T.', rating: 5, text: 'Excelente disposición, solucionó la filtración del lavaplatos muy rápido', date: '2025-05-18' },
      { author: 'Diego M.', rating: 5, text: 'Muy puntual y dejó todo limpio después del trabajo.', date: '2025-04-30' },
      { author: 'Sofía L.', rating: 4, text: 'Buen precio y trabajo bien hecho en la cañería.', date: '2025-04-12' }
    ],
    verification: pedroVerification(),
    locationShare: pedroLocationShare(),
    providerContract: demoApprovedContract('Pedro Gómez', '12.345.678-9')
  },
  {
    id: 'tecnico-pedro-demo',
    email: 'tecnico.pedro@fundez.cl',
    password: 'tecnico123',
    name: 'Luis Demo',
    role: 'tecnico',
    parentId: 'provider-pedro',
    phone: '+56 9 2234 5679',
    specialties: demoServiceIds(),
    rating: 4.7,
    reviewsCount: 12,
    online: false,
    avatar: 'LD',
    bio: 'Técnico demo con expediente completo para pruebas del muro.',
    reviews: [],
    verification: demoTechnicianVerification(),
    locationShare: pedroLocationShare(),
    active: true,
    memberSince: '2025-10-01',
    emailVerifiedAt: '2025-10-01T12:00:00.000Z'
  },
  {
    id: 'provider-marta',
    email: 'marta@fundez.cl',
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
    locationShare: defaultLocationShare(),
    providerContract: demoApprovedContract('Marta Quiroz', '13.456.789-0')
  },
  {
    id: 'provider-juan',
    email: 'juancarlos@fundez.cl',
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
    locationShare: defaultLocationShare(),
    providerContract: demoApprovedContract('Juan Carlos', '14.567.890-1')
  },
  {
    id: 'provider-ana',
    email: 'ana@fundez.cl',
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
    locationShare: defaultLocationShare(),
    providerContract: demoApprovedContract('Ana Rojas', '15.678.901-2')
  },
  {
    id: 'admin-1',
    email: 'admin@fundez.cl',
    password: 'admin123',
    name: 'Admin Fundez',
    role: 'admin',
    phone: '+56 9 0000 0000',
    adminAccess: { profileId: 'superadmin', isSuperAdmin: true, permissions: [] }
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
  { id: 'sec-1', event: 'login_ok', user: 'admin@fundez.cl', ip: '10.0.0.1', createdAt: '2026-06-30T08:00:00.000Z' },
  { id: 'sec-2', event: 'login_ok', user: 'cliente@fundez.cl', ip: '10.0.0.2', createdAt: '2026-06-30T09:30:00.000Z' },
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
    parentId: row.parent_id || null,
    phone: row.phone,
    address: row.address,
    addressLat: row.address_lat != null ? Number(row.address_lat) : null,
    addressLng: row.address_lng != null ? Number(row.address_lng) : null,
    addressPlaceId: row.address_place_id || null,
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
    active: row.active == null ? true : Boolean(row.active),
    emailVerifiedAt: row.email_verified_at ? new Date(row.email_verified_at).toISOString() : null,
    emailVerificationCodeHash: row.email_verification_code_hash || null,
    emailVerificationExpiresAt: row.email_verification_expires_at
      ? new Date(row.email_verification_expires_at).toISOString() : null,
    emailVerificationSentAt: row.email_verification_sent_at
      ? new Date(row.email_verification_sent_at).toISOString() : null,
    clientEnabled: Boolean(row.client_enabled)
  };

  if (row.role === 'client' || Boolean(row.client_enabled)) {
    user.billing = row.billing ? normalizeBilling(parseJson(row.billing, null)) : null;
  }

  if (row.role === 'admin') {
    user.mfa = normalizeMfa(parseJson(row.mfa, null));
    user.adminAccess = parseJson(row.admin_access, null);
  }

  if (row.role === 'provider' || row.role === 'tecnico') {
    user.specialties = parseJson(row.specialties, []);
    user.rating = row.rating != null ? Number(row.rating) : null;
    user.reviewsCount = row.reviews_count;
    user.online = Boolean(row.online);
    user.avatar = row.avatar;
    user.bio = row.bio;
    user.reviews = parseJson(row.reviews, []);
    user.verification = parseJson(row.verification, defaultProviderVerification());
    user.locationShare = parseJson(row.location_share, defaultLocationShare());
    if (row.role === 'provider') {
      user.providerContract = normalizeProviderContract(parseJson(row.provider_contract, null));
    }
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
    parent_id: user.parentId || null,
    phone: user.phone || null,
    address: user.address || null,
    address_lat: user.addressLat ?? null,
    address_lng: user.addressLng ?? null,
    address_place_id: user.addressPlaceId || null,
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
    billing: user.billing ? JSON.stringify(user.billing) : null,
    mfa: user.mfa ? JSON.stringify(user.mfa) : null,
    admin_access: user.adminAccess ? JSON.stringify(user.adminAccess) : null,
    provider_contract: user.providerContract ? JSON.stringify(user.providerContract) : null,
    active: user.active === false ? 0 : 1,
    email_verified_at: user.emailVerifiedAt || null,
    email_verification_code_hash: user.emailVerificationCodeHash || null,
    email_verification_expires_at: user.emailVerificationExpiresAt || null,
    email_verification_sent_at: user.emailVerificationSentAt || null,
    client_enabled: user.clientEnabled ? 1 : 0
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

function rowToModule(row) {
  return {
    id: row.id,
    audience: row.audience,
    name: row.name,
    description: row.description,
    sortOrder: row.sort_order || 0,
    enabled: Boolean(row.enabled)
  };
}

function rowToPromo(row) {
  return {
    id: row.id,
    title: row.title,
    desc: row.description,
    code: row.code,
    color: row.color,
    sortOrder: row.sort_order || 0,
    enabled: Boolean(row.enabled),
    discountPercent: row.discount_percent == null ? null : Number(row.discount_percent),
    showBanner: row.show_banner == null ? true : Boolean(row.show_banner),
    checkoutEnabled: Boolean(row.checkout_enabled)
  };
}

function toMysqlDatetime(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function rowToCrmLead(row) {
  return {
    id: row.id,
    companyName: row.company_name,
    contactName: row.contact_name,
    email: row.email || '',
    phone: row.phone || '',
    rut: row.rut || '',
    meetingAt: row.meeting_at ? new Date(row.meeting_at).toISOString() : null,
    nextSteps: row.next_steps || '',
    meetingNotes: row.meeting_notes || '',
    trainingDone: Boolean(row.training_done),
    docsReceived: Boolean(row.docs_received),
    contractSent: Boolean(row.contract_sent),
    contractSigned: Boolean(row.contract_signed),
    pipelineStage: row.pipeline_stage || 'prospecto',
    interestedServices: row.interested_services || '',
    coverageArea: row.coverage_area || '',
    source: row.source || '',
    assignedTo: row.assigned_to || '',
    notes: row.notes || '',
    convertedProviderId: row.converted_provider_id || null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

function rowToCoverageCommune(row) {
  return {
    regionCode: row.region_code,
    regionName: row.region_name,
    communeCode: row.commune_code,
    communeName: row.commune_name,
    enabled: Boolean(row.enabled),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

function rowToCoverageRegion(row) {
  return {
    regionCode: row.region_code,
    regionName: row.region_name,
    enabled: Boolean(row.enabled),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
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

  await ensurePromoExtraColumns();
  await ensureUserClientEnabledColumn();
  await ensureAlandMonitorColumns();
}

async function ensureAlandMonitorColumns() {
  const alters = [
    'ALTER TABLE aland_conversations ADD COLUMN tokens_prompt INT NOT NULL DEFAULT 0',
    'ALTER TABLE aland_conversations ADD COLUMN tokens_completion INT NOT NULL DEFAULT 0',
    'ALTER TABLE aland_conversations ADD COLUMN tokens_total INT NOT NULL DEFAULT 0',
    'ALTER TABLE aland_conversations ADD COLUMN injection_count INT NOT NULL DEFAULT 0',
    'ALTER TABLE aland_conversations ADD COLUMN last_injection_at DATETIME NULL DEFAULT NULL'
  ];
  for (const statement of alters) {
    try {
      await db.raw(statement);
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME' && err.code !== 'ER_NO_SUCH_TABLE') throw err;
    }
  }
}

async function ensureUserClientEnabledColumn() {
  try {
    await db.raw('ALTER TABLE users ADD COLUMN client_enabled TINYINT(1) NOT NULL DEFAULT 0');
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }
}

async function ensurePromoExtraColumns() {
  const alters = [
    'ALTER TABLE promos ADD COLUMN discount_percent INT NULL DEFAULT NULL',
    'ALTER TABLE promos ADD COLUMN show_banner TINYINT(1) NOT NULL DEFAULT 1',
    'ALTER TABLE promos ADD COLUMN checkout_enabled TINYINT(1) NOT NULL DEFAULT 0'
  ];
  for (const statement of alters) {
    try {
      await db.raw(statement);
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') throw err;
    }
  }
  try {
    await db.query(
      `UPDATE promos
       SET discount_percent = COALESCE(discount_percent, 10),
           checkout_enabled = 1,
           description = ?
       WHERE id = 'first' OR UPPER(IFNULL(code, '')) = 'BIENVENIDO'`,
      ['Código BIENVENIDO · 10% en tu primer servicio']
    );
  } catch (_) { /* tabla aún no existe en algún entorno */ }
}

async function upsertSeedUser(user) {
  await saveUser(user);
}

async function ensureDemoServices() {
  for (const service of SEED_SERVICES) {
    await saveService(service, { preserveEnabled: true });
  }
}

async function ensureDemoModules() {
  for (const mod of SEED_MODULES) {
    await saveModule(mod, { preserveEnabled: true });
  }
}

async function ensureCoverageCommunes() {
  const catalog = flattenCatalog();
  for (const row of catalog) {
    await db.query(
      `INSERT INTO coverage_communes (region_code, commune_code, region_name, commune_name, enabled)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         region_name = VALUES(region_name),
         commune_name = VALUES(commune_name)`,
      [row.regionCode, row.communeCode, row.regionName, row.communeName, row.enabled ? 1 : 0]
    );
  }
}

async function ensureCoverageRegions() {
  const catalog = flattenRegionsCatalog();
  for (const row of catalog) {
    await db.query(
      `INSERT INTO coverage_regions (region_code, region_name, enabled)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         region_name = VALUES(region_name)`,
      [row.regionCode, row.regionName, row.enabled ? 1 : 0]
    );
  }
}

async function ensureDemoPromos() {
  for (const promo of SEED_PROMOS) {
    await savePromo(promo, { preserveEnabled: true });
  }
}

async function ensureDemoPricing() {
  const existing = await db.query('SELECT id FROM pricing_config WHERE id = ?', ['default']);
  if (!existing.rows.length) {
    await savePricingConfig(DEFAULT_PRICING);
  }
}

function getAdminSeedConfig() {
  const appMode = require('../lib/appMode');
  const defaultPass = appMode.isProductionMode() ? '' : 'admin123';
  const password = process.env.ADMIN_PASSWORD || defaultPass;
  if (appMode.isProductionMode() && (!password || password === 'admin123')) {
    console.warn('⚠ ADMIN_PASSWORD no configurada de forma segura en producción');
  }
  return {
    id: 'admin-1',
    email: (process.env.ADMIN_EMAIL || 'admin@fundez.cl').trim().toLowerCase(),
    password: password || cryptoRandomTemp(),
    name: process.env.ADMIN_NAME || 'Admin Fundez',
    phone: '+56 9 0000 0000',
    adminAccess: { profileId: 'superadmin', isSuperAdmin: true, permissions: [] }
  };
}

function cryptoRandomTemp() {
  return require('crypto').randomBytes(16).toString('hex');
}

async function ensureAdminAccount() {
  const seed = getAdminSeedConfig();
  const hashed = await hashPassword(seed.password);
  const adminAccessJson = JSON.stringify(seed.adminAccess);

  const byEmail = await db.query('SELECT * FROM users WHERE email = ? LIMIT 1', [seed.email]);
  const byId = await db.query('SELECT * FROM users WHERE id = ? LIMIT 1', [seed.id]);

  let row = byEmail.rows[0] || byId.rows[0];

  if (!row) {
    await saveUser({
      id: seed.id,
      email: seed.email,
      password: hashed,
      name: seed.name,
      role: 'admin',
      phone: seed.phone,
      adminAccess: seed.adminAccess,
      active: true
    });
    console.log(`✓ Cuenta admin creada (${seed.email})`);
    return;
  }

  await db.query(
    `UPDATE users SET role = 'admin', active = 1,
      admin_access = COALESCE(admin_access, ?),
      email = COALESCE(NULLIF(email, ''), ?),
      name = COALESCE(NULLIF(name, ''), ?)
     WHERE id = ?`,
    [adminAccessJson, seed.email, seed.name, row.id]
  );

  const syncPassword = process.env.ADMIN_SYNC_PASSWORD === '1' || process.env.ADMIN_SYNC_PASSWORD === 'true';
  if (syncPassword) {
    await db.query('UPDATE users SET password = ? WHERE id = ?', [hashed, row.id]);
    console.log(`✓ Cuenta admin verificada (${seed.email}) — contraseña sincronizada desde ADMIN_PASSWORD`);
    return;
  }

  console.log(`✓ Cuenta admin verificada (${seed.email}) — datos existentes conservados`);
}

async function resetAdminPassword(plainPassword) {
  const seed = getAdminSeedConfig();
  const password = plainPassword || seed.password;
  const hashed = await hashPassword(password);
  const adminAccessJson = JSON.stringify(seed.adminAccess);

  const res = await db.query('SELECT id FROM users WHERE email = ? OR id = ? LIMIT 1', [seed.email, seed.id]);
  if (!res.rows.length) {
    await saveUser({
      id: seed.id,
      email: seed.email,
      password: hashed,
      name: seed.name,
      role: 'admin',
      phone: seed.phone,
      adminAccess: seed.adminAccess,
      active: true
    });
    return { created: true, email: seed.email };
  }

  await db.query(
    `UPDATE users SET email = ?, password = ?, role = 'admin', active = 1, admin_access = ? WHERE id = ?`,
    [seed.email, hashed, adminAccessJson, res.rows[0].id]
  );
  return { created: false, email: seed.email, userId: res.rows[0].id };
}

async function ensureDemoUsers() {
  await ensureAdminAccount();
  const appMode = require('../lib/appMode');
  if (appMode.isProductionMode() && process.env.SEED_DEMO_USERS !== 'true') {
    console.log('✓ Seed de usuarios demo omitido (modo producción)');
    return;
  }
  const DEMO_IDS = new Set(['client-1', 'provider-pedro', 'tecnico-pedro-demo']);
  for (const user of SEED_USERS) {
    if (user.role === 'admin') continue;
    const exists = await db.query('SELECT id, email_verified_at FROM users WHERE id = ? LIMIT 1', [user.id]);
    if (exists.rows.length) {
      // Cuentas demo de login: sin validación de correo
      if (DEMO_IDS.has(user.id) && !exists.rows[0].email_verified_at) {
        await db.query('UPDATE users SET email_verified_at = ? WHERE id = ?', [
          new Date().toISOString().slice(0, 19).replace('T', ' '),
          user.id
        ]);
      }
      continue;
    }
    const hashed = await hashPassword(user.password);
    const toSave = DEMO_IDS.has(user.id)
      ? { ...user, password: hashed, emailVerifiedAt: user.emailVerifiedAt || new Date().toISOString() }
      : { ...user, password: hashed };
    await saveUser(toSave);
  }

  // El muro exige técnico con expediente completo + especialidad.
  // Sincroniza cobertura demo aunque Pedro ya existiera sin técnicos.
  await syncDemoProviderCoverage();
}

/**
 * Asegura que el socio demo pueda ver y tomar pedidos del muro:
 * todas las especialidades del catálogo + técnico con expediente completo.
 */
async function syncDemoProviderCoverage() {
  const specialtyIds = demoServiceIds();
  const verifiedAt = new Date().toISOString();

  const pedroRes = await db.query('SELECT * FROM users WHERE id = ? LIMIT 1', ['provider-pedro']);
  if (pedroRes.rows.length) {
    const pedro = rowToUser(pedroRes.rows[0]);
    pedro.specialties = specialtyIds;
    pedro.verification = pedroVerification();
    pedro.locationShare = pedroLocationShare();
    pedro.providerContract = demoApprovedContract('Pedro Gómez', '12.345.678-9');
    pedro.active = true;
    pedro.emailVerifiedAt = pedro.emailVerifiedAt || verifiedAt;
    pedro.bio = pedro.bio || 'Socio demo Fundez con cobertura de prueba en todos los servicios del catálogo.';
    await saveUser(pedro);
  }

  const techSeed = SEED_USERS.find((u) => u.id === 'tecnico-pedro-demo');
  if (!techSeed) return;

  const techRes = await db.query('SELECT * FROM users WHERE id = ? LIMIT 1', ['tecnico-pedro-demo']);
  if (techRes.rows.length) {
    const tech = rowToUser(techRes.rows[0]);
    tech.parentId = 'provider-pedro';
    tech.role = 'tecnico';
    tech.specialties = specialtyIds;
    tech.verification = demoTechnicianVerification();
    tech.locationShare = pedroLocationShare();
    tech.active = true;
    tech.emailVerifiedAt = tech.emailVerifiedAt || verifiedAt;
    tech.phone = tech.phone || techSeed.phone;
    tech.bio = techSeed.bio;
    await saveUser(tech);
    return;
  }

  await saveUser({
    ...techSeed,
    specialties: specialtyIds,
    verification: demoTechnicianVerification(),
    locationShare: pedroLocationShare(),
    password: await hashPassword(techSeed.password),
    emailVerifiedAt: verifiedAt,
    active: true
  });
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

/** Garantiza catálogo y cuenta admin sin sobrescribir datos de producción */
async function ensureDemoData() {
  console.log('Verificando datos en MySQL (modo conservador)...');
  await ensureDemoServices();
  await ensureDemoModules();
  await ensureCoverageRegions();
  await ensureCoverageCommunes();
  await ensureDemoPromos();
  await ensureDemoPricing();
  await ensureDemoUsers();
  await ensureDemoExtras();
  console.log('✓ Catálogo verificado — historial de pagos y datos existentes conservados');
  return true;
}

/** @deprecated Usar ensureDemoData */
async function seedIfEmpty() {
  return ensureDemoData();
}

function mapLoadedRows({
  usersRes,
  servicesRes,
  modulesRes,
  promosRes,
  crmLeadsRes,
  pricingRes,
  requestsRes,
  logbookRes,
  complaintsRes,
  chatsRes,
  consentsRes,
  logsRes,
  notifRes,
  coverageRes,
  coverageRegionsRes
}) {
  let pricing = DEFAULT_PRICING;
  if (pricingRes.rows?.[0]?.config) {
    pricing = normalizePricing(parseJson(pricingRes.rows[0].config, DEFAULT_PRICING));
  }

  return {
    users: usersRes.rows.map(rowToUser),
    services: servicesRes.rows.map(rowToService),
    modules: modulesRes.rows.map(rowToModule),
    promos: (promosRes?.rows || []).map(rowToPromo),
    crmLeads: (crmLeadsRes?.rows || []).map(rowToCrmLead),
    coverageCommunes: (coverageRes?.rows || []).map(rowToCoverageCommune),
    coverageRegions: (coverageRegionsRes?.rows || []).map(rowToCoverageRegion),
    pricing,
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
      purpose: row.purpose || null,
      legalBasis: row.legal_basis || null,
      source: row.source || null,
      withdrawnAt: row.withdrawn_at ? new Date(row.withdrawn_at).toISOString() : null,
      meta: parseJson(row.meta, null),
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null
    })),
    securityLogs: (logsRes.rows || []).map((row) => ({
      id: row.id,
      event: row.event,
      detail: row.detail,
      user: row.user,
      ip: row.ip,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null
    })),
    notifications: (notifRes.rows || []).map((row) => ({
      id: row.id,
      event: row.event,
      channel: row.channel,
      status: row.status,
      recipient: row.recipient,
      subject: row.subject,
      body: row.body,
      meta: parseJson(row.meta, {}),
      requestId: row.request_id,
      userId: row.user_id,
      error: row.error,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null
    }))
  };
}

async function fetchDataRows({ logsLimit = 200, notifLimit = 300, includeSecurityLogs = true } = {}) {
  const logsQuery = !includeSecurityLogs
    ? Promise.resolve({ rows: [] })
    : logsLimit == null
      ? db.query('SELECT * FROM security_logs ORDER BY created_at DESC')
      : db.query(`SELECT * FROM security_logs ORDER BY created_at DESC LIMIT ${Math.max(1, logsLimit)}`);

  const notifQuery = notifLimit == null
    ? db.query('SELECT * FROM notifications ORDER BY created_at DESC').catch(() => ({ rows: [] }))
    : db.query(`SELECT * FROM notifications ORDER BY created_at DESC LIMIT ${Math.max(1, notifLimit)}`).catch(() => ({ rows: [] }));

  const [usersRes, servicesRes, modulesRes, promosRes, crmLeadsRes, pricingRes, requestsRes, logbookRes, complaintsRes, chatsRes, consentsRes, logsRes, notifRes, coverageRes, coverageRegionsRes] = await Promise.all([
    db.query('SELECT * FROM users ORDER BY created_at ASC'),
    db.query('SELECT * FROM services ORDER BY name ASC'),
    db.query('SELECT * FROM modules ORDER BY audience ASC, sort_order ASC'),
    db.query('SELECT * FROM promos ORDER BY sort_order ASC, title ASC').catch(() => ({ rows: [] })),
    db.query('SELECT * FROM crm_leads ORDER BY meeting_at IS NULL, meeting_at DESC, updated_at DESC').catch(() => ({ rows: [] })),
    db.query('SELECT * FROM pricing_config WHERE id = ?', ['default']).catch(() => ({ rows: [] })),
    db.query('SELECT * FROM service_requests ORDER BY created_at DESC'),
    db.query('SELECT * FROM home_logbook ORDER BY entry_date DESC'),
    db.query('SELECT * FROM complaints ORDER BY created_at DESC'),
    db.query('SELECT * FROM chats ORDER BY updated_at DESC'),
    db.query('SELECT * FROM consent_records ORDER BY created_at DESC'),
    logsQuery,
    notifQuery,
    db.query('SELECT * FROM coverage_communes ORDER BY region_name ASC, commune_name ASC').catch(() => ({ rows: [] })),
    db.query('SELECT * FROM coverage_regions ORDER BY region_name ASC').catch(() => ({ rows: [] }))
  ]);

  return {
    usersRes,
    servicesRes,
    modulesRes,
    promosRes,
    crmLeadsRes,
    pricingRes,
    requestsRes,
    logbookRes,
    complaintsRes,
    chatsRes,
    consentsRes,
    logsRes,
    notifRes,
    coverageRes,
    coverageRegionsRes
  };
}

async function loadAll() {
  return mapLoadedRows(await fetchDataRows({ logsLimit: null, notifLimit: null, includeSecurityLogs: true }));
}

async function loadAllForBackup({ includeSecurityLogs = true } = {}) {
  return mapLoadedRows(await fetchDataRows({
    logsLimit: includeSecurityLogs ? null : 0,
    notifLimit: null,
    includeSecurityLogs
  }));
}

async function saveUser(user) {
  const row = userToRow(user);
  await db.query(
    `INSERT INTO users (
      id, email, password, name, role, parent_id, phone, address, address_lat, address_lng, address_place_id, referral_code,
      zilo_points, credits_clp, referrals_count, services_count,
      used_welcome_promo, used_referral, member_since,
      onboarding_completed, onboarding_completed_at,
      specialties, rating, reviews_count, online, avatar, bio, reviews, verification, location_share, billing, mfa, admin_access, provider_contract, active,
      email_verified_at, email_verification_code_hash, email_verification_expires_at, email_verification_sent_at, client_enabled
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      email = VALUES(email),
      password = VALUES(password),
      name = VALUES(name),
      role = VALUES(role),
      parent_id = VALUES(parent_id),
      phone = VALUES(phone),
      address = VALUES(address),
      address_lat = VALUES(address_lat),
      address_lng = VALUES(address_lng),
      address_place_id = VALUES(address_place_id),
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
      billing = VALUES(billing),
      mfa = VALUES(mfa),
      admin_access = VALUES(admin_access),
      provider_contract = VALUES(provider_contract),
      active = VALUES(active),
      email_verified_at = VALUES(email_verified_at),
      email_verification_code_hash = VALUES(email_verification_code_hash),
      email_verification_expires_at = VALUES(email_verification_expires_at),
      email_verification_sent_at = VALUES(email_verification_sent_at),
      client_enabled = VALUES(client_enabled)`,
    [
      row.id, row.email, row.password, row.name, row.role, row.parent_id, row.phone, row.address, row.address_lat, row.address_lng, row.address_place_id, row.referral_code,
      row.zilo_points, row.credits_clp, row.referrals_count, row.services_count,
      row.used_welcome_promo ? 1 : 0, row.used_referral ? 1 : 0, row.member_since,
      row.onboarding_completed ? 1 : 0, row.onboarding_completed_at,
      row.specialties, row.rating, row.reviews_count, row.online ? 1 : 0, row.avatar, row.bio, row.reviews, row.verification, row.location_share, row.billing, row.mfa, row.admin_access, row.provider_contract, row.active,
      row.email_verified_at, row.email_verification_code_hash, row.email_verification_expires_at, row.email_verification_sent_at, row.client_enabled ? 1 : 0
    ]
  );
}

async function saveService(service, { preserveEnabled = false } = {}) {
  const updateEnabled = preserveEnabled
    ? ''
    : ', enabled = VALUES(enabled)';
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
       description = VALUES(description)${updateEnabled}`,
    [service.id, service.name, service.icon, service.color, service.visitPrice, service.basicMin, service.basicMax, service.description, service.enabled ? 1 : 0]
  );
}

async function saveModule(mod, { preserveEnabled = false } = {}) {
  const updateEnabled = preserveEnabled
    ? ''
    : ', enabled = VALUES(enabled)';
  await db.query(
    `INSERT INTO modules (id, audience, name, description, sort_order, enabled)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       description = VALUES(description),
       sort_order = VALUES(sort_order)${updateEnabled}`,
    [mod.id, mod.audience, mod.name, mod.description || null, mod.sortOrder || 0, mod.enabled ? 1 : 0]
  );
}

async function saveCoverageRegion(row) {
  await db.query(
    `INSERT INTO coverage_regions (region_code, region_name, enabled)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       region_name = VALUES(region_name),
       enabled = VALUES(enabled)`,
    [row.regionCode, row.regionName, row.enabled ? 1 : 0]
  );
}

async function saveCoverageCommune(row) {
  await db.query(
    `INSERT INTO coverage_communes (region_code, commune_code, region_name, commune_name, enabled)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       region_name = VALUES(region_name),
       commune_name = VALUES(commune_name),
       enabled = VALUES(enabled)`,
    [row.regionCode, row.communeCode, row.regionName, row.communeName, row.enabled ? 1 : 0]
  );
}

async function savePromo(promo, { preserveEnabled = false } = {}) {
  const updateEnabled = preserveEnabled
    ? ''
    : ', enabled = VALUES(enabled)';
  const discountPercent = promo.discountPercent == null || promo.discountPercent === ''
    ? null
    : Math.max(0, Math.min(100, Math.round(Number(promo.discountPercent))));
  await db.query(
    `INSERT INTO promos (id, title, description, code, color, sort_order, enabled, discount_percent, show_banner, checkout_enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       title = VALUES(title),
       description = VALUES(description),
       code = VALUES(code),
       color = VALUES(color),
       sort_order = VALUES(sort_order),
       discount_percent = VALUES(discount_percent),
       show_banner = VALUES(show_banner),
       checkout_enabled = VALUES(checkout_enabled)${updateEnabled}`,
    [
      promo.id,
      promo.title,
      promo.desc || promo.description || null,
      promo.code || null,
      promo.color || null,
      promo.sortOrder || 0,
      promo.enabled !== false ? 1 : 0,
      discountPercent,
      promo.showBanner === false ? 0 : 1,
      promo.checkoutEnabled ? 1 : 0
    ]
  );
}

async function deletePromo(id) {
  await db.query('DELETE FROM promos WHERE id = ?', [id]);
}

async function saveCrmLead(lead) {
  await db.query(
    `INSERT INTO crm_leads (
      id, company_name, contact_name, email, phone, rut, meeting_at, next_steps, meeting_notes,
      training_done, docs_received, contract_sent, contract_signed, pipeline_stage,
      interested_services, coverage_area, source, assigned_to, notes, converted_provider_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      company_name = VALUES(company_name),
      contact_name = VALUES(contact_name),
      email = VALUES(email),
      phone = VALUES(phone),
      rut = VALUES(rut),
      meeting_at = VALUES(meeting_at),
      next_steps = VALUES(next_steps),
      meeting_notes = VALUES(meeting_notes),
      training_done = VALUES(training_done),
      docs_received = VALUES(docs_received),
      contract_sent = VALUES(contract_sent),
      contract_signed = VALUES(contract_signed),
      pipeline_stage = VALUES(pipeline_stage),
      interested_services = VALUES(interested_services),
      coverage_area = VALUES(coverage_area),
      source = VALUES(source),
      assigned_to = VALUES(assigned_to),
      notes = VALUES(notes),
      converted_provider_id = VALUES(converted_provider_id)`,
    [
      lead.id,
      lead.companyName,
      lead.contactName,
      lead.email || null,
      lead.phone || null,
      lead.rut || null,
      toMysqlDatetime(lead.meetingAt),
      lead.nextSteps || null,
      lead.meetingNotes || null,
      lead.trainingDone ? 1 : 0,
      lead.docsReceived ? 1 : 0,
      lead.contractSent ? 1 : 0,
      lead.contractSigned ? 1 : 0,
      lead.pipelineStage || 'prospecto',
      lead.interestedServices || null,
      lead.coverageArea || null,
      lead.source || null,
      lead.assignedTo || null,
      lead.notes || null,
      lead.convertedProviderId || null
    ]
  );
}

async function deleteCrmLead(id) {
  await db.query('DELETE FROM crm_leads WHERE id = ?', [id]);
}

async function savePricingConfig(config) {
  const normalized = normalizePricing(config);
  await db.query(
    `INSERT INTO pricing_config (id, config) VALUES ('default', ?)
     ON DUPLICATE KEY UPDATE config = VALUES(config)`,
    [JSON.stringify(normalized)]
  );
  return normalized;
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
    `INSERT INTO consent_records (id, user_id, ip, type, granted, version, user_agent, purpose, legal_basis, source, withdrawn_at, meta, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       granted = VALUES(granted),
       version = VALUES(version),
       purpose = VALUES(purpose),
       legal_basis = VALUES(legal_basis),
       source = VALUES(source),
       withdrawn_at = VALUES(withdrawn_at),
       meta = VALUES(meta)`,
    [
      record.id, record.userId, record.ip || null, record.type, record.granted ? 1 : 0,
      record.version, record.userAgent || null,
      record.purpose || null, record.legalBasis || null, record.source || null,
      record.withdrawnAt || null,
      record.meta ? JSON.stringify(record.meta) : null,
      record.createdAt
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

async function saveNotification(record) {
  await db.query(
    `INSERT INTO notifications (id, event, channel, status, recipient, subject, body, meta, request_id, user_id, error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE status = VALUES(status), error = VALUES(error)`,
    [
      record.id,
      record.event,
      record.channel,
      record.status,
      record.recipient || null,
      record.subject || null,
      record.body || null,
      record.meta ? JSON.stringify(record.meta) : null,
      record.requestId || null,
      record.userId || null,
      record.error || null,
      record.createdAt
    ]
  );
}

async function saveChat(chat) {
  await db.query(
    `INSERT INTO chats (id, client_name, client_phone, last_message, channel, status, unread, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       client_name = VALUES(client_name),
       client_phone = VALUES(client_phone),
       last_message = VALUES(last_message),
       channel = VALUES(channel),
       status = VALUES(status),
       unread = VALUES(unread),
       updated_at = VALUES(updated_at)`,
    [
      chat.id, chat.clientName, chat.clientPhone, chat.lastMessage,
      chat.channel, chat.status, chat.unread || 0, chat.updatedAt
    ]
  );
}

async function restoreFromSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('Snapshot inválido');
  }

  const stats = {
    users: 0,
    services: 0,
    modules: 0,
    requests: 0,
    homeLogbook: 0,
    complaints: 0,
    chats: 0,
    consents: 0,
    securityLogs: 0,
    notifications: 0,
    promos: 0,
    crmLeads: 0
  };

  for (const service of snapshot.services || []) {
    await saveService(service);
    stats.services++;
  }

  for (const mod of snapshot.modules || []) {
    await saveModule(mod);
    stats.modules++;
  }

  if (snapshot.pricing) {
    await savePricingConfig(snapshot.pricing);
  }

  for (const promo of snapshot.promos || []) {
    await savePromo(promo);
    stats.promos++;
  }

  for (const lead of snapshot.crmLeads || []) {
    await saveCrmLead(lead);
    stats.crmLeads++;
  }

  for (const user of snapshot.users || []) {
    await saveUser(user);
    stats.users++;
  }

  for (const request of snapshot.requests || []) {
    await saveRequest(request);
    stats.requests++;
  }

  for (const entry of snapshot.homeLogbook || []) {
    await saveLogbookEntry(entry);
    stats.homeLogbook++;
  }

  for (const complaint of snapshot.complaints || []) {
    await saveComplaint(complaint);
    stats.complaints++;
  }

  for (const chat of snapshot.chats || []) {
    await saveChat(chat);
    stats.chats++;
  }

  for (const record of snapshot.consentRecords || []) {
    await saveConsent(record);
    stats.consents++;
  }

  for (const log of snapshot.securityLogs || []) {
    await saveSecurityLog(log);
    stats.securityLogs++;
  }

  for (const notification of snapshot.notifications || []) {
    await saveNotification(notification);
    stats.notifications++;
  }

  return stats;
}

function persist(fn, label) {
  fn().catch((err) => {
    console.error(`Error persistiendo ${label}:`, err.message);
  });
}

module.exports = {
  SEED_SERVICES,
  SEED_MODULES,
  migrate,
  ensureDemoData,
  ensureAdminAccount,
  resetAdminPassword,
  getAdminSeedConfig,
  seedIfEmpty,
  loadAll,
  loadAllForBackup,
  saveUser,
  saveService,
  saveModule,
  saveCoverageCommune,
  saveCoverageRegion,
  savePromo,
  deletePromo,
  saveCrmLead,
  deleteCrmLead,
  savePricingConfig,
  saveRequest,
  saveLogbookEntry,
  saveComplaint,
  saveConsent,
  saveSecurityLog,
  saveNotification,
  saveChat,
  restoreFromSnapshot,
  persist,
  defaultProviderVerification,
  defaultLocationShare
};
