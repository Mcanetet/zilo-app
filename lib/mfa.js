const QRCode = require('qrcode');

const ISSUER = process.env.MFA_ISSUER || 'Fundez Admin';

let otplibPromise;

function loadOtplib() {
  if (!otplibPromise) otplibPromise = import('otplib');
  return otplibPromise;
}

async function generateSecret() {
  const { generateSecret: gen } = await loadOtplib();
  return gen();
}

async function buildOtpauthUrl(email, secret) {
  const { generateURI } = await loadOtplib();
  return generateURI({
    issuer: ISSUER,
    label: email,
    secret
  });
}

async function verifyToken(secret, token) {
  const code = String(token || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) return false;
  const { verify } = await loadOtplib();
  const result = await verify({ secret, token: code });
  return Boolean(result?.valid);
}

async function qrDataUrl(otpauthUrl) {
  return QRCode.toDataURL(otpauthUrl, {
    width: 220,
    margin: 1,
    color: { dark: '#1e3a5f', light: '#ffffff' }
  });
}

function normalizeMfa(value) {
  if (!value || typeof value !== 'object') return null;
  const mfa = {
    enabled: Boolean(value.enabled),
    secret: value.secret || null,
    pendingSecret: value.pendingSecret || null,
    confirmedAt: value.confirmedAt || null
  };
  if (!mfa.enabled && !mfa.secret && !mfa.pendingSecret) return null;
  return mfa;
}

module.exports = {
  generateSecret,
  buildOtpauthUrl,
  verifyToken,
  qrDataUrl,
  normalizeMfa,
  ISSUER
};
