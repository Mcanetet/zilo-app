const alandStore = require('./store');
const openai = require('./openai');
const company = require('../../config/company');

function formatCLP(n) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n || 0);
}

async function syncKnowledgeFromApp(appStore) {
  if (!appStore?.isReady?.()) return 0;
  let count = 0;

  const companyBlock = [
    `Empresa: ${company.name}`,
    `RUT: ${company.rut}`,
    `Email soporte: ${company.supportEmail}`,
    `Dirección: ${company.address}`,
    `WhatsApp: ${company.whatsappDisplay}`,
    `Web: ${company.appUrl}`,
    `Comisión plataforma: ${company.commissionRate}%`,
    `DPO / privacidad: ${company.dpoEmail}`
  ].join('\n');

  await alandStore.saveKnowledge({
    id: 'kb-company',
    sourceType: 'company',
    title: 'Información de la empresa Fundez',
    content: companyBlock,
    sortOrder: 0,
    active: true
  });
  count++;

  const pricing = appStore.getPricingConfig?.() || {};
  const pricingBlock = [
    `Visita diagnóstico mínima: ${formatCLP(pricing.visitBasePrice || pricing.visitPrice)}`,
    `Trabajo base (servicePrice): ${formatCLP(pricing.servicePrice)}`,
    `Recargo tarjeta: ${pricing.cardSurchargePercent || 0}%`,
    `Transferencia habilitada: ${pricing.transferEnabled ? 'Sí' : 'No'}`,
    `Opciones de llegada: ${(pricing.urgencyTiers || []).map((t) => `${t.label} (${t.responseMinutes || '?'} min)`).join(', ')}`,
    'Tarifa dinámica: (base × horario configurable) × (1 + recargo llegada configurable). Horario y opciones Inmediato/Hoy/Mañana/2 días se editan en Admin → Precios.'
  ].join('\n');

  await alandStore.saveKnowledge({
    id: 'kb-pricing',
    sourceType: 'pricing',
    title: 'Precios y tarifas Fundez',
    content: pricingBlock,
    sortOrder: 1,
    active: true
  });
  count++;

  for (const service of appStore.SERVICES || []) {
    await alandStore.saveKnowledge({
      id: `kb-service-${service.id}`,
      sourceType: 'service',
      serviceId: service.id,
      title: `Servicio: ${service.name}`,
      content: [
        `Nombre: ${service.name}`,
        `Descripción: ${service.description || '—'}`,
        `Visita técnica desde: ${formatCLP(service.visitPrice)}`,
        `Rango servicio estimado: ${formatCLP(service.basicMin)} – ${formatCLP(service.basicMax)}`,
        `Estado: ${service.enabled ? 'Disponible' : 'No disponible'}`
      ].join('\n'),
      sortOrder: 10,
      active: service.enabled !== false
    });
    count++;
  }

  return count;
}

function buildKnowledgeContext(knowledge, serviceId) {
  const relevant = knowledge.filter((k) => {
    if (!k.active) return false;
    if (k.sourceType === 'service' && k.serviceId && k.serviceId !== serviceId) return false;
    return true;
  });
  return relevant.map((k) => `### ${k.title}\n${k.content}`).join('\n\n');
}

function shouldEscalate(text, config) {
  const lower = String(text || '').toLowerCase();
  const keywords = [...(config.escalateKeywords || []), 'hablar con alguien', 'necesito un técnico', 'visita técnica', 'presupuesto'];
  if (keywords.some((kw) => lower.includes(String(kw).toLowerCase()))) return { escalate: true, reason: 'keyword' };

  const technicalPatterns = [
    /no (prende|funciona|enciende)/i,
    /filtraci/i,
    /cortocircuito/i,
    /tablero/i,
    /instalaci[oó]n/i,
    /presupuesto/i,
    /cotizaci/i,
    /urgente/i
  ];
  if (technicalPatterns.some((re) => re.test(text))) return { escalate: true, reason: 'technical' };

  return { escalate: false };
}

function findProviderForService(appStore, serviceId) {
  const providers = (appStore.USERS || []).filter(
    (u) => u.role === 'provider' && u.active !== false && Array.isArray(u.specialties) && u.specialties.includes(serviceId)
  );
  const online = providers.filter((p) => p.online);
  const pick = online[0] || providers[0];
  return pick || null;
}

function buildSystemPrompt(config, knowledgeContext, serviceName) {
  return [
    config.personality,
    '',
    `Tu nombre es ${config.agentName || 'Aland IA'}. Nunca digas que eres ChatGPT ni un bot genérico.`,
    config.systemInstructions,
    '',
    `Servicio actual de la conversación: ${serviceName}.`,
    '',
    'Temas permitidos: ' + (config.allowedTopics || []).join(', '),
    'Temas prohibidos (deriva a humano): ' + (config.blockedTopics || []).join(', '),
    ...(config.customRules || []).map((r, i) => `Regla ${i + 1}: ${r}`),
    '',
    'BASE DE CONOCIMIENTO (usa solo esta información):',
    knowledgeContext || '(Sin información adicional cargada)',
    '',
    'Si debes derivar a un especialista, responde al cliente que lo conectarás con el equipo del servicio y termina con la etiqueta [DERIVAR_PROVEEDOR] en una línea aparte (el cliente no debe ver instrucciones internas).'
  ].join('\n');
}

async function generateAlandReply({ appStore, conversation, userMessage, config }) {
  const knowledge = await alandStore.listKnowledge({ activeOnly: true });
  const knowledgeContext = buildKnowledgeContext(knowledge, conversation.serviceId);
  const history = await alandStore.listMessages(conversation.id, 30);
  const messages = [
    { role: 'system', content: buildSystemPrompt(config, knowledgeContext, conversation.serviceName) }
  ];

  for (const msg of history.slice(-12)) {
    if (msg.senderType === 'client') messages.push({ role: 'user', content: msg.body });
    else if (msg.senderType === 'aland') messages.push({ role: 'assistant', content: msg.body });
  }
  messages.push({ role: 'user', content: userMessage });

  let reply = await openai.chatCompletion({
    model: config.openaiModel,
    messages,
    temperature: 0.78
  });

  let escalate = false;
  if (reply.includes('[DERIVAR_PROVEEDOR]')) {
    escalate = true;
    reply = reply.replace(/\[DERIVAR_PROVEEDOR\]/g, '').trim();
  }

  const check = shouldEscalate(userMessage, config);
  if (check.escalate) escalate = true;

  if (escalate && !reply.toLowerCase().includes('especialista') && !reply.toLowerCase().includes('equipo')) {
    reply += '\n\nTe conecto con un especialista del servicio para ayudarte mejor. Un momento por favor.';
  }

  return { reply, escalate, escalateReason: check.reason || 'ai' };
}

async function escalateToProvider(appStore, conversation, io) {
  const provider = findProviderForService(appStore, conversation.serviceId);
  const now = new Date();
  const updated = await alandStore.updateConversation(conversation.id, {
    status: 'awaiting_provider',
    providerId: provider?.id || null,
    providerName: provider?.name || null,
    escalatedAt: now,
    providerNotifiedAt: now,
    lastMessageAt: now
  });

  const sysMsg = provider
    ? `Conversación derivada al socio ${provider.name}. Tiene ${(await alandStore.getConfig()).providerTimeoutMinutes} minutos para responder.`
    : 'Conversación derivada. No hay socio disponible para este servicio; se escalará a administración.';

  const message = await alandStore.addMessage({
    conversationId: conversation.id,
    senderType: 'system',
    senderName: 'Sistema',
    body: sysMsg,
    meta: { type: 'escalation_provider' }
  });

  if (io && provider) {
    io.to(`aland_provider_${provider.id}`).emit('aland_escalated', { conversation: updated, message });
  }
  if (io) {
    io.to('aland_admin').emit('aland_escalated', { conversation: updated, message });
  }

  return updated;
}

async function escalateToAdmin(conversation, io, reason = 'timeout') {
  const now = new Date();
  const updated = await alandStore.updateConversation(conversation.id, {
    status: 'awaiting_admin',
    adminEscalatedAt: now,
    lastMessageAt: now
  });

  const message = await alandStore.addMessage({
    conversationId: conversation.id,
    senderType: 'system',
    senderName: 'Sistema',
    body: reason === 'timeout'
      ? 'El socio no respondió a tiempo. Conversación escalada a administración Fundez.'
      : 'Conversación escalada a administración Fundez.',
    meta: { type: 'escalation_admin', reason }
  });

  if (io) {
    io.to('aland_admin').emit('aland_escalated', { conversation: updated, message });
    io.to(`aland_conv_${conversation.id}`).emit('aland_message', { conversationId: conversation.id, message });
  }

  return updated;
}

async function processClientMessage({ appStore, io, conversationId, user, text }) {
  const config = await alandStore.getConfig();
  if (!config.enabled) {
    throw new Error('Aland IA está desactivado temporalmente');
  }

  let conversation = await alandStore.getConversationById(conversationId);
  if (!conversation) throw new Error('Conversación no encontrada');
  if (conversation.clientId && user?.id && conversation.clientId !== user.id) {
    throw new Error('No autorizado');
  }

  const clientMsg = await alandStore.addMessage({
    conversationId,
    senderType: 'client',
    senderId: user?.id,
    senderName: user?.name || conversation.clientName,
    body: text
  });

  if (io) {
    io.to(`aland_conv_${conversationId}`).emit('aland_message', { conversationId, message: clientMsg });
  }

  if (conversation.status !== 'ai_active') {
    if (conversation.status === 'awaiting_provider' && conversation.providerId) {
      if (io) {
        io.to(`aland_provider_${conversation.providerId}`).emit('aland_message', { conversationId, message: clientMsg });
      }
    }
    if (conversation.status === 'awaiting_admin' && io) {
      io.to('aland_admin').emit('aland_message', { conversationId, message: clientMsg });
    }
    return { conversation, clientMessage: clientMsg, alandMessage: null, escalated: false };
  }

  const { reply, escalate } = await generateAlandReply({
    appStore,
    conversation,
    userMessage: text,
    config
  });

  const alandMsg = await alandStore.addMessage({
    conversationId,
    senderType: 'aland',
    senderName: config.agentName || 'Aland IA',
    body: reply,
    meta: { model: config.openaiModel }
  });

  if (io) {
    io.to(`aland_conv_${conversationId}`).emit('aland_message', { conversationId, message: alandMsg });
  }

  if (escalate) {
    conversation = await escalateToProvider(appStore, conversation, io);
    return { conversation, clientMessage: clientMsg, alandMessage: alandMsg, escalated: true };
  }

  return { conversation, clientMessage: clientMsg, alandMessage: alandMsg, escalated: false };
}

async function processHumanReply({ io, conversationId, senderType, senderId, senderName, text }) {
  const conversation = await alandStore.getConversationById(conversationId);
  if (!conversation) throw new Error('Conversación no encontrada');

  const msg = await alandStore.addMessage({
    conversationId,
    senderType,
    senderId,
    senderName,
    body: text
  });

  if (senderType === 'provider' || senderType === 'admin') {
    await alandStore.updateConversation(conversationId, {
      status: senderType === 'admin' ? 'awaiting_admin' : 'awaiting_provider',
      lastMessageAt: new Date()
    });
  }

  if (io) {
    io.to(`aland_conv_${conversationId}`).emit('aland_message', { conversationId, message: msg });
    if (conversation.clientId) {
      io.to(`aland_client_${conversation.clientId}`).emit('aland_message', { conversationId, message: msg });
    }
  }

  return { conversation, message: msg };
}

async function runEscalationWatch(appStore, io) {
  const config = await alandStore.getConfig();
  const stale = await alandStore.findStaleProviderConversations(config.providerTimeoutMinutes || 5);

  for (const conv of stale) {
    const since = conv.providerNotifiedAt ? new Date(conv.providerNotifiedAt) : null;
    if (!since) continue;
    const replies = await alandStore.countProviderRepliesSince(conv.id, since);
    if (replies === 0) {
      await escalateToAdmin(conv, io, 'timeout');
    }
  }
}

function startEscalationWatcher(appStore, io) {
  setInterval(() => {
    runEscalationWatch(appStore, io).catch((err) => {
      console.error('[Aland IA] Escalation watch:', err.message);
    });
  }, 30 * 1000);
}

module.exports = {
  syncKnowledgeFromApp,
  generateAlandReply,
  processClientMessage,
  processHumanReply,
  escalateToProvider,
  escalateToAdmin,
  findProviderForService,
  startEscalationWatcher,
  runEscalationWatch
};
