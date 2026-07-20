const { computeRequestFinancials } = require('../pricing');
const { CHART_OF_ACCOUNTS, emptyBalances, postEntry, finalizeBalances } = require('./ledger');
const purchases = require('./purchases');
const reconciliation = require('./reconciliation');

/**
 * Pack contable/financiero: ventas, costos, P&L, balance y conciliación.
 * Todas las ventas (cobros) y costos (liquidaciones + compras SII) pasan por aquí.
 */
function buildAccountingPack({ requests = [], payments = [], pricing = {}, getAllDteDocuments }) {
  const approved = requests.filter((r) => r.paymentStatus === 'approved');
  const completed = approved.filter((r) => r.status === 'completed');
  const purchaseInvoices = purchases.listPurchaseInvoices();
  const bankMovements = reconciliation.listBankMovements();
  const reconSummary = reconciliation.getReconciliationSummary(payments);
  const dteDocs = typeof getAllDteDocuments === 'function' ? getAllDteDocuments() : [];

  const sales = [];
  const costs = [];
  const journal = [];
  const balances = emptyBalances();

  let salesVisitTotal = 0;
  let salesCompletedTotal = 0;
  let incomeCommission = 0;
  let incomeSurcharge = 0;
  let costProviderPaid = 0;
  let costProviderPending = 0;
  let costPurchases = 0;
  let materialsPassThrough = 0;
  let ivaLiability = 0;

  approved.forEach((r) => {
    const visitPaid = r.visitPricePaid || r.amountDue || 0;
    salesVisitTotal += visitPaid;
    incomeSurcharge += r.paymentSurchargeAmount || 0;

    sales.push({
      id: r.id,
      date: (r.paidAt || r.createdAt || '').toString().slice(0, 10),
      type: 'sale_visit',
      label: `Cobro visita · ${r.serviceName || r.serviceId}`,
      clientName: r.clientName,
      amount: visitPaid,
      surcharge: r.paymentSurchargeAmount || 0,
      method: r.paymentMethod,
      gateway: r.paymentGateway,
      status: r.status,
      dteCount: Array.isArray(r.dteDocuments) ? r.dteDocuments.length : 0
    });

    if (visitPaid > 0) {
      journal.push(postEntry(balances, {
        date: (r.paidAt || '').toString().slice(0, 10),
        memo: `Cobro ${r.id}`,
        source: { requestId: r.id, kind: 'payment' },
        lines: [
          { code: '1102', side: 'debit', amount: visitPaid, label: 'Cobro por conciliar' },
          { code: '4101', side: 'credit', amount: visitPaid, label: 'Ingreso bruto provisional' }
        ]
      }));
    }

    if ((r.paymentSurchargeAmount || 0) > 0) {
      journal.push(postEntry(balances, {
        date: (r.paidAt || '').toString().slice(0, 10),
        memo: `Recargo pago ${r.id}`,
        source: { requestId: r.id, kind: 'surcharge' },
        lines: [
          { code: '1102', side: 'debit', amount: r.paymentSurchargeAmount, label: 'Recargo cobrado' },
          { code: '4102', side: 'credit', amount: r.paymentSurchargeAmount, label: 'Ingreso recargo' }
        ]
      }));
    }
  });

  completed.forEach((r) => {
    const fin = r.financials || computeRequestFinancials(r, pricing);
    salesCompletedTotal += fin.grandTotal || 0;
    incomeCommission += fin.appTotal || 0;
    materialsPassThrough += fin.materialsTotal || 0;
    ivaLiability += fin.ivaOnFees || 0;

    const providerNet = fin.providerTotal || 0;
    if (r.payoutStatus === 'pagado') costProviderPaid += providerNet;
    else costProviderPending += providerNet;

    costs.push({
      id: r.id,
      date: (r.completedAt || r.paidAt || '').toString().slice(0, 10),
      type: 'provider_settlement',
      label: `Liquidación socio · ${r.serviceName || r.serviceId}`,
      amount: providerNet,
      status: r.payoutStatus === 'pagado' ? 'pagado' : (r.payoutStatus || 'programado'),
      materials: fin.materialsTotal || 0,
      commission: fin.appTotal || 0
    });

    // Reclasifica: el margen Fundez queda como ingreso real; el resto pasa a pasivo socio.
    // Se reduce el crédito provisional 4101 por (visitPaid - appTotal) vía 2101/5101.
    const visitPaid = r.visitPricePaid || r.amountDue || 0;
    const toProvider = Math.min(providerNet, Math.max(0, visitPaid - (fin.appTotal || 0)));
    if (toProvider > 0) {
      journal.push(postEntry(balances, {
        date: (r.completedAt || '').toString().slice(0, 10),
        memo: `Cierre servicio ${r.id}`,
        source: { requestId: r.id, kind: 'completion' },
        lines: [
          { code: '4101', side: 'debit', amount: toProvider, label: 'Reclasifica ingreso provisional' },
          { code: '2101', side: 'credit', amount: toProvider, label: 'Por pagar socio' }
        ]
      }));
    }

    if (r.payoutStatus === 'pagado' && providerNet > 0) {
      journal.push(postEntry(balances, {
        date: (r.payoutPaidAt || r.completedAt || '').toString().slice(0, 10),
        memo: `Pago socio ${r.id}`,
        source: { requestId: r.id, kind: 'payout' },
        lines: [
          { code: '2101', side: 'debit', amount: providerNet, label: 'Cancelación pasivo socio' },
          { code: '1101', side: 'credit', amount: providerNet, label: 'Salida banco' }
        ]
      }));
      journal.push(postEntry(balances, {
        date: (r.payoutPaidAt || r.completedAt || '').toString().slice(0, 10),
        memo: `Costo liquidación ${r.id}`,
        source: { requestId: r.id, kind: 'payout_expense' },
        lines: [
          { code: '5101', side: 'debit', amount: providerNet, label: 'Liquidación socio' },
          { code: '4101', side: 'debit', amount: 0, label: '' },
          { code: '1102', side: 'credit', amount: providerNet, label: 'Aplicación cobro a liquidación' }
        ].filter((l) => l.amount > 0)
      }));
    }
  });

  purchaseInvoices.forEach((inv) => {
    costPurchases += inv.totalAmount || 0;
    costs.push({
      id: inv.id,
      date: inv.issuedAt,
      type: 'purchase_sii',
      label: `Compra SII · ${inv.supplierName} · folio ${inv.folio}`,
      amount: inv.totalAmount,
      status: inv.siiStatus,
      supplierRut: inv.supplierRut
    });
    if (inv.totalAmount > 0) {
      journal.push(postEntry(balances, {
        date: inv.issuedAt,
        memo: `Factura compra ${inv.folio}`,
        source: { purchaseId: inv.id, kind: 'purchase' },
        lines: [
          { code: '5102', side: 'debit', amount: inv.totalAmount, label: 'Gasto / compra' },
          { code: '1101', side: 'credit', amount: inv.totalAmount, label: 'Pago compra' }
        ]
      }));
    }
  });

  // Conciliación: mueve montos matched de 1102 → 1101
  bankMovements.filter((m) => m.status === 'matched').forEach((m) => {
    const amt = Math.abs(m.amount);
    if (!amt) return;
    journal.push(postEntry(balances, {
      date: m.date,
      memo: `Conciliación ${m.id}`,
      source: { movementId: m.id, kind: 'reconcile' },
      lines: [
        { code: '1101', side: 'debit', amount: amt, label: 'Banco confirmado' },
        { code: '1102', side: 'credit', amount: amt, label: 'Sale de por conciliar' }
      ]
    }));
  });

  finalizeBalances(balances);

  // P&L operativo (fuente de verdad para reportes admin)
  const totalIncome = incomeCommission + incomeSurcharge;
  const totalExpenses = costProviderPaid + costPurchases;
  const netResult = totalIncome - totalExpenses;

  balances['3101'].debit = 0;
  balances['3101'].credit = 0;
  balances['3101'].balance = netResult;
  if (netResult >= 0) balances['3101'].credit = netResult;
  else balances['3101'].debit = Math.abs(netResult);

  if (ivaLiability > 0) {
    balances['2102'].credit = ivaLiability;
    balances['2102'].balance = ivaLiability;
  }

  const balanceSheet = {
    assets: CHART_OF_ACCOUNTS.filter((a) => a.type === 'asset').map((a) => ({ ...balances[a.code] })),
    liabilities: CHART_OF_ACCOUNTS.filter((a) => a.type === 'liability').map((a) => ({ ...balances[a.code] })),
    equity: CHART_OF_ACCOUNTS.filter((a) => a.type === 'equity').map((a) => ({ ...balances[a.code] })),
    totalAssets: sumBalance(balances, 'asset'),
    totalLiabilities: sumBalance(balances, 'liability'),
    totalEquity: sumBalance(balances, 'equity')
  };

  const pnl = {
    income: {
      commission: incomeCommission,
      cardSurcharge: incomeSurcharge,
      total: totalIncome
    },
    expenses: {
      providerPaid: costProviderPaid,
      providerPending: costProviderPending,
      purchases: costPurchases,
      materialsPassThrough,
      total: totalExpenses
    },
    netResult,
    salesVisitTotal,
    salesCompletedTotal,
    ivaLiability,
    dteIssuedCount: dteDocs.length,
    dteIssuedAmount: dteDocs.reduce((s, d) => s + (d.amount || 0), 0)
  };

  return {
    generatedAt: new Date().toISOString(),
    sales: sales.sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 80),
    costs: costs.sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 80),
    pnl,
    balanceSheet,
    journal: journal.filter((j) => j.balanced).slice(0, 60),
    chartOfAccounts: CHART_OF_ACCOUNTS,
    accountBalances: Object.values(balances),
    purchases: {
      connection: purchases.getSiiConnectionStatus(),
      invoices: purchaseInvoices.slice(0, 40),
      total: costPurchases,
      count: purchaseInvoices.length
    },
    bank: {
      movements: bankMovements.slice(0, 40),
      reconciliation: reconSummary
    },
    dte: {
      autoSalesEnabled: true,
      splitInvoicing: process.env.SPLIT_INVOICING !== 'false',
      note: process.env.SPLIT_INVOICING === 'false'
        ? 'Modo legado: DTE de visita al pagar.'
        : 'DTE de margen Fundez se emite automáticamente al completar el servicio. El socio registra su factura de venta por su parte.',
      documentsCount: dteDocs.length,
      amount: pnl.dteIssuedAmount
    }
  };
}

function sumBalance(balances, type) {
  return Object.values(balances)
    .filter((a) => a.type === type)
    .reduce((s, a) => s + (a.balance || 0), 0);
}

module.exports = {
  buildAccountingPack
};
