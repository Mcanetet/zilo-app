/**
 * Pruebas del motor de tarifas dinámicas.
 * Uso: node scripts/test-dynamic-tariffs.js
 */
'use strict';

const {
  calculateDynamicTariff,
  SERVICE_CATALOG,
  MIN_WORK_BASE_CLP
} = require('../lib/dynamicTariffs');

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: esperado ${expected}, recibió ${actual}`);
  }
  console.log(`✓ ${label} → ${actual}`);
}

function run() {
  console.log('— Casos de negocio —');

  // Caso 1 (Normal/Programado): 160000 * 1.0 * 1.0 = 160000
  const c1 = calculateDynamicTariff({
    valorBase: 160000,
    horaSolicitud: '14:00',
    tiempoRespuestaMinutos: 180
  });
  assertEqual(c1.horarioBand, 'normal', 'Caso 1 banda horario');
  assertEqual(c1.urgenciaBand, 'scheduled', 'Caso 1 banda urgencia');
  assertEqual(c1.total, 160000, 'Caso 1 total');

  // Caso 2 (Tarde/Urgencia media): 160000 * 1.25 * 1.10 = 220000
  const c2 = calculateDynamicTariff({
    valorBase: 160000,
    horaSolicitud: '19:30',
    tiempoRespuestaMinutos: 90
  });
  assertEqual(c2.horarioBand, 'tarde', 'Caso 2 banda horario');
  assertEqual(c2.urgenciaBand, 'medium', 'Caso 2 banda urgencia');
  assertEqual(c2.total, 220000, 'Caso 2 total');

  // Caso 3 (Nocturno/Urgencia crítica): 160000 * 1.50 * 1.25 = 300000
  const c3 = calculateDynamicTariff({
    valorBase: 160000,
    horaSolicitud: '23:30',
    tiempoRespuestaMinutos: 45
  });
  assertEqual(c3.horarioBand, 'nocturno', 'Caso 3 banda horario');
  assertEqual(c3.urgenciaBand, 'critical', 'Caso 3 banda urgencia');
  assertEqual(c3.total, 300000, 'Caso 3 total');

  console.log('\n— Validaciones extra —');

  const forced = calculateDynamicTariff({
    valorBase: 50000,
    horaSolicitud: '10:00',
    tiempoRespuestaMinutos: 180
  });
  assertEqual(forced.valorBaseAplicado, MIN_WORK_BASE_CLP, 'Fuerza mínimo $100.000');
  assertEqual(forced.total, MIN_WORK_BASE_CLP, 'Total mínimo en horario normal programado');

  let threw = false;
  try {
    calculateDynamicTariff({
      valorBase: 80000,
      horaSolicitud: '10:00',
      tiempoRespuestaMinutos: 180,
      strictBase: true
    });
  } catch (_) {
    threw = true;
  }
  assertEqual(threw, true, 'strictBase lanza error bajo mínimo');

  const edgeLate = calculateDynamicTariff({
    valorBase: 100000,
    horaSolicitud: '17:00',
    tiempoRespuestaMinutos: 180
  });
  assertEqual(edgeLate.horarioBand, 'normal', '17:00 es horario normal');

  const edgeNight = calculateDynamicTariff({
    valorBase: 100000,
    horaSolicitud: '17:01',
    tiempoRespuestaMinutos: 180
  });
  assertEqual(edgeNight.horarioBand, 'tarde', '17:01 es horario tarde');

  const catalogCount = SERVICE_CATALOG.reduce((n, s) => n + s.activities.length, 0);
  assertEqual(SERVICE_CATALOG.length, 5, '5 especialidades en catálogo');
  assertEqual(catalogCount, 20, '20 actividades en catálogo');

  console.log('\nTodos los tests OK');
}

run();
