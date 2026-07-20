const { v4: uuidv4 } = require('uuid');
const { loadState, saveState } = require('./state');

function listBankMovements() {
  return loadState().bankMovements || [];
}

function addBankMovement(payload = {}) {
  const state = loadState();
  const row = {
    id: payload.id || `bm-${uuidv4().slice(0, 8)}`,
    date: payload.date || new Date().toISOString().slice(0, 10),
    amount: Math.round(Number(payload.amount) || 0),
    description: String(payload.description || '').trim() || 'Movimiento bancario',
    reference: String(payload.reference || '').trim(),
    type: payload.amount >= 0 ? 'credit' : 'debit',
    matchedPaymentId: payload.matchedPaymentId || null,
    matchedRequestId: payload.matchedRequestId || null,
    status: payload.status || 'open',
    source: payload.source || 'manual',
    createdAt: new Date().toISOString()
  };
  state.bankMovements.unshift(row);
  saveState(state);
  return { success: true, movement: row };
}

function importBankMovements(rows = []) {
  const imported = [];
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const r = addBankMovement({ ...row, source: row.source || 'bank_import' });
    imported.push(r.movement);
  });
  return { success: true, imported: imported.length, movements: imported };
}

/**
 * Conciliación automática: empareja movimientos bancarios abiertos
 * con cobros aprobados (mismo monto ± tolerancia y referencia/paymentId).
 */
function autoReconcile(payments = []) {
  const state = loadState();
  const open = (state.bankMovements || []).filter((m) => m.status === 'open');
  const unusedPayments = payments.filter((p) => p.paidAt);
  const matches = [];
  const TOLERANCE = 1;

  open.forEach((mov) => {
    const absAmount = Math.abs(mov.amount);
    const candidate = unusedPayments.find((p) => {
      const payAmount = Math.round(Number(p.visitPaid || p.amount || 0));
      if (Math.abs(payAmount - absAmount) > TOLERANCE) return false;
      if (mov.reference && p.paymentId && String(mov.reference).includes(String(p.paymentId))) return true;
      if (mov.reference && String(mov.description || '').includes(p.id)) return true;
      // Match por monto exacto si no hay mejor pista
      return Math.abs(payAmount - absAmount) === 0;
    });
    if (!candidate) return;

    mov.status = 'matched';
    mov.matchedPaymentId = candidate.paymentId || null;
    mov.matchedRequestId = candidate.id;
    mov.matchedAt = new Date().toISOString();
    matches.push({
      movementId: mov.id,
      requestId: candidate.id,
      amount: absAmount,
      paymentId: candidate.paymentId || null
    });
    const idx = unusedPayments.indexOf(candidate);
    if (idx >= 0) unusedPayments.splice(idx, 1);
  });

  if (matches.length) {
    state.reconciliations.unshift({
      id: `rc-${uuidv4().slice(0, 8)}`,
      at: new Date().toISOString(),
      matches,
      matchedCount: matches.length
    });
    saveState(state);
  }

  return {
    success: true,
    matched: matches.length,
    matches,
    openRemaining: (state.bankMovements || []).filter((m) => m.status === 'open').length
  };
}

function getReconciliationSummary(payments = []) {
  const movements = listBankMovements();
  const matched = movements.filter((m) => m.status === 'matched');
  const open = movements.filter((m) => m.status === 'open');
  const approvedTotal = payments.reduce((s, p) => s + (p.visitPaid || p.amount || 0), 0);
  const matchedTotal = matched.reduce((s, m) => s + Math.abs(m.amount), 0);
  return {
    movementsCount: movements.length,
    matchedCount: matched.length,
    openCount: open.length,
    approvedPayments: payments.length,
    approvedTotal,
    matchedTotal,
    unreconciledEstimate: Math.max(0, approvedTotal - matchedTotal),
    recent: (loadState().reconciliations || []).slice(0, 5)
  };
}

module.exports = {
  listBankMovements,
  addBankMovement,
  importBankMovements,
  autoReconcile,
  getReconciliationSummary
};
