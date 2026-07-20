const alandStore = require('./store');
const openai = require('./openai');
const company = require('../../config/company');
const moderation = require('./moderation');
const routing = require('./routing');

function formatCLP(n) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n || 0);
}

async function syncKnowledgeFromApp(appStore) {
  if (!appStore?.isReady?.()) return 0;
  let count = 0;

  const companyBlock = [
    `Empresa: ${company.name}`,
    `Email soporte: ${company.supportEmail}`,
    `WhatsApp: ${company.whatsappDisplay}`,
    `Web: ${company.appUrl}`,
    `Cobertura: servicios a domicilio en Santiago (consultar comunas vigentes en la app)`,
    `Privacidad: consultas de datos personales a ${company.dpoEmail || company.supportEmail}`
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
    'BASE DE CONOCIMIENTO (usa solo esta información pública de negocio):',
    knowledgeContext || '(Sin información adicional cargada)',
    '',
    'Si debes derivar a un especialista del servicio, responde al cliente que lo conectarás con el equipo y termina con [DERIVAR_PROVEEDOR] en una línea aparte.',
    'Si el tema es de pagos/cobros/facturación, responde y termina con [DERIVAR_PAGOS] en una línea aparte.',
    '',
    routing.ROUTING_PROMPT,
    '',
    moderation.HARDENED_SECURITY_RULES
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
    temperature: 0.45
  });

  let escalate = false;
  let escalatePayments = false;
  let securityAlert = false;
  if (/\[ALERTA_SEGURIDAD\]/i.test(reply)) {
    securityAlert = true;
    reply = reply.replace(/\[ALERTA_SEGURIDAD[^\]]*\]/gi, '').trim();
  }
  if (/\[DERIVAR_PAGOS\]/i.test(reply)) {
    escalatePayments = true;
    reply = reply.replace(/\[DERIVAR_PAGOS\]/gi, '').trim();
  }
  if (reply.includes('[DERIVAR_PROVEEDOR]')) {
    escalate = true;
    reply = reply.replace(/\[DERIVAR_PROVEEDOR\]/g, '').trim();
  }

  const sanitized = moderation.sanitizeAssistantOutput(reply);
  reply = sanitized.reply;
  if (sanitized.blocked) securityAlert = true;

  const topic = routing.classifyTopic(userMessage);
  if (topic === 'payment') escalatePayments = true;

  const check = shouldEscalate(userMessage, config);
  if (check.escalate && topic !== 'payment') escalate = true;

  // Pagos tiene prioridad sobre proveedor
  if (escalatePayments) escalate = false;

  if (escalatePayments && !/pago|cobro|admin|whatsapp|factur/i.test(reply)) {
    reply += '\n\nTe derivo con el equipo de pagos de Fundez. También puedes continuar por WhatsApp para resolverlo más rápido.';
  } else if (escalate && !reply.toLowerCase().includes('especialista') && !reply.toLowerCase().includes('equipo')) {
    reply += '\n\nTe conecto con un especialista del servicio para ayudarte mejor. Un momento por favor.';
  }

  return {
    reply,
    escalate,
    escalatePayments,
    escalateReason: escalatePayments ? 'payment' : (check.reason || topic || 'ai'),
    securityAlert,
    topic
  };
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

  const bodyByReason = {
    timeout: 'El socio no respondió a tiempo. Conversación escalada a administración Fundez.',
    security: 'Alerta de seguridad: posible intento de prompt injection o acceso indebido. Conversación escalada a administración.',
    payment: 'Consulta de PAGOS derivada a administración. Se notificó WhatsApp de operaciones.',
    service_triage: 'Consulta de servicio desde soporte general. Administración debe canalizar al socio adecuado.'
  };

  const message = await alandStore.addMessage({
    conversationId: conversation.id,
    senderType: 'system',
    senderName: 'Sistema',
    body: bodyByReason[reason] || 'Conversación escalada a administración Fundez.',
    meta: { type: 'escalation_admin', reason }
  });

  if (io) {
    io.to('aland_admin').emit('aland_escalated', { conversation: updated, message, reason });
    io.to(`aland_conv_${conversation.id}`).emit('aland_message', { conversationId: conversation.id, message });
  }

  return updated;
}

async function escalatePaymentIssue({ appStore, conversation, io, user, userMessage }) {
  const whatsappUrl = routing.paymentsWhatsAppUrl({
    clientName: user?.name || conversation.clientName,
    clientEmail: user?.email || conversation.clientEmail,
    clientPhone: user?.phone || null,
    serviceName: conversation.serviceName,
    message: userMessage,
    conversationId: conversation.id
  });

  const updated = await escalateToAdmin(conversation, io, 'payment');

  try {
    if (typeof appStore.logSecurityEvent === 'function') {
      appStore.logSecurityEvent(
        'aland_payment_escalation',
        `${conversation.id} | ${user?.email || user?.id || 'anon'} | ${String(userMessage).slice(0, 180)}`
      );
    }
  } catch (_) { /* ignore */ }

  try {
    const notifications = require('../notifications');
    const subject = `Aland IA · pagos — ${conversation.clientName || 'Cliente'}`;
    const text = [
      'Nueva consulta de PAGOS derivada por Aland IA.',
      `Cliente: ${user?.name || conversation.clientName || '—'}`,
      `Email: ${user?.email || conversation.clientEmail || '—'}`,
      `Servicio: ${conversation.serviceName || 'Soporte'}`,
      `Conversación: ${conversation.id}`,
      '',
      String(userMessage || '').slice(0, 1000),
      '',
      `WhatsApp operaciones: ${whatsappUrl}`
    ].join('\n');

    await notifications.notify({
      event: 'aland.payment',
      to: company.supportEmail,
      phone: routing.PAYMENTS_WHATSAPP,
      subject,
      text,
      userId: user?.id,
      meta: { conversationId: conversation.id, whatsappUrl }
    });
  } catch (_) { /* notify opcional */ }

  if (io) {
    io.to('aland_admin').emit('aland_payment_alert', {
      conversationId: conversation.id,
      clientName: conversation.clientName,
      preview: String(userMessage).slice(0, 160),
      whatsappUrl,
      at: new Date().toISOString()
    });
  }

  const handoff = await alandStore.addMessage({
    conversationId: conversation.id,
    senderType: 'aland',
    senderName: 'Aland IA',
    body: 'Dejé el caso en el equipo de pagos. Si quieres, continúa por WhatsApp ahora mismo para agilizar.',
    meta: { type: 'payment_handoff', whatsappUrl }
  });

  if (io) {
    io.to(`aland_conv_${conversation.id}`).emit('aland_message', {
      conversationId: conversation.id,
      message: handoff
    });
  }

  return { conversation: updated, whatsappUrl, handoffMessage: handoff };
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

  const risk = moderation.analyzeUserInput(text);
  if (risk.injection || risk.profanity) {
    const reply = risk.injection
      ? moderation.SAFE_INJECTION_REPLY
      : moderation.SAFE_PROFANITY_REPLY;

    try {
      if (typeof appStore.logSecurityEvent === 'function') {
        appStore.logSecurityEvent(
          risk.injection ? 'aland_prompt_injection' : 'aland_profanity',
          `${conversationId} | ${user?.email || user?.id || 'anon'} | ${String(text).slice(0, 180)}`
        );
      }
    } catch (_) { /* ignore logging failures */ }

    const alandMsg = await alandStore.addMessage({
      conversationId,
      senderType: 'aland',
      senderName: config.agentName || 'Aland IA',
      body: reply,
      meta: {
        model: 'moderation',
        risk: risk.risk,
        securityAlert: risk.injection
      }
    });

    if (io) {
      io.to(`aland_conv_${conversationId}`).emit('aland_message', { conversationId, message: alandMsg });
      if (risk.injection) {
        io.to('aland_admin').emit('aland_security_alert', {
          conversationId,
          type: 'prompt_injection',
          preview: String(text).slice(0, 160),
          clientId: user?.id || conversation.clientId,
          at: new Date().toISOString()
        });
      }
    }

    if (risk.injection) {
      conversation = await escalateToAdmin(conversation, io, 'security');
    }

    return {
      conversation,
      clientMessage: clientMsg,
      alandMessage: alandMsg,
      escalated: risk.injection,
      securityAlert: risk.injection
    };
  }

  const { reply, escalate, escalatePayments, securityAlert } = await generateAlandReply({
    appStore,
    conversation,
    userMessage: text,
    config
  });

  if (securityAlert) {
    try {
      if (typeof appStore.logSecurityEvent === 'function') {
        appStore.logSecurityEvent(
          'aland_security_alert',
          `${conversationId} | ${user?.email || user?.id || 'anon'} | ${String(text).slice(0, 180)}`
        );
      }
    } catch (_) { /* ignore */ }
    if (io) {
      io.to('aland_admin').emit('aland_security_alert', {
        conversationId,
        type: 'model_flag',
        preview: String(text).slice(0, 160),
        clientId: user?.id || conversation.clientId,
        at: new Date().toISOString()
      });
    }
  }

  const alandMsg = await alandStore.addMessage({
    conversationId,
    senderType: 'aland',
    senderName: config.agentName || 'Aland IA',
    body: reply,
    meta: { model: config.openaiModel, securityAlert: Boolean(securityAlert) }
  });

  if (io) {
    io.to(`aland_conv_${conversationId}`).emit('aland_message', { conversationId, message: alandMsg });
  }

  if (escalatePayments) {
    const payment = await escalatePaymentIssue({
      appStore,
      conversation,
      io,
      user,
      userMessage: text
    });
    return {
      conversation: payment.conversation,
      clientMessage: clientMsg,
      alandMessage: alandMsg,
      escalated: true,
      escalatePayments: true,
      whatsappUrl: payment.whatsappUrl,
      handoffMessage: payment.handoffMessage,
      securityAlert
    };
  }

  if (escalate) {
    // Sin servicio concreto (soporte general) → admin para triage
    if (!conversation.serviceId || conversation.serviceId === 'soporte-general') {
      conversation = await escalateToAdmin(conversation, io, 'service_triage');
      return { conversation, clientMessage: clientMsg, alandMessage: alandMsg, escalated: true, securityAlert };
    }
    conversation = await escalateToProvider(appStore, conversation, io);
    return { conversation, clientMessage: clientMsg, alandMessage: alandMsg, escalated: true, securityAlert };
  }

  return { conversation, clientMessage: clientMsg, alandMessage: alandMsg, escalated: false, securityAlert };
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
  escalatePaymentIssue,
  findProviderForService,
  startEscalationWatcher,
  runEscalationWatch
};
