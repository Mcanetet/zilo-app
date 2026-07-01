const { v4: uuidv4 } = require('uuid');
const { geocodeAddress, randomSantiagoCoords } = require('../lib/geocode');

const SERVICES = [
  {
    id: 'electrico',
    name: 'Eléctrico',
    icon: 'electrico',
    color: '#F59E0B',
    visitPrice: 25000,
    basicMin: 40000,
    basicMax: 60000,
    description: 'Instalaciones, cortocircuitos, tableros y emergencias eléctricas.',
    enabled: true
  },
  {
    id: 'gasfiter',
    name: 'Gásfiter',
    icon: 'gasfiter',
    color: '#3B82F6',
    visitPrice: 25000,
    basicMin: 45000,
    basicMax: 70000,
    description: 'Fugas, cañerías, grifería y destapes en baño y cocina.',
    enabled: true
  },
  {
    id: 'cerrajero',
    name: 'Cerrajero',
    icon: 'cerrajero',
    color: '#8B5CF6',
    visitPrice: 30000,
    basicMin: 50000,
    basicMax: 90000,
    description: 'Apertura de puertas, cambio de cerraduras y copias de llaves.',
    enabled: true
  },
  {
    id: 'termos',
    name: 'Reparación de Termos',
    icon: 'termos',
    color: '#EF4444',
    visitPrice: 28000,
    basicMin: 55000,
    basicMax: 120000,
    description: 'Mantención, cambio de resistencia y reparación de termos eléctricos.',
    enabled: true
  },
  {
    id: 'lavavajillas',
    name: 'Lavavajillas',
    icon: 'lavavajillas',
    color: '#06B6D4',
    visitPrice: 25000,
    basicMin: 45000,
    basicMax: 85000,
    description: 'Reparación de bombas, fugas y programas de lavado.',
    enabled: true
  },
  {
    id: 'lavadora',
    name: 'Lavadora',
    icon: 'lavadora',
    color: '#10B981',
    visitPrice: 25000,
    basicMin: 40000,
    basicMax: 80000,
    description: 'Centrifugado, drenaje, tambor y tarjetas electrónicas.',
    enabled: true
  }
];

const USERS = [
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
    ]
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
    ]
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
    ]
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
    ]
  },
  {
    id: 'admin-1',
    email: 'admin@zilo.cl',
    password: 'admin123',
    name: 'Admin Zilo',
    role: 'admin',
    phone: '+56 9 0000 0000'
  }
];

let requests = [];
const providerSockets = new Map();

const POINTS_VALUE_CLP = 100;
const WELCOME_PROMO = 'BIENVENIDO';
const WELCOME_DISCOUNT = 0.2;

const homeLogbook = [
  {
    id: 'log-001',
    clientId: 'client-1',
    address: 'Av. Providencia 2650, Providencia, Santiago',
    serviceName: 'Gásfiter',
    category: 'gasfiter',
    date: '2025-11-15',
    note: 'Revisión de cañería bajo lavaplatos — sin fugas detectadas',
    healthImpact: 8,
    providerName: 'Pedro Gómez'
  },
  {
    id: 'log-002',
    clientId: 'client-1',
    address: 'Av. Providencia 2650, Providencia, Santiago',
    serviceName: 'Eléctrico',
    category: 'electrico',
    date: '2026-01-20',
    note: 'Instalación de luminarias LED en pasillo y verificación de tablero',
    healthImpact: 10,
    providerName: 'Marta Quiroz'
  },
  {
    id: 'log-003',
    clientId: 'client-1',
    address: 'Av. Providencia 2650, Providencia, Santiago',
    serviceName: 'Reparación de Termos',
    category: 'termos',
    date: '2026-03-08',
    note: 'Cambio de resistencia y limpieza de sedimentos',
    healthImpact: 12,
    providerName: 'Ana Rojas'
  }
];

async function createRequest({ clientId, serviceId, address, notes, coords: inputCoords, gift }) {
  const service = getServiceById(serviceId);
  const client = getUserById(clientId);
  const fullAddress = address || client.address;

  let coords;
  if (inputCoords?.lat && inputCoords?.lng) {
    coords = { lat: parseFloat(inputCoords.lat), lng: parseFloat(inputCoords.lng) };
  } else {
    const geo = await geocodeAddress(fullAddress);
    coords = { lat: geo.lat, lng: geo.lng, displayName: geo.displayName };
  }

  const isGift = Boolean(gift?.name);
  const beneficiaryName = isGift ? gift.name : client.name;
  const beneficiaryPhone = isGift ? (gift.phone || client.phone) : client.phone;

  const request = {
    id: uuidv4(),
    clientId,
    clientName: client.name,
    clientPhone: client.phone,
    beneficiaryName,
    beneficiaryPhone,
    isGift,
    giftMessage: isGift ? (gift.message || '') : null,
    serviceId,
    serviceName: service.name,
    address: fullAddress,
    notes: notes || '',
    status: 'pending_payment',
    paymentStatus: 'pending',
    paymentId: null,
    preferenceId: null,
    providerId: null,
    createdAt: new Date().toISOString(),
    basePrice: service.visitPrice,
    estimatedVisit: service.visitPrice,
    amountDue: service.visitPrice,
    discountCredits: 0,
    discountPoints: 0,
    discountPromo: 0,
    pointsUsed: 0,
    promoCode: null,
    guardianToken: uuidv4().replace(/-/g, '').slice(0, 12),
    coords
  };
  requests.unshift(request);
  return request;
}

function updateUserProfile(userId, data) {
  const user = getUserById(userId);
  if (!user) return null;
  const allowed = user.role === 'provider'
    ? ['name', 'phone', 'bio', 'email']
    : ['name', 'phone', 'address'];
  allowed.forEach(key => {
    if (data[key] !== undefined && String(data[key]).trim()) {
      user[key] = String(data[key]).trim();
    }
  });
  if (user.role === 'provider' && user.name) {
    user.avatar = user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  }
  return user;
}

function getReferralStats(userId) {
  const user = getUserById(userId);
  if (!user || user.role !== 'client') return null;
  return {
    code: user.referralCode,
    points: user.ziloPoints || 0,
    creditsCLP: user.creditsCLP || 0,
    referralsCount: user.referralsCount || 0,
    servicesCount: user.servicesCount || 0
  };
}

function applyReferralCode(userId, code) {
  const user = getUserById(userId);
  if (!user || user.role !== 'client') return { error: 'Usuario inválido' };
  if (!code) return { error: 'Código requerido' };
  if (user.usedReferral) return { error: 'Ya usaste un código de referido' };
  if (user.referralCode === code) return { error: 'No puedes usar tu propio código' };
  const referrer = USERS.find(u => u.referralCode === code && u.role === 'client');
  if (!referrer) return { error: 'Código no válido' };
  user.usedReferral = true;
  user.creditsCLP = (user.creditsCLP || 0) + 5000;
  referrer.creditsCLP = (referrer.creditsCLP || 0) + 5000;
  referrer.referralsCount = (referrer.referralsCount || 0) + 1;
  referrer.ziloPoints = (referrer.ziloPoints || 0) + 200;
  return { success: true, bonus: 5000 };
}

const PROMOS = [
  { id: 'first', title: '20% en tu 1er servicio', desc: 'Código BIENVENIDO al pagar', code: 'BIENVENIDO', color: '#B8956B' },
  { id: 'refer', title: 'Invita y gana $5.000', desc: 'Tú y tu amigo reciben crédito', code: null, color: '#8B7355' },
  { id: 'gift', title: 'Regala un servicio', desc: 'Modo Guardián para tu familia', code: null, color: '#A67C52' }
];

function getCheckoutSummary(userId, requestId) {
  const user = getUserById(userId);
  const request = requests.find(r => r.id === requestId && r.clientId === userId);
  if (!request || !user) return null;

  const basePrice = request.basePrice || request.estimatedVisit;
  const paidCount = requests.filter(r => r.clientId === userId && r.paymentStatus === 'approved').length;

  return {
    basePrice,
    creditsAvailable: user.creditsCLP || 0,
    pointsAvailable: user.ziloPoints || 0,
    pointsValueCLP: (user.ziloPoints || 0) * POINTS_VALUE_CLP,
    discountCredits: request.discountCredits || 0,
    discountPoints: request.discountPoints || 0,
    discountPromo: request.discountPromo || 0,
    pointsUsed: request.pointsUsed || 0,
    amountDue: request.amountDue ?? basePrice,
    promoCode: request.promoCode,
    canUseWelcome: !user.usedWelcomePromo && paidCount === 0
  };
}

function applyCheckoutDiscounts(userId, requestId, { useCredits, usePoints, promoCode }) {
  const user = getUserById(userId);
  const request = requests.find(r => r.id === requestId && r.clientId === userId);
  if (!request || request.paymentStatus !== 'pending') return { error: 'Solicitud no disponible para pago' };

  const basePrice = request.basePrice || request.estimatedVisit;
  let remaining = basePrice;
  let discountCredits = 0;
  let discountPoints = 0;
  let discountPromo = 0;
  let pointsUsed = 0;
  let appliedPromo = null;

  const paidCount = requests.filter(r => r.clientId === userId && r.paymentStatus === 'approved').length;
  const code = promoCode?.trim().toUpperCase();

  if (code === WELCOME_PROMO && !user.usedWelcomePromo && paidCount === 0) {
    discountPromo = Math.round(remaining * WELCOME_DISCOUNT);
    remaining -= discountPromo;
    appliedPromo = WELCOME_PROMO;
  } else if (code && code !== WELCOME_PROMO) {
    return { error: 'Código promocional no válido' };
  } else if (code === WELCOME_PROMO && (user.usedWelcomePromo || paidCount > 0)) {
    return { error: 'El código BIENVENIDO solo aplica en tu primer servicio' };
  }

  if (useCredits && (user.creditsCLP || 0) > 0 && remaining > 0) {
    discountCredits = Math.min(user.creditsCLP, remaining);
    remaining -= discountCredits;
  }

  if (usePoints && (user.ziloPoints || 0) > 0 && remaining > 0) {
    const maxFromPoints = Math.min(user.ziloPoints * POINTS_VALUE_CLP, remaining);
    pointsUsed = Math.ceil(maxFromPoints / POINTS_VALUE_CLP);
    discountPoints = pointsUsed * POINTS_VALUE_CLP;
    remaining -= discountPoints;
  }

  request.basePrice = basePrice;
  request.discountCredits = discountCredits;
  request.discountPoints = discountPoints;
  request.discountPromo = discountPromo;
  request.pointsUsed = pointsUsed;
  request.promoCode = appliedPromo;
  request.amountDue = Math.max(0, remaining);
  request.estimatedVisit = request.amountDue;

  return { success: true, summary: getCheckoutSummary(userId, requestId) };
}

function commitCheckoutDiscounts(userId, requestId) {
  const user = getUserById(userId);
  const request = requests.find(r => r.id === requestId && r.clientId === userId);
  if (!user || !request || request.discountsCommitted) return;

  request.discountsCommitted = true;
  if (request.discountCredits > 0) {
    user.creditsCLP = Math.max(0, (user.creditsCLP || 0) - request.discountCredits);
  }
  if (request.pointsUsed > 0) {
    user.ziloPoints = Math.max(0, (user.ziloPoints || 0) - request.pointsUsed);
  }
  if (request.promoCode === WELCOME_PROMO) {
    user.usedWelcomePromo = true;
  }
  user.servicesCount = (user.servicesCount || 0) + 1;
  user.ziloPoints = (user.ziloPoints || 0) + 50;
}

function getRequestByGuardianToken(token) {
  return requests.find(r => r.guardianToken === token);
}

function getHomePassport(clientId) {
  const user = getUserById(clientId);
  if (!user || user.role !== 'client') return null;

  const address = user.address || 'Sin dirección registrada';
  const entries = [
    ...homeLogbook.filter(e => e.clientId === clientId),
    ...requests
      .filter(r => r.clientId === clientId && r.status === 'completed')
      .map(r => ({
        id: r.id,
        clientId: r.clientId,
        address: r.address,
        serviceName: r.serviceName,
        category: r.serviceId,
        date: r.completedAt || r.createdAt,
        note: r.notes || `Servicio ${r.serviceName} completado`,
        healthImpact: 8,
        providerName: r.providerId ? getUserById(r.providerId)?.name : 'Técnico Zilo'
      }))
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  let healthScore = 42;
  entries.slice(0, 8).forEach(e => { healthScore += e.healthImpact || 5; });
  healthScore = Math.min(100, healthScore);

  const level = healthScore >= 85 ? 'Excelente'
    : healthScore >= 70 ? 'Muy bueno'
    : healthScore >= 55 ? 'Regular'
    : 'Necesita atención';

  const monthsSinceLast = entries.length
    ? Math.floor((Date.now() - new Date(entries[0].date)) / (1000 * 60 * 60 * 24 * 30))
    : null;

  return {
    address,
    healthScore,
    level,
    entries,
    monthsSinceLast,
    recommendation: healthScore < 70
      ? 'Te recomendamos una revisión preventiva de instalaciones este trimestre.'
      : 'Tu hogar está bien mantenido. Sigue registrando cada servicio en tu Pasaporte.'
  };
}

function addLogbookEntryFromRequest(request) {
  if (!request || request.status !== 'completed') return;
  const exists = homeLogbook.some(e => e.id === request.id);
  if (exists) return;

  homeLogbook.unshift({
    id: request.id,
    clientId: request.clientId,
    address: request.address,
    serviceName: request.serviceName,
    category: request.serviceId,
    date: request.completedAt || new Date().toISOString(),
    note: request.notes || `Mantenimiento ${request.serviceName}`,
    healthImpact: 10,
    providerName: request.providerId ? getUserById(request.providerId)?.name : 'Técnico Zilo'
  });
}

function setPaymentPreference(requestId, preferenceId) {
  const request = requests.find(r => r.id === requestId);
  if (request) request.preferenceId = preferenceId;
  return request;
}

function markPaymentApproved(requestId, paymentId) {
  const request = requests.find(r => r.id === requestId);
  if (!request) return null;
  if (request.paymentStatus === 'approved') return request;
  request.paymentStatus = 'approved';
  request.paymentId = paymentId;
  request.paidAt = new Date().toISOString();
  commitCheckoutDiscounts(request.clientId, requestId);
  return request;
}

function activateRequest(requestId) {
  const request = requests.find(r => r.id === requestId);
  if (!request) return null;
  request.status = 'searching';
  return request;
}

function formatCLP(amount) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0
  }).format(amount);
}

function getServiceById(id) {
  return SERVICES.find(s => s.id === id);
}

function getActiveServices() {
  return SERVICES.filter(s => s.enabled);
}

function toggleService(serviceId, enabled) {
  const service = getServiceById(serviceId);
  if (!service) return null;
  service.enabled = enabled;
  return service;
}

function getUserById(id) {
  const user = USERS.find(u => u.id === id);
  if (user?.role === 'provider') ensureProviderFields(user);
  return user;
}

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

function ensureProviderFields(provider) {
  if (!provider.verification) provider.verification = defaultProviderVerification();
  if (!provider.locationShare) provider.locationShare = defaultLocationShare();
  provider.verification.status = computeVerificationStatus(provider);
  return provider;
}

function computeVerificationStatus(provider) {
  const v = provider.verification;
  if (v.idCardFront && v.idCardBack && v.faceVerified && provider.locationShare?.consent) {
    return 'verified';
  }
  if (v.idCardFront || v.idCardBack || v.selfie || v.certificates?.length) {
    return 'pending';
  }
  return 'incomplete';
}

function canProviderGoOnline(provider) {
  ensureProviderFields(provider);
  const v = provider.verification;
  const missing = [];
  if (!provider.phone?.trim()) missing.push('teléfono');
  if (!provider.email?.trim()) missing.push('correo electrónico');
  if (!v.idCardFront) missing.push('carnet (frente)');
  if (!v.idCardBack) missing.push('carnet (reverso)');
  if (!v.faceVerified) missing.push('verificación facial');
  if (!provider.locationShare.consent) missing.push('permiso de ubicación');
  return { ok: missing.length === 0, missing };
}

function getPublicProviderProfile(provider) {
  if (!provider) return null;
  ensureProviderFields(provider);
  const v = provider.verification;
  const badges = [];
  if (v.faceVerified) badges.push({ id: 'face', label: 'Identidad verificada' });
  if (v.idCardFront && v.idCardBack) badges.push({ id: 'id', label: 'Cédula validada' });
  if (v.certificates?.length) badges.push({ id: 'cert', label: `${v.certificates.length} certificado(s)` });
  if (provider.phone?.trim()) badges.push({ id: 'phone', label: 'Teléfono verificado' });
  if (provider.email?.trim()) badges.push({ id: 'email', label: 'Correo verificado' });

  const loc = provider.locationShare;
  return {
    id: provider.id,
    name: provider.name,
    phone: provider.phone,
    email: provider.email,
    rating: provider.rating,
    reviewsCount: provider.reviewsCount,
    bio: provider.bio,
    avatar: provider.avatar,
    reviews: provider.reviews || [],
    verification: {
      status: v.status,
      faceVerified: v.faceVerified,
      faceScore: v.faceScore,
      hasId: Boolean(v.idCardFront && v.idCardBack),
      certificatesCount: v.certificates?.length || 0,
      badges
    },
    location: loc.consent && loc.lat != null ? {
      lat: loc.lat,
      lng: loc.lng,
      updatedAt: loc.updatedAt
    } : null
  };
}

function saveProviderDocument(providerId, type, url, label) {
  const provider = getUserById(providerId);
  if (!provider) return null;
  ensureProviderFields(provider);
  if (type === 'idFront') provider.verification.idCardFront = url;
  else if (type === 'idBack') provider.verification.idCardBack = url;
  else if (type === 'certificate') {
    provider.verification.certificates.push({ url, label: label || 'Certificado', uploadedAt: new Date().toISOString() });
  }
  provider.verification.submittedAt = new Date().toISOString();
  provider.verification.status = computeVerificationStatus(provider);
  return provider.verification;
}

function saveProviderSelfie(providerId, url, faceResult) {
  const provider = getUserById(providerId);
  if (!provider) return null;
  ensureProviderFields(provider);
  provider.verification.selfie = url;
  provider.verification.faceVerified = faceResult.success;
  provider.verification.faceScore = faceResult.score || null;
  provider.verification.faceVerifiedAt = faceResult.success ? new Date().toISOString() : null;
  provider.verification.status = computeVerificationStatus(provider);
  return provider.verification;
}

function setLocationConsent(providerId, consent) {
  const provider = getUserById(providerId);
  if (!provider) return null;
  ensureProviderFields(provider);
  provider.locationShare.consent = Boolean(consent);
  provider.locationShare.consentAt = consent ? new Date().toISOString() : null;
  if (!consent) {
    provider.locationShare.lat = null;
    provider.locationShare.lng = null;
    provider.locationShare.updatedAt = null;
  }
  provider.verification.status = computeVerificationStatus(provider);
  return provider.locationShare;
}

function updateProviderLocation(providerId, lat, lng) {
  const provider = getUserById(providerId);
  if (!provider || !provider.locationShare?.consent) return null;
  provider.locationShare.lat = parseFloat(lat);
  provider.locationShare.lng = parseFloat(lng);
  provider.locationShare.updatedAt = new Date().toISOString();
  return provider.locationShare;
}

function getUserByEmail(email) {
  return USERS.find(u => u.email === email);
}

function getOnlineProviders(serviceId) {
  return USERS.filter(
    u => u.role === 'provider' && u.online && u.specialties.includes(serviceId)
  );
}

function assignProvider(requestId, providerId) {
  const request = requests.find(r => r.id === requestId);
  if (!request) return null;
  request.providerId = providerId;
  request.status = 'assigned';
  request.assignedAt = new Date().toISOString();
  return request;
}

function updateRequestStatus(requestId, status) {
  const request = requests.find(r => r.id === requestId);
  if (!request) return null;
  request.status = status;
  if (status === 'completed') {
    request.completedAt = new Date().toISOString();
    request.payoutStatus = request.payoutStatus || 'pendiente';
    addLogbookEntryFromRequest(request);
  }
  return request;
}

function setProviderOnline(providerId, online) {
  const provider = getUserById(providerId);
  if (provider && provider.role === 'provider') {
    provider.online = online;
    return provider;
  }
  return null;
}

function getRequestsByClient(clientId) {
  return requests.filter(r => r.clientId === clientId);
}

function getRequestsByProvider(providerId) {
  return requests.filter(r => r.providerId === providerId);
}

function getAllRequests() {
  return requests;
}

function getPendingRequestsForProvider(providerId) {
  const provider = getUserById(providerId);
  if (!provider) return [];
  return requests.filter(
    r => r.status === 'searching' && provider.specialties.includes(r.serviceId)
  );
}

const COMPLAINTS = [
  {
    id: 'rec-001',
    requestId: null,
    clientName: 'Jorge Muñoz',
    clientEmail: 'jorge@email.cl',
    type: 'calidad',
    subject: 'Trabajo incompleto en instalación eléctrica',
    description: 'El técnico se fue sin terminar el empalme del tablero.',
    status: 'abierto',
    priority: 'alta',
    createdAt: '2026-06-28T14:30:00.000Z'
  },
  {
    id: 'rec-002',
    requestId: null,
    clientName: 'Carolina Díaz',
    clientEmail: 'carolina@email.cl',
    type: 'cobro',
    subject: 'Cobro diferente al presupuesto',
    description: 'Me cobraron $20.000 más de lo acordado en la visita.',
    status: 'en_revision',
    priority: 'media',
    createdAt: '2026-06-27T09:15:00.000Z'
  },
  {
    id: 'rec-003',
    requestId: null,
    clientName: 'Andrés Vega',
    clientEmail: 'andres@email.cl',
    type: 'demora',
    subject: 'Proveedor no llegó en el tiempo estimado',
    description: 'Esperé más de 2 horas y nadie llegó.',
    status: 'resuelto',
    priority: 'baja',
    createdAt: '2026-06-25T18:00:00.000Z',
    resolvedAt: '2026-06-26T10:00:00.000Z'
  }
];

const CHATS = [
  {
    id: 'chat-001',
    clientName: 'María González',
    clientPhone: '+56 9 8765 4321',
    lastMessage: '¿A qué hora llega el técnico?',
    channel: 'whatsapp',
    status: 'activo',
    unread: 2,
    updatedAt: '2026-06-30T18:00:00.000Z'
  },
  {
    id: 'chat-002',
    clientName: 'Roberto Soto',
    clientPhone: '+56 9 5555 1234',
    lastMessage: 'Necesito factura del servicio',
    channel: 'whatsapp',
    status: 'activo',
    unread: 0,
    updatedAt: '2026-06-30T15:30:00.000Z'
  },
  {
    id: 'chat-003',
    clientName: 'Valentina Ríos',
    clientPhone: '+56 9 7777 8899',
    lastMessage: 'Gracias, todo resuelto',
    channel: 'whatsapp',
    status: 'cerrado',
    unread: 0,
    updatedAt: '2026-06-29T11:00:00.000Z'
  }
];

let consentRecords = [
  { id: 'c-1', userId: 'client-1', type: 'privacidad', granted: true, version: '1.0', createdAt: '2026-06-01T10:00:00.000Z' },
  { id: 'c-2', userId: 'client-1', type: 'cookies', granted: true, version: '1.0', createdAt: '2026-06-01T10:00:00.000Z' },
  { id: 'c-3', userId: null, type: 'cookies', granted: true, version: '1.0', createdAt: '2026-06-15T08:00:00.000Z', ip: '192.168.1.1' }
];

let securityLogs = [
  { id: 'sec-1', event: 'login_ok', user: 'admin@zilo.cl', ip: '10.0.0.1', createdAt: '2026-06-30T08:00:00.000Z' },
  { id: 'sec-2', event: 'login_ok', user: 'cliente@zilo.cl', ip: '10.0.0.2', createdAt: '2026-06-30T09:30:00.000Z' },
  { id: 'sec-3', event: 'pago_demo', detail: 'Pago simulado aprobado', ip: '10.0.0.2', createdAt: '2026-06-30T10:00:00.000Z' }
];

function recordConsent({ userId, ip, type, granted, version, userAgent }) {
  const record = {
    id: `c-${Date.now()}`,
    userId,
    ip,
    type,
    granted,
    version,
    userAgent: userAgent?.slice(0, 120),
    createdAt: new Date().toISOString()
  };
  consentRecords.unshift(record);
  return record;
}

function getConsentsSummary() {
  const total = consentRecords.length;
  const granted = consentRecords.filter(c => c.granted).length;
  return { total, granted, rate: total ? Math.round((granted / total) * 100) : 0 };
}

function logSecurityEvent(event, detail, req) {
  securityLogs.unshift({
    id: `sec-${Date.now()}`,
    event,
    detail: detail || null,
    user: req?.session?.user?.email || null,
    ip: req?.ip || null,
    createdAt: new Date().toISOString()
  });
  if (securityLogs.length > 200) securityLogs.pop();
}

function getPayments() {
  return requests
    .filter(r => r.paymentStatus === 'approved')
    .map(r => {
      const commission = Math.round(r.estimatedVisit * 0.15);
      const providerPayout = r.estimatedVisit - commission;
      const provider = r.providerId ? getUserById(r.providerId) : null;
      return {
        id: r.id,
        clientName: r.clientName,
        serviceName: r.serviceName,
        amount: r.estimatedVisit,
        commission,
        providerPayout,
        providerName: provider?.name || '—',
        paymentId: r.paymentId,
        paidAt: r.paidAt,
        status: r.status,
        payoutStatus: r.status === 'completed' ? (r.payoutStatus || 'pendiente') : 'n/a'
      };
    });
}

function getProviderPayouts() {
  const payouts = {};
  USERS.filter(u => u.role === 'provider').forEach(p => {
    payouts[p.id] = { provider: p, completed: 0, pending: 0, paid: 0, jobs: 0 };
  });

  getPayments().forEach(pay => {
    const req = requests.find(r => r.id === pay.id);
    if (!req?.providerId || !payouts[req.providerId]) return;
    const bucket = payouts[req.providerId];
    bucket.jobs++;
    if (req.status === 'completed') {
      if (req.payoutStatus === 'pagado') bucket.paid += pay.providerPayout;
      else bucket.pending += pay.providerPayout;
      bucket.completed++;
    }
  });

  return Object.values(payouts);
}

function updateComplaintStatus(id, status) {
  const c = COMPLAINTS.find(x => x.id === id);
  if (!c) return null;
  c.status = status;
  if (status === 'resuelto') c.resolvedAt = new Date().toISOString();
  return c;
}

function markPayoutPaid(requestId) {
  const req = requests.find(r => r.id === requestId);
  if (!req) return null;
  req.payoutStatus = 'pagado';
  req.payoutPaidAt = new Date().toISOString();
  return req;
}

function getAdminStats() {
  const payments = getPayments();
  const totalRevenue = payments.reduce((s, p) => s + p.amount, 0);
  const totalCommission = payments.reduce((s, p) => s + p.commission, 0);
  const payouts = getProviderPayouts();
  const owedToProviders = payouts.reduce((s, p) => s + p.pending, 0);

  return {
    totalRevenue,
    totalCommission,
    owedToProviders,
    openComplaints: COMPLAINTS.filter(c => c.status !== 'resuelto').length,
    activeChats: CHATS.filter(c => c.status === 'activo').length,
    unreadChats: CHATS.reduce((s, c) => s + c.unread, 0),
    consentRate: getConsentsSummary().rate
  };
}

function needsOnboarding(user) {
  return user && user.onboardingCompleted !== true;
}

function completeOnboarding(userId) {
  const user = getUserById(userId);
  if (!user) return null;
  user.onboardingCompleted = true;
  user.onboardingCompletedAt = new Date().toISOString();
  return user;
}

function exportDataSnapshot({ includeSecurityLogs = true } = {}) {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    app: 'zilo',
    services: JSON.parse(JSON.stringify(SERVICES)),
    users: JSON.parse(JSON.stringify(USERS)),
    requests: JSON.parse(JSON.stringify(requests)),
    homeLogbook: JSON.parse(JSON.stringify(homeLogbook)),
    complaints: JSON.parse(JSON.stringify(COMPLAINTS)),
    chats: JSON.parse(JSON.stringify(CHATS)),
    consentRecords: JSON.parse(JSON.stringify(consentRecords)),
    securityLogs: includeSecurityLogs ? JSON.parse(JSON.stringify(securityLogs)) : [],
    promos: JSON.parse(JSON.stringify(PROMOS))
  };
}

module.exports = {
  SERVICES,
  USERS,
  formatCLP,
  getServiceById,
  getActiveServices,
  toggleService,
  getUserByEmail,
  getUserById,
  getOnlineProviders,
  createRequest,
  setPaymentPreference,
  markPaymentApproved,
  activateRequest,
  assignProvider,
  updateRequestStatus,
  setProviderOnline,
  getRequestsByClient,
  getRequestsByProvider,
  getAllRequests,
  getPendingRequestsForProvider,
  providerSockets,
  COMPLAINTS,
  CHATS,
  getPayments,
  getProviderPayouts,
  getAdminStats,
  getConsentsSummary,
  recordConsent,
  get consentRecords() { return consentRecords; },
  get securityLogs() { return securityLogs; },
  logSecurityEvent,
  updateComplaintStatus,
  markPayoutPaid,
  updateUserProfile,
  getReferralStats,
  applyReferralCode,
  PROMOS,
  POINTS_VALUE_CLP,
  getCheckoutSummary,
  applyCheckoutDiscounts,
  getRequestByGuardianToken,
  getHomePassport,
  ensureProviderFields,
  canProviderGoOnline,
  getPublicProviderProfile,
  saveProviderDocument,
  saveProviderSelfie,
  setLocationConsent,
  updateProviderLocation,
  computeVerificationStatus,
  exportDataSnapshot,
  needsOnboarding,
  completeOnboarding,
  get requests() { return requests; }
};

(function initDemoVerifiedProvider() {
  const pedro = USERS.find(u => u.id === 'provider-pedro');
  if (!pedro) return;
  ensureProviderFields(pedro);
  pedro.verification.idCardFront = 'demo';
  pedro.verification.idCardBack = 'demo';
  pedro.verification.faceVerified = true;
  pedro.verification.faceScore = 94;
  pedro.verification.faceVerifiedAt = '2025-10-01T12:00:00.000Z';
  pedro.locationShare.consent = true;
  pedro.locationShare.consentAt = '2025-10-01T12:00:00.000Z';
  pedro.locationShare.lat = -33.442;
  pedro.locationShare.lng = -70.654;
  pedro.locationShare.updatedAt = new Date().toISOString();
  pedro.verification.status = computeVerificationStatus(pedro);
})();
