/**
 * Motor de tarifas dinámicas Fundez (CLP).
 * Total = round((valorBase * recargoHorario) * recargoUrgencia)
 */

'use strict';

const { SERVICE_CATALOG, SERVICE_TO_SPECIALTY } = require('./serviceCatalogData');

/** @typedef {'preventiva' | 'correctiva'} ActivityKind */
/** @typedef {'normal' | 'tarde' | 'nocturno'} ScheduleBand */
/** @typedef {'critical' | 'medium' | 'scheduled'} UrgencyBand */

/**
 * @typedef {Object} CatalogActivity
 * @property {string} id
 * @property {string} name
 * @property {ActivityKind} kind
 * @property {number} basePrice CLP en horario normal
 */

/**
 * @typedef {Object} SpecialtyCatalog
 * @property {string} id
 * @property {string} name
 * @property {CatalogActivity[]} activities
 */

/**
 * @typedef {Object} DynamicTariffInput
 * @property {number} valorBase
 * @property {Date|string} horaSolicitud Date, ISO o 'HH:mm' (hora local del dispositivo o Chile)
 * @property {number} tiempoRespuestaMinutos
 * @property {boolean} [strictBase=false] Si true, valorBase < 100000 lanza error
 * @property {string} [timeZone] Zona IANA; por defecto America/Santiago
 */

/**
 * @typedef {Object} DynamicTariffResult
 * @property {number} valorBaseOriginal
 * @property {number} valorBaseAplicado
 * @property {ScheduleBand} horarioBand
 * @property {number} horarioMultiplier
 * @property {number} afterSchedule
 * @property {UrgencyBand} urgenciaBand
 * @property {number} urgenciaMultiplier
 * @property {number} tiempoRespuestaMinutos
 * @property {number} total
 * @property {string} minutesOfDay
 * @property {string} timeZone
 */

const MIN_WORK_BASE_CLP = 100000;
const MIN_DIAGNOSTIC_VISIT_CLP = 50000;
const BUSINESS_TIME_ZONE = 'America/Santiago';

function specialtyIdForService(serviceId) {
  return SERVICE_TO_SPECIALTY[serviceId] || null;
}

function getActivitiesForService(serviceId, priceOverrides = null) {
  const specialtyId = specialtyIdForService(serviceId);
  if (!specialtyId) return [];
  const catalog = getServiceCatalog(priceOverrides);
  return catalog.find((s) => s.id === specialtyId)?.activities || [];
}

function buildTimeParts(hours, minutes) {
  return {
    hours,
    minutes,
    totalMinutes: hours * 60 + minutes,
    label: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  };
}

function parseHHmm(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return buildTimeParts(hours, minutes);
}

/**
 * Extrae HH:mm de un Date en una zona IANA (nunca usa la zona del servidor).
 * @param {Date} date
 * @param {string} [timeZone]
 */
function timePartsInZone(date, timeZone = BUSINESS_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timeZone || BUSINESS_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const hours = Number(parts.find((p) => p.type === 'hour')?.value);
  const minutes = Number(parts.find((p) => p.type === 'minute')?.value);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    throw new Error('No se pudo resolver la hora local');
  }
  return buildTimeParts(hours, minutes);
}

/**
 * @param {Date|string} horaSolicitud
 * @param {{ timeZone?: string }} [opts]
 * @returns {{ hours: number, minutes: number, totalMinutes: number, label: string, timeZone: string }}
 */
function parseRequestTime(horaSolicitud, opts = {}) {
  const timeZone = opts.timeZone || BUSINESS_TIME_ZONE;

  if (typeof horaSolicitud === 'string') {
    const asClock = parseHHmm(horaSolicitud);
    if (asClock) return { ...asClock, timeZone };
    const asDate = new Date(horaSolicitud);
    if (!Number.isNaN(asDate.getTime())) {
      return { ...timePartsInZone(asDate, timeZone), timeZone };
    }
  }

  if (horaSolicitud instanceof Date && !Number.isNaN(horaSolicitud.getTime())) {
    return { ...timePartsInZone(horaSolicitud, timeZone), timeZone };
  }

  throw new Error('horaSolicitud inválida: usa Date, ISO o string HH:mm');
}

/**
 * A) Recargo por horario sobre valorBase.
 * Bandas fijas de reloj; los % vienen de Admin (scheduleSurcharges).
 * @param {number} totalMinutes
 * @param {{ normalPercent?: number, tardePercent?: number, nocturnoPercent?: number }} [scheduleSurcharges]
 * @returns {{ band: ScheduleBand, multiplier: number, percent: number }}
 */
function getScheduleMultiplier(totalMinutes, scheduleSurcharges = {}) {
  const startNormal = 9 * 60;       // 09:00
  const endNormal = 17 * 60;        // 17:00 inclusive
  const endLate = 21 * 60;          // 21:00 inclusive as late
  const normalPercent = Number.isFinite(Number(scheduleSurcharges.normalPercent))
    ? Number(scheduleSurcharges.normalPercent) : 0;
  const tardePercent = Number.isFinite(Number(scheduleSurcharges.tardePercent))
    ? Number(scheduleSurcharges.tardePercent) : 25;
  const nocturnoPercent = Number.isFinite(Number(scheduleSurcharges.nocturnoPercent))
    ? Number(scheduleSurcharges.nocturnoPercent) : 50;

  if (totalMinutes >= startNormal && totalMinutes <= endNormal) {
    return { band: 'normal', multiplier: 1 + normalPercent / 100, percent: normalPercent };
  }
  if (totalMinutes > endNormal && totalMinutes <= endLate) {
    return { band: 'tarde', multiplier: 1 + tardePercent / 100, percent: tardePercent };
  }
  return { band: 'nocturno', multiplier: 1 + nocturnoPercent / 100, percent: nocturnoPercent };
}

/**
 * B) Recargo por urgencia (fallback por minutos si no viene multiplier del admin).
 * < 60 → 1.25 | 60–120 → 1.10 | > 120 → 1.0
 * @param {number} tiempoRespuestaMinutos
 * @returns {{ band: UrgencyBand, multiplier: number }}
 */
function getUrgencyMultiplier(tiempoRespuestaMinutos) {
  const minutes = Number(tiempoRespuestaMinutos);
  if (!Number.isFinite(minutes) || minutes < 0) {
    throw new Error('tiempoRespuestaMinutos debe ser un número >= 0');
  }
  if (minutes < 60) return { band: 'critical', multiplier: 1.25 };
  if (minutes <= 120) return { band: 'medium', multiplier: 1.1 };
  return { band: 'scheduled', multiplier: 1.0 };
}

/**
 * Normaliza valorBase: mínimo $100.000 (o error si strictBase).
 * @param {number} valorBase
 * @param {{ strictBase?: boolean }} [opts]
 */
function normalizeWorkBase(valorBase, opts = {}) {
  const n = Number(valorBase);
  if (!Number.isFinite(n)) {
    throw new Error('valorBase debe ser un número válido');
  }
  if (opts.strictBase && n < MIN_WORK_BASE_CLP) {
    throw new Error(`valorBase mínimo es ${MIN_WORK_BASE_CLP}`);
  }
  return Math.max(MIN_WORK_BASE_CLP, Math.round(n));
}

/**
 * Calcula el costo total compuesto:
 * Total = round((valorBase * horario) * urgencia)
 * @param {DynamicTariffInput} input
 * @returns {DynamicTariffResult}
 */
function calculateDynamicTariff(input) {
  const {
    valorBase,
    horaSolicitud,
    tiempoRespuestaMinutos,
    strictBase = false,
    timeZone,
    urgenciaMultiplier,
    urgenciaBand,
    scheduleSurcharges
  } = input || {};

  // 1) Base de trabajo (>= $100.000)
  const valorBaseOriginal = Number(valorBase);
  const valorBaseAplicado = normalizeWorkBase(valorBaseOriginal, { strictBase });

  // 2) Parseo de hora local del dispositivo (o Chile) y banda horaria
  const time = parseRequestTime(horaSolicitud ?? new Date(), { timeZone });
  const schedule = getScheduleMultiplier(time.totalMinutes, scheduleSurcharges);

  // 3) Paso A: aplicar recargo horario
  const afterSchedule = valorBaseAplicado * schedule.multiplier;

  // 4) Paso B: aplicar recargo de urgencia (config Admin o fallback por minutos)
  const urgency = Number.isFinite(Number(urgenciaMultiplier))
    ? {
        band: urgenciaBand || 'custom',
        multiplier: Math.max(0.5, Number(urgenciaMultiplier))
      }
    : getUrgencyMultiplier(tiempoRespuestaMinutos);
  const rawTotal = afterSchedule * urgency.multiplier;

  // 5) Redondeo a peso chileno entero
  const total = Math.round(rawTotal);

  return {
    valorBaseOriginal: Number.isFinite(valorBaseOriginal) ? valorBaseOriginal : valorBaseAplicado,
    valorBaseAplicado,
    horarioBand: schedule.band,
    horarioMultiplier: schedule.multiplier,
    horarioPercent: schedule.percent,
    afterSchedule: Math.round(afterSchedule),
    urgenciaBand: urgency.band,
    urgenciaMultiplier: urgency.multiplier,
    tiempoRespuestaMinutos: Number(tiempoRespuestaMinutos),
    total,
    minutesOfDay: time.label,
    timeZone: time.timeZone
  };
}

/**
 * Aplica overrides de precios (activityId → CLP) sobre el catálogo base.
 * @param {Record<string, number>|null|undefined} priceOverrides
 * @returns {SpecialtyCatalog[]}
 */
function getServiceCatalog(priceOverrides = null) {
  const overrides = priceOverrides && typeof priceOverrides === 'object' ? priceOverrides : {};
  return SERVICE_CATALOG.map((specialty) => ({
    id: specialty.id,
    name: specialty.name,
    activities: specialty.activities.map((activity) => {
      const override = parseInt(overrides[activity.id], 10);
      const basePrice = Number.isFinite(override) && override > 0
        ? Math.max(MIN_WORK_BASE_CLP, override)
        : activity.basePrice;
      return { ...activity, basePrice };
    })
  }));
}

/**
 * Lista plana para tablas admin: especialidad + actividad + precio.
 * @param {Record<string, number>|null|undefined} priceOverrides
 */
function flattenServiceCatalog(priceOverrides = null) {
  const rows = [];
  getServiceCatalog(priceOverrides).forEach((specialty) => {
    specialty.activities.forEach((activity) => {
      rows.push({
        specialtyId: specialty.id,
        specialtyName: specialty.name,
        activityId: activity.id,
        activityName: activity.name,
        kind: activity.kind,
        basePrice: activity.basePrice,
        defaultBasePrice: SERVICE_CATALOG
          .find((s) => s.id === specialty.id)
          ?.activities.find((a) => a.id === activity.id)?.basePrice || activity.basePrice
      });
    });
  });
  return rows;
}

/**
 * Normaliza mapa de precios del catálogo (solo ids conocidos).
 * @param {Record<string, number>|Array<{id:string, basePrice:number}>|null} raw
 */
function normalizeCatalogPrices(raw) {
  const validIds = new Set(
    SERVICE_CATALOG.flatMap((s) => s.activities.map((a) => a.id))
  );
  const out = {};
  if (Array.isArray(raw)) {
    raw.forEach((row) => {
      const id = row?.id || row?.activityId;
      const price = parseInt(row?.basePrice, 10);
      if (id && validIds.has(id) && Number.isFinite(price) && price > 0) {
        out[id] = Math.max(MIN_WORK_BASE_CLP, price);
      }
    });
    return out;
  }
  if (raw && typeof raw === 'object') {
    Object.keys(raw).forEach((id) => {
      const price = parseInt(raw[id], 10);
      if (validIds.has(id) && Number.isFinite(price) && price > 0) {
        out[id] = Math.max(MIN_WORK_BASE_CLP, price);
      }
    });
  }
  return out;
}

/**
 * Busca una actividad del catálogo por id.
 * @param {string} activityId
 * @param {Record<string, number>|null} [priceOverrides]
 * @returns {{ specialty: SpecialtyCatalog, activity: CatalogActivity } | null}
 */
function findCatalogActivity(activityId, priceOverrides = null) {
  const catalog = getServiceCatalog(priceOverrides);
  for (const specialty of catalog) {
    const activity = specialty.activities.find((a) => a.id === activityId);
    if (activity) return { specialty, activity };
  }
  return null;
}

/**
 * Cotiza una actividad del catálogo con tarifas dinámicas.
 * @param {string} activityId
 * @param {Omit<DynamicTariffInput, 'valorBase'> & { priceOverrides?: Record<string, number> }} opts
 */
function calculateCatalogActivityTariff(activityId, opts) {
  const found = findCatalogActivity(activityId, opts.priceOverrides || null);
  if (!found) throw new Error(`Actividad no encontrada: ${activityId}`);
  return {
    specialty: found.specialty,
    activity: found.activity,
    tariff: calculateDynamicTariff({
      valorBase: found.activity.basePrice,
      horaSolicitud: opts.horaSolicitud,
      tiempoRespuestaMinutos: opts.tiempoRespuestaMinutos,
      strictBase: opts.strictBase,
      timeZone: opts.timeZone,
      urgenciaMultiplier: opts.urgenciaMultiplier,
      urgenciaBand: opts.urgenciaBand,
      scheduleSurcharges: opts.scheduleSurcharges
    })
  };
}

module.exports = {
  MIN_WORK_BASE_CLP,
  MIN_DIAGNOSTIC_VISIT_CLP,
  BUSINESS_TIME_ZONE,
  SERVICE_CATALOG,
  SERVICE_TO_SPECIALTY,
  specialtyIdForService,
  getActivitiesForService,
  getServiceCatalog,
  flattenServiceCatalog,
  normalizeCatalogPrices,
  parseRequestTime,
  timePartsInZone,
  getScheduleMultiplier,
  getUrgencyMultiplier,
  normalizeWorkBase,
  calculateDynamicTariff,
  findCatalogActivity,
  calculateCatalogActivityTariff
};
