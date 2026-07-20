const { v4: uuidv4 } = require('uuid');
const { loadState, saveState } = require('./state');

/**
 * Registro de facturas de compra (SII).
 * Preparado para sync automático vía LibreDTE / RCV cuando se configuren env vars.
 */
function listPurchaseInvoices() {
  return loadState().purchaseInvoices || [];
}

function getSiiConnectionStatus() {
  return loadState().siiConnection;
}

function upsertPurchaseInvoice(payload = {}) {
  const state = loadState();
  const id = payload.id || `pc-${uuidv4().slice(0, 8)}`;
  const existing = state.purchaseInvoices.findIndex((p) => p.id === id);
  const row = {
    id,
    supplierRut: String(payload.supplierRut || '').trim(),
    supplierName: String(payload.supplierName || '').trim() || 'Proveedor',
    folio: String(payload.folio || '').trim(),
    dteType: Number(payload.dteType) || 33,
    issuedAt: payload.issuedAt || new Date().toISOString().slice(0, 10),
    netAmount: Math.max(0, Math.round(Number(payload.netAmount) || 0)),
    taxAmount: Math.max(0, Math.round(Number(payload.taxAmount) || 0)),
    totalAmount: Math.max(0, Math.round(Number(payload.totalAmount) || Number(payload.netAmount) || 0)),
    requestId: payload.requestId || null,
    source: payload.source || 'manual',
    siiStatus: payload.siiStatus || 'registered',
    notes: String(payload.notes || '').trim(),
    createdAt: payload.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  if (!row.totalAmount && (row.netAmount || row.taxAmount)) {
    row.totalAmount = row.netAmount + row.taxAmount;
  }
  if (existing >= 0) state.purchaseInvoices[existing] = { ...state.purchaseInvoices[existing], ...row };
  else state.purchaseInvoices.unshift(row);
  saveState(state);
  return { success: true, invoice: row };
}

function importPurchaseInvoices(rows = []) {
  const imported = [];
  const errors = [];
  (Array.isArray(rows) ? rows : []).forEach((row, idx) => {
    try {
      if (!row.supplierRut && !row.folio) {
        errors.push({ index: idx, error: 'Falta RUT proveedor o folio' });
        return;
      }
      const result = upsertPurchaseInvoice({ ...row, source: row.source || 'sii_import' });
      imported.push(result.invoice);
    } catch (err) {
      errors.push({ index: idx, error: err.message });
    }
  });
  return { success: true, imported: imported.length, invoices: imported, errors };
}

/**
 * Stub de sincronización SII — cuando haya credenciales, aquí se llama a la API.
 */
async function syncPurchasesFromSii() {
  const state = loadState();
  const conn = state.siiConnection;
  if (!conn.endpoint || !conn.apiKeySet) {
    return {
      success: false,
      error: 'Conexión SII de compras no configurada. Define SII_PURCHASES_URL y SII_PURCHASES_API_KEY (o LIBREDTE_HASH).',
      connection: conn
    };
  }
  // Placeholder: listo para integrar LibreDTE compras / RCV
  conn.lastSyncAt = new Date().toISOString();
  conn.status = 'awaiting_api_integration';
  state.siiConnection = conn;
  saveState(state);
  return {
    success: false,
    error: 'Endpoint SII configurado. Falta cablear el cliente HTTP de compras (LibreDTE RCV). El registro manual e import JSON ya están activos.',
    connection: conn
  };
}

module.exports = {
  listPurchaseInvoices,
  getSiiConnectionStatus,
  upsertPurchaseInvoice,
  importPurchaseInvoices,
  syncPurchasesFromSii
};
