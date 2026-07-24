const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const openai = require('../aland/openai');
const openaiUsage = require('../openaiUsage');
const mailer = require('../mailer');
const company = require('../../config/company');

const IMAGE_DIR = path.join(__dirname, '../../public/uploads/marketing');
const ALLOWED_CHANNELS = ['instagram', 'facebook', 'linkedin', 'x', 'tiktok', 'email'];
let schedulerTimer = null;

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function rowToItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    channel: row.channel,
    status: row.status,
    scheduledAt: row.scheduled_at ? new Date(row.scheduled_at).toISOString() : null,
    content: parseJson(row.content, {}),
    imageUrl: row.image_url || null,
    externalId: row.external_id || null,
    error: row.error || null,
    approvedBy: row.approved_by || null,
    approvedAt: row.approved_at ? new Date(row.approved_at).toISOString() : null,
    publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

async function ensureSchema() {
  if (!db.isConfigured()) return false;
  await db.raw(`
    CREATE TABLE IF NOT EXISTS florencia_marketing_items (
      id VARCHAR(64) PRIMARY KEY,
      kind VARCHAR(32) NOT NULL DEFAULT 'content',
      title VARCHAR(220) NOT NULL,
      channel VARCHAR(32) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'draft',
      scheduled_at DATETIME NULL,
      content LONGTEXT NOT NULL,
      image_url VARCHAR(1024) NULL,
      external_id VARCHAR(512) NULL,
      error TEXT NULL,
      approved_by VARCHAR(64) NULL,
      approved_at DATETIME NULL,
      published_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      INDEX idx_florencia_status_date (status, scheduled_at),
      INDEX idx_florencia_channel (channel)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await db.raw(`
    CREATE TABLE IF NOT EXISTS florencia_chat_messages (
      id VARCHAR(64) PRIMARY KEY,
      item_id VARCHAR(64) NULL,
      role ENUM('user','assistant','system') NOT NULL,
      body TEXT NOT NULL,
      meta JSON NULL,
      created_at DATETIME NOT NULL,
      INDEX idx_florencia_chat_created (created_at),
      INDEX idx_florencia_chat_item (item_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  return true;
}

async function listItems({ status, channel, limit = 100 } = {}) {
  if (!db.isConfigured()) return [];
  const clauses = [];
  const params = [];
  if (status) { clauses.push('status = ?'); params.push(status); }
  if (channel) { clauses.push('channel = ?'); params.push(channel); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await db.query(
    `SELECT * FROM florencia_marketing_items ${where}
     ORDER BY COALESCE(scheduled_at, created_at) ASC LIMIT ?`,
    [...params, Math.min(500, Math.max(1, Number(limit) || 100))]
  );
  return result.rows.map(rowToItem);
}

async function getItem(id) {
  if (!db.isConfigured()) return null;
  const result = await db.query('SELECT * FROM florencia_marketing_items WHERE id = ? LIMIT 1', [id]);
  return rowToItem(result.rows[0]);
}

async function createItem(input = {}) {
  const now = new Date();
  const id = input.id || uuidv4();
  const channel = ALLOWED_CHANNELS.includes(input.channel) ? input.channel : 'instagram';
  await db.query(
    `INSERT INTO florencia_marketing_items
     (id, kind, title, channel, status, scheduled_at, content, image_url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      String(input.kind || 'content').slice(0, 32),
      String(input.title || 'Pieza de marketing').slice(0, 220),
      channel,
      input.status || 'draft',
      input.scheduledAt ? new Date(input.scheduledAt) : null,
      JSON.stringify(input.content || {}),
      input.imageUrl || null,
      now,
      now
    ]
  );
  return getItem(id);
}

async function updateItem(id, input = {}) {
  const current = await getItem(id);
  if (!current) return null;
  if (current.status === 'published') throw new Error('Una pieza publicada no se puede modificar');
  const title = input.title !== undefined ? String(input.title).slice(0, 220) : current.title;
  const channel = input.channel && ALLOWED_CHANNELS.includes(input.channel) ? input.channel : current.channel;
  const scheduledAt = input.scheduledAt !== undefined
    ? (input.scheduledAt ? new Date(input.scheduledAt) : null)
    : (current.scheduledAt ? new Date(current.scheduledAt) : null);
  const content = input.content !== undefined ? input.content : current.content;
  const imageUrl = input.imageUrl !== undefined ? input.imageUrl : current.imageUrl;
  await db.query(
    `UPDATE florencia_marketing_items
     SET title = ?, channel = ?, scheduled_at = ?, content = ?, image_url = ?,
     status = 'pending_approval', approved_by = NULL, approved_at = NULL, error = NULL, updated_at = ?
     WHERE id = ?`,
    [title, channel, scheduledAt, JSON.stringify(content || {}), imageUrl || null, new Date(), id]
  );
  return getItem(id);
}

async function setStatus(id, status, extra = {}) {
  const allowed = ['draft', 'pending_approval', 'approved', 'publishing', 'published', 'rejected', 'failed'];
  if (!allowed.includes(status)) throw new Error('Estado no válido');
  await db.query(
    `UPDATE florencia_marketing_items SET status = ?, external_id = ?, error = ?,
     approved_by = COALESCE(?, approved_by), approved_at = COALESCE(?, approved_at),
     published_at = COALESCE(?, published_at), updated_at = ? WHERE id = ?`,
    [
      status,
      extra.externalId || null,
      extra.error || null,
      extra.approvedBy || null,
      extra.approvedAt || null,
      extra.publishedAt || null,
      new Date(),
      id
    ]
  );
  return getItem(id);
}

function extractJson(text) {
  const raw = String(text || '').trim();
  try { return JSON.parse(raw); } catch (_) {}
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/i) || raw.match(/(\{[\s\S]*\})/);
  if (!match) throw new Error('Florencia no devolvió un plan JSON válido');
  return JSON.parse(match[1]);
}

function marketingContext(store) {
  const services = (store.SERVICES || []).filter((s) => s.enabled !== false);
  const stats = store.getAdminStats?.() || {};
  return {
    company: company.name,
    appUrl: company.appUrl,
    market: 'Servicios técnicos para el hogar en Santiago de Chile',
    services: services.map((s) => ({
      name: s.name,
      description: s.description,
      visitPrice: s.visitPrice
    })),
    stats: {
      clients: (store.USERS || []).filter((u) => u.role === 'client').length,
      providers: (store.USERS || []).filter((u) => u.role === 'provider').length,
      completedServices: stats.completedRequests || 0
    }
  };
}

async function generatePlan(store, brief = {}) {
  const days = Math.min(90, Math.max(7, Number(brief.days) || 30));
  const start = new Date();
  const context = marketingContext(store);
  const prompt = `Eres Florencia IA, directora senior de marketing de Fundez en Chile.
Genera un plan editorial accionable de ${days} días. Todo debe quedar en borrador para aprobación humana.
Objetivo: ${brief.objective || 'captar clientes y aumentar servicios completados'}.
Audiencia: ${brief.audience || 'hogares y administradores de edificios en Santiago'}.
Presupuesto/condiciones: ${brief.budget || 'orgánico y bajo presupuesto'}.
Contexto: ${JSON.stringify(context)}.

Devuelve SOLO JSON válido con:
{
  "strategy": {"positioning":"","objectives":[],"audiences":[],"pillars":[],"kpis":[]},
  "items": [
    {
      "title":"",
      "channel":"instagram|facebook|linkedin|x|tiktok|email",
      "scheduledAt":"ISO-8601",
      "copy":"",
      "subject":"",
      "cta":"",
      "hashtags":[],
      "imagePrompt":"",
      "format":"post|story|reel|email"
    }
  ]
}
Incluye 12 a 24 piezas equilibradas. No inventes descuentos, cifras, certificaciones ni testimonios.
En imagePrompt describe SOLO la escena fotográfica: sin logos, sin tipografía, sin texto sobre la imagen.`;

  const completion = await openai.chatCompletion({
    model: process.env.FLORENCIA_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'Responde en español de Chile. Eres estratégica, concreta, ética y orientada a conversión. No publicas sin aprobación. Las imágenes nunca deben incluir logos ni texto.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.55,
    maxTokens: 6000,
    agent: 'florencia',
    operation: 'plan'
  });
  const plan = extractJson(completion.content);
  const created = [];
  for (const raw of (Array.isArray(plan.items) ? plan.items : [])) {
    const channel = ALLOWED_CHANNELS.includes(raw.channel) ? raw.channel : 'instagram';
    created.push(await createItem({
      kind: channel === 'email' ? 'email' : 'social',
      title: raw.title,
      channel,
      status: 'pending_approval',
      scheduledAt: raw.scheduledAt || start,
      content: {
        copy: raw.copy || '',
        subject: raw.subject || '',
        cta: raw.cta || '',
        hashtags: Array.isArray(raw.hashtags) ? raw.hashtags : [],
        imagePrompt: raw.imagePrompt || '',
        format: raw.format || 'post',
        strategy: plan.strategy || null
      }
    }));
  }
  return { strategy: plan.strategy || {}, items: created, usage: completion.usage };
}

async function generateImage(item, { extraInstructions = '' } = {}) {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY no configurada');
  const imagePrompt = item?.content?.imagePrompt || item?.title;
  const prompt = `Fotografía publicitaria premium para Fundez (servicios técnicos del hogar en Santiago de Chile).
Escena: ${imagePrompt}
${extraInstructions ? `Instrucciones del director de marketing: ${extraInstructions}` : ''}

REGLAS VISUALES OBLIGATORIAS:
- Estilo fotográfico realista, limpio, confiable, iluminación natural, azul y blanco.
- Composición cuadrada 1:1 apta para Instagram/Facebook.
- PROHIBIDO: cualquier logo, marca, watermark, tipografía, letras, números, carteles, stickers, badges o texto sobre la imagen.
- PROHIBIDO: logos inventados o el logo de Fundez renderizado (el logo se agrega después en diseño).
- PROHIBIDO: caras claramente reconocibles de celebridades, datos personales o escenas alarmistas.
- Enfócate en el oficio, la herramienta, el hogar o el resultado del servicio, sin overlays.`;
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.FLORENCIA_IMAGE_MODEL || 'gpt-image-1',
      prompt,
      size: '1024x1024',
      quality: 'medium',
      n: 1
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `OpenAI Images respondió ${response.status}`);
  const b64 = data?.data?.[0]?.b64_json;
  const remoteUrl = data?.data?.[0]?.url;
  const imageModel = process.env.FLORENCIA_IMAGE_MODEL || 'gpt-image-1';
  const usage = data?.usage || {};
  const promptTokens = Number(usage.input_tokens || usage.prompt_tokens) || 0;
  const completionTokens = Number(usage.output_tokens || usage.completion_tokens) || 0;
  const totalTokens = Number(usage.total_tokens) || (promptTokens + completionTokens);
  openaiUsage.logUsage({
    agent: 'florencia',
    operation: 'image',
    model: imageModel,
    promptTokens,
    completionTokens,
    totalTokens: totalTokens || 0,
    images: 1,
    estimated: !totalTokens,
    meta: { itemId: item.id }
  }).catch(() => {});
  await fs.promises.mkdir(IMAGE_DIR, { recursive: true });
  const filename = `${item.id}-${Date.now()}.png`;
  const target = path.join(IMAGE_DIR, filename);
  if (b64) {
    await fs.promises.writeFile(target, Buffer.from(b64, 'base64'));
  } else if (remoteUrl) {
    const imageResponse = await fetch(remoteUrl);
    if (!imageResponse.ok) throw new Error('No se pudo descargar la imagen generada');
    await fs.promises.writeFile(target, Buffer.from(await imageResponse.arrayBuffer()));
  } else {
    throw new Error('OpenAI no devolvió una imagen');
  }
  const imageUrl = `/uploads/marketing/${filename}`;
  return updateItem(item.id, {
    imageUrl,
    content: {
      ...(item.content || {}),
      imagePrompt: item?.content?.imagePrompt || imagePrompt,
      lastImageNotes: String(extraInstructions || '').slice(0, 500) || undefined
    }
  });
}

function connectionsStatus() {
  return {
    facebook: Boolean(process.env.META_PAGE_ID && process.env.META_PAGE_ACCESS_TOKEN),
    instagram: Boolean(process.env.INSTAGRAM_BUSINESS_ID && process.env.META_PAGE_ACCESS_TOKEN),
    linkedin: Boolean(process.env.LINKEDIN_ORGANIZATION_URN && process.env.LINKEDIN_ACCESS_TOKEN),
    x: Boolean(process.env.X_USER_ACCESS_TOKEN),
    // Se mantiene deshabilitado hasta completar la auditoría y UX obligatoria de TikTok.
    tiktok: false,
    tiktokCredentials: Boolean(process.env.TIKTOK_ACCESS_TOKEN && process.env.TIKTOK_OPEN_ID),
    email: mailer.isConfigured()
  };
}

function publicImageUrl(imageUrl) {
  if (!imageUrl) return null;
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  return `${String(company.appUrl || '').replace(/\/$/, '')}${imageUrl}`;
}

async function publishFacebook(item) {
  const version = process.env.META_GRAPH_VERSION || 'v23.0';
  const endpoint = item.imageUrl ? 'photos' : 'feed';
  const url = `https://graph.facebook.com/${version}/${encodeURIComponent(process.env.META_PAGE_ID)}/${endpoint}`;
  const body = new URLSearchParams({
    access_token: process.env.META_PAGE_ACCESS_TOKEN,
    [item.imageUrl ? 'caption' : 'message']: buildSocialText(item)
  });
  if (item.imageUrl) body.set('url', publicImageUrl(item.imageUrl));
  const response = await fetch(url, { method: 'POST', body });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `Meta respondió ${response.status}`);
  return data.post_id || data.id;
}

async function publishInstagram(item) {
  if (!item.imageUrl) throw new Error('Instagram requiere imagen aprobada');
  const base = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v23.0'}`;
  const createBody = new URLSearchParams({
    access_token: process.env.META_PAGE_ACCESS_TOKEN,
    image_url: publicImageUrl(item.imageUrl),
    caption: buildSocialText(item)
  });
  const create = await fetch(`${base}/${encodeURIComponent(process.env.INSTAGRAM_BUSINESS_ID)}/media`, {
    method: 'POST',
    body: createBody
  });
  const created = await create.json().catch(() => ({}));
  if (!create.ok) throw new Error(created?.error?.message || `Instagram respondió ${create.status}`);
  const publish = await fetch(`${base}/${encodeURIComponent(process.env.INSTAGRAM_BUSINESS_ID)}/media_publish`, {
    method: 'POST',
    body: new URLSearchParams({
      access_token: process.env.META_PAGE_ACCESS_TOKEN,
      creation_id: created.id
    })
  });
  const result = await publish.json().catch(() => ({}));
  if (!publish.ok) throw new Error(result?.error?.message || `Instagram respondió ${publish.status}`);
  return result.id;
}

async function publishLinkedIn(item) {
  const response = await fetch('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      'LinkedIn-Version': process.env.LINKEDIN_API_VERSION || '202601',
      'X-Restli-Protocol-Version': '2.0.0'
    },
    body: JSON.stringify({
      author: process.env.LINKEDIN_ORGANIZATION_URN,
      commentary: buildSocialText(item),
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false
    })
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`LinkedIn respondió ${response.status}: ${text.slice(0, 300)}`);
  return response.headers.get('x-restli-id') || 'linkedin-published';
}

async function publishX(item) {
  const response = await fetch('https://api.x.com/2/tweets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.X_USER_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ text: buildSocialText(item).slice(0, 280) })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.detail || data?.title || `X respondió ${response.status}`);
  return data?.data?.id;
}

function buildSocialText(item) {
  const content = item.content || {};
  const tags = (content.hashtags || []).map((tag) => tag.startsWith('#') ? tag : `#${tag}`).join(' ');
  return [content.copy, content.cta, tags].filter(Boolean).join('\n\n').trim();
}

function marketingRecipients(store) {
  const latest = new Map();
  for (const record of (store.consentRecords || [])) {
    if (record.type !== 'marketing') continue;
    const key = record.userId || record.user_id;
    if (!key) continue;
    const prev = latest.get(key);
    if (!prev || new Date(record.createdAt || record.created_at || 0) > new Date(prev.createdAt || prev.created_at || 0)) {
      latest.set(key, record);
    }
  }
  return (store.USERS || []).filter((user) => {
    if (user.role !== 'client' || !user.email || user.active === false) return false;
    const consent = latest.get(user.id);
    return Boolean(
      consent
      && !consent.withdrawnAt
      && !consent.withdrawn_at
      && (consent.granted === true || consent.granted === 1)
    );
  });
}

async function sendEmailCampaign(item, store) {
  const recipients = marketingRecipients(store);
  if (!recipients.length) throw new Error('No hay clientes con consentimiento de marketing vigente');
  const subject = item.content?.subject || item.title;
  const copy = item.content?.copy || '';
  const cta = item.content?.cta || '';
  const image = item.imageUrl
    ? `<img src="${publicImageUrl(item.imageUrl)}" alt="" style="width:100%;border-radius:14px;margin-bottom:18px">`
    : '';
  let sent = 0;
  let failed = 0;
  for (const user of recipients) {
    const result = await mailer.sendMail({
      to: user.email,
      subject,
      text: `${copy}\n\n${cta}\n\nPara dejar de recibir marketing, responde este correo con “unsubscribe”.`,
      html: `${image}<p>Hola <strong>${escapeHtml(user.name || 'cliente')}</strong>,</p><p>${escapeHtml(copy).replace(/\n/g, '<br>')}</p><p><strong>${escapeHtml(cta)}</strong></p><p style="font-size:11px;color:#6B7280">Recibes este correo porque aceptaste comunicaciones de marketing de Fundez. Puedes darte de baja respondiendo “unsubscribe”.</p>`
    });
    if (result?.error) failed += 1;
    else sent += 1;
  }
  return { externalId: `email:${sent}`, sent, failed };
}

async function publishItem(id, store) {
  const item = await getItem(id);
  if (!item) throw new Error('Pieza no encontrada');
  if (item.status !== 'approved') throw new Error('La pieza debe estar aprobada antes de publicar');
  const status = connectionsStatus();
  if (!status[item.channel]) throw new Error(`Conexión ${item.channel} no configurada`);
  await setStatus(id, 'publishing');
  try {
    let externalId;
    if (item.channel === 'facebook') externalId = await publishFacebook(item);
    else if (item.channel === 'instagram') externalId = await publishInstagram(item);
    else if (item.channel === 'linkedin') externalId = await publishLinkedIn(item);
    else if (item.channel === 'x') externalId = await publishX(item);
    else if (item.channel === 'email') externalId = (await sendEmailCampaign(item, store)).externalId;
    else if (item.channel === 'tiktok') {
      throw new Error('TikTok requiere auditoría de Content Posting API; la pieza queda aprobada para carga manual');
    }
    return setStatus(id, 'published', { externalId, publishedAt: new Date() });
  } catch (err) {
    await setStatus(id, 'failed', { error: err.message });
    throw err;
  }
}

function rowToChatMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    itemId: row.item_id || null,
    role: row.role,
    body: row.body || '',
    meta: parseJson(row.meta, null),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null
  };
}

async function listChatMessages({ itemId = null, limit = 80 } = {}) {
  if (!db.isConfigured()) return [];
  await ensureSchema();
  const capped = Math.min(200, Math.max(1, Number(limit) || 80));
  let result;
  if (itemId) {
    result = await db.query(
      `SELECT * FROM florencia_chat_messages WHERE item_id = ?
       ORDER BY created_at DESC LIMIT ?`,
      [itemId, capped]
    );
  } else {
    result = await db.query(
      `SELECT * FROM florencia_chat_messages WHERE item_id IS NULL
       ORDER BY created_at DESC LIMIT ?`,
      [capped]
    );
  }
  return result.rows.map(rowToChatMessage).reverse();
}

async function saveChatMessage({ itemId = null, role, body, meta = null } = {}) {
  if (!db.isConfigured()) throw new Error('Base de datos no configurada');
  await ensureSchema();
  const id = uuidv4();
  const now = new Date();
  await db.query(
    `INSERT INTO florencia_chat_messages (id, item_id, role, body, meta, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      id,
      itemId || null,
      role === 'assistant' || role === 'system' ? role : 'user',
      String(body || '').slice(0, 8000),
      meta ? JSON.stringify(meta) : null,
      now
    ]
  );
  return rowToChatMessage({
    id,
    item_id: itemId || null,
    role: role === 'assistant' || role === 'system' ? role : 'user',
    body: String(body || '').slice(0, 8000),
    meta,
    created_at: now
  });
}

async function applyChatActions(item, actions = []) {
  if (!item || !Array.isArray(actions) || !actions.length) {
    return { item, applied: [], regenerated: false };
  }
  let current = item;
  const applied = [];
  let regenerated = false;
  let contentPatch = { ...(current.content || {}) };
  let titlePatch;
  let needsContentUpdate = false;

  for (const action of actions) {
    const type = String(action?.type || '').trim();
    if (type === 'update_title' && action.title) {
      titlePatch = String(action.title).slice(0, 220);
      applied.push({ type, title: titlePatch });
    } else if (type === 'update_copy') {
      if (action.copy != null) contentPatch.copy = String(action.copy).slice(0, 4000);
      if (action.cta != null) contentPatch.cta = String(action.cta).slice(0, 500);
      if (action.subject != null) contentPatch.subject = String(action.subject).slice(0, 220);
      if (Array.isArray(action.hashtags)) {
        contentPatch.hashtags = action.hashtags.map((tag) => String(tag).replace(/^#/, '').slice(0, 40)).filter(Boolean).slice(0, 12);
      }
      needsContentUpdate = true;
      applied.push({ type: 'update_copy' });
    } else if (type === 'update_image_prompt' && action.imagePrompt) {
      contentPatch.imagePrompt = String(action.imagePrompt).slice(0, 1200);
      needsContentUpdate = true;
      applied.push({ type: 'update_image_prompt' });
    } else if (type === 'regenerate_image') {
      applied.push({ type: 'regenerate_image', pending: true });
    }
  }

  if (needsContentUpdate || titlePatch !== undefined) {
    current = await updateItem(current.id, {
      ...(titlePatch !== undefined ? { title: titlePatch } : {}),
      ...(needsContentUpdate ? { content: contentPatch } : {})
    });
  }

  const regen = actions.find((a) => String(a?.type || '') === 'regenerate_image');
  if (regen) {
    const notes = String(regen.extraInstructions || regen.notes || '').slice(0, 800);
    current = await generateImage(current, { extraInstructions: notes });
    regenerated = true;
    const last = applied.find((a) => a.type === 'regenerate_image');
    if (last) {
      last.pending = false;
      last.imageUrl = current.imageUrl;
    }
  }

  return { item: current, applied, regenerated };
}

async function chatWithFlorencia(store, { message, itemId = null } = {}) {
  const text = String(message || '').trim().slice(0, 4000);
  if (!text) throw new Error('Escribe un mensaje para Florencia');
  await ensureSchema();

  let item = null;
  if (itemId) {
    item = await getItem(itemId);
    if (!item) throw new Error('Pieza no encontrada');
  }

  await saveChatMessage({ itemId: item?.id || null, role: 'user', body: text });
  const history = await listChatMessages({ itemId: item?.id || null, limit: 24 });
  const context = marketingContext(store);

  const itemContext = item
    ? {
        id: item.id,
        title: item.title,
        channel: item.channel,
        status: item.status,
        scheduledAt: item.scheduledAt,
        imageUrl: item.imageUrl,
        content: {
          copy: item.content?.copy || '',
          cta: item.content?.cta || '',
          subject: item.content?.subject || '',
          hashtags: item.content?.hashtags || [],
          imagePrompt: item.content?.imagePrompt || '',
          format: item.content?.format || 'post'
        }
      }
    : null;

  const system = `Eres Florencia IA, directora de marketing de Fundez (Chile).
Ayudas al equipo admin a mejorar copy e imágenes de piezas publicitarias.
Hablas en español de Chile, clara y práctica.
Nunca publicas ni apruebas piezas: solo propones cambios.
Problema frecuente: las imágenes IA salen con logos o texto ilegible. Corrige eso.
Cuando debas modificar una pieza, incluye actions en el JSON.
Tipos de action:
- update_title: { "type":"update_title", "title":"..." }
- update_copy: { "type":"update_copy", "copy":"...", "cta":"...", "subject":"...", "hashtags":["..."] }
- update_image_prompt: { "type":"update_image_prompt", "imagePrompt":"escena sin logos ni texto" }
- regenerate_image: { "type":"regenerate_image", "extraInstructions":"qué corregir visualmente" }
Si el usuario pide regenerar o arreglar logo/texto en la foto, usa update_image_prompt + regenerate_image.
imagePrompt y extraInstructions NUNCA deben pedir logos, tipografía ni texto sobre la imagen.
Si no hay pieza vinculada, responde consejo estratégico sin actions (o array vacío).
Devuelve SOLO JSON válido:
{"reply":"mensaje para el admin","actions":[]}`;

  const completion = await openai.chatCompletion({
    model: process.env.FLORENCIA_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: system },
      {
        role: 'user',
        content: JSON.stringify({
          context,
          item: itemContext,
          conversation: history.map((m) => ({ role: m.role, body: m.body })),
          latestMessage: text
        })
      }
    ],
    temperature: 0.45,
    maxTokens: 2500,
    agent: 'florencia',
    operation: 'chat'
  });

  let parsed;
  try {
    parsed = extractJson(completion.content);
  } catch (_) {
    parsed = { reply: completion.content, actions: [] };
  }

  const reply = String(parsed.reply || completion.content || 'Listo, revisé tu pedido.').trim().slice(0, 4000);
  const actions = Array.isArray(parsed.actions) ? parsed.actions : [];
  let applied = [];
  let regenerated = false;

  if (item && actions.length) {
    if (item.status === 'published') {
      // Las piezas publicadas no se editan; solo consejo.
    } else {
      const result = await applyChatActions(item, actions);
      item = result.item;
      applied = result.applied;
      regenerated = result.regenerated;
    }
  }

  const assistantMsg = await saveChatMessage({
    itemId: item?.id || null,
    role: 'assistant',
    body: reply,
    meta: { applied, regenerated, usage: completion.usage || null }
  });

  return {
    reply,
    message: assistantMsg,
    messages: await listChatMessages({ itemId: item?.id || null, limit: 80 }),
    item,
    applied,
    regenerated,
    usage: completion.usage
  };
}

function startScheduler(store, io) {
  if (schedulerTimer) return schedulerTimer;
  const tick = async () => {
    try {
      const approved = await listItems({ status: 'approved', limit: 100 });
      const connections = connectionsStatus();
      const due = approved.filter((item) =>
        connections[item.channel]
        && item.scheduledAt
        && new Date(item.scheduledAt).getTime() <= Date.now()
      );
      for (const item of due) {
        try {
          const published = await publishItem(item.id, store);
          io?.to('aland_admin').emit('florencia_update', { type: 'published', item: published });
        } catch (err) {
          console.error(`[florencia] publicar ${item.id}:`, err.message);
          io?.to('aland_admin').emit('florencia_update', { type: 'failed', itemId: item.id, error: err.message });
        }
      }
    } catch (err) {
      console.error('[florencia] scheduler:', err.message);
    }
  };
  schedulerTimer = setInterval(tick, 60 * 1000);
  schedulerTimer.unref?.();
  return schedulerTimer;
}

module.exports = {
  ALLOWED_CHANNELS,
  ensureSchema,
  listItems,
  getItem,
  createItem,
  updateItem,
  setStatus,
  generatePlan,
  generateImage,
  listChatMessages,
  chatWithFlorencia,
  connectionsStatus,
  publishItem,
  marketingRecipients,
  startScheduler
};
