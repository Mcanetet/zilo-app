const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const STATE_FILE = path.join(DATA_DIR, 'finance-state.json');

const defaultState = () => ({
  purchaseInvoices: [],
  bankMovements: [],
  reconciliations: [],
  siiConnection: {
    enabled: false,
    provider: process.env.SII_PURCHASES_PROVIDER || 'pending',
    // LibreDTE / API SII — listo para conectar
    endpoint: process.env.SII_PURCHASES_URL || '',
    apiKeySet: Boolean(process.env.SII_PURCHASES_API_KEY || process.env.LIBREDTE_HASH),
    lastSyncAt: null,
    status: 'ready_to_connect',
    notes: 'Importación de facturas de compra (RCV / LibreDTE) preparada. Configura SII_PURCHASES_URL y API key para activar sync.'
  },
  updatedAt: null
});

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return defaultState();
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return { ...defaultState(), ...raw };
  } catch (_) {
    return defaultState();
  }
}

function saveState(state) {
  ensureDir();
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  return state;
}

module.exports = {
  STATE_FILE,
  defaultState,
  loadState,
  saveState
};
