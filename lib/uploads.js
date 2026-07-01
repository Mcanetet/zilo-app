const fs = require('fs');
const path = require('path');

const UPLOAD_ROOT = path.join(__dirname, '../public/uploads/providers');

function saveProviderFile(providerId, category, dataUrlOrBase64) {
  const match = String(dataUrlOrBase64).match(/^data:([^;]+);base64,(.+)$/);
  const mime = match ? match[1] : 'image/jpeg';
  const base64 = match ? match[2] : dataUrlOrBase64;
  const ext = mime.includes('png') ? 'png' : mime.includes('pdf') ? 'pdf' : 'jpg';

  const dir = path.join(UPLOAD_ROOT, providerId);
  fs.mkdirSync(dir, { recursive: true });

  const filename = `${category}-${Date.now()}.${ext}`;
  const fullPath = path.join(dir, filename);
  fs.writeFileSync(fullPath, Buffer.from(base64, 'base64'));

  return `/uploads/providers/${providerId}/${filename}`;
}

module.exports = { saveProviderFile };
