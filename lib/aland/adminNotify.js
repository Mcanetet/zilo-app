/**
 * Avisos gratis al admin (sin WhatsApp/Meta).
 * Canales:
 * 1) Email SMTP (Hostinger) — siempre si hay SUPPORT_EMAIL / ADMIN_ALERT_EMAIL
 * 2) Telegram Bot API (opcional, gratis) — TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
 * 3) ntfy.sh (opcional, gratis) — NTFY_TOPIC
 */
const company = require('../../config/company');

function alertEmails() {
  const list = [
    process.env.ADMIN_ALERT_EMAIL,
    process.env.SUPPORT_EMAIL,
    company.supportEmail
  ]
    .map((e) => String(e || '').trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(list)];
}

async function notifyEmail({ subject, text }) {
  const notifications = require('../notifications');
  const results = [];
  for (const to of alertEmails()) {
    try {
      const record = await notifications.notify({
        event: 'aland.payment',
        to,
        subject,
        text,
        meta: { channel: 'email_alert' }
      });
      results.push({ channel: 'email', to, ok: record?.status === 'sent' || record?.status === 'queued' });
    } catch (err) {
      results.push({ channel: 'email', to, ok: false, error: err.message });
    }
  }
  return results;
}

/** Telegram Bot API es gratis: crea un bot con @BotFather y obtén tu chat_id. */
async function notifyTelegram(text) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = String(process.env.TELEGRAM_CHAT_ID || '').trim();
  if (!token || !chatId) return { channel: 'telegram', ok: false, skipped: true };

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: String(text).slice(0, 3900),
        disable_web_page_preview: true
      })
    });
    const data = await res.json().catch(() => ({}));
    return { channel: 'telegram', ok: Boolean(data.ok), error: data.description };
  } catch (err) {
    return { channel: 'telegram', ok: false, error: err.message };
  }
}

/** ntfy.sh push gratis al celular (app ntfy). */
async function notifyNtfy(title, text) {
  const topic = String(process.env.NTFY_TOPIC || '').trim();
  if (!topic) return { channel: 'ntfy', ok: false, skipped: true };

  const base = String(process.env.NTFY_SERVER || 'https://ntfy.sh').replace(/\/+$/, '');
  try {
    const res = await fetch(`${base}/${encodeURIComponent(topic)}`, {
      method: 'POST',
      headers: {
        Title: title || 'Fundez Aland',
        Priority: 'high',
        Tags: 'moneybag,warning'
      },
      body: String(text).slice(0, 3900)
    });
    return { channel: 'ntfy', ok: res.ok, status: res.status };
  } catch (err) {
    return { channel: 'ntfy', ok: false, error: err.message };
  }
}

async function notifyAdminFree({ title, body, conversationId, clientName }) {
  const subject = title || 'Aland IA · aviso de pagos';
  const text = [
    body,
    '',
    clientName ? `Cliente: ${clientName}` : null,
    conversationId ? `Conversación: ${conversationId}` : null,
    `Entra al admin → Mensajes para responder.`,
    company.appUrl ? `Admin: ${String(company.appUrl).replace(/\/+$/, '')}` : null
  ].filter(Boolean).join('\n');

  const [emails, telegram, ntfy] = await Promise.all([
    notifyEmail({ subject, text }),
    notifyTelegram(`${subject}\n\n${text}`),
    notifyNtfy(subject, text)
  ]);

  return { emails, telegram, ntfy };
}

module.exports = {
  alertEmails,
  notifyAdminFree,
  notifyTelegram,
  notifyNtfy
};
