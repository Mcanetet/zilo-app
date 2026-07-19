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

function stripHtml(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function wrapHtmlDocument(bodyHtml, { title = 'Fundez' } = {}) {
  const inner = String(bodyHtml || '').trim();
  if (/<html[\s>]/i.test(inner)) return inner;
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:24px;background:#F6F7F9;color:#111827;">
  <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #E6E9EF;border-radius:16px;padding:24px;">
    ${inner}
  </div>
</body>
</html>`;
}

async function sendMail({ to, subject, text, html, replyTo }) {
  if (!to) return { skipped: true, reason: 'no_recipient' };
  if (!isConfigured()) {
    console.log(`[mail:demo] → ${to}: ${subject}`);
    return { demo: true, to, subject };
  }

  try {
    const fromEmail = extractEmail(env('SMTP_FROM') || env('SMTP_USER') || company.supportEmail);
    const plainText = (text && String(text).trim())
      || stripHtml(html)
      || subject;
    const htmlBody = html
      ? wrapHtmlDocument(html, { title: subject || 'Fundez' })
      : wrapHtmlDocument(`<p>${String(plainText).replace(/\n/g, '<br>')}</p>`, { title: subject || 'Fundez' });

    const domain = (fromEmail && fromEmail.includes('@')) ? fromEmail.split('@')[1] : 'fundez.cl';
    const messageId = `<verify.${Date.now()}.${Math.random().toString(36).slice(2, 10)}@${domain}>`;

    const info = await getTransporter().sendMail({
      from: formatFromAddress(),
      to,
      replyTo: replyTo || fromEmail || company.supportEmail,
      subject,
      text: plainText,
      html: htmlBody,
      envelope: fromEmail ? { from: fromEmail, to: [to] } : undefined,
      messageId,
      headers: {
        'X-Mailer': 'Fundez',
        'X-Priority': '1',
        'X-Entity-Ref-ID': `fundez-${Date.now()}`,
        'List-Unsubscribe': `<mailto:${fromEmail || company.supportEmail}?subject=unsubscribe>`
      }
    });

    const rejected = Array.isArray(info.rejected) ? info.rejected : [];
    const toNorm = String(to).toLowerCase();
    if (rejected.some((addr) => String(addr).toLowerCase().includes(toNorm) || toNorm.includes(String(addr).toLowerCase()))) {
      console.error(`[mail:rejected] → ${to}: ${subject}`, rejected);
      return { error: `El servidor rechazó el destino (${rejected.join(', ')})`, to, subject, rejected };
    }

    console.log(`[mail:sent] → ${to}: ${subject} (${info.messageId || messageId})`);
    return {
      messageId: info.messageId || messageId,
      to,
      subject,
      accepted: info.accepted,
      rejected: info.rejected,
      response: info.response || null
    };
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
  resetTransporter,
  wrapHtmlDocument,
  stripHtml
};
