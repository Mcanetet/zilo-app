const fs = require('fs');
const path = require('path');

const UPLOAD_ROOT = path.join(__dirname, '../public/uploads/providers');
const REQUEST_UPLOAD_ROOT = path.join(__dirname, '../public/uploads/requests');

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

module.exports = { saveProviderFile, saveRequestFile };
