const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

function isConfigured() {
  return Boolean(process.env.OPENAI_API_KEY && String(process.env.OPENAI_API_KEY).trim());
}

async function chatCompletion({ model, messages, temperature = 0.75, maxTokens = 800 }) {
  if (!isConfigured()) {
    throw new Error('OPENAI_API_KEY no configurada. Agrega la clave en las variables de entorno de Hostinger.');
  }

  const res = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model || process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages,
      temperature,
      max_tokens: maxTokens
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `OpenAI respondió ${res.status}`;
    throw new Error(msg);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI no devolvió respuesta');
  return String(content).trim();
}

module.exports = {
  isConfigured,
  chatCompletion
};
