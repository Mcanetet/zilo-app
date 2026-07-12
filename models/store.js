const { v4: uuidv4 } = require('uuid');
const { geocodeAddress } = require('../lib/geocode');
const db = require('../lib/db');
const repository = require('./repository');
const { getAppVersionInfo } = require('../lib/version');
const { t: translate } = require('../lib/i18n');
const { verifyPassword, hashPassword } = require('../lib/password');
const {
  generateSecret,
  buildOtpauthUrl,
  verifyToken,
  normalizeMfa
} = require('../lib/mfa');
const {
  DEFAULT_PRICING,
  normalizePricing,
  getActiveUrgencyTiers,
  calculateVisitPricing,
  calculatePaymentSurcharge,
  computeRequestFinancials
} = require('../lib/pricing');
const {
  defaultProviderContract,
  normalizeProviderContract,
  validateContractSubmission,
  computeContractStatus,
  isContractOperational,
  getContractSummary,
  buildApprovedContract,
  getDocumentsForEntity,
  DOCUMENT_CATALOG,
  LEGAL_DECLARATIONS,
  CONTRACT_CLAUSES,
  ENTITY_TYPES,
  TEMPLATE_VERSION
} = require('../lib/contracts');
const {
  normalizeAdminAccess,
  resolveAdminAccess,
  PROFILES,
  getProfilesList,
  getPermissionGroups
} = require('../lib/adminPermissions');
const { checkAddressCoverage, groupCoverageForAdmin, formatCoverageMessage } = require('../lib/coverage');
const { getCommuneKey } = require('../lib/chile-geo');
const {
  POLICY_VERSION,
  CONSENT_DEFINITIONS,
  validateRegistrationConsents,
  getRegistrationConsentPayload
} = require('../lib/consent-policy');
const emailVerification = require('../lib/emailVerification');

let SERVICES = [];
let MODULES = [];
let PRICING_CONFIG = null;
let USERS = [];
let requests = [];
let homeLogbook = [];
let COMPLAINTS = [];
let CHATS = [];
let consentRecords = [];
let securityLogs = [];
let notifications = [];
let PROMOS = [];
let COVERAGE_COMMUNES = [];
let COVERAGE_REGIONS = [];
let coverageMap = new Map();
let initialized = false;

function afterEvent(run) {
  setImmediate(() => {
    try {
      run(require('../lib/events'));
    } catch (err) {
      console.error('[events]', err.message);
    }
  });
}

const providerSockets = new Map();
const technicianSockets = new Map();

const POINTS_VALUE_CLP = 100;
const WELCOME_PROMO = 'BIENVENIDO';
const WELCOME_DISCOUNT = 0.2;

async function init() {
  if (initialized) return;
  if (!db.isConfigured()) {
    throw new Error('Faltan DB_HOST, DB_USER, DB_PASSWORD y DB_NAME en las variables de entorno');
  }

  await repository.migrate();
  await repository.ensureDemoData();
  await require('../lib/backup').hydrateFromDatabase();
  const data = await repository.loadAll();

  SERVICES = data.services;
  MODULES = data.modules;
  PRICING_CONFIG = data.pricing || normalizePricing(DEFAULT_PRICING);
  USERS = data.users;
  requests = data.requests;
  homeLogbook = data.homeLogbook;
  COMPLAINTS = data.complaints;
  CHATS = data.chats;
  consentRecords = data.consentRecords;
  securityLogs = data.securityLogs;
  notifications = data.notifications || [];
  PROMOS = data.promos || [];
  COVERAGE_COMMUNES = data.coverageCommunes || [];
  COVERAGE_REGIONS = data.coverageRegions || [];
  rebuildCoverageMap();
  initialized = true;
  const events = require('../lib/events');
  events.init(module.exports);
  require('../lib/notifications').bindStore(module.exports);
  console.log(`📦 Datos cargados desde MySQL (${USERS.length} usuarios, ${requests.length} solicitudes)`);
}

function isReady() {
  return initialized;
}

function ensureReady() {
  if (!initialized) {
    throw new Error('Store no inicializado. Llama a store.init() antes de arrancar el servidor.');
  }
}

async function createRequest({ clientId, serviceId, address, notes, coords: inputCoords, gift, clientPhotoUrl, urgencyTier }) {
  const service = getServiceById(serviceId);
  const client = getUserById(clientId);
  const fullAddress = address || client.address;
  const pricing = getPricingConfig();
  const visitCalc = calculateVisitPricing(pricing, urgencyTier);
  if (!visitCalc) return Promise.reject(new Error('Opción de urgencia no válida'));

  let coords;
  let geoMeta = null;
  const geo = await geocodeAddress(fullAddress);
  if (inputCoords?.lat && inputCoords?.lng) {
    coords = { lat: parseFloat(inputCoords.lat), lng: parseFloat(inputCoords.lng) };
  } else {
    coords = { lat: geo.lat, lng: geo.lng, displayName: geo.displayName };
  }

  const coverage = checkAddressCoverage({
    address: fullAddress,
    displayName: geo.displayName,
    nominatimAddress: geo.address
  }, coverageMap);
  geoMeta = coverage;
  if (!coverage.covered) {
    return Promise.reject(new Error(formatCoverageMessage(coverage)));
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
    urgencyTier: visitCalc.tier.id,
    urgencyTierLabel: visitCalc.tier.label,
    urgencyAdjustmentPercent: visitCalc.adjustmentPercent,
    urgencyAdjustmentAmount: visitCalc.adjustmentAmount,
    visitBasePrice: visitCalc.baseVisit,
    visitTotal: visitCalc.visitTotal,
    servicePriceBase: visitCalc.servicePrice,
    basePrice: visitCalc.visitTotal,
    estimatedVisit: visitCalc.visitTotal,
    amountDue: visitCalc.visitTotal,
    discountCredits: 0,
    discountPoints: 0,
    discountPromo: 0,
    pointsUsed: 0,
    promoCode: null,
    clientPhotoUrl: clientPhotoUrl || null,
    billingSnapshot: createBillingSnapshot(client.billing) || null,
    paymentMethod: null,
    paymentSurchargePercent: 0,
    paymentSurchargeAmount: 0,
    guardianToken: uuidv4().replace(/-/g, '').slice(0, 12),
    coords,
    regionCode: geoMeta?.regionCode || null,
    regionName: geoMeta?.regionName || null,
    communeCode: geoMeta?.communeCode || null,
    communeName: geoMeta?.communeName || null
  };
  requests.unshift(request);
  repository.persist(() => repository.saveRequest(request), `solicitud ${request.id}`);
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
  repository.persist(() => repository.saveUser(user), `usuario ${user.id}`);
  return user;
}

function isBillingComplete(user) {
  if (!user || user.role !== 'client') return false;
  return validateBilling(user.billing || {}).ok;
}

function updateUserBilling(userId, data) {
  const user = getUserById(userId);
  if (!user || user.role !== 'client') return { error: 'Usuario no encontrado' };
  const result = validateBilling(data);
  if (!result.ok) return { error: result.errors[0] };
  user.billing = result.billing;
  repository.persist(() => repository.saveUser(user), `facturación ${user.id}`);
  return { success: true, billing: user.billing };
}

function setRequestBillingSnapshot(requestId, userId, billingData) {
  const request = requests.find(r => r.id === requestId && r.clientId === userId);
  if (!request) return { error: 'Solicitud no encontrada' };
  const snapshot = billingData ? createBillingSnapshot(billingData) : createBillingSnapshot(getUserById(userId)?.billing);
  if (!snapshot) return { error: 'Completa los datos de facturación' };
  request.billingSnapshot = snapshot;
  repository.persist(() => repository.saveRequest(request), `facturación solicitud ${requestId}`);
  return { success: true, billingSnapshot: snapshot };
}

function applyPaymentMethodToRequest(request, paymentMethod) {
  const pricing = getPricingConfig();
  const visitSubtotal = request.visitTotal ?? request.basePrice ?? pricing.visitPrice;
  const surcharge = calculatePaymentSurcharge(pricing, visitSubtotal, paymentMethod);
  request.paymentMethod = surcharge.method;
  request.paymentSurchargePercent = surcharge.percent;
  request.paymentSurchargeAmount = surcharge.amount;
  request.basePrice = surcharge.subtotal;
  return request;
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
  repository.persist(() => repository.saveUser(user), `usuario ${user.id}`);
  repository.persist(() => repository.saveUser(referrer), `usuario ${referrer.id}`);
  return { success: true, bonus: 5000 };
}

function getActivePromos() {
  return PROMOS.filter((p) => p.enabled !== false);
}

function getCheckoutSummary(userId, requestId) {
  const user = getUserById(userId);
  const request = requests.find(r => r.id === requestId && r.clientId === userId);
  if (!request || !user) return null;

  const pricing = getPricingConfig();
  const visitSubtotal = request.visitTotal ?? request.visitBasePrice ?? request.basePrice;
  const basePrice = request.basePrice ?? visitSubtotal;
  const paidCount = requests.filter(r => r.clientId === userId && r.paymentStatus === 'approved').length;

  return {
    visitSubtotal,
    basePrice,
    visitBasePrice: request.visitBasePrice ?? visitSubtotal,
    urgencyAdjustmentAmount: request.urgencyAdjustmentAmount || 0,
    urgencyTierLabel: request.urgencyTierLabel || null,
    paymentMethod: request.paymentMethod || 'card',
    paymentSurchargePercent: request.paymentSurchargePercent || 0,
    paymentSurchargeAmount: request.paymentSurchargeAmount || 0,
    cardSurchargePercent: pricing.cardSurchargePercent,
    cardEnabled: pricing.cardEnabled,
    transferEnabled: pricing.transferEnabled,
    bankTransfer: pricing.bankTransfer,
    servicePriceBase: request.servicePriceBase ?? pricing.servicePrice,
    billingComplete: Boolean(request.billingSnapshot) || isBillingComplete(user),
    billingSnapshot: request.billingSnapshot || null,
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

function applyCheckoutDiscounts(userId, requestId, { useCredits, usePoints, promoCode, paymentMethod }) {
  const user = getUserById(userId);
  const request = requests.find(r => r.id === requestId && r.clientId === userId);
  if (!request || !['pending', 'pending_transfer'].includes(request.paymentStatus)) {
    return { error: 'Solicitud no disponible para pago' };
  }

  const pricing = getPricingConfig();
  const method = paymentMethod || request.paymentMethod || 'card';
  if (method === 'card' && !pricing.cardEnabled) {
    return { error: 'El pago con tarjeta no está disponible' };
  }
  if (method === 'transfer' && !pricing.transferEnabled) {
    return { error: 'La transferencia bancaria no está disponible' };
  }

  applyPaymentMethodToRequest(request, method);

  const basePrice = request.basePrice;
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
  repository.persist(() => repository.saveRequest(request), `solicitud ${requestId}`);

  return { success: true, summary: getCheckoutSummary(userId, requestId) };
}

function submitTransferPayment(requestId, userId) {
  const request = requests.find(r => r.id === requestId && r.clientId === userId);
  if (!request) return { error: 'Solicitud no encontrada' };
  if (request.paymentMethod !== 'transfer') return { error: 'Esta solicitud no usa transferencia' };
  if (!request.billingSnapshot) return { error: 'Faltan datos de facturación' };
  request.paymentStatus = 'pending_transfer';
  request.transferSubmittedAt = new Date().toISOString();
  repository.persist(() => repository.saveRequest(request), `transferencia ${requestId}`);
  afterEvent((ev) => ev.onTransferPending(request));
  return { success: true, request };
}

function approveTransferPayment(requestId) {
  const request = requests.find(r => r.id === requestId);
  if (!request) return null;
  if (request.paymentStatus !== 'pending_transfer') return null;
  markPaymentApproved(requestId, `transfer-${Date.now()}`);
  activateRequest(requestId);
  return request;
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
  repository.persist(() => repository.saveUser(user), `usuario ${user.id}`);
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
        providerName: r.providerId ? getUserById(r.providerId)?.name : 'Técnico Fundez'
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

  const entry = {
    id: request.id,
    clientId: request.clientId,
    address: request.address,
    serviceName: request.serviceName,
    category: request.serviceId,
    date: (request.completedAt || new Date().toISOString()).slice(0, 10),
    note: request.notes || `Mantenimiento ${request.serviceName}`,
    healthImpact: 10,
    providerName: request.providerId ? getUserById(request.providerId)?.name : 'Técnico Fundez'
  };
  homeLogbook.unshift(entry);
  repository.persist(() => repository.saveLogbookEntry(entry), `logbook ${entry.id}`);
}

function setPaymentPreference(requestId, preferenceId) {
  const request = requests.find(r => r.id === requestId);
  if (request) {
    request.preferenceId = preferenceId;
    repository.persist(() => repository.saveRequest(request), `solicitud ${requestId}`);
  }
  return request;
}

function setCardPaymentSession(requestId, { gateway, token, paymentUrl, preferenceId, buyOrder, paypalOrderId }) {
  const request = requests.find(r => r.id === requestId);
  if (!request) return null;
  request.paymentGateway = gateway || null;
  request.transbankToken = token || null;
  request.paymentUrl = paymentUrl || null;
  request.transbankBuyOrder = buyOrder || null;
  request.paypalOrderId = paypalOrderId || null;
  if (preferenceId) request.preferenceId = preferenceId;
  repository.persist(() => repository.saveRequest(request), `pago ${requestId}`);
  return request;
}

function markPaymentApproved(requestId, paymentId) {
  const request = requests.find(r => r.id === requestId);
  if (!request) return null;
  if (request.paymentStatus === 'approved') return request;
  request.paymentStatus = 'approved';
  request.paymentId = paymentId;
  request.paidAt = new Date().toISOString();
  request.visitPricePaid = request.amountDue ?? request.visitTotal ?? request.basePrice;
  commitCheckoutDiscounts(request.clientId, requestId);
  repository.persist(() => repository.saveRequest(request), `solicitud ${requestId}`);
  afterEvent((ev) => ev.onPaymentApproved(request));
  return request;
}

function activateRequest(requestId) {
  const request = requests.find(r => r.id === requestId);
  if (!request) return null;
  request.status = 'searching';
  repository.persist(() => repository.saveRequest(request), `solicitud ${requestId}`);
  afterEvent((ev) => ev.onServiceSearching(request));
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

function getLandingServices() {
  const active = getActiveServices();
  if (active.length) return active;
  const { SEED_SERVICES } = require('./repository');
  return SEED_SERVICES.filter(s => s.enabled);
}

function toggleService(serviceId, enabled) {
  const service = getServiceById(serviceId);
  if (!service) return null;
  service.enabled = enabled;
  repository.persist(() => repository.saveService(service), `servicio ${serviceId}`);
  return service;
}

function getModuleById(id) {
  return MODULES.find(m => m.id === id);
}

function isModuleEnabled(id) {
  const mod = getModuleById(id);
  return mod ? mod.enabled !== false : true;
}

function getModules() {
  return MODULES;
}

function getModulesByAudience(audience) {
  return MODULES.filter(m => m.audience === audience).sort((a, b) => a.sortOrder - b.sortOrder);
}

function getEnabledModules(audience) {
  return getModulesByAudience(audience).filter(m => m.enabled);
}

function toggleModule(moduleId, enabled) {
  const mod = getModuleById(moduleId);
  if (!mod) return null;
  mod.enabled = enabled;
  repository.persist(() => repository.saveModule(mod), `módulo ${moduleId}`);
  return mod;
}

function rebuildCoverageMap() {
  const regionEnabled = new Map(COVERAGE_REGIONS.map((r) => [r.regionCode, r.enabled]));
  coverageMap = new Map(
    COVERAGE_COMMUNES.map((row) => {
      const enriched = {
        ...row,
        regionEnabled: regionEnabled.get(row.regionCode) ?? false
      };
      return [getCommuneKey(row.regionCode, row.communeCode), enriched];
    })
  );
}

function getCoverageRegions() {
  return COVERAGE_REGIONS;
}

function getCoverageCommunes() {
  return COVERAGE_COMMUNES;
}

function getCoverageMap() {
  return coverageMap;
}

function getCoverageForAdmin() {
  return groupCoverageForAdmin(COVERAGE_REGIONS, COVERAGE_COMMUNES);
}

function getCoverageStats() {
  const regionsActive = COVERAGE_REGIONS.filter((r) => r.enabled).length;
  const communesOperational = COVERAGE_COMMUNES.filter((row) => {
    const mapRow = coverageMap.get(getCommuneKey(row.regionCode, row.communeCode));
    return mapRow && mapRow.regionEnabled && mapRow.enabled;
  }).length;
  return {
    enabled: communesOperational,
    total: COVERAGE_COMMUNES.length,
    regionsActive,
    regionsTotal: COVERAGE_REGIONS.length
  };
}

function toggleCoverageCommune(regionCode, communeCode, enabled) {
  const region = COVERAGE_REGIONS.find((r) => r.regionCode === regionCode);
  if (!region?.enabled) {
    return { error: 'Activa la región antes de habilitar comunas.' };
  }

  const row = COVERAGE_COMMUNES.find(
    (c) => c.regionCode === regionCode && c.communeCode === communeCode
  );
  if (!row) return null;
  row.enabled = enabled;
  rebuildCoverageMap();
  repository.persist(() => repository.saveCoverageCommune(row), `cobertura ${regionCode}/${communeCode}`);
  return row;
}

function toggleCoverageRegion(regionCode, enabled) {
  const row = COVERAGE_REGIONS.find((r) => r.regionCode === regionCode);
  if (!row) return null;
  row.enabled = enabled;
  rebuildCoverageMap();
  repository.persist(() => repository.saveCoverageRegion(row), `cobertura región ${regionCode}`);
  return row;
}

function validateAddressCoverage({ address, displayName, nominatimAddress }) {
  return checkAddressCoverage({ address, displayName, nominatimAddress }, coverageMap);
}

function getPricingConfig() {
  return PRICING_CONFIG || normalizePricing(DEFAULT_PRICING);
}

function updatePricingConfig(updates) {
  const current = getPricingConfig();
  const merged = normalizePricing({
    ...current,
    ...updates,
    urgencyTiers: updates.urgencyTiers || current.urgencyTiers,
    paymentGateways: updates.paymentGateways || current.paymentGateways
  });
  PRICING_CONFIG = merged;
  repository.persist(() => repository.savePricingConfig(merged), 'pricing');
  return merged;
}

function getUrgencyTiersForClient() {
  return getActiveUrgencyTiers(getPricingConfig());
}

function previewVisitPrice(tierId) {
  return calculateVisitPricing(getPricingConfig(), tierId);
}

function getUserById(id) {
  const user = USERS.find(u => u.id === id);
  if (user?.role === 'provider') ensureProviderFields(user);
  return user;
}

const defaultProviderVerification = repository.defaultProviderVerification;
const defaultLocationShare = repository.defaultLocationShare;

function ensureProviderFields(provider) {
  if (!provider.verification) provider.verification = defaultProviderVerification();
  if (!provider.locationShare) provider.locationShare = defaultLocationShare();
  if (!provider.providerContract) provider.providerContract = defaultProviderContract();
  provider.providerContract = normalizeProviderContract(provider.providerContract);
  provider.verification.status = computeVerificationStatus(provider);
  provider.providerContract.status = computeContractStatus(provider.providerContract);
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
  const contractSummary = getContractSummary(provider.providerContract);
  if (!contractSummary.canOperate) {
    if (contractSummary.status === 'pending_review') missing.push('contrato en revisión legal');
    else if (contractSummary.status === 'rejected') missing.push('contrato rechazado — contacta soporte');
    else if (contractSummary.status === 'needs_info') missing.push('contrato — antecedentes pendientes');
    else if (contractSummary.status === 'expired') missing.push('contrato vencido — renovar');
    else missing.push('contrato de socio firmado y aprobado');
  }
  return { ok: missing.length === 0, missing, contract: contractSummary };
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
  repository.persist(() => repository.saveUser(provider), `proveedor ${providerId}`);
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
  repository.persist(() => repository.saveUser(provider), `proveedor ${providerId}`);
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
  repository.persist(() => repository.saveUser(provider), `proveedor ${providerId}`);
  return provider.locationShare;
}

function updateProviderLocation(providerId, lat, lng) {
  const provider = getUserById(providerId);
  if (!provider || !provider.locationShare?.consent) return null;
  provider.locationShare.lat = parseFloat(lat);
  provider.locationShare.lng = parseFloat(lng);
  provider.locationShare.updatedAt = new Date().toISOString();
  repository.persist(() => repository.saveUser(provider), `proveedor ${providerId}`);
  return provider.locationShare;
}

function getProviderContract(providerId) {
  const provider = getUserById(providerId);
  if (!provider) return null;
  ensureProviderFields(provider);
  return provider.providerContract;
}

function updateProviderContractDraft(providerId, payload) {
  const provider = getUserById(providerId);
  if (!provider) return { error: 'Socio no encontrado.' };
  ensureProviderFields(provider);
  const c = provider.providerContract;
  if (['approved', 'pending_review'].includes(computeContractStatus(c)) && c.review.status !== 'needs_info') {
    return { error: 'El contrato ya fue enviado a revisión. Espera respuesta del equipo legal.' };
  }

  if (payload.entityType) c.entityType = payload.entityType;
  if (payload.legalEntity) c.legalEntity = { ...c.legalEntity, ...payload.legalEntity };
  if (payload.legalRepresentative) c.legalRepresentative = { ...c.legalRepresentative, ...payload.legalRepresentative };
  if (payload.declarations) c.declarations = { ...c.declarations, ...payload.declarations };
  if (payload.signature) c.signature = { ...(c.signature || {}), ...payload.signature };

  c.status = computeContractStatus(c) === 'unsigned' ? 'incomplete' : computeContractStatus(c);
  provider.providerContract = normalizeProviderContract(c);
  repository.persist(() => repository.saveUser(provider), `contrato draft ${providerId}`);
  return { success: true, contract: provider.providerContract, summary: getContractSummary(provider.providerContract) };
}

function saveContractDocument(providerId, docKey, url, label) {
  const provider = getUserById(providerId);
  if (!provider) return null;
  ensureProviderFields(provider);
  const c = provider.providerContract;
  if (docKey === 'technical_certs') {
    c.technicalCerts.push({ url, label: label || 'Certificación', uploadedAt: new Date().toISOString() });
  } else {
    c.documents[docKey] = { url, uploadedAt: new Date().toISOString() };
  }
  c.status = 'incomplete';
  provider.providerContract = normalizeProviderContract(c);
  repository.persist(() => repository.saveUser(provider), `contrato doc ${providerId}`);
  return provider.providerContract;
}

function submitProviderContract(providerId, { signature, ip, userAgent }) {
  const provider = getUserById(providerId);
  if (!provider) return { error: 'Socio no encontrado.' };
  ensureProviderFields(provider);
  const c = provider.providerContract;

  c.signature = {
    ...(c.signature || {}),
    ...signature,
    accepted: true,
    signedAt: new Date().toISOString(),
    signedIp: ip || null,
    userAgent: userAgent || null,
    method: 'electronic_acceptance',
    templateVersion: TEMPLATE_VERSION
  };

  const validation = validateContractSubmission(c);
  if (!validation.ok) return { error: validation.errors[0], errors: validation.errors };

  c.status = 'pending_review';
  c.submittedAt = new Date().toISOString();
  c.review = {
    ...c.review,
    status: 'pending',
    rejectionReason: '',
    requestedDocs: []
  };
  c.history.push({ at: c.submittedAt, action: 'submitted', by: provider.email });

  provider.providerContract = normalizeProviderContract(c);
  repository.persist(() => repository.saveUser(provider), `contrato submit ${providerId}`);
  return { success: true, contract: provider.providerContract, summary: getContractSummary(provider.providerContract) };
}

function getAllProviderContracts() {
  return USERS
    .filter((u) => u.role === 'provider')
    .map((u) => {
      ensureProviderFields(u);
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        avatar: u.avatar,
        specialties: u.specialties || [],
        active: u.active !== false,
        online: Boolean(u.online),
        verification: u.verification,
        contract: u.providerContract,
        summary: getContractSummary(u.providerContract)
      };
    })
    .sort((a, b) => {
      const order = { pending_review: 0, needs_info: 1, incomplete: 2, unsigned: 3, rejected: 4, approved: 5, expired: 6 };
      return (order[a.summary.status] ?? 9) - (order[b.summary.status] ?? 9);
    });
}

function reviewProviderContract(providerId, { action, notes, rejectionReason, requestedDocs }, adminEmail) {
  const provider = getUserById(providerId);
  if (!provider) return { error: 'Socio no encontrado.' };
  ensureProviderFields(provider);
  const c = provider.providerContract;
  const now = new Date().toISOString();

  if (action === 'approve') {
    provider.providerContract = buildApprovedContract(provider, adminEmail);
    provider.active = true;
  } else if (action === 'reject') {
    c.status = 'rejected';
    c.review = {
      ...c.review,
      status: 'rejected',
      reviewedBy: adminEmail,
      reviewedAt: now,
      reviewNotes: notes || '',
      rejectionReason: rejectionReason || 'Documentación o contrato no cumple requisitos.'
    };
    c.history.push({ at: now, action: 'rejected', by: adminEmail, notes });
    provider.providerContract = normalizeProviderContract(c);
    provider.online = false;
  } else if (action === 'needs_info') {
    c.status = 'needs_info';
    c.review = {
      ...c.review,
      status: 'needs_info',
      reviewedBy: adminEmail,
      reviewedAt: now,
      reviewNotes: notes || '',
      requestedDocs: Array.isArray(requestedDocs) ? requestedDocs : []
    };
    c.history.push({ at: now, action: 'needs_info', by: adminEmail, notes });
    provider.providerContract = normalizeProviderContract(c);
    provider.online = false;
  } else if (action === 'suspend') {
    c.status = 'suspended';
    c.review = { ...c.review, status: 'suspended', reviewedBy: adminEmail, reviewedAt: now, reviewNotes: notes || '' };
    c.history.push({ at: now, action: 'suspend', by: adminEmail, notes });
    provider.providerContract = normalizeProviderContract(c);
    provider.online = false;
  } else {
    return { error: 'Acción no válida.' };
  }

  repository.persist(() => repository.saveUser(provider), `contrato review ${providerId}`);
  return { success: true, provider: getAllProviderContracts().find((p) => p.id === providerId) };
}

function getContractStats() {
  const all = getAllProviderContracts();
  const counts = { pending_review: 0, needs_info: 0, approved: 0, rejected: 0, incomplete: 0, unsigned: 0, expired: 0 };
  all.forEach((p) => { counts[p.summary.status] = (counts[p.summary.status] || 0) + 1; });
  return { total: all.length, ...counts };
}

function getUserByEmail(email) {
  const normalized = (email || '').trim().toLowerCase();
  const user = USERS.find(u => (u.email || '').toLowerCase() === normalized);
  if (user?.role === 'provider') ensureProviderFields(user);
  return user;
}

async function authenticateUser(email, password, { allowedRoles } = {}) {
  const user = getUserByEmail(email);
  if (!user) return { error: 'invalid' };
  if (user.active === false) return { error: 'blocked' };

  if (allowedRoles?.length && !allowedRoles.includes(user.role)) {
    return { error: 'wrong_portal', role: user.role };
  }

  const check = await verifyPassword(password, user.password);
  if (!check.ok) return { error: 'invalid' };

  if (check.needsUpgrade) {
    user.password = await hashPassword(password);
    repository.persist(() => repository.saveUser(user), `password upgrade ${user.id}`);
  }

  return { user };
}

function generateReferralCode(name) {
  const base = (name || 'USER').replace(/[^a-zA-Z]/g, '').slice(0, 5).toUpperCase() || 'USER';
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${base}${rand}`;
}

async function registerUser({ name, email, password, phone, role, address, specialties }) {
  name = (name || '').trim();
  email = (email || '').trim().toLowerCase();
  password = password || '';
  role = role === 'provider' ? 'provider' : 'client';

  if (!name || !email || !password) return { error: 'Completa nombre, correo y contraseña.' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'Ingresa un correo válido.' };
  if (password.length < 6) return { error: 'La contraseña debe tener al menos 6 caracteres.' };
  if (getUserByEmail(email)) {
    return { error: 'Ya existe una cuenta con ese correo.', code: 'email_exists' };
  }

  let cleanSpecialties = [];
  if (role === 'provider') {
    const raw = Array.isArray(specialties) ? specialties : (specialties ? [specialties] : []);
    cleanSpecialties = raw.filter(id => SERVICES.some(s => s.id === id));
    if (cleanSpecialties.length === 0) return { error: 'Selecciona al menos una especialidad.' };
  }

  const shortId = uuidv4().slice(0, 8);
  const hashedPassword = await hashPassword(password);
  const baseUser = {
    id: role === 'provider' ? `provider-${shortId}` : `client-${shortId}`,
    email,
    password: hashedPassword,
    name,
    role,
    phone: (phone || '').trim() || null,
    onboardingCompleted: false,
    memberSince: new Date().toISOString().slice(0, 10),
    emailVerifiedAt: null,
    emailVerificationCodeHash: null,
    emailVerificationExpiresAt: null,
    emailVerificationSentAt: null
  };

  let user;
  if (role === 'provider') {
    user = {
      ...baseUser,
      specialties: cleanSpecialties,
      rating: null,
      reviewsCount: 0,
      online: false,
      avatar: name.split(/\s+/).map(n => n[0]).join('').slice(0, 2).toUpperCase(),
      bio: '',
      reviews: [],
      verification: defaultProviderVerification(),
      locationShare: defaultLocationShare(),
      providerContract: defaultProviderContract()
    };
  } else {
    user = {
      ...baseUser,
      address: (address || '').trim() || null,
      referralCode: generateReferralCode(name),
      ziloPoints: 0,
      creditsCLP: 0,
      referralsCount: 0,
      servicesCount: 0,
      usedWelcomePromo: false,
      usedReferral: false,
      billing: null
    };
  }

  USERS.push(user);
  try {
    await repository.saveUser(user);
  } catch (err) {
    const idx = USERS.indexOf(user);
    if (idx >= 0) USERS.splice(idx, 1);
    console.error('Error registrando usuario:', err.message);
    return { error: 'No se pudo crear la cuenta. Intenta nuevamente.' };
  }
  return { success: true, user };
}

async function createTechnician(socioId, { name, email, password, phone } = {}) {
  const socio = getUserById(socioId);
  if (!socio || socio.role !== 'provider') return { error: 'Cuenta de socio no válida.' };

  name = (name || '').trim();
  email = (email || '').trim().toLowerCase();
  password = password || '';

  if (!name || !email || !password) return { error: 'Completa nombre, correo y contraseña.' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'Ingresa un correo válido.' };
  if (password.length < 6) return { error: 'La contraseña debe tener al menos 6 caracteres.' };
  if (getUserByEmail(email)) return { error: 'Ya existe una cuenta con ese correo.' };

  const hashedPassword = await hashPassword(password);
  const tecnico = {
    id: `tecnico-${uuidv4().slice(0, 8)}`,
    email,
    password: hashedPassword,
    name,
    role: 'tecnico',
    parentId: socioId,
    phone: (phone || '').trim() || null,
    specialties: Array.isArray(socio.specialties) ? [...socio.specialties] : [],
    rating: null,
    reviewsCount: 0,
    online: false,
    avatar: name.split(/\s+/).map(n => n[0]).join('').slice(0, 2).toUpperCase(),
    bio: '',
    reviews: [],
    locationShare: defaultLocationShare(),
    active: true,
    memberSince: new Date().toISOString().slice(0, 10),
    emailVerifiedAt: null,
    emailVerificationCodeHash: null,
    emailVerificationExpiresAt: null,
    emailVerificationSentAt: null
  };

  USERS.push(tecnico);
  try {
    await repository.saveUser(tecnico);
  } catch (err) {
    const idx = USERS.indexOf(tecnico);
    if (idx >= 0) USERS.splice(idx, 1);
    console.error('Error creando técnico:', err.message);
    return { error: 'No se pudo crear el técnico. Intenta nuevamente.' };
  }
  return { success: true, tecnico };
}

function getTechniciansByProvider(socioId) {
  return USERS.filter(u => u.role === 'tecnico' && u.parentId === socioId);
}

function getTechnicianForProvider(socioId, tecnicoId) {
  return USERS.find(u => u.id === tecnicoId && u.role === 'tecnico' && u.parentId === socioId) || null;
}

function setUserActive(userId, active) {
  const user = getUserById(userId);
  if (!user) return null;
  user.active = Boolean(active);
  repository.persist(() => repository.saveUser(user), `usuario ${userId}`);
  return user;
}

function getAdminTeamUsers() {
  return USERS
    .filter((u) => u.role === 'admin')
    .map((u) => {
      const access = resolveAdminAccess(u);
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        phone: u.phone || '',
        active: u.active !== false,
        profileId: access.profileId,
        isSuperAdmin: access.isSuperAdmin,
        permissions: access.permissions,
        mfaEnabled: isMfaEnabled(u.id),
        createdAt: u.memberSince || null
      };
    })
    .sort((a, b) => a.email.localeCompare(b.email));
}

async function createAdminUser({ name, email, password, profileId, permissions, isSuperAdmin }, actorId) {
  ensureReady();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail || !password || !name) {
    return { error: 'Nombre, email y contraseña son obligatorios.' };
  }
  if (password.length < 8) {
    return { error: 'La contraseña debe tener al menos 8 caracteres.' };
  }
  if (getUserByEmail(normalizedEmail)) {
    return { error: 'Ya existe una cuenta con ese email.' };
  }

  const profile = PROFILES[profileId] || PROFILES.operaciones;
  const adminAccess = normalizeAdminAccess({
    profileId: isSuperAdmin ? 'superadmin' : (profileId || profile.id),
    permissions: permissions || profile.permissions,
    isSuperAdmin: Boolean(isSuperAdmin)
  });

  const user = {
    id: `admin-${uuidv4().slice(0, 8)}`,
    email: normalizedEmail,
    password: await hashPassword(password),
    name: String(name).trim(),
    role: 'admin',
    phone: null,
    active: true,
    adminAccess,
    memberSince: new Date().toISOString().slice(0, 10)
  };

  USERS.push(user);
  await repository.saveUser(user);
  return { success: true, user: getAdminTeamUsers().find((u) => u.id === user.id) };
}

async function updateAdminUserAccess(userId, { name, profileId, permissions, isSuperAdmin, password }, actorId) {
  ensureReady();
  const user = getUserById(userId);
  if (!user || user.role !== 'admin') return { error: 'Administrador no encontrado.' };

  if (name) user.name = String(name).trim();
  if (password) {
    if (password.length < 8) return { error: 'La contraseña debe tener al menos 8 caracteres.' };
    user.password = await hashPassword(password);
  }

  const profile = PROFILES[profileId] || null;
  user.adminAccess = normalizeAdminAccess({
    profileId: isSuperAdmin ? 'superadmin' : (profileId || user.adminAccess?.profileId || 'custom'),
    permissions: permissions || profile?.permissions || user.adminAccess?.permissions,
    isSuperAdmin: Boolean(isSuperAdmin)
  });

  await repository.saveUser(user);
  return { success: true, user: getAdminTeamUsers().find((u) => u.id === userId) };
}

function getAdminPermissionMeta() {
  return {
    profiles: getProfilesList(),
    groups: getPermissionGroups()
  };
}

function isMfaEnabled(userId) {
  const user = getUserById(userId);
  return Boolean(user?.mfa?.enabled && user.mfa.secret);
}

async function beginMfaSetup(userId) {
  const user = getUserById(userId);
  if (!user || user.role !== 'admin') return { error: 'Usuario no válido.' };
  if (user.mfa?.enabled) return { error: 'MFA ya está activo.' };

  const secret = await generateSecret();
  user.mfa = {
    enabled: false,
    secret: null,
    pendingSecret: secret,
    confirmedAt: null
  };
  repository.persist(() => repository.saveUser(user), `mfa setup ${userId}`);
  return {
    success: true,
    secret,
    otpauthUrl: await buildOtpauthUrl(user.email, secret)
  };
}

async function confirmMfaSetup(userId, code) {
  const user = getUserById(userId);
  if (!user || user.role !== 'admin') return { error: 'Usuario no válido.' };
  if (!user.mfa?.pendingSecret) return { error: 'No hay configuración MFA pendiente.' };
  if (!(await verifyToken(user.mfa.pendingSecret, code))) {
    return { error: 'Código incorrecto. Verifica la hora de tu dispositivo.' };
  }

  user.mfa = {
    enabled: true,
    secret: user.mfa.pendingSecret,
    pendingSecret: null,
    confirmedAt: new Date().toISOString()
  };
  repository.persist(() => repository.saveUser(user), `mfa confirm ${userId}`);
  return { success: true };
}

async function disableMfa(userId, password, code) {
  const user = getUserById(userId);
  if (!user || user.role !== 'admin') return { error: 'Usuario no válido.' };
  if (!user.mfa?.enabled) return { error: 'MFA no está activo.' };

  const check = await verifyPassword(password, user.password);
  if (!check.ok) return { error: 'Contraseña incorrecta.' };
  if (check.needsUpgrade) {
    user.password = await hashPassword(password);
  }
  if (!(await verifyToken(user.mfa.secret, code))) return { error: 'Código MFA incorrecto.' };

  user.mfa = null;
  repository.persist(() => repository.saveUser(user), `mfa disable ${userId}`);
  return { success: true };
}

async function verifyMfaCode(userId, code) {
  const user = getUserById(userId);
  if (!user?.mfa?.enabled || !user.mfa.secret) return false;
  return verifyToken(user.mfa.secret, code);
}

function getAdminMfaStatus(userId) {
  const user = getUserById(userId);
  if (!user || user.role !== 'admin') return { enabled: false, pending: false };
  const mfa = normalizeMfa(user.mfa);
  return {
    enabled: Boolean(mfa?.enabled && mfa.secret),
    pending: Boolean(mfa?.pendingSecret),
    confirmedAt: mfa?.confirmedAt || null
  };
}

const DEMO_ACCOUNT_IDS = ['client-1', 'provider-pedro'];
const DEMO_ACCOUNT_LABELS = { 'client-1': 'Cliente', 'provider-pedro': 'Socio' };
const DEMO_ACCOUNT_PASSWORDS = { 'client-1': 'cliente123', 'provider-pedro': 'proveedor123' };

function getDemoAccounts() {
  return DEMO_ACCOUNT_IDS
    .map(id => USERS.find(u => u.id === id))
    .filter(Boolean)
    .map(u => ({
      id: u.id,
      label: DEMO_ACCOUNT_LABELS[u.id] || u.role,
      name: u.name,
      email: u.email,
      password: DEMO_ACCOUNT_PASSWORDS[u.id] || '',
      active: u.active !== false
    }));
}

function getOnlineProviders(serviceId) {
  return USERS.filter(
    u => u.role === 'provider' && u.online && u.specialties.includes(serviceId)
  );
}

function getOnlineTechnicians(serviceId) {
  return USERS.filter(
    u => u.role === 'tecnico' && u.online && u.active !== false
      && Array.isArray(u.specialties) && u.specialties.includes(serviceId)
  );
}

function getWorkWallItems(userId) {
  const user = getUserById(userId);
  if (!user || !['provider', 'tecnico'].includes(user.role)) return [];
  const specs = user.specialties || [];
  return requests
    .filter(r => r.status === 'searching' && specs.includes(r.serviceId))
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
}

function tryAcceptRequest(requestId, userId) {
  const request = requests.find(r => r.id === requestId);
  if (!request || request.status !== 'searching') {
    return { error: 'Solicitud ya no está disponible', code: 'taken' };
  }

  const user = getUserById(userId);
  if (!user) return { error: 'Usuario no encontrado' };

  if (user.role === 'provider') {
    if (!user.specialties.includes(request.serviceId)) {
      return { error: 'No tienes esta especialidad' };
    }
    request.providerId = user.id;
    request.status = 'assigned';
    request.assignedAt = new Date().toISOString();
  } else if (user.role === 'tecnico') {
    if (!Array.isArray(user.specialties) || !user.specialties.includes(request.serviceId)) {
      return { error: 'No tienes esta especialidad' };
    }
    if (!user.parentId) return { error: 'Sin socio asignado' };
    const socio = getUserById(user.parentId);
    if (!socio) return { error: 'Socio no encontrado' };

    request.providerId = socio.id;
    request.technicianId = user.id;
    request.technicianName = user.name;
    request.technicianPhone = user.phone || null;
    request.technicianAssignedAt = new Date().toISOString();
    request.techStatus = 'aceptado';
    request.status = 'assigned';
    request.assignedAt = new Date().toISOString();
  } else {
    return { error: 'Rol no autorizado' };
  }

  repository.persist(() => repository.saveRequest(request), `solicitud ${requestId}`);
  afterEvent((ev) => {
    ev.onProviderAssigned(request);
    if (request.technicianId) ev.onTechnicianAssigned(request);
  });
  return { success: true, request };
}

function assignProvider(requestId, providerId) {
  const request = requests.find(r => r.id === requestId);
  if (!request) return null;
  request.providerId = providerId;
  request.status = 'assigned';
  request.assignedAt = new Date().toISOString();
  repository.persist(() => repository.saveRequest(request), `solicitud ${requestId}`);
  afterEvent((ev) => ev.onProviderAssigned(request));
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
  repository.persist(() => repository.saveRequest(request), `solicitud ${requestId}`);
  return request;
}

function assignTechnician(requestId, socioId, technicianId) {
  const request = requests.find(r => r.id === requestId);
  if (!request) return { error: 'Solicitud no encontrada.' };
  if (request.providerId !== socioId) return { error: 'Esta solicitud no es de tu equipo.' };

  const tecnico = getTechnicianForProvider(socioId, technicianId);
  if (!tecnico) return { error: 'Técnico no válido.' };
  if (tecnico.active === false) return { error: 'El técnico está desactivado.' };

  request.technicianId = tecnico.id;
  request.technicianName = tecnico.name;
  request.technicianPhone = tecnico.phone || null;
  request.technicianAssignedAt = new Date().toISOString();
  request.techStatus = 'asignado';
  repository.persist(() => repository.saveRequest(request), `solicitud ${requestId}`);
  afterEvent((ev) => ev.onTechnicianAssigned(request));
  return { success: true, request, tecnico };
}

function updateTechStatus(requestId, technicianId, techStatus) {
  const request = requests.find(r => r.id === requestId);
  if (!request || request.technicianId !== technicianId) return null;
  request.techStatus = techStatus;
  const map = {
    aceptado: 'assigned',
    en_camino: 'in_progress',
    en_sitio: 'in_progress',
    diagnostico: 'in_progress',
    reparando: 'in_progress',
    comprando: 'in_progress',
    presupuesto_pendiente: 'in_progress',
    presupuesto_aprobado: 'in_progress',
    completado: 'completed'
  };
  const mappedStatus = map[techStatus];
  if (mappedStatus) {
    request.status = mappedStatus;
    if (mappedStatus === 'completed') {
      request.completedAt = new Date().toISOString();
      request.payoutStatus = request.payoutStatus || 'pendiente';
      addLogbookEntryFromRequest(request);
    }
  }
  repository.persist(() => repository.saveRequest(request), `solicitud ${requestId}`);
  if (techStatus === 'en_camino') afterEvent((ev) => ev.onTechnicianEnRoute(request));
  return request;
}

function getRequestForTechnician(requestId, technicianId) {
  return requests.find(r => r.id === requestId && r.technicianId === technicianId) || null;
}

function ensureSiteReport(request) {
  if (!request.siteReport) {
    request.siteReport = {
      arrivedAt: null,
      diagnosis: '',
      photoStart: null,
      photoEnd: null,
      action: null,
      workNotes: '',
      budgetAmount: null,
      budgetDescription: '',
      budgetStatus: null,
      budgetRespondedAt: null,
      materials: []
    };
  }
  return request.siteReport;
}

function recordSiteArrival(requestId, technicianId, { diagnosis, photoStart }) {
  const request = getRequestForTechnician(requestId, technicianId);
  if (!request) return { error: 'Solicitud no encontrada.' };
  if (!['en_sitio', 'en_camino', 'aceptado'].includes(request.techStatus)) {
    return { error: 'No puedes registrar llegada en este estado.' };
  }
  diagnosis = (diagnosis || '').trim();
  if (!diagnosis) return { error: 'Describe lo que observas en el lugar.' };
  if (!photoStart) return { error: 'Sube la foto inicial de la visita.' };

  const sr = ensureSiteReport(request);
  sr.arrivedAt = new Date().toISOString();
  sr.diagnosis = diagnosis;
  sr.photoStart = photoStart;
  request.techStatus = 'diagnostico';
  request.status = 'in_progress';
  repository.persist(() => repository.saveRequest(request), `solicitud ${requestId}`);
  afterEvent((ev) => ev.onTechnicianArrived(request));
  return { success: true, request };
}

function setSiteAction(requestId, technicianId, action) {
  const request = getRequestForTechnician(requestId, technicianId);
  if (!request) return { error: 'Solicitud no encontrada.' };
  if (request.techStatus !== 'diagnostico') return { error: 'Primero registra tu llegada y diagnóstico.' };

  const valid = ['reparar', 'comprar', 'presupuesto'];
  if (!valid.includes(action)) return { error: 'Acción inválida.' };

  const sr = ensureSiteReport(request);
  sr.action = action;
  if (action === 'reparar') request.techStatus = 'reparando';
  else if (action === 'comprar') request.techStatus = 'comprando';
  else request.techStatus = 'presupuesto_pendiente';

  repository.persist(() => repository.saveRequest(request), `solicitud ${requestId}`);
  return { success: true, request };
}

function submitSiteBudget(requestId, technicianId, { amount, description }) {
  const request = getRequestForTechnician(requestId, technicianId);
  if (!request) return { error: 'Solicitud no encontrada.' };
  if (request.techStatus !== 'presupuesto_pendiente') return { error: 'No hay presupuesto pendiente de envío.' };

  const parsed = parseInt(amount, 10);
  if (!parsed || parsed < 1000) return { error: 'Ingresa un monto válido (mín. $1.000).' };
  description = (description || '').trim();
  if (!description) return { error: 'Describe el trabajo y materiales del presupuesto.' };

  const sr = ensureSiteReport(request);
  sr.budgetAmount = parsed;
  sr.budgetDescription = description;
  sr.budgetStatus = 'pending';
  repository.persist(() => repository.saveRequest(request), `solicitud ${requestId}`);
  afterEvent((ev) => ev.onBudgetSent(request, parsed));
  return { success: true, request };
}

function respondSiteBudget(requestId, clientId, approved) {
  const request = requests.find(r => r.id === requestId && r.clientId === clientId);
  if (!request) return { error: 'Solicitud no encontrada.' };
  if (request.techStatus !== 'presupuesto_pendiente') return { error: 'No hay presupuesto pendiente.' };
  const sr = ensureSiteReport(request);
  if (sr.budgetStatus !== 'pending') return { error: 'Este presupuesto ya fue respondido.' };

  sr.budgetStatus = approved ? 'approved' : 'rejected';
  sr.budgetRespondedAt = new Date().toISOString();
  if (approved) {
    request.techStatus = 'presupuesto_aprobado';
  } else {
    request.techStatus = 'completado';
    request.status = 'completed';
    request.completedAt = new Date().toISOString();
    sr.workNotes = 'Presupuesto rechazado por el cliente. Visita finalizada.';
  }
  repository.persist(() => repository.saveRequest(request), `solicitud ${requestId}`);
  return { success: true, request, approved };
}

function addSiteMaterial(requestId, technicianId, { description, amount, receiptUrl }) {
  const request = getRequestForTechnician(requestId, technicianId);
  if (!request) return { error: 'Solicitud no encontrada.' };
  if (!['comprando', 'reparando', 'presupuesto_aprobado'].includes(request.techStatus)) {
    return { error: 'No puedes agregar materiales en este estado.' };
  }

  const parsed = parseInt(amount, 10);
  if (!parsed || parsed < 100) return { error: 'Monto de material inválido.' };
  description = (description || '').trim();
  if (!description) return { error: 'Describe el material.' };

  const sr = ensureSiteReport(request);
  sr.materials.push({
    id: `mat-${Date.now()}`,
    description,
    amount: parsed,
    receiptUrl: receiptUrl || null,
    addedAt: new Date().toISOString()
  });
  repository.persist(() => repository.saveRequest(request), `solicitud ${requestId}`);
  return { success: true, request, material: sr.materials[sr.materials.length - 1] };
}

function completeSiteWork(requestId, technicianId, { workNotes, photoEnd }) {
  const request = getRequestForTechnician(requestId, technicianId);
  if (!request) return { error: 'Solicitud no encontrada.' };

  const allowed = ['reparando', 'comprando', 'presupuesto_aprobado'];
  if (!allowed.includes(request.techStatus)) {
    return { error: 'Completa el flujo antes de finalizar (diagnóstico y acción).' };
  }

  workNotes = (workNotes || '').trim();
  if (!workNotes) return { error: 'Escribe el resumen de lo realizado.' };
  if (!photoEnd) return { error: 'Sube la foto final de la visita.' };

  const sr = ensureSiteReport(request);
  sr.workNotes = workNotes;
  sr.photoEnd = photoEnd;
  request.techStatus = 'completado';
  request.status = 'completed';
  request.completedAt = new Date().toISOString();
  request.payoutStatus = request.payoutStatus || 'pendiente';
  request.financials = computeRequestFinancials(request, getPricingConfig());
  addLogbookEntryFromRequest(request);
  repository.persist(() => repository.saveRequest(request), `solicitud ${requestId}`);
  afterEvent((ev) => ev.onServiceCompleted(request));
  return { success: true, request };
}

function getRequestsByTechnician(technicianId) {
  return requests.filter(r => r.technicianId === technicianId);
}

function updateTechnicianLocation(technicianId, lat, lng) {
  const tecnico = getUserById(technicianId);
  if (!tecnico || tecnico.role !== 'tecnico') return null;
  if (!tecnico.locationShare) tecnico.locationShare = defaultLocationShare();
  tecnico.locationShare.consent = true;
  tecnico.locationShare.consentAt = tecnico.locationShare.consentAt || new Date().toISOString();
  tecnico.locationShare.lat = parseFloat(lat);
  tecnico.locationShare.lng = parseFloat(lng);
  tecnico.locationShare.updatedAt = new Date().toISOString();
  repository.persist(() => repository.saveUser(tecnico), `tecnico ${technicianId}`);
  return tecnico.locationShare;
}

function computeEtaMinutes(fromLat, fromLng, toLat, toLng, avgKmh = 30) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(toLat - fromLat);
  const dLng = toRad(toLng - fromLng);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.sin(dLng / 2) ** 2;
  const distanceKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const minutes = Math.round((distanceKm / avgKmh) * 60);
  return { distanceKm: Math.round(distanceKm * 10) / 10, etaMinutes: Math.max(1, minutes) };
}

function setProviderOnline(providerId, online) {
  const provider = getUserById(providerId);
  if (provider && provider.role === 'provider') {
    provider.online = online;
    repository.persist(() => repository.saveUser(provider), `proveedor ${providerId}`);
    return provider;
  }
  return null;
}

function setTechnicianOnline(tecnicoId, online) {
  const tecnico = getUserById(tecnicoId);
  if (tecnico && tecnico.role === 'tecnico') {
    tecnico.online = online;
    repository.persist(() => repository.saveUser(tecnico), `tecnico ${tecnicoId}`);
    return tecnico;
  }
  return null;
}

function getRequestsByClient(clientId) {
  return requests.filter(r => r.clientId === clientId);
}

const REQUEST_STATUS_LABELS = {
  pending_payment: 'status.request.pending_payment',
  pending: 'status.request.pending',
  pending_transfer: 'status.request.pending_transfer',
  searching: 'status.request.searching',
  assigned: 'status.request.assigned',
  in_progress: 'status.request.in_progress',
  completed: 'status.request.completed',
  cancelled: 'status.request.cancelled'
};

function getRequestStatusLabel(request, locale = 'es') {
  if (!request) return '—';
  if (request.techStatus === 'en_camino') return translate(locale, 'status.tech.en_camino');
  if (request.techStatus === 'en_sitio' || request.techStatus === 'diagnostico') {
    return translate(locale, 'status.tech.en_sitio');
  }
  if (request.techStatus === 'presupuesto_pendiente') {
    return translate(locale, 'status.tech.presupuesto_pendiente');
  }
  const key = REQUEST_STATUS_LABELS[request.status];
  return key ? translate(locale, key) : request.status;
}

function enrichRequestForClient(request, locale = 'es') {
  if (!request) return null;
  return {
    ...request,
    statusLabel: getRequestStatusLabel(request, locale)
  };
}

function getActiveRequestsForClient(clientId, locale = 'es') {
  return requests
    .filter(r => r.clientId === clientId && ['searching', 'assigned', 'in_progress'].includes(r.status))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5)
    .map(r => enrichRequestForClient(r, locale));
}

function getLastCompletedRequest(clientId, locale = 'es') {
  const completed = requests
    .filter(r => r.clientId === clientId && r.status === 'completed')
    .sort((a, b) => new Date(b.completedAt || b.createdAt) - new Date(a.completedAt || a.createdAt));
  return completed[0] ? enrichRequestForClient(completed[0], locale) : null;
}

function getClientTrustStats() {
  const providers = USERS.filter(u => u.role === 'provider');
  const completed = requests.filter(r => r.status === 'completed').length;
  const avgRating = providers.length
    ? (providers.reduce((s, p) => s + (p.rating || 0), 0) / providers.length).toFixed(1)
    : '4.9';
  const verified = providers.filter(p => p.verification?.faceVerified || p.verification?.status === 'verified').length;
  return {
    completedServices: Math.max(completed, 120),
    avgRating,
    verifiedProviders: providers.length ? Math.round((verified / providers.length) * 100) : 100,
    responseTime: '~45 min'
  };
}

function submitClientReview(requestId, clientId, { rating, text }) {
  const request = requests.find(r => r.id === requestId && r.clientId === clientId);
  if (!request) return { error: 'Solicitud no encontrada' };
  if (request.status !== 'completed') return { error: 'Solo puedes calificar servicios completados' };
  if (request.clientReview) return { error: 'Ya calificaste este servicio' };

  const stars = Math.min(5, Math.max(1, parseInt(rating, 10) || 0));
  if (!stars) return { error: 'Selecciona una calificación' };

  const provider = request.providerId ? getUserById(request.providerId) : null;
  const client = getUserById(clientId);
  const reviewText = (text || '').trim().slice(0, 500);

  if (provider) {
    const nameParts = (client?.name || 'Cliente').split(' ');
    const author = nameParts.length > 1
      ? `${nameParts[0]} ${nameParts[1][0]}.`
      : nameParts[0];
    const review = {
      author,
      rating: stars,
      text: reviewText || 'Servicio completado vía Fundez',
      date: new Date().toISOString().slice(0, 10)
    };
    provider.reviews = [review, ...(provider.reviews || [])].slice(0, 50);
    provider.reviewsCount = (provider.reviewsCount || 0) + 1;
    const ratings = provider.reviews.map(r => r.rating);
    provider.rating = Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10;
    repository.persist(() => repository.saveUser(provider), `proveedor ${provider.id}`);
  }

  request.clientReview = {
    rating: stars,
    text: reviewText,
    at: new Date().toISOString()
  };
  repository.persist(() => repository.saveRequest(request), `solicitud ${requestId}`);

  if (client) {
    client.ziloPoints = (client.ziloPoints || 0) + 25;
    repository.persist(() => repository.saveUser(client), `usuario ${client.id}`);
  }

  return { success: true, review: request.clientReview };
}

function getTechStatusLabel(techStatus, locale = 'es') {
  const map = {
    aceptado: 'status.tech.aceptado',
    asignado: 'status.request.assigned',
    en_camino: 'status.tech.en_camino',
    en_sitio: 'status.tech.en_sitio',
    diagnostico: 'status.tech.diagnostico_label',
    reparando: 'status.tech.reparando',
    comprando: 'status.tech.comprando',
    presupuesto_pendiente: 'status.tech.presupuesto_pendiente',
    presupuesto_aprobado: 'status.tech.presupuesto_aprobado',
    completado: 'status.tech.completado'
  };
  const key = map[techStatus];
  return key ? translate(locale, key) : null;
}

function enrichRequestForProvider(request, locale = 'es') {
  if (!request) return null;
  return {
    ...request,
    statusLabel: getRequestStatusLabel(request, locale),
    techStatusLabel: getTechStatusLabel(request.techStatus, locale) || getRequestStatusLabel(request, locale)
  };
}

function getActiveRequestsForProvider(providerId, locale = 'es') {
  return requests
    .filter(r => r.providerId === providerId && ['assigned', 'in_progress'].includes(r.status))
    .sort((a, b) => new Date(b.assignedAt || b.createdAt) - new Date(a.assignedAt || a.createdAt))
    .map(r => enrichRequestForProvider(r, locale));
}

function getProviderPayoutSummary(providerId) {
  const row = getProviderPayouts().find(p => p.provider.id === providerId);
  if (!row) return { pending: 0, paid: 0, jobs: 0, completed: 0 };
  return { pending: row.pending, paid: row.paid, jobs: row.jobs, completed: row.completed };
}

function getProviderDashboardStats(providerId) {
  const provider = getUserById(providerId);
  const payout = getProviderPayoutSummary(providerId);
  const activeJobs = getActiveRequestsForProvider(providerId).length;
  const pendingWall = getPendingRequestsForProvider(providerId).length;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthCompleted = requests.filter(r =>
    r.providerId === providerId &&
    r.status === 'completed' &&
    new Date(r.completedAt || r.createdAt) >= monthStart
  ).length;

  return {
    rating: provider?.rating || 0,
    reviewsCount: provider?.reviewsCount || 0,
    activeJobs,
    pendingWall,
    completedTotal: payout.completed,
    monthCompleted,
    pendingPayout: payout.pending,
    paidTotal: payout.paid,
    online: Boolean(provider?.online)
  };
}

function getProviderWorkflowStep(providerId) {
  const provider = getUserById(providerId);
  if (!provider?.online) return 1;
  const active = getActiveRequestsForProvider(providerId);
  if (active.length === 0) {
    return getPendingRequestsForProvider(providerId).length > 0 ? 2 : 1;
  }
  const inProgress = active.some(r => r.status === 'in_progress' || r.techStatus);
  if (inProgress) return 3;
  return 2;
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

function isEmailVerified(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return Boolean(user.emailVerifiedAt);
}

async function issueEmailVerification(userId, { locale = 'es' } = {}) {
  const user = getUserById(userId);
  if (!user || isEmailVerified(user)) return { skipped: true };

  const sent = await emailVerification.sendVerificationEmail(user, { locale });
  user.emailVerificationCodeHash = sent.codeHash;
  user.emailVerificationExpiresAt = sent.expiresAt;
  user.emailVerificationSentAt = sent.sentAt;

  try {
    await repository.saveUser(user);
  } catch (err) {
    console.error('Error guardando código de verificación:', err.message);
    return { error: 'No se pudo enviar el código. Intenta más tarde.' };
  }
  return { success: true, sentAt: sent.sentAt, demo: sent.mailResult?.demo };
}

async function verifyEmailCode(userId, code) {
  const user = getUserById(userId);
  if (!user) return { error: 'Usuario no encontrado.' };
  if (isEmailVerified(user)) return { success: true, already: true };

  const check = emailVerification.verifyCode(user, code);
  if (check.error) return check;

  user.emailVerifiedAt = new Date().toISOString();
  user.emailVerificationCodeHash = null;
  user.emailVerificationExpiresAt = null;

  try {
    await repository.saveUser(user);
  } catch (err) {
    console.error('Error verificando correo:', err.message);
    return { error: 'No se pudo confirmar la verificación.' };
  }
  return { success: true };
}

async function resendEmailVerification(userId, { locale = 'es' } = {}) {
  const user = getUserById(userId);
  if (!user) return { error: 'Usuario no encontrado.' };
  if (isEmailVerified(user)) return { error: 'Tu correo ya está verificado.' };
  if (!emailVerification.canResend(user)) {
    return {
      error: 'Espera un momento antes de solicitar otro código.',
      cooldown: emailVerification.resendCooldownSeconds(user)
    };
  }
  return issueEmailVerification(userId, { locale });
}

function recordConsent({
  userId, ip, type, granted, version, userAgent,
  purpose, legalBasis, source, meta, withdrawnAt
}) {
  const def = CONSENT_DEFINITIONS[type] || {};
  const record = {
    id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    userId,
    ip,
    type,
    granted: Boolean(granted),
    version: version || POLICY_VERSION,
    userAgent: userAgent?.slice(0, 120),
    purpose: purpose || def.purpose || null,
    legalBasis: legalBasis || def.legalBasis || null,
    source: source || null,
    meta: meta || null,
    withdrawnAt: withdrawnAt || null,
    createdAt: new Date().toISOString()
  };
  consentRecords.unshift(record);
  repository.persist(() => repository.saveConsent(record), `consentimiento ${record.id}`);
  return record;
}

function recordRegistrationConsents(req, userId, body) {
  const items = getRegistrationConsentPayload(body);
  const ua = req.get('user-agent');
  const ip = req.ip;
  return items.map((item) => recordConsent({
    userId,
    ip,
    type: item.type,
    granted: item.granted,
    version: POLICY_VERSION,
    userAgent: ua,
    purpose: item.purpose,
    legalBasis: item.legalBasis,
    source: 'registro'
  }));
}

function getUserConsents(userId) {
  return consentRecords
    .filter((c) => c.userId === userId && !c.withdrawnAt)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getUserConsentStatus(userId) {
  const rows = getUserConsents(userId);
  const latestByType = {};
  rows.forEach((r) => {
    if (!latestByType[r.type]) latestByType[r.type] = r;
  });
  return Object.values(latestByType);
}

function revokeUserConsent(userId, type, req) {
  const def = CONSENT_DEFINITIONS[type];
  if (!def) return { error: 'Tipo de consentimiento no válido.' };
  if (!def.revocable) return { error: 'Este consentimiento no puede revocarse desde la app.' };

  const active = getUserConsents(userId).find((c) => c.type === type && c.granted);
  if (!active) return { error: 'No hay un consentimiento activo para revocar.' };

  const withdrawnAt = new Date().toISOString();
  active.withdrawnAt = withdrawnAt;
  repository.persist(() => repository.saveConsent(active), `revocar ${type}`);

  recordConsent({
    userId,
    ip: req?.ip,
    type,
    granted: false,
    version: POLICY_VERSION,
    userAgent: req?.get?.('user-agent'),
    purpose: def.purpose,
    legalBasis: def.legalBasis,
    source: 'revocacion',
    withdrawnAt
  });

  return { success: true, type, withdrawnAt };
}

function getConsentsSummary() {
  const total = consentRecords.length;
  const granted = consentRecords.filter(c => c.granted).length;
  return { total, granted, rate: total ? Math.round((granted / total) * 100) : 0 };
}

function logSecurityEvent(event, detail, req) {
  const log = {
    id: `sec-${Date.now()}`,
    event,
    detail: detail || null,
    user: req?.session?.user?.email || null,
    ip: req?.ip || null,
    createdAt: new Date().toISOString()
  };
  securityLogs.unshift(log);
  if (securityLogs.length > 200) securityLogs.pop();
  repository.persist(() => repository.saveSecurityLog(log), `log ${log.id}`);
}

function getPayments() {
  const pricing = getPricingConfig();
  return requests
    .filter(r => r.paymentStatus === 'approved')
    .map(r => {
      const fin = r.status === 'completed' && r.financials
        ? r.financials
        : computeRequestFinancials(r, pricing);
      const provider = r.providerId ? getUserById(r.providerId) : null;
      return {
        id: r.id,
        clientName: r.clientName,
        serviceName: r.serviceName,
        amount: fin.grandTotal || r.visitPricePaid || r.amountDue || r.basePrice,
        visitPaid: fin.visitPaid,
        serviceAmount: fin.serviceAmount,
        materialsTotal: fin.materialsTotal,
        commission: fin.appTotal,
        laborCommission: fin.laborCommission,
        materialsCommission: fin.materialsCommission,
        providerPayout: fin.providerTotal,
        providerName: provider?.name || '—',
        paymentId: r.paymentId,
        paidAt: r.paidAt,
        status: r.status,
        urgencyTierLabel: r.urgencyTierLabel,
        payoutStatus: r.status === 'completed' ? (r.payoutStatus || 'pendiente') : 'n/a'
      };
    });
}

function getProviderPayouts() {
  const payouts = {};
  USERS.filter(u => u.role === 'provider').forEach(p => {
    payouts[p.id] = { provider: p, completed: 0, pending: 0, paid: 0, jobs: 0, materials: 0 };
  });

  getPayments().forEach(pay => {
    const req = requests.find(r => r.id === pay.id);
    if (!req?.providerId || !payouts[req.providerId]) return;
    const bucket = payouts[req.providerId];
    bucket.jobs++;
    if (req.status === 'completed') {
      bucket.materials += pay.materialsTotal || 0;
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
  repository.persist(() => repository.saveComplaint(c), `reclamo ${id}`);
  return c;
}

function markPayoutPaid(requestId) {
  const req = requests.find(r => r.id === requestId);
  if (!req) return null;
  req.payoutStatus = 'pagado';
  req.payoutPaidAt = new Date().toISOString();
  repository.persist(() => repository.saveRequest(req), `solicitud ${requestId}`);
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

function bumpFinanceBucket(map, key, amount = 0, count = 1) {
  if (!map[key]) map[key] = { count: 0, amount: 0 };
  map[key].count += count;
  map[key].amount += amount;
}

function getFinancialReport() {
  const pricing = getPricingConfig();
  const approved = requests.filter((r) => r.paymentStatus === 'approved');
  const pendingXfer = requests.filter((r) => r.paymentStatus === 'pending_transfer');
  const payouts = getProviderPayouts();

  const summary = {
    visitsCollected: 0,
    cardSurcharges: 0,
    serviceVolume: 0,
    materialsVolume: 0,
    totalBilled: 0,
    appCommission: 0,
    laborCommission: 0,
    materialsCommission: 0,
    providerPending: payouts.reduce((s, p) => s + p.pending, 0),
    providerPaid: payouts.reduce((s, p) => s + p.paid, 0),
    pendingTransferCount: pendingXfer.length,
    pendingTransferAmount: pendingXfer.reduce((s, r) => s + (r.amountDue || 0), 0),
    approvedCount: approved.length,
    completedCount: approved.filter((r) => r.status === 'completed').length,
    activeCount: approved.filter((r) => ['searching', 'assigned', 'in_progress'].includes(r.status)).length
  };

  const byPaymentMethod = {};
  const byGateway = {};
  const byUrgency = {};
  const last7Days = {};

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    last7Days[key] = {
      date: key,
      label: d.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' }),
      amount: 0,
      count: 0
    };
  }

  const gatewayLabels = {
    transbank: 'Transbank',
    mercadopago: 'Mercado Pago',
    paypal: 'PayPal',
    transferencia: 'Transferencia',
    demo: 'Demo'
  };

  approved.forEach((r) => {
    const visitPaid = r.visitPricePaid || r.amountDue || 0;
    summary.visitsCollected += visitPaid;
    summary.cardSurcharges += r.paymentSurchargeAmount || 0;

    const method = r.paymentMethod === 'transfer' ? 'Transferencia' : 'Tarjeta';
    bumpFinanceBucket(byPaymentMethod, method, visitPaid);

    const gwKey = r.paymentGateway || (r.paymentMethod === 'transfer' ? 'transferencia' : 'demo');
    bumpFinanceBucket(byGateway, gatewayLabels[gwKey] || gwKey, visitPaid);

    bumpFinanceBucket(byUrgency, r.urgencyTierLabel || 'Sin urgencia', visitPaid);

    if (r.paidAt) {
      const day = String(r.paidAt).slice(0, 10);
      if (last7Days[day]) {
        last7Days[day].amount += visitPaid;
        last7Days[day].count++;
      }
    }

    if (r.status === 'completed') {
      const fin = r.financials || computeRequestFinancials(r, pricing);
      summary.serviceVolume += fin.serviceAmount || 0;
      summary.materialsVolume += fin.materialsTotal || 0;
      summary.totalBilled += fin.grandTotal || 0;
      summary.appCommission += fin.appTotal || 0;
      summary.laborCommission += fin.laborCommission || 0;
      summary.materialsCommission += fin.materialsCommission || 0;
    }
  });

  const toRows = (map) => Object.entries(map)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.amount - a.amount);

  const maxDaily = Math.max(1, ...Object.values(last7Days).map((d) => d.amount));

  return {
    summary,
    byPaymentMethod: toRows(byPaymentMethod),
    byGateway: toRows(byGateway),
    byUrgency: toRows(byUrgency),
    dailyTrend: Object.values(last7Days),
    maxDaily,
    pricing: {
      laborRate: pricing.laborCommissionRate,
      materialsRate: pricing.materialsCommissionRate,
      cardSurcharge: pricing.cardSurchargePercent
    }
  };
}

function getAllDteDocuments() {
  return requests
    .filter((r) => Array.isArray(r.dteDocuments) && r.dteDocuments.length)
    .flatMap((r) => r.dteDocuments.map((d) => ({ ...d, request: r })));
}

function needsOnboarding(user) {
  return user && user.onboardingCompleted !== true;
}

function completeOnboarding(userId) {
  const user = getUserById(userId);
  if (!user) return null;
  user.onboardingCompleted = true;
  user.onboardingCompletedAt = new Date().toISOString();
  repository.persist(() => repository.saveUser(user), `usuario ${userId}`);
  return user;
}

async function exportDataSnapshot({ includeSecurityLogs = true } = {}) {
  const versionInfo = getAppVersionInfo();
  const data = await repository.loadAllForBackup({ includeSecurityLogs });
  return {
    schemaVersion: 3,
    exportedAt: new Date().toISOString(),
    app: 'fundez',
    appVersion: versionInfo.version,
    appVersionLabel: versionInfo.label,
    gitCommit: versionInfo.gitCommit,
    gitTag: versionInfo.gitTag,
    services: data.services,
    modules: data.modules,
    pricing: data.pricing,
    users: data.users,
    requests: data.requests,
    homeLogbook: data.homeLogbook,
    complaints: data.complaints,
    chats: data.chats,
    consentRecords: data.consentRecords,
    securityLogs: data.securityLogs,
    notifications: data.notifications,
    promos: data.promos
  };
}

async function reloadFromDatabase() {
  ensureReady();
  const data = await repository.loadAll();
  SERVICES = data.services;
  MODULES = data.modules;
  PRICING_CONFIG = data.pricing || normalizePricing(DEFAULT_PRICING);
  USERS = data.users;
  requests = data.requests;
  homeLogbook = data.homeLogbook;
  COMPLAINTS = data.complaints;
  CHATS = data.chats;
  consentRecords = data.consentRecords;
  securityLogs = data.securityLogs;
  notifications = data.notifications || [];
  PROMOS = data.promos || [];
  require('../lib/notifications').bindStore(module.exports);
  return data;
}

async function importDataSnapshot(snapshot) {
  ensureReady();
  const stats = await repository.restoreFromSnapshot(snapshot);
  if (snapshot?.backupConfig) {
    const backupStore = require('../lib/backupStore');
    if (backupStore.isAvailable()) {
      await backupStore.saveConfig(snapshot.backupConfig);
      try {
        const backup = require('../lib/backup');
        const merged = { ...backup.DEFAULT_CONFIG, ...snapshot.backupConfig };
        merged.nextBackupAt = backup.computeNextBackupAt(merged);
        const fs = require('fs');
        const path = require('path');
        fs.writeFileSync(path.join(__dirname, '../data/backup-config.json'), JSON.stringify(merged, null, 2));
      } catch (_) {}
    }
  }
  await reloadFromDatabase();
  return stats;
}

module.exports = {
  init,
  isReady,
  get SERVICES() { return SERVICES; },
  get USERS() { return USERS; },
  get MODULES() { return MODULES; },
  formatCLP,
  getServiceById,
  getActiveServices,
  getLandingServices,
  toggleService,
  getModules,
  getModulesByAudience,
  getEnabledModules,
  isModuleEnabled,
  toggleModule,
  getCoverageCommunes,
  getCoverageRegions,
  getCoverageForAdmin,
  getCoverageStats,
  toggleCoverageCommune,
  toggleCoverageRegion,
  validateAddressCoverage,
  getPricingConfig,
  updatePricingConfig,
  getUrgencyTiersForClient,
  previewVisitPrice,
  getUserByEmail,
  authenticateUser,
  registerUser,
  createTechnician,
  getTechniciansByProvider,
  getTechnicianForProvider,
  setUserActive,
  getAdminTeamUsers,
  createAdminUser,
  updateAdminUserAccess,
  getAdminPermissionMeta,
  resolveAdminAccess,
  isMfaEnabled,
  beginMfaSetup,
  confirmMfaSetup,
  disableMfa,
  verifyMfaCode,
  getAdminMfaStatus,
  getDemoAccounts,
  getUserById,
  getOnlineProviders,
  createRequest,
  setPaymentPreference,
  setCardPaymentSession,
  markPaymentApproved,
  activateRequest,
  assignProvider,
  updateRequestStatus,
  assignTechnician,
  updateTechStatus,
  getRequestForTechnician,
  recordSiteArrival,
  setSiteAction,
  submitSiteBudget,
  respondSiteBudget,
  addSiteMaterial,
  completeSiteWork,
  getRequestsByTechnician,
  updateTechnicianLocation,
  computeEtaMinutes,
  setProviderOnline,
  getRequestsByClient,
  getActiveRequestsForClient,
  getLastCompletedRequest,
  getClientTrustStats,
  getRequestStatusLabel,
  enrichRequestForClient,
  submitClientReview,
  getRequestsByProvider,
  getActiveRequestsForProvider,
  getProviderDashboardStats,
  getProviderPayoutSummary,
  getProviderWorkflowStep,
  enrichRequestForProvider,
  getTechStatusLabel,
  getAllRequests,
  getPendingRequestsForProvider,
  getWorkWallItems,
  tryAcceptRequest,
  getOnlineTechnicians,
  setTechnicianOnline,
  providerSockets,
  technicianSockets,
  get COMPLAINTS() { return COMPLAINTS; },
  get CHATS() { return CHATS; },
  getPayments,
  getProviderPayouts,
  getAdminStats,
  getFinancialReport,
  getConsentsSummary,
  recordConsent,
  recordRegistrationConsents,
  validateRegistrationConsents,
  getUserConsentStatus,
  revokeUserConsent,
  isEmailVerified,
  issueEmailVerification,
  verifyEmailCode,
  resendEmailVerification,
  POLICY_VERSION,
  get consentRecords() { return consentRecords; },
  get securityLogs() { return securityLogs; },
  logSecurityEvent,
  updateComplaintStatus,
  markPayoutPaid,
  updateUserProfile,
  updateUserBilling,
  isBillingComplete,
  setRequestBillingSnapshot,
  submitTransferPayment,
  approveTransferPayment,
  getReferralStats,
  applyReferralCode,
  getActivePromos,
  get PROMOS() { return getActivePromos(); },
  POINTS_VALUE_CLP,
  getCheckoutSummary,
  applyCheckoutDiscounts,
  getRequestByGuardianToken,
  getHomePassport,
  ensureProviderFields,
  canProviderGoOnline,
  getProviderContract,
  updateProviderContractDraft,
  saveContractDocument,
  submitProviderContract,
  getAllProviderContracts,
  reviewProviderContract,
  getContractStats,
  getPublicProviderProfile,
  saveProviderDocument,
  saveProviderSelfie,
  setLocationConsent,
  updateProviderLocation,
  computeVerificationStatus,
  exportDataSnapshot,
  importDataSnapshot,
  reloadFromDatabase,
  needsOnboarding,
  completeOnboarding,
  getAllDteDocuments,
  get requests() { return requests; },
  get notifications() { return notifications; }
};
