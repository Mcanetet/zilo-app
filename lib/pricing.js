const {
  calculateDynamicTariff,
  MIN_WORK_BASE_CLP,
  MIN_DIAGNOSTIC_VISIT_CLP,
  getServiceCatalog,
  flattenServiceCatalog,
  normalizeCatalogPrices,
  getActivitiesForService,
  findCatalogActivity,
  specialtyIdForService
} = require('./dynamicTariffs');

const DEFAULT_PRICING = {
  visitPrice: MIN_DIAGNOSTIC_VISIT_CLP,
  servicePrice: 160000,
  /** Overrides de precio base del catálogo: { [activityId]: CLP } */
  catalogPrices: {},
  cancellationFee: 35000,
  laborCommissionRate: 0.20,
  materialsCommissionRate: 0.05,
  /** % que Fundez retiene por uso de tarjetas al liquidar al socio (no es el recargo al cliente). */
  merchantCardFeePercent: 4,
  /** IVA Chile sobre comisiones + fee tarjeta */
  ivaRate: 0.19,
  cardSurchargePercent: 5,
  cardEnabled: true,
  transferEnabled: true,
  bankTransfer: {
    bankName: 'Banco de Chile',
    accountType: 'Cuenta corriente',
    accountNumber: '1234567890',
    holderName: 'Fundez SpA',
    holderRut: '77.777.777-7',
    email: 'pagos@fundez.cl'
  },
  paymentGateways: {
    transbank: { enabled: true, sortOrder: 1 },
    mercadopago: { enabled: true, sortOrder: 2 },
    paypal: { enabled: false, sortOrder: 3 }
  },
  /** Recargos de horario configurables en Admin (% sobre tarifa base). */
  scheduleSurcharges: {
    normalPercent: 0,
    tardePercent: 25,
    nocturnoPercent: 50
  },
  // Opciones de llegada del cliente. surchargePercent se multiplica después del horario.
  urgencyTiers: [
    {
      id: 'immediate',
      label: 'Inmediato (1-3 h)',
      description: 'Un técnico puede llegar entre 1 y 3 horas',
      responseMinutes: 45,
      surchargePercent: 25,
      enabled: true,
      sortOrder: 1
    },
    {
      id: 'today',
      label: 'Hoy (4-8 h)',
      description: 'Servicio programado para hoy, entre 4 y 8 horas',
      responseMinutes: 90,
      surchargePercent: 10,
      enabled: true,
      sortOrder: 2
    },
    {
      id: 'tomorrow',
      label: 'Mañana',
      description: 'Al día siguiente — precio normal',
      responseMinutes: 180,
      surchargePercent: 0,
      enabled: true,
      sortOrder: 3
    },
    {
      id: 'two_days',
      label: 'En 2 días',
      description: 'Programado con anticipación — descuento en la visita',
      responseMinutes: 180,
      surchargePercent: -10,
      enabled: true,
      sortOrder: 4
    }
  ]
};

const DEFAULT_RESPONSE_BY_ID = {
  immediate: 45,
  today: 90,
  tomorrow: 180,
  two_days: 180,
  // Compat con tiers antiguos
  critical: 45,
  medium: 90,
  scheduled: 180
};

const DEFAULT_SURCHARGE_BY_ID = {
  immediate: 25,
  today: 10,
  tomorrow: 0,
  two_days: -10,
  critical: 25,
  medium: 10,
  scheduled: 0
};

function clampSurchargePercent(val, fallback = 0) {
  const n = parseInt(val, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(200, Math.max(-50, n));
}

function normalizeScheduleSurcharges(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    normalPercent: clampSurchargePercent(source.normalPercent, DEFAULT_PRICING.scheduleSurcharges.normalPercent),
    tardePercent: clampSurchargePercent(source.tardePercent, DEFAULT_PRICING.scheduleSurcharges.tardePercent),
    nocturnoPercent: clampSurchargePercent(source.nocturnoPercent, DEFAULT_PRICING.scheduleSurcharges.nocturnoPercent)
  };
}

function normalizePricing(raw) {
  const base = { ...DEFAULT_PRICING, ...(raw || {}) };
  base.visitPrice = Math.max(
    MIN_DIAGNOSTIC_VISIT_CLP,
    parseInt(base.visitPrice, 10) || DEFAULT_PRICING.visitPrice
  );
  base.servicePrice = Math.max(
    MIN_WORK_BASE_CLP,
    parseInt(base.servicePrice, 10) || DEFAULT_PRICING.servicePrice
  );
  base.cancellationFee = Math.max(0, parseInt(base.cancellationFee, 10) || DEFAULT_PRICING.cancellationFee);
  base.laborCommissionRate = clampRate(base.laborCommissionRate, DEFAULT_PRICING.laborCommissionRate);
  base.materialsCommissionRate = clampRate(base.materialsCommissionRate, DEFAULT_PRICING.materialsCommissionRate);
  base.merchantCardFeePercent = Math.max(
    0,
    parseInt(base.merchantCardFeePercent, 10)
      || DEFAULT_PRICING.merchantCardFeePercent
  );
  const ivaRaw = parseFloat(base.ivaRate);
  base.ivaRate = Number.isFinite(ivaRaw)
    ? Math.min(1, Math.max(0, ivaRaw > 1 ? ivaRaw / 100 : ivaRaw))
    : DEFAULT_PRICING.ivaRate;
  base.cardSurchargePercent = Math.max(0, parseInt(base.cardSurchargePercent, 10) || DEFAULT_PRICING.cardSurchargePercent);
  base.cardEnabled = base.cardEnabled !== false;
  base.transferEnabled = base.transferEnabled !== false;
  base.bankTransfer = {
    ...DEFAULT_PRICING.bankTransfer,
    ...(raw?.bankTransfer || {})
  };
  base.paymentGateways = normalizePaymentGateways(raw?.paymentGateways);
  base.catalogPrices = normalizeCatalogPrices(raw?.catalogPrices || base.catalogPrices);
  base.scheduleSurcharges = normalizeScheduleSurcharges(raw?.scheduleSurcharges || base.scheduleSurcharges);

  const tiersRaw = Array.isArray(raw?.urgencyTiers) && raw.urgencyTiers.length
    ? raw.urgencyTiers
    : DEFAULT_PRICING.urgencyTiers;
  const tierIds = new Set(tiersRaw.map((t) => t.id));
  const looksLikeLegacyThree =
    tierIds.has('critical') &&
    tierIds.has('medium') &&
    tierIds.has('scheduled') &&
    !tierIds.has('immediate') &&
    !tierIds.has('today');
  const tiers = looksLikeLegacyThree ? DEFAULT_PRICING.urgencyTiers : tiersRaw;

  base.urgencyTiers = tiers.map((t, i) => {
    const id = t.id || `tier-${i}`;
    const responseMinutes = Math.max(
      0,
      parseInt(t.responseMinutes, 10)
        || DEFAULT_RESPONSE_BY_ID[id]
        || DEFAULT_PRICING.urgencyTiers[i]?.responseMinutes
        || 180
    );
    const surchargeFallback = DEFAULT_SURCHARGE_BY_ID[id]
      ?? DEFAULT_PRICING.urgencyTiers[i]?.surchargePercent
      ?? 0;
    const surchargePercent = clampSurchargePercent(
      t.surchargePercent != null ? t.surchargePercent : t.adjustmentPercent,
      surchargeFallback
    );
    return {
      id,
      label: t.label || `Opción ${i + 1}`,
      description: t.description || '',
      responseMinutes,
      surchargePercent,
      // Compat UI antigua
      adjustmentPercent: surchargePercent,
      enabled: t.enabled !== false,
      sortOrder: parseInt(t.sortOrder, 10) || i + 1
    };
  }).sort((a, b) => a.sortOrder - b.sortOrder);

  return base;
}

function clampRate(val, fallback) {
  const n = parseFloat(val);
  if (Number.isNaN(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

function normalizePaymentGateways(raw) {
  const defaults = DEFAULT_PRICING.paymentGateways;
  const source = raw && typeof raw === 'object' ? raw : {};
  const result = {};
  ['transbank', 'mercadopago', 'paypal'].forEach((id, i) => {
    const def = defaults[id] || { enabled: true, sortOrder: i + 1 };
    const item = source[id];
    result[id] = {
      enabled: item != null ? item.enabled !== false : def.enabled !== false,
      sortOrder: parseInt(item?.sortOrder, 10) || def.sortOrder || i + 1
    };
  });
  return result;
}

function getActiveUrgencyTiers(pricing) {
  return (pricing.urgencyTiers || []).filter(t => t.enabled !== false).sort((a, b) => a.sortOrder - b.sortOrder);
}

function getUrgencyTier(pricing, tierId) {
  const tiers = getActiveUrgencyTiers(pricing);
  if (tierId) {
    const found = tiers.find(t => t.id === tierId);
    if (found) return found;
  }
  return tiers.find(t => t.id === 'tomorrow' || t.id === 'scheduled' || t.id === 'two_days')
    || tiers[tiers.length - 1]
    || tiers[0]
    || null;
}

/**
 * Cotiza el trabajo con tarifas dinámicas (horario × urgencia) sobre servicePrice.
 * Compat: visitTotal = total dinámico (lo que paga el cliente al solicitar).
 */
function calculateVisitPricing(pricing, tierId, { horaSolicitud = new Date(), valorBase, timeZone } = {}) {
  const cfg = normalizePricing(pricing);
  const tier = getUrgencyTier(cfg, tierId);
  if (!tier) return null;

  const urgenciaMultiplier = 1 + (Number(tier.surchargePercent) || 0) / 100;
  const tariff = calculateDynamicTariff({
    valorBase: valorBase != null ? valorBase : cfg.servicePrice,
    horaSolicitud,
    tiempoRespuestaMinutos: tier.responseMinutes,
    urgenciaMultiplier,
    urgenciaBand: tier.id,
    scheduleSurcharges: cfg.scheduleSurcharges,
    timeZone
  });

  const adjustmentAmount = tariff.total - tariff.valorBaseAplicado;
  const adjustmentPercent = tariff.valorBaseAplicado > 0
    ? Math.round((adjustmentAmount / tariff.valorBaseAplicado) * 100)
    : 0;

  const enrichedTier = {
    ...tier,
    adjustmentPercent,
    horarioBand: tariff.horarioBand,
    urgenciaBand: tariff.urgenciaBand
  };

  return {
    tier: enrichedTier,
    baseVisit: tariff.valorBaseAplicado,
    adjustmentPercent,
    adjustmentAmount,
    visitTotal: tariff.total,
    servicePrice: 0,
    estimatedTotal: tariff.total,
    diagnosticVisitMin: Math.max(MIN_DIAGNOSTIC_VISIT_CLP, cfg.visitPrice),
    tariff
  };
}

function formatAdjustmentLabel(percent) {
  if (percent > 0) return `+${percent}%`;
  if (percent < 0) return `${percent}%`;
  return 'Precio normal';
}

function calculatePaymentSurcharge(pricing, visitSubtotal, paymentMethod) {
  const cfg = normalizePricing(pricing);
  const method = paymentMethod === 'transfer' ? 'transfer' : 'card';
  if (method === 'transfer' || !cfg.cardEnabled) {
    return { method: 'transfer', percent: 0, amount: 0, subtotal: visitSubtotal };
  }
  const percent = cfg.cardSurchargePercent || 0;
  const amount = Math.round(visitSubtotal * percent / 100);
  return {
    method: 'card',
    percent,
    amount,
    subtotal: visitSubtotal + amount
  };
}

function computeRequestFinancials(request, pricing) {
  const cfg = normalizePricing(pricing);
  const visitPaid = request.visitPricePaid ?? request.visitTotal ?? request.basePrice ?? cfg.visitPrice;
  let serviceAmount = request.additionalPaymentsTotal ?? request.approvedServicePrice ?? 0;

  const sr = request.siteReport;
  // Compatibilidad con solicitudes antiguas, anteriores al cobro de ajustes.
  if (sr?.budgetStatus === 'approved' && sr.budgetAmount && request.additionalPaymentsTotal == null) {
    serviceAmount = Math.max(serviceAmount, sr.budgetAmount - visitPaid);
  }

  const materialsTotal = (sr?.materials || []).reduce((s, m) => s + (parseInt(m.amount, 10) || 0), 0);
  const laborTotal = visitPaid + serviceAmount;
  const grandTotal = laborTotal + materialsTotal;

  const laborCommission = Math.round(laborTotal * cfg.laborCommissionRate);
  // Los materiales son un reembolso íntegro al socio: no generan comisión Fundez.
  const materialsCommission = 0;

  const paidByCard = request.paymentMethod === 'card'
    || request.paymentMethod === 'transbank'
    || request.paymentMethod === 'mercadopago'
    || request.paymentMethod === 'paypal';
  // Si aún no hay método (estimado al tomar trabajo), asumimos tarjeta (peor caso para el socio).
  const applyCardFee = paidByCard || !request.paymentMethod;
  // El costo de materiales no infla cargos ni porcentajes de la plataforma.
  const cardFee = applyCardFee
    ? Math.round(laborTotal * (cfg.merchantCardFeePercent / 100))
    : 0;

  const feesBeforeIva = laborCommission + materialsCommission + cardFee;
  const ivaOnFees = Math.round(feesBeforeIva * cfg.ivaRate);
  const appTotal = feesBeforeIva + ivaOnFees;
  const providerTotal = Math.max(0, grandTotal - appTotal);

  return {
    visitPaid,
    serviceAmount,
    materialsTotal,
    laborTotal,
    laborCommission,
    laborProvider: laborTotal - laborCommission,
    materialsCommission,
    materialsProvider: materialsTotal - materialsCommission,
    cardFee,
    cardFeeApplied: applyCardFee,
    merchantCardFeePercent: cfg.merchantCardFeePercent,
    ivaOnFees,
    ivaRate: cfg.ivaRate,
    feesBeforeIva,
    appTotal,
    providerTotal,
    grandTotal,
    laborCommissionRate: cfg.laborCommissionRate,
    materialsCommissionRate: cfg.materialsCommissionRate,
    paymentMethod: request.paymentMethod || null
  };
}

/**
 * Vista para socios/técnicos: solo ven su pago hasta completar el servicio.
 */
function getProviderVisibleFinancials(request, pricing) {
  const fin = computeRequestFinancials(request, pricing);
  const completed = request.status === 'completed' || request.techStatus === 'completado';
  if (!completed) {
    return {
      completed: false,
      providerPayout: fin.providerTotal,
      // No exponer totales del cliente ni cortes de la app
      grandTotal: null,
      appTotal: null,
      laborCommission: null,
      cardFee: null,
      ivaOnFees: null
    };
  }
  return {
    completed: true,
    providerPayout: fin.providerTotal,
    grandTotal: fin.grandTotal,
    appTotal: fin.appTotal,
    laborCommission: fin.laborCommission,
    materialsCommission: fin.materialsCommission,
    cardFee: fin.cardFee,
    ivaOnFees: fin.ivaOnFees,
    feesBeforeIva: fin.feesBeforeIva,
    laborCommissionRate: fin.laborCommissionRate,
    materialsCommissionRate: 0,
    merchantCardFeePercent: fin.merchantCardFeePercent,
    ivaRate: fin.ivaRate,
    paymentMethod: fin.paymentMethod
  };
}

/**
 * Resumen final que puede ver el cliente. No expone comisiones internas.
 */
function getClientVisibleFinancials(request, pricing) {
  const fin = computeRequestFinancials(request, pricing);
  const completed = request.status === 'completed' || request.techStatus === 'completado';
  const materials = (request.siteReport?.materials || []).map((material) => ({
    description: material.description,
    amount: parseInt(material.amount, 10) || 0
  }));
  return {
    completed,
    visitPaid: fin.visitPaid,
    serviceAmount: fin.serviceAmount,
    laborTotal: fin.laborTotal,
    materialsTotal: fin.materialsTotal,
    materials,
    grandTotal: fin.grandTotal,
    materialsAtCost: true
  };
}

/**
 * Sanitiza una solicitud para el muro / socket del socio o técnico.
 */
function sanitizeRequestForWorker(request, pricing) {
  if (!request) return null;
  const visible = getProviderVisibleFinancials(request, pricing);
  const {
    amountDue,
    visitTotal,
    visitBasePrice,
    basePrice,
    estimatedVisit,
    servicePriceBase,
    urgencyAdjustmentAmount,
    paymentSurchargeAmount,
    paymentSurchargePercent,
    financials,
    chatMessages,
    ...safe
  } = request;

  return {
    ...safe,
    providerPayout: visible.providerPayout,
    financialsVisible: visible,
    // Compat UI antigua: solo muestra lo que gana el socio
    estimatedVisit: visible.providerPayout,
    amountDue: undefined,
    visitTotal: undefined,
    basePrice: undefined
  };
}

function getPricingServiceCatalog(pricing) {
  const cfg = normalizePricing(pricing);
  return getServiceCatalog(cfg.catalogPrices);
}

function getPricingCatalogRows(pricing) {
  const cfg = normalizePricing(pricing);
  return flattenServiceCatalog(cfg.catalogPrices);
}

function getActivitiesForAppService(pricing, serviceId) {
  const cfg = normalizePricing(pricing);
  return getActivitiesForService(serviceId, cfg.catalogPrices);
}

/** Precio promedio de los subservicios de una especialidad para la grilla del cliente. */
function getServiceAveragePrice(pricing, serviceId) {
  const activities = getActivitiesForAppService(pricing, serviceId);
  if (!activities.length) return MIN_WORK_BASE_CLP;
  const total = activities.reduce(
    (sum, activity) => sum + (Number(activity.basePrice) || MIN_WORK_BASE_CLP),
    0
  );
  return Math.round(total / activities.length);
}

function quoteActivityForRequest(pricing, activityId, { horaSolicitud, tierId, timeZone } = {}) {
  const cfg = normalizePricing(pricing);
  const found = findCatalogActivity(activityId, cfg.catalogPrices);
  if (!found) return null;
  const tier = getUrgencyTier(cfg, tierId);
  if (!tier) return null;
  return calculateVisitPricing(cfg, tier.id, {
    horaSolicitud: horaSolicitud || new Date(),
    valorBase: found.activity.basePrice,
    timeZone
  });
}

module.exports = {
  DEFAULT_PRICING,
  normalizePricing,
  normalizeScheduleSurcharges,
  normalizePaymentGateways,
  getActiveUrgencyTiers,
  getUrgencyTier,
  calculateVisitPricing,
  calculatePaymentSurcharge,
  formatAdjustmentLabel,
  computeRequestFinancials,
  getProviderVisibleFinancials,
  getClientVisibleFinancials,
  sanitizeRequestForWorker,
  getPricingServiceCatalog,
  getPricingCatalogRows,
  getActivitiesForAppService,
  getServiceAveragePrice,
  quoteActivityForRequest,
  specialtyIdForService,
  findCatalogActivity,
  MIN_WORK_BASE_CLP,
  MIN_DIAGNOSTIC_VISIT_CLP
};
