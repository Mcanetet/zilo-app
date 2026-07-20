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
  return String(crypto.randomInt(100000, 1000000));
}

function codesMatch(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function buildVerificationEmail({ name, code, locale = 'es' }) {
  const isEn = locale === 'en';
  const { getSiteUrl } = require('./seo');
  const appUrl = getSiteUrl();
  const subject = isEn
    ? 'Your Fundez verification code'
    : 'Tu código de verificación Fundez';
  const text = isEn
    ? `Hello ${name},\n\nYour Fundez verification code is: ${code}\n\nIt expires in 15 minutes. Enter this code at ${appUrl}/verificar-email to activate your account.\n\nIf you did not create a Fundez account, you can ignore this message.\n\nFundez SpA\n${company.supportEmail}`
    : `Hola ${name},\n\nTu código de verificación Fundez es: ${code}\n\nExpira en 15 minutos. Ingrésalo en ${appUrl}/verificar-email para activar tu cuenta.\n\nSi no creaste una cuenta en Fundez, puedes ignorar este mensaje.\n\nFundez SpA\n${company.supportEmail}`;
  const body = isEn
    ? `<p>Hello <strong>${name}</strong>,</p>
        <p>Use this code to verify your Fundez account:</p>
        <p style="font-size:28px;font-weight:bold;letter-spacing:6px;color:#2563EB;margin:20px 0">${code}</p>
        <p>It expires in 15 minutes.</p>
        <p><a href="${appUrl}/verificar-email" style="color:#2563EB">Open verification page</a></p>
        <p style="color:#6B7280;font-size:12px">If you did not create a Fundez account, ignore this email.</p>
        <p style="color:#6B7280;font-size:12px">Fundez SpA · ${company.supportEmail}</p>`
    : `<p>Hola <strong>${name}</strong>,</p>
        <p>Usa este código para verificar tu cuenta Fundez:</p>
        <p style="font-size:28px;font-weight:bold;letter-spacing:6px;color:#2563EB;margin:20px 0">${code}</p>
        <p>Expira en 15 minutos.</p>
        <p><a href="${appUrl}/verificar-email" style="color:#2563EB">Abrir página de verificación</a></p>
        <p style="color:#6B7280;font-size:12px">Si no creaste una cuenta en Fundez, ignora este correo.</p>
        <p style="color:#6B7280;font-size:12px">Fundez SpA · ${company.supportEmail}</p>`;
  return {
    subject,
    text,
    html: mailer.wrapHtmlDocument(body, { title: subject })
  };
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
  } else if (result.error) {
    console.error(`[verify:error] No se pudo enviar a ${user.email}: ${result.error}`);
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
  const computed = hashCode(user.id, normalized);
  const left = Buffer.from(String(computed));
  const right = Buffer.from(String(expected));
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
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
