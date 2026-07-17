const fs = require('fs');
const path = require('path');

const UPLOAD_ROOT = path.join(__dirname, '../public/uploads/providers');
const REQUEST_UPLOAD_ROOT = path.join(__dirname, '../public/uploads/requests');
const PRIVATE_INVOICE_ROOT = path.join(__dirname, '../data/provider-invoices');
const PRIVATE_TECHNICIAN_ROOT = path.join(__dirname, '../data/technician-documents');

function saveBase64File(dir, filename, dataUrlOrBase64) {
  const match = String(dataUrlOrBase64).match(/^data:([^;]+);base64,(.+)$/);
  const mime = match ? match[1] : 'image/jpeg';
  const base64 = match ? match[2] : dataUrlOrBase64;
  const ext = mime.includes('png') ? 'png' : mime.includes('pdf') ? 'pdf' : 'jpg';

  fs.mkdirSync(dir, { recursive: true });
  const fullPath = path.join(dir, filename.endsWith(`.${ext}`) ? filename : `${filename}.${ext}`);
  fs.writeFileSync(fullPath, Buffer.from(base64, 'base64'));
  return fullPath;
}

function saveProviderFile(providerId, category, dataUrlOrBase64) {
  const dir = path.join(UPLOAD_ROOT, providerId);
  const filename = `${category}-${Date.now()}`;
  const fullPath = saveBase64File(dir, filename, dataUrlOrBase64);
  return fullPath.replace(path.join(__dirname, '../public'), '').replace(/\\/g, '/');
}

function saveRequestFile(requestId, category, dataUrlOrBase64) {
  const dir = path.join(REQUEST_UPLOAD_ROOT, requestId);
  const filename = `${category}-${Date.now()}`;
  const fullPath = saveBase64File(dir, filename, dataUrlOrBase64);
  return fullPath.replace(path.join(__dirname, '../public'), '').replace(/\\/g, '/');
}

function saveProviderInvoice(requestId, dataUrlOrBase64) {
  const dir = path.join(PRIVATE_INVOICE_ROOT, requestId);
  const fullPath = saveBase64File(dir, `factura-${Date.now()}`, dataUrlOrBase64);
  return {
    filePath: fullPath,
    fileName: path.basename(fullPath),
    mimeType: fullPath.endsWith('.pdf') ? 'application/pdf' : fullPath.endsWith('.png') ? 'image/png' : 'image/jpeg'
  };
}

function saveTechnicianDocumentFile(technicianId, category, dataUrlOrBase64) {
  const dir = path.join(PRIVATE_TECHNICIAN_ROOT, technicianId);
  return saveBase64File(dir, `${category}-${Date.now()}`, dataUrlOrBase64);
}

module.exports = { saveProviderFile, saveRequestFile, saveProviderInvoice, saveTechnicianDocumentFile };
