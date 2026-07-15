/**
 * Motor de tarifas dinámicas Fundez (CLP).
 * Total = round((valorBase * recargoHorario) * recargoUrgencia)
 */

'use strict';

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
 * @property {Date|string} horaSolicitud Date o 'HH:mm'
 * @property {number} tiempoRespuestaMinutos
 * @property {boolean} [strictBase=false] Si true, valorBase < 100000 lanza error
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
 */

const MIN_WORK_BASE_CLP = 100000;
const MIN_DIAGNOSTIC_VISIT_CLP = 50000;

/** @type {SpecialtyCatalog[]} */
const SERVICE_CATALOG = [
  {
    id: 'gasfiteria',
    name: 'Gasfitería',
    activities: [
      { id: 'gas-insp-matriz', name: 'Inspección y mantención de matriz', kind: 'preventiva', basePrice: 120000 },
      { id: 'gas-limpieza-sifones', name: 'Limpieza de sifones', kind: 'preventiva', basePrice: 110000 },
      { id: 'gas-filtracion', name: 'Reparación de filtración', kind: 'correctiva', basePrice: 140000 },
      { id: 'gas-destape', name: 'Destape de alcantarillado con máquina', kind: 'correctiva', basePrice: 160000 }
    ]
  },
  {
    id: 'electricidad',
    name: 'Electricidad',
    activities: [
      { id: 'elec-balanceo', name: 'Balanceo de cargas en tablero', kind: 'preventiva', basePrice: 115000 },
      { id: 'elec-aislamiento', name: 'Pruebas de aislamiento', kind: 'preventiva', basePrice: 105000 },
      { id: 'elec-cortocircuito', name: 'Normalización de cortocircuito', kind: 'correctiva', basePrice: 150000 },
      { id: 'elec-automaticos', name: 'Reemplazo de automáticos principales', kind: 'correctiva', basePrice: 135000 }
    ]
  },
  {
    id: 'aire-acondicionado',
    name: 'Aire Acondicionado',
    activities: [
      { id: 'ac-mantencion', name: 'Mantención completa y sanitización', kind: 'preventiva', basePrice: 110000 },
      { id: 'ac-serpentines', name: 'Limpieza química serpentines', kind: 'preventiva', basePrice: 125000 },
      { id: 'ac-refrigerante', name: 'Recarga de refrigerante', kind: 'correctiva', basePrice: 150000 },
      { id: 'ac-placa', name: 'Reemplazo de placa electrónica', kind: 'correctiva', basePrice: 140000 }
    ]
  },
  {
    id: 'calderas',
    name: 'Calderas de Edificios',
    activities: [
      { id: 'cald-mensual', name: 'Mantención mensual de caldera', kind: 'preventiva', basePrice: 250000 },
      { id: 'cald-gases', name: 'Análisis de gases y calibración', kind: 'preventiva', basePrice: 180000 },
      { id: 'cald-bombas', name: 'Cambio de bombas circuladoras', kind: 'correctiva', basePrice: 220000 },
      { id: 'cald-colector', name: 'Reparación de fuga en colector', kind: 'correctiva', basePrice: 310000 }
    ]
  },
  {
    id: 'termos-electricos',
    name: 'Termos Eléctricos',
    activities: [
      { id: 'termo-sarro', name: 'Limpieza de sarro y cambio de ánodo', kind: 'preventiva', basePrice: 110000 },
      { id: 'termo-valvula', name: 'Inspección de válvula de sobrepresión', kind: 'preventiva', basePrice: 100000 },
      { id: 'termo-resistencia', name: 'Reemplazo de resistencia y termostato', kind: 'correctiva', basePrice: 135000 },
      { id: 'termo-120l', name: 'Instalación o cambio de termo 120L', kind: 'correctiva', basePrice: 160000 }
    ]
  }
];

/**
 * @param {Date|string} horaSolicitud
 * @returns {{ hours: number, minutes: number, totalMinutes: number, label: string }}
 */
function parseRequestTime(horaSolicitud) {
  if (horaSolicitud instanceof Date && !Number.isNaN(horaSolicitud.getTime())) {
    const hours = horaSolicitud.getHours();
    const minutes = horaSolicitud.getMinutes();
    return {
      hours,
      minutes,
      totalMinutes: hours * 60 + minutes,
      label: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
    };
  }

  if (typeof horaSolicitud === 'string') {
    const match = /^(\d{1,2}):(\d{2})$/.exec(horaSolicitud.trim());
    if (match) {
      const hours = Number(match[1]);
      const minutes = Number(match[2]);
      if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
        return {
          hours,
          minutes,
          totalMinutes: hours * 60 + minutes,
          label: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
        };
      }
    }
  }

  throw new Error('horaSolicitud inválida: usa Date o string HH:mm');
}

/**
 * A) Recargo por horario sobre valorBase.
 * Normal 09:00–17:00 → 1.0
 * Tarde 17:01–21:00 → 1.25
 * Nocturno 21:01–08:59 → 1.50
 * @param {number} totalMinutes
 * @returns {{ band: ScheduleBand, multiplier: number }}
 */
function getScheduleMultiplier(totalMinutes) {
  const startNormal = 9 * 60;       // 09:00
  const endNormal = 17 * 60;        // 17:00 inclusive
  const endLate = 21 * 60;          // 21:00 inclusive as late

  if (totalMinutes >= startNormal && totalMinutes <= endNormal) {
    return { band: 'normal', multiplier: 1.0 };
  }
  if (totalMinutes > endNormal && totalMinutes <= endLate) {
    return { band: 'tarde', multiplier: 1.25 };
  }
  return { band: 'nocturno', multiplier: 1.5 };
}

/**
 * B) Recargo por urgencia sobre el valor ya recalculado por horario.
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
  const { valorBase, horaSolicitud, tiempoRespuestaMinutos, strictBase = false } = input || {};

  // 1) Base de trabajo (>= $100.000)
  const valorBaseOriginal = Number(valorBase);
  const valorBaseAplicado = normalizeWorkBase(valorBaseOriginal, { strictBase });

  // 2) Parseo de hora y banda horaria
  const time = parseRequestTime(horaSolicitud);
  const schedule = getScheduleMultiplier(time.totalMinutes);

  // 3) Paso A: aplicar recargo horario
  const afterSchedule = valorBaseAplicado * schedule.multiplier;

  // 4) Paso B: aplicar recargo de urgencia sobre el valor ya recalculado
  const urgency = getUrgencyMultiplier(tiempoRespuestaMinutos);
  const rawTotal = afterSchedule * urgency.multiplier;

  // 5) Redondeo a peso chileno entero
  const total = Math.round(rawTotal);

  return {
    valorBaseOriginal: Number.isFinite(valorBaseOriginal) ? valorBaseOriginal : valorBaseAplicado,
    valorBaseAplicado,
    horarioBand: schedule.band,
    horarioMultiplier: schedule.multiplier,
    afterSchedule: Math.round(afterSchedule),
    urgenciaBand: urgency.band,
    urgenciaMultiplier: urgency.multiplier,
    tiempoRespuestaMinutos: Number(tiempoRespuestaMinutos),
    total,
    minutesOfDay: time.label
  };
}

/**
 * Busca una actividad del catálogo por id.
 * @param {string} activityId
 * @returns {{ specialty: SpecialtyCatalog, activity: CatalogActivity } | null}
 */
function findCatalogActivity(activityId) {
  for (const specialty of SERVICE_CATALOG) {
    const activity = specialty.activities.find((a) => a.id === activityId);
    if (activity) return { specialty, activity };
  }
  return null;
}

/**
 * Cotiza una actividad del catálogo con tarifas dinámicas.
 * @param {string} activityId
 * @param {Omit<DynamicTariffInput, 'valorBase'>} opts
 */
function calculateCatalogActivityTariff(activityId, opts) {
  const found = findCatalogActivity(activityId);
  if (!found) throw new Error(`Actividad no encontrada: ${activityId}`);
  return {
    specialty: found.specialty,
    activity: found.activity,
    tariff: calculateDynamicTariff({
      valorBase: found.activity.basePrice,
      horaSolicitud: opts.horaSolicitud,
      tiempoRespuestaMinutos: opts.tiempoRespuestaMinutos,
      strictBase: opts.strictBase
    })
  };
}

module.exports = {
  MIN_WORK_BASE_CLP,
  MIN_DIAGNOSTIC_VISIT_CLP,
  SERVICE_CATALOG,
  parseRequestTime,
  getScheduleMultiplier,
  getUrgencyMultiplier,
  normalizeWorkBase,
  calculateDynamicTariff,
  findCatalogActivity,
  calculateCatalogActivityTariff
};
