const crypto = require('crypto');
const mailer = require('./mailer');
const company = require('../config/company');

const CODE_TTL_MS = 15 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

function hashCode(userId, code) {
  const secret = process.env.SESSION_SECRET || 'fundez-dev';
  return crypto.createHash('sha256').update(`${userId}:${code}:${secret}`).digest('hex');
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function buildVerificationEmail({ name, code, locale = 'es' }) {
  const isEn = locale === 'en';
  const subject = isEn
    ? 'Fundez — Verify your email'
    : 'Fundez — Verifica tu correo';
  const text = isEn
    ? `Hello ${name},\n\nYour Fundez verification code is: ${code}\n\nIt expires in 15 minutes. Enter this code in the app to activate your account.\n\nIf you did not request this, ignore this message.\n\n— Fundez`
    : `Hola ${name},\n\nTu código de verificación Fundez es: ${code}\n\nExpira en 15 minutos. Ingresa este código en la aplicación para activar tu cuenta.\n\nSi no solicitaste esto, ignora este mensaje.\n\n— Fundez`;
  const html = isEn
    ? `<p>Hello <strong>${name}</strong>,</p><p>Your verification code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px;color:#2563EB">${code}</p><p>Expires in 15 minutes.</p>`
    : `<p>Hola <strong>${name}</strong>,</p><p>Tu código de verificación es:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px;color:#2563EB">${code}</p><p>Expira en 15 minutos.</p>`;
  return { subject, text, html };
}

async function sendVerificationEmail(user, { locale = 'es' } = {}) {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
  const sentAt = new Date().toISOString();
  const emailContent = buildVerificationEmail({ name: user.name, code, locale });

  const result = await mailer.sendMail({
    to: user.email,
    subject: emailContent.subject,
    text: emailContent.text,
    html: emailContent.html
  });

  if (result.demo) {
    console.log(`[verify:demo] Código para ${user.email}: ${code}`);
  }

  return {
    codeHash: hashCode(user.id, code),
    expiresAt,
    sentAt,
    mailResult: result
  };
}

function verifyCode(user, code) {
  if (!user?.emailVerificationCodeHash || !user?.emailVerificationExpiresAt) {
    return { error: 'No hay un código activo. Solicita uno nuevo.' };
  }
  if (new Date(user.emailVerificationExpiresAt).getTime() < Date.now()) {
    return { error: 'El código expiró. Solicita uno nuevo.' };
  }
  const normalized = String(code || '').trim().replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalized)) {
    return { error: 'Ingresa el código de 6 dígitos.' };
  }
  const expected = user.emailVerificationCodeHash;
  if (hashCode(user.id, normalized) !== expected) {
    return { error: 'Código incorrecto. Revisa tu correo e intenta de nuevo.' };
  }
  return { ok: true };
}

function canResend(user) {
  if (!user?.emailVerificationSentAt) return true;
  return Date.now() - new Date(user.emailVerificationSentAt).getTime() >= RESEND_COOLDOWN_MS;
}

function resendCooldownSeconds(user) {
  if (!user?.emailVerificationSentAt) return 0;
  const elapsed = Date.now() - new Date(user.emailVerificationSentAt).getTime();
  return Math.max(0, Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000));
}

module.exports = {
  CODE_TTL_MS,
  RESEND_COOLDOWN_MS,
  hashCode,
  generateCode,
  sendVerificationEmail,
  verifyCode,
  canResend,
  resendCooldownSeconds
};
