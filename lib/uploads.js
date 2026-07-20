const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UPLOAD_ROOT = path.join(__dirname, '../public/uploads/providers');
const REQUEST_UPLOAD_ROOT = path.join(__dirname, '../public/uploads/requests');
const PRIVATE_INVOICE_ROOT = path.join(__dirname, '../data/provider-invoices');
const PRIVATE_TECHNICIAN_ROOT = path.join(__dirname, '../data/technician-documents');

const MAX_BYTES = Math.min(
  5 * 1024 * 1024,
  Math.max(100 * 1024, Number(process.env.UPLOAD_MAX_BYTES) || 3 * 1024 * 1024)
);

const ALLOWED = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf'
};

function sniffMime(buf) {
  if (!buf || buf.length < 4) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'application/pdf';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

function saveBase64File(dir, filename, dataUrlOrBase64) {
  const match = String(dataUrlOrBase64 || '').match(/^data:([^;]+);base64,(.+)$/);
  const claimedMime = match ? match[1].toLowerCase() : 'image/jpeg';
  const base64 = match ? match[2] : String(dataUrlOrBase64 || '');
  if (!base64 || base64.length > MAX_BYTES * 1.4) {
    throw new Error('Archivo demasiado grande o vacío');
  }
  const buf = Buffer.from(base64, 'base64');
  if (buf.length > MAX_BYTES) {
    throw new Error(`El archivo supera el máximo de ${Math.round(MAX_BYTES / 1024)} KB`);
  }
  const sniffed = sniffMime(buf);
  const mime = sniffed || (ALLOWED[claimedMime] ? claimedMime : null);
  if (!mime || !ALLOWED[mime]) {
    throw new Error('Tipo de archivo no permitido (solo JPG, PNG, WEBP o PDF)');
  }
  const ext = ALLOWED[mime];
  const safeName = String(filename || crypto.randomBytes(8).toString('hex'))
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .slice(0, 80);
  fs.mkdirSync(dir, { recursive: true });
  const fullPath = path.join(dir, safeName.endsWith(`.${ext}`) ? safeName : `${safeName}.${ext}`);
  const resolved = path.resolve(fullPath);
  if (!resolved.startsWith(path.resolve(dir))) {
    throw new Error('Ruta de archivo inválida');
  }
  fs.writeFileSync(resolved, buf);
  return resolved;
}

function saveProviderFile(providerId, category, dataUrlOrBase64) {
  const safeId = String(providerId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  const dir = path.join(UPLOAD_ROOT, safeId);
  const filename = `${String(category || 'file').replace(/[^a-zA-Z0-9_-]/g, '')}-${Date.now()}`;
  const fullPath = saveBase64File(dir, filename, dataUrlOrBase64);
  return fullPath.replace(path.join(__dirname, '../public'), '').replace(/\\/g, '/');
}

function saveRequestFile(requestId, category, dataUrlOrBase64) {
  const safeId = String(requestId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  const dir = path.join(REQUEST_UPLOAD_ROOT, safeId);
  const filename = `${String(category || 'file').replace(/[^a-zA-Z0-9_-]/g, '')}-${Date.now()}`;
  const fullPath = saveBase64File(dir, filename, dataUrlOrBase64);
  return fullPath.replace(path.join(__dirname, '../public'), '').replace(/\\/g, '/');
}

function saveProviderInvoice(requestId, dataUrlOrBase64) {
  const safeId = String(requestId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  const dir = path.join(PRIVATE_INVOICE_ROOT, safeId);
  const fullPath = saveBase64File(dir, `factura-${Date.now()}`, dataUrlOrBase64);
  return {
    filePath: fullPath,
    fileName: path.basename(fullPath),
    mimeType: fullPath.endsWith('.pdf') ? 'application/pdf' : fullPath.endsWith('.png') ? 'image/png' : 'image/jpeg'
  };
}

function saveTechnicianDocumentFile(technicianId, category, dataUrlOrBase64) {
  const safeId = String(technicianId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  const dir = path.join(PRIVATE_TECHNICIAN_ROOT, safeId);
  return saveBase64File(dir, `${String(category || 'doc').replace(/[^a-zA-Z0-9_-]/g, '')}-${Date.now()}`, dataUrlOrBase64);
}

module.exports = { saveProviderFile, saveRequestFile, saveProviderInvoice, saveTechnicianDocumentFile, MAX_BYTES };
