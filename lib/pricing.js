const {
  calculateDynamicTariff,
  MIN_WORK_BASE_CLP,
  MIN_DIAGNOSTIC_VISIT_CLP
} = require('./dynamicTariffs');

const DEFAULT_PRICING = {
  visitPrice: MIN_DIAGNOSTIC_VISIT_CLP,
  servicePrice: 160000,
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
  // Tiers = compromiso de llegada (minutos). El % ya no se configura a mano:
  // lo calcula el motor (horario × urgencia) sobre servicePrice.
  urgencyTiers: [
    {
      id: 'critical',
      label: 'Menos de 1 hora',
      description: 'Llegada comprometida en menos de 60 minutos',
      responseMinutes: 45,
      enabled: true,
      sortOrder: 1
    },
    {
      id: 'medium',
      label: '1 a 2 horas',
      description: 'Llegada comprometida entre 60 y 120 minutos',
      responseMinutes: 90,
      enabled: true,
      sortOrder: 2
    },
    {
      id: 'scheduled',
      label: 'Más de 2 horas / programado',
      description: 'Servicio programado (más de 120 minutos)',
      responseMinutes: 180,
      enabled: true,
      sortOrder: 3
    }
  ]
};

const DEFAULT_RESPONSE_BY_ID = {
  critical: 45,
  medium: 90,
  scheduled: 180,
  // Compat con tiers antiguos guardados en BD
  immediate: 45,
  today: 90,
  tomorrow: 180,
  two_days: 180
};

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

  const tiers = Array.isArray(raw?.urgencyTiers) && raw.urgencyTiers.length
    ? raw.urgencyTiers
    : DEFAULT_PRICING.urgencyTiers;

  base.urgencyTiers = tiers.map((t, i) => {
    const id = t.id || `tier-${i}`;
    const responseMinutes = Math.max(
      0,
      parseInt(t.responseMinutes, 10)
        || DEFAULT_RESPONSE_BY_ID[id]
        || DEFAULT_PRICING.urgencyTiers[i]?.responseMinutes
        || 180
    );
    return {
      id,
      label: t.label || `Opción ${i + 1}`,
      description: t.description || '',
      responseMinutes,
      // adjustmentPercent queda solo informativo / compat UI (se recalcula en preview)
      adjustmentPercent: parseInt(t.adjustmentPercent, 10) || 0,
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
  return tiers.find(t => t.id === 'scheduled') || tiers[tiers.length - 1] || tiers[0] || null;
}

/**
 * Cotiza el trabajo con tarifas dinámicas (horario × urgencia) sobre servicePrice.
 * Compat: visitTotal = total dinámico (lo que paga el cliente al solicitar).
 */
function calculateVisitPricing(pricing, tierId, { horaSolicitud = new Date(), valorBase } = {}) {
  const cfg = normalizePricing(pricing);
  const tier = getUrgencyTier(cfg, tierId);
  if (!tier) return null;

  const tariff = calculateDynamicTariff({
    valorBase: valorBase != null ? valorBase : cfg.servicePrice,
    horaSolicitud,
    tiempoRespuestaMinutos: tier.responseMinutes
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
  let serviceAmount = request.approvedServicePrice ?? request.servicePriceBase ?? 0;

  const sr = request.siteReport;
  if (sr?.budgetStatus === 'approved' && sr.budgetAmount) {
    serviceAmount = Math.max(serviceAmount, sr.budgetAmount - visitPaid);
  }

  const materialsTotal = (sr?.materials || []).reduce((s, m) => s + (parseInt(m.amount, 10) || 0), 0);
  const laborTotal = visitPaid + serviceAmount;
  const grandTotal = laborTotal + materialsTotal;

  const laborCommission = Math.round(laborTotal * cfg.laborCommissionRate);
  const materialsCommission = Math.round(materialsTotal * cfg.materialsCommissionRate);

  const paidByCard = request.paymentMethod === 'card'
    || request.paymentMethod === 'transbank'
    || request.paymentMethod === 'mercadopago'
    || request.paymentMethod === 'paypal';
  // Si aún no hay método (estimado al tomar trabajo), asumimos tarjeta (peor caso para el socio).
  const applyCardFee = paidByCard || !request.paymentMethod;
  const cardFee = applyCardFee
    ? Math.round(grandTotal * (cfg.merchantCardFeePercent / 100))
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
    merchantCardFeePercent: fin.merchantCardFeePercent,
    ivaRate: fin.ivaRate,
    paymentMethod: fin.paymentMethod
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

module.exports = {
  DEFAULT_PRICING,
  normalizePricing,
  normalizePaymentGateways,
  getActiveUrgencyTiers,
  getUrgencyTier,
  calculateVisitPricing,
  calculatePaymentSurcharge,
  formatAdjustmentLabel,
  computeRequestFinancials,
  getProviderVisibleFinancials,
  sanitizeRequestForWorker,
  MIN_WORK_BASE_CLP,
  MIN_DIAGNOSTIC_VISIT_CLP
};
