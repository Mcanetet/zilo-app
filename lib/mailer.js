const nodemailer = require('nodemailer');
const company = require('../config/company');

let transporter = null;

function env(name, fallback = '') {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  return String(raw).trim().replace(/^['"]|['"]$/g, '');
}

function isConfigured() {
  return Boolean(env('SMTP_HOST') && env('SMTP_USER') && env('SMTP_PASS'));
}

function extractEmail(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/<([^>]+)>/);
  if (match) return match[1].trim();
  return raw;
}

function formatFromAddress() {
  const raw = env('SMTP_FROM') || env('SMTP_USER') || company.supportEmail;
  const email = extractEmail(raw);
  if (!email) return `"Fundez" <${company.supportEmail}>`;
  return `"Fundez" <${email}>`;
}

function smtpStatus() {
  const host = env('SMTP_HOST');
  const user = env('SMTP_USER');
  const port = parseInt(env('SMTP_PORT', '587'), 10) || 587;
  return {
    configured: isConfigured(),
    host: host || null,
    port,
    user: user ? `${user.slice(0, 3)}***@${user.split('@')[1] || '?'}` : null,
    from: extractEmail(env('SMTP_FROM') || user || company.supportEmail) || null
  };
}

function resetTransporter() {
  transporter = null;
}

function getTransporter() {
  if (!isConfigured()) return null;
  if (transporter) return transporter;

  const host = env('SMTP_HOST');
  const port = parseInt(env('SMTP_PORT', '587'), 10) || 587;
  const user = env('SMTP_USER');
  const pass = env('SMTP_PASS');
  const secure = port === 465;

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure,
    auth: { user, pass },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    tls: {
      minVersion: 'TLSv1.2',
      servername: host
    }
  });

  return transporter;
}

async function verifySmtp() {
  if (!isConfigured()) {
    return { ok: false, reason: 'not_configured' };
  }
  try {
    await getTransporter().verify();
    return { ok: true };
  } catch (err) {
    resetTransporter();
    return { ok: false, reason: err.message || 'verify_failed' };
  }
}

async function sendMail({ to, subject, text, html }) {
  if (!to) return { skipped: true, reason: 'no_recipient' };
  if (!isConfigured()) {
    console.log(`[mail:demo] → ${to}: ${subject}`);
    return { demo: true, to, subject };
  }

  try {
    const info = await getTransporter().sendMail({
      from: formatFromAddress(),
      to,
      subject,
      text,
      html: html || text.replace(/\n/g, '<br>')
    });
    console.log(`[mail:sent] → ${to}: ${subject} (${info.messageId || 'ok'})`);
    return { messageId: info.messageId, to, subject, accepted: info.accepted, rejected: info.rejected };
  } catch (err) {
    resetTransporter();
    console.error(`[mail:error] → ${to}: ${subject}`, err.message);
    return { error: err.message, to, subject };
  }
}

module.exports = {
  isConfigured,
  sendMail,
  formatFromAddress,
  smtpStatus,
  verifySmtp,
  resetTransporter
};
