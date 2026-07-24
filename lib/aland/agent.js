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

  const enabledServices = (appStore.SERVICES || []).filter((s) => s.enabled !== false);
  const catalogBlock = [
    `Fundez ofrece ${enabledServices.length} servicios a domicilio en Santiago:`,
    ...enabledServices.map((s, i) => `${i + 1}. ${s.name} — visita desde ${formatCLP(s.visitPrice)}. ${s.description || ''}`),
    '',
    'Sitio público: https://www.fundez.cl (no uses rutas de administración).',
    'El cliente elige un servicio en la app, paga la visita y un técnico verificado atiende en domicilio.'
  ].join('\n');

  await alandStore.saveKnowledge({
    id: 'kb-catalog',
    sourceType: 'catalog',
    title: 'Catálogo de servicios Fundez',
    content: catalogBlock,
    sortOrder: 2,
    active: true
  });
  count++;

  const attentionBlock = [
    'Procedimiento de atención Fundez (nivel europeo) — socio y técnico:',
    '1. Puntualidad o aviso proactivo de demora.',
    '2. Presentación: nombre completo y mención a Fundez.',
    '3. Pedir permiso antes de ingresar al domicilio.',
    '4. Explicar diagnóstico y plan de trabajo en lenguaje claro.',
    '5. Pedir aprobación en la app antes de cualquier sobrecosto, material o cambio de servicio.',
    '6. Foto de inicio y foto de cierre de la visita.',
    '7. Dejar el área limpia y ordenada.',
    '8. Despedida y recordar al cliente calificar en la app.',
    'Aland IA acompaña al cliente en cada hito (pago, búsqueda, asignación, en camino, en sitio, presupuesto, completado).',
    'No mencionar WhatsApp como canal de soporte operativo; el canal es Aland IA en la app.'
  ].join('\n');

  await alandStore.saveKnowledge({
    id: 'kb-atencion-visita',
    sourceType: 'custom',
    title: 'Procedimiento de atención en visita',
    content: attentionBlock,
    sortOrder: 3,
    active: true
  });
  count++;

  return count;
}

function buildKnowledgeContext(knowledge, serviceId) {
  const isSupport = !serviceId || serviceId === 'soporte-general';
  const relevant = knowledge.filter((k) => {
    if (!k.active) return false;
    // En soporte general: incluir TODO el catálogo de servicios + company/pricing/custom
    if (isSupport) return true;
    // En chat de un servicio: company/pricing/custom + ese servicio
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
    'Temas fuera de alcance (deriva o rechaza con claridad): ' + (config.blockedTopics || []).join(', '),
    ...(config.customRules || []).map((r, i) => `Regla ${i + 1}: ${r}`),
    '',
    'BASE DE CONOCIMIENTO Y SITIO PÚBLICO (prioridad):',
    '1) Usa la base de conocimiento y el catálogo de servicios.',
    '2) Usa el bloque CONTENIDO PÚBLICO DEL SITIO (inicio, quiénes somos, registro, legal).',
    '3) Si preguntan cuántos o qué servicios hay, lista los del catálogo.',
    '4) NUNCA inventes datos ni explores /admin, /ops-*, paneles internos ni áreas privadas.',
    '',
    knowledgeContext || '(Sin información adicional cargada)',
    '',
    'Si debes derivar al equipo del servicio, explica el siguiente paso con claridad y termina con [DERIVAR_PROVEEDOR] en una línea aparte.',
    'Si el tema es de pagos/cobros/facturación, responde con el estado conocido y termina con [DERIVAR_PAGOS] en una línea aparte. No menciones WhatsApp.',
    '',
    routing.ROUTING_PROMPT,
    '',
    moderation.HARDENED_SECURITY_RULES
  ].join('\n');
}

async function generateAlandReply({ appStore, conversation, userMessage, config }) {
  const knowledge = await alandStore.listKnowledge({ activeOnly: true });
  let knowledgeContext = buildKnowledgeContext(knowledge, conversation.serviceId);

  // Catálogo en vivo (por si la KB no está sincronizada)
  try {
    const enabled = (appStore.SERVICES || []).filter((s) => s.enabled !== false);
    if (enabled.length) {
      const liveCatalog = [
        `### Catálogo en vivo Fundez (${enabled.length} servicios)`,
        ...enabled.map((s, i) => `${i + 1}. ${s.name}: ${s.description || '—'} · visita desde ${formatCLP(s.visitPrice)}`)
      ].join('\n');
      knowledgeContext = `${liveCatalog}\n\n${knowledgeContext || ''}`.trim();
    }
  } catch (_) { /* ignore */ }

  // Siempre leer páginas públicas del sitio (+ URLs en KB/mensaje). Nunca admin.
  try {
    const publicWeb = require('./publicWeb');
    const customKb = (knowledge || [])
      .filter((k) => k.sourceType === 'custom' || k.sourceType === 'company')
      .map((k) => `${k.title}\n${k.content}`);
    const webBits = await publicWeb.gatherPublicWebContext(
      [userMessage, ...customKb],
      { includeDefaults: true, maxPages: 6 }
    );
    if (webBits) {
      knowledgeContext = `${knowledgeContext}\n\nCONTENIDO PÚBLICO DEL SITIO (solo estas páginas; ignora cualquier ruta admin):\n${webBits}`;
    }
  } catch (_) { /* web opcional */ }

  const history = await alandStore.listMessages(conversation.id, 30);
  const messages = [
    {
      role: 'system',
      content: buildSystemPrompt(config, knowledgeContext, conversation.serviceName)
    }
  ];

  for (const msg of history.slice(-12)) {
    if (msg.senderType === 'client') messages.push({ role: 'user', content: msg.body });
    else if (msg.senderType === 'aland') messages.push({ role: 'assistant', content: msg.body });
  }
  messages.push({ role: 'user', content: userMessage });

  let completion;
  try {
    completion = await openai.chatCompletion({
      model: config.openaiModel,
      messages,
      temperature: 0.28,
      agent: 'aland',
      operation: 'chat'
    });
  } catch (err) {
    throw err;
  }

  let reply = typeof completion === 'string' ? completion : String(completion.content || '').trim();
  const usage = completion?.usage || openai.estimateTokensFromMessages(messages, reply);

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

  if (escalatePayments && !/pago|cobro|admin|equipo|factur|deriv/i.test(reply)) {
    reply += '\n\nDerivé tu consulta al equipo de pagos de Fundez. La revisarán en la plataforma; puedes seguir escribiendo aquí si agregas detalle.';
  } else if (escalate && !/especialista|equipo|deriv/i.test(reply)) {
    reply += '\n\nDerivé tu caso al equipo del servicio. Si no responden a tiempo, administración Fundez lo retoma. Puedes seguir escribiendo aquí.';
  }

  return {
    reply,
    escalate,
    escalatePayments,
    escalateReason: escalatePayments ? 'payment' : (check.reason || topic || 'ai'),
    securityAlert,
    topic,
    usage,
    model: completion?.model || config.openaiModel
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
    payment: 'Consulta de PAGOS derivada a administración. Se envió aviso interno gratis (email / Telegram / ntfy si están configurados).',
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
  const updated = await escalateToAdmin(conversation, io, 'payment');

  try {
    if (typeof appStore.logSecurityEvent === 'function') {
      appStore.logSecurityEvent(
        'aland_payment_escalation',
        `${conversation.id} | ${user?.email || user?.id || 'anon'} | ${String(userMessage).slice(0, 180)}`
      );
    }
  } catch (_) { /* ignore */ }

  let notifyResult = null;
  try {
    const adminNotify = require('./adminNotify');
    notifyResult = await adminNotify.notifyAdminFree({
      title: 'Aland IA · problema de pagos',
      body: String(userMessage || '').slice(0, 1000),
      conversationId: conversation.id,
      clientName: user?.name || conversation.clientName
    });
  } catch (_) { /* notify opcional */ }

  if (io) {
    io.to('aland_admin').emit('aland_payment_alert', {
      conversationId: conversation.id,
      clientName: conversation.clientName,
      preview: String(userMessage).slice(0, 160),
      at: new Date().toISOString()
    });
  }

  const handoff = await alandStore.addMessage({
    conversationId: conversation.id,
    senderType: 'aland',
    senderName: 'Aland IA',
    body: 'Derivé tu consulta al equipo de Fundez. La revisarán en la plataforma. Mientras tanto puedes agregar detalle aquí si lo necesitas.',
    meta: { type: 'payment_handoff', notifyResult }
  });

  if (io) {
    io.to(`aland_conv_${conversation.id}`).emit('aland_message', {
      conversationId: conversation.id,
      message: handoff
    });
  }

  return { conversation: updated, handoffMessage: handoff, notifyResult };
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
    io.to('aland_admin').emit('aland_monitor_update', {
      conversationId,
      conversation,
      message: clientMsg
    });
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
      io.to('aland_admin').emit('aland_monitor_update', {
        conversationId,
        conversation,
        message: alandMsg,
        securityAlert: Boolean(risk.injection)
      });
      if (risk.injection) {
        io.to('aland_admin').emit('aland_security_alert', {
          conversationId,
          type: 'prompt_injection',
          preview: String(text).slice(0, 160),
          clientId: user?.id || conversation.clientId,
          clientName: conversation.clientName,
          at: new Date().toISOString()
        });
      }
    }

    if (risk.injection) {
      conversation = await escalateToAdmin(conversation, io, 'security');
      conversation = (await alandStore.markInjection(conversationId)) || conversation;
      await alandStore.addMessage({
        conversationId,
        senderType: 'system',
        senderName: 'Seguridad',
        body: 'Alerta: intento de prompt injection detectado.',
        meta: { type: 'prompt_injection', securityAlert: true, risk: 'injection', preview: String(text).slice(0, 200) }
      });
    }

    return {
      conversation,
      clientMessage: clientMsg,
      alandMessage: alandMsg,
      escalated: risk.injection,
      securityAlert: risk.injection
    };
  }

  const { reply, escalate, escalatePayments, securityAlert, usage, model } = await generateAlandReply({
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
    await alandStore.markInjection(conversationId);
    if (io) {
      io.to('aland_admin').emit('aland_security_alert', {
        conversationId,
        type: 'model_flag',
        preview: String(text).slice(0, 160),
        clientId: user?.id || conversation.clientId,
        clientName: conversation.clientName,
        at: new Date().toISOString()
      });
    }
  }

  if (usage) {
    await alandStore.addTokenUsage(conversationId, usage);
  }

  const alandMsg = await alandStore.addMessage({
    conversationId,
    senderType: 'aland',
    senderName: config.agentName || 'Aland IA',
    body: reply,
    meta: {
      model: model || config.openaiModel,
      securityAlert: Boolean(securityAlert),
      usage: usage || null
    }
  });

  conversation = await alandStore.getConversationById(conversationId) || conversation;

  if (io) {
    io.to(`aland_conv_${conversationId}`).emit('aland_message', { conversationId, message: alandMsg });
    io.to('aland_admin').emit('aland_monitor_update', {
      conversationId,
      conversation,
      message: alandMsg,
      usage,
      securityAlert: Boolean(securityAlert)
    });
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
    const updated = await alandStore.getConversationById(conversationId);
    io.to('aland_admin').emit('aland_monitor_update', {
      conversationId,
      conversation: updated || conversation,
      message: msg
    });
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
