/**
 * Plan de cuentas operativo Fundez (marketplace).
 * Asientos se derivan de ventas, liquidaciones, DTE y compras SII.
 */
const CHART_OF_ACCOUNTS = [
  { code: '1101', name: 'Banco / pasarelas', type: 'asset' },
  { code: '1102', name: 'Por conciliar (cobros)', type: 'asset' },
  { code: '2101', name: 'Por pagar a socios', type: 'liability' },
  { code: '2102', name: 'IVA débito (margen Fundez)', type: 'liability' },
  { code: '3101', name: 'Resultado del ejercicio', type: 'equity' },
  { code: '4101', name: 'Ingresos por comisión de servicio', type: 'income' },
  { code: '4102', name: 'Ingresos por recargo de pago', type: 'income' },
  { code: '5101', name: 'Liquidaciones pagadas a socios', type: 'expense' },
  { code: '5102', name: 'Compras y gastos (facturas SII)', type: 'expense' },
  { code: '5103', name: 'Materiales pass-through (neto cero)', type: 'expense' }
];

function emptyBalances() {
  const map = {};
  CHART_OF_ACCOUNTS.forEach((a) => {
    map[a.code] = { ...a, debit: 0, credit: 0, balance: 0 };
  });
  return map;
}

/**
 * Postea un asiento simple: debits/credits arrays { code, amount, memo }
 */
function postEntry(balances, { date, memo, lines, source }) {
  const entry = {
    id: `je-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    date: date || new Date().toISOString().slice(0, 10),
    memo: memo || '',
    source: source || null,
    lines: []
  };
  let debitSum = 0;
  let creditSum = 0;
  for (const line of lines || []) {
    const amount = Math.max(0, Math.round(Number(line.amount) || 0));
    if (!amount || !balances[line.code]) continue;
    const side = line.side === 'credit' ? 'credit' : 'debit';
    if (side === 'debit') {
      balances[line.code].debit += amount;
      debitSum += amount;
    } else {
      balances[line.code].credit += amount;
      creditSum += amount;
    }
    entry.lines.push({ code: line.code, side, amount, label: line.label || '' });
  }
  entry.balanced = debitSum === creditSum && debitSum > 0;
  entry.debitSum = debitSum;
  entry.creditSum = creditSum;
  return entry;
}

function finalizeBalances(balances) {
  Object.values(balances).forEach((acc) => {
    if (acc.type === 'asset' || acc.type === 'expense') {
      acc.balance = acc.debit - acc.credit;
    } else {
      acc.balance = acc.credit - acc.debit;
    }
  });
  return balances;
}

module.exports = {
  CHART_OF_ACCOUNTS,
  emptyBalances,
  postEntry,
  finalizeBalances
};
