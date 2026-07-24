const { v4: uuidv4 } = require('uuid');
const db = require('./db');

const AGENTS = {
  aland: { id: 'aland', label: 'Aland IA' },
  florencia: { id: 'florencia', label: 'Florencia IA' },
  other: { id: 'other', label: 'Otros' }
};

/** Estimación de costo USD solo para referencia en admin (no factura real). */
const MODEL_RATES = {
  'gpt-4o-mini': { prompt: 0.15 / 1e6, completion: 0.6 / 1e6 },
  'gpt-4o': { prompt: 2.5 / 1e6, completion: 10 / 1e6 },
  'gpt-4.1-mini': { prompt: 0.4 / 1e6, completion: 1.6 / 1e6 },
  'gpt-4.1': { prompt: 2 / 1e6, completion: 8 / 1e6 },
  'gpt-image-1': { image: 0.04 }
};

function normalizeAgent(agent) {
  const key = String(agent || 'other').toLowerCase().trim();
  return AGENTS[key] ? key : 'other';
}

function estimateCostUsd({ model, promptTokens = 0, completionTokens = 0, images = 0 } = {}) {
  const rates = MODEL_RATES[String(model || '').trim()] || MODEL_RATES['gpt-4o-mini'];
  const tokenCost = (Number(promptTokens) || 0) * (rates.prompt || 0)
    + (Number(completionTokens) || 0) * (rates.completion || 0);
  const imageCost = (Number(images) || 0) * (rates.image || MODEL_RATES['gpt-image-1'].image);
  return Number((tokenCost + imageCost).toFixed(6));
}

async function ensureSchema() {
  if (!db.isConfigured()) return false;
  await db.raw(`
    CREATE TABLE IF NOT EXISTS openai_usage_logs (
      id VARCHAR(64) PRIMARY KEY,
      agent VARCHAR(64) NOT NULL,
      operation VARCHAR(64) NOT NULL DEFAULT 'chat',
      model VARCHAR(120) NULL,
      prompt_tokens INT NOT NULL DEFAULT 0,
      completion_tokens INT NOT NULL DEFAULT 0,
      total_tokens INT NOT NULL DEFAULT 0,
      images INT NOT NULL DEFAULT 0,
      estimated TINYINT(1) NOT NULL DEFAULT 0,
      cost_usd DECIMAL(12, 6) NOT NULL DEFAULT 0,
      meta JSON NULL,
      created_at DATETIME NOT NULL,
      INDEX idx_openai_usage_agent_date (agent, created_at),
      INDEX idx_openai_usage_created (created_at),
      INDEX idx_openai_usage_operation (operation)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  return true;
}

async function logUsage(input = {}) {
  if (!db.isConfigured()) return null;
  try {
    await ensureSchema();
    const promptTokens = Math.max(0, Number(input.promptTokens ?? input.prompt_tokens) || 0);
    const completionTokens = Math.max(0, Number(input.completionTokens ?? input.completion_tokens) || 0);
    const totalTokens = Math.max(
      0,
      Number(input.totalTokens ?? input.total_tokens) || (promptTokens + completionTokens)
    );
    const images = Math.max(0, Number(input.images) || 0);
    if (!totalTokens && !images) return null;

    const agent = normalizeAgent(input.agent);
    const model = input.model ? String(input.model).slice(0, 120) : null;
    const estimated = Boolean(input.estimated);
    const costUsd = input.costUsd != null
      ? Number(input.costUsd)
      : estimateCostUsd({ model, promptTokens, completionTokens, images });
    const id = uuidv4();
    const now = new Date();
    await db.query(
      `INSERT INTO openai_usage_logs
       (id, agent, operation, model, prompt_tokens, completion_tokens, total_tokens, images, estimated, cost_usd, meta, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        agent,
        String(input.operation || 'chat').slice(0, 64),
        model,
        promptTokens,
        completionTokens,
        totalTokens,
        images,
        estimated ? 1 : 0,
        costUsd,
        input.meta ? JSON.stringify(input.meta) : null,
        now
      ]
    );
    return { id, agent, totalTokens, images, costUsd, createdAt: now.toISOString() };
  } catch (err) {
    console.error('[openai-usage]', err.message);
    return null;
  }
}

function emptyBucket() {
  return {
    requests: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    images: 0,
    costUsd: 0
  };
}

function addRowToBucket(bucket, row) {
  bucket.requests += Number(row.requests) || 0;
  bucket.promptTokens += Number(row.prompt_tokens) || 0;
  bucket.completionTokens += Number(row.completion_tokens) || 0;
  bucket.totalTokens += Number(row.total_tokens) || 0;
  bucket.images += Number(row.images) || 0;
  bucket.costUsd = Number((bucket.costUsd + (Number(row.cost_usd) || 0)).toFixed(6));
}

async function getAlandLegacyTotals() {
  if (!db.isConfigured()) return emptyBucket();
  try {
    const result = await db.query(
      `SELECT
         COUNT(*) AS requests,
         COALESCE(SUM(tokens_prompt), 0) AS prompt_tokens,
         COALESCE(SUM(tokens_completion), 0) AS completion_tokens,
         COALESCE(SUM(tokens_total), 0) AS total_tokens,
         0 AS images,
         0 AS cost_usd
       FROM aland_conversations
       WHERE COALESCE(tokens_total, 0) > 0`
    );
    const row = result.rows[0] || {};
    const bucket = emptyBucket();
    addRowToBucket(bucket, {
      requests: Number(row.requests) || 0,
      prompt_tokens: row.prompt_tokens,
      completion_tokens: row.completion_tokens,
      total_tokens: row.total_tokens,
      images: 0,
      cost_usd: estimateCostUsd({
        model: 'gpt-4o-mini',
        promptTokens: Number(row.prompt_tokens) || 0,
        completionTokens: Number(row.completion_tokens) || 0
      })
    });
    return bucket;
  } catch (_) {
    return emptyBucket();
  }
}

async function getUsageSummary({ days = 30 } = {}) {
  await ensureSchema();
  const windowDays = Math.min(365, Math.max(1, Number(days) || 30));
  const empty = {
    windowDays,
    totals: emptyBucket(),
    byAgent: Object.keys(AGENTS).map((id) => ({
      agent: id,
      label: AGENTS[id].label,
      ...emptyBucket(),
      legacy: emptyBucket()
    })),
    byDay: [],
    byOperation: [],
    recent: [],
    legacyNote: null
  };
  if (!db.isConfigured()) return empty;

  const [byAgentRows, byDayRows, byOpRows, recentRows, periodTotals] = await Promise.all([
    db.query(
      `SELECT agent,
         COUNT(*) AS requests,
         COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
         COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
         COALESCE(SUM(total_tokens), 0) AS total_tokens,
         COALESCE(SUM(images), 0) AS images,
         COALESCE(SUM(cost_usd), 0) AS cost_usd
       FROM openai_usage_logs
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY agent`,
      [windowDays]
    ).catch(() => ({ rows: [] })),
    db.query(
      `SELECT DATE(created_at) AS day, agent,
         COUNT(*) AS requests,
         COALESCE(SUM(total_tokens), 0) AS total_tokens,
         COALESCE(SUM(images), 0) AS images,
         COALESCE(SUM(cost_usd), 0) AS cost_usd
       FROM openai_usage_logs
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY DATE(created_at), agent
       ORDER BY day ASC`,
      [windowDays]
    ).catch(() => ({ rows: [] })),
    db.query(
      `SELECT agent, operation,
         COUNT(*) AS requests,
         COALESCE(SUM(total_tokens), 0) AS total_tokens,
         COALESCE(SUM(images), 0) AS images,
         COALESCE(SUM(cost_usd), 0) AS cost_usd
       FROM openai_usage_logs
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY agent, operation
       ORDER BY total_tokens DESC`,
      [windowDays]
    ).catch(() => ({ rows: [] })),
    db.query(
      `SELECT id, agent, operation, model, prompt_tokens, completion_tokens, total_tokens,
              images, estimated, cost_usd, created_at
       FROM openai_usage_logs
       ORDER BY created_at DESC
       LIMIT 40`
    ).catch(() => ({ rows: [] })),
    db.query(
      `SELECT
         COUNT(*) AS requests,
         COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
         COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
         COALESCE(SUM(total_tokens), 0) AS total_tokens,
         COALESCE(SUM(images), 0) AS images,
         COALESCE(SUM(cost_usd), 0) AS cost_usd
       FROM openai_usage_logs
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [windowDays]
    ).catch(() => ({ rows: [{}] }))
  ]);

  const totals = emptyBucket();
  addRowToBucket(totals, periodTotals.rows[0] || {});

  const legacy = await getAlandLegacyTotals();
  const byAgentMap = new Map();
  for (const id of Object.keys(AGENTS)) {
    byAgentMap.set(id, {
      agent: id,
      label: AGENTS[id].label,
      ...emptyBucket(),
      legacy: id === 'aland' ? legacy : emptyBucket()
    });
  }
  for (const row of byAgentRows.rows) {
    const key = normalizeAgent(row.agent);
    const bucket = byAgentMap.get(key) || {
      agent: key,
      label: AGENTS[key]?.label || key,
      ...emptyBucket(),
      legacy: emptyBucket()
    };
    addRowToBucket(bucket, row);
    byAgentMap.set(key, bucket);
  }

  return {
    windowDays,
    totals,
    byAgent: [...byAgentMap.values()].sort((a, b) => b.totalTokens - a.totalTokens),
    byDay: byDayRows.rows.map((row) => ({
      day: row.day instanceof Date ? row.day.toISOString().slice(0, 10) : String(row.day).slice(0, 10),
      agent: normalizeAgent(row.agent),
      requests: Number(row.requests) || 0,
      totalTokens: Number(row.total_tokens) || 0,
      images: Number(row.images) || 0,
      costUsd: Number(row.cost_usd) || 0
    })),
    byOperation: byOpRows.rows.map((row) => ({
      agent: normalizeAgent(row.agent),
      operation: row.operation,
      requests: Number(row.requests) || 0,
      totalTokens: Number(row.total_tokens) || 0,
      images: Number(row.images) || 0,
      costUsd: Number(row.cost_usd) || 0
    })),
    recent: recentRows.rows.map((row) => ({
      id: row.id,
      agent: normalizeAgent(row.agent),
      label: AGENTS[normalizeAgent(row.agent)]?.label || row.agent,
      operation: row.operation,
      model: row.model,
      promptTokens: Number(row.prompt_tokens) || 0,
      completionTokens: Number(row.completion_tokens) || 0,
      totalTokens: Number(row.total_tokens) || 0,
      images: Number(row.images) || 0,
      estimated: Boolean(row.estimated),
      costUsd: Number(row.cost_usd) || 0,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null
    })),
    legacyNote: legacy.totalTokens > 0
      ? 'Aland también muestra el acumulado histórico de conversaciones (antes del registro unificado).'
      : null
  };
}

module.exports = {
  AGENTS,
  ensureSchema,
  logUsage,
  getUsageSummary,
  estimateCostUsd,
  normalizeAgent
};
