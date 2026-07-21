const express = require('express');
const router = express.Router();
const store = require('../models/store');
const aland = require('../lib/aland');
const { requireRole } = require('../middleware/auth');
const { requireModule } = require('../middleware/modules');
const { requireAdminPermission, requireFullAdminAccess } = require('../middleware/adminAccess');

function emitIo(req, event, payload) {
  const io = req.app.get('io');
  if (io) io.emit(event, payload);
}

function emitTo(req, room, event, payload) {
  const io = req.app.get('io');
  if (io) io.to(room).emit(event, payload);
}

// ——— Cliente ———

router.post('/client/start', requireRole('client'), requireModule('client_aland'), async (req, res) => {
  try {
    const mode = String(req.body.mode || '').trim().toLowerCase();
    const isSupport = mode === 'support' || mode === 'soporte';
    let serviceId;
    let serviceName;

    if (isSupport) {
      serviceId = 'soporte-general';
      serviceName = 'Soporte Fundez';
    } else {
      serviceId = String(req.body.serviceId || '').trim();
      const service = store.getServiceById(serviceId);
      if (!service || !service.enabled) {
        return res.status(404).json({ error: 'Servicio no disponible' });
      }
      serviceName = service.name;
    }

    const config = await aland.getConfig();
    if (!config.enabled) return res.status(503).json({ error: 'Aland IA no está disponible' });

    const user = store.getUserById(req.session.user.id);
    if (isSupport) {
      const pendingRequest = store.getPendingNoProviderRequestForClient(user.id);
      if (pendingRequest?.alandConversationId) {
        const existing = await aland.getConversationById(pendingRequest.alandConversationId);
        if (existing) {
          return res.json({
            success: true,
            conversation: existing,
            messages: await aland.listMessages(existing.id),
            openaiConfigured: aland.openai.isConfigured(),
            mode: 'support',
            pendingRequestId: pendingRequest.id
          });
        }
      }
    }
    const conversation = await aland.createConversation({
      serviceId,
      serviceName,
      clientId: user.id,
      clientName: user.name,
      clientEmail: user.email
    });

    const greetingTemplate = isSupport
      ? (config.supportGreeting
        || aland.DEFAULT_CONFIG.supportGreeting
        || 'Hola, soy Aland IA, soporte de Fundez. Dime si tu consulta es de servicio, pagos o una solicitud en curso y te indico el siguiente paso.')
      : (config.greetingMessage || config.greeting || aland.DEFAULT_CONFIG.greetingMessage);

    const greeting = String(greetingTemplate).replace('{service}', serviceName);

    const welcome = await aland.addMessage({
      conversationId: conversation.id,
      senderType: 'aland',
      senderName: config.agentName || 'Aland IA',
      body: greeting
    });

    res.json({
      success: true,
      conversation,
      messages: [welcome],
      openaiConfigured: aland.openai.isConfigured(),
      mode: isSupport ? 'support' : 'service'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/client/:conversationId/message', requireRole('client'), requireModule('client_aland'), async (req, res) => {
  try {
    const text = String(req.body.message || '').trim();
    if (!text || text.length > 4000) return res.status(400).json({ error: 'Mensaje inválido' });

    const user = store.getUserById(req.session.user.id);
    const io = req.app.get('io');
    const result = await aland.processClientMessage({
      appStore: store,
      io,
      conversationId: req.params.conversationId,
      user,
      text
    });

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/client/:conversationId/messages', requireRole('client'), requireModule('client_aland'), async (req, res) => {
  try {
    const conversation = await aland.getConversationById(req.params.conversationId);
    if (!conversation || conversation.clientId !== req.session.user.id) {
      return res.status(404).json({ error: 'Conversación no encontrada' });
    }
    const messages = await aland.listMessages(conversation.id);
    res.json({ success: true, conversation, messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ——— Proveedor ———

router.get('/provider/conversations', requireRole('provider'), async (req, res) => {
  try {
    const list = await aland.listConversations({
      providerId: req.session.user.id,
      status: ['awaiting_provider', 'awaiting_admin', 'ai_active']
    });
    res.json({ success: true, conversations: list });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/provider/:conversationId/messages', requireRole('provider'), async (req, res) => {
  try {
    const conversation = await aland.getConversationById(req.params.conversationId);
    if (!conversation || conversation.providerId !== req.session.user.id) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    const messages = await aland.listMessages(conversation.id);
    res.json({ success: true, conversation, messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/provider/:conversationId/reply', requireRole('provider'), async (req, res) => {
  try {
    const text = String(req.body.message || '').trim();
    if (!text) return res.status(400).json({ error: 'Mensaje vacío' });

    const conversation = await aland.getConversationById(req.params.conversationId);
    if (!conversation || conversation.providerId !== req.session.user.id) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const user = store.getUserById(req.session.user.id);
    const io = req.app.get('io');
    const result = await aland.processHumanReply({
      io,
      conversationId: conversation.id,
      senderType: 'provider',
      senderId: user.id,
      senderName: user.name,
      text
    });

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ——— Admin ———

router.get('/admin/config', requireRole('admin'), requireAdminPermission('aland.manage'), async (req, res) => {
  const config = await aland.getConfig();
  res.json({
    success: true,
    config,
    openaiConfigured: aland.openai.isConfigured()
  });
});

router.post('/admin/config', requireRole('admin'), requireAdminPermission('aland.manage'), async (req, res) => {
  try {
    const config = await aland.saveConfig(req.body);
    store.logSecurityEvent('aland_config_update', 'config', req);
    res.json({ success: true, config });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/admin/knowledge', requireRole('admin'), requireAdminPermission('aland.manage'), async (req, res) => {
  const knowledge = await aland.listKnowledge();
  res.json({ success: true, knowledge });
});

router.post('/admin/knowledge', requireRole('admin'), requireFullAdminAccess(), async (req, res) => {
  try {
    const id = await aland.saveKnowledge(req.body);
    store.logSecurityEvent('aland_kb_create', id, req);
    res.json({ success: true, id, knowledge: await aland.listKnowledge() });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.put('/admin/knowledge/:id', requireRole('admin'), requireFullAdminAccess(), async (req, res) => {
  try {
    const existing = (await aland.listKnowledge()).find((k) => k.id === req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Entrada no encontrada.' });
    await aland.saveKnowledge({
      ...existing,
      ...req.body,
      id: req.params.id,
      sourceType: req.body.sourceType || existing.sourceType || 'custom'
    });
    store.logSecurityEvent('aland_kb_update', req.params.id, req);
    res.json({ success: true, knowledge: await aland.listKnowledge() });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.delete('/admin/knowledge/:id', requireRole('admin'), requireFullAdminAccess(), async (req, res) => {
  await aland.deleteKnowledge(req.params.id);
  store.logSecurityEvent('aland_kb_delete', req.params.id, req);
  res.json({ success: true, knowledge: await aland.listKnowledge() });
});

router.post('/admin/knowledge/sync', requireRole('admin'), requireFullAdminAccess(), async (req, res) => {
  try {
    const synced = await aland.syncKnowledgeFromApp(store);
    store.logSecurityEvent('aland_kb_sync', String(synced), req);
    res.json({ success: true, synced, knowledge: await aland.listKnowledge() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/admin/conversations', requireRole('admin'), requireAdminPermission('mensajes.view'), async (req, res) => {
  const status = req.query.status;
  const conversations = await aland.listConversations({
    status: status ? status.split(',') : undefined,
    limit: 200
  });
  res.json({ success: true, conversations });
});

router.get('/admin/monitor/stats', requireRole('admin'), requireAdminPermission('aland.view'), async (req, res) => {
  try {
    const stats = await aland.getMonitorStats();
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/admin/monitor/conversations', requireRole('admin'), requireAdminPermission('aland.view'), async (req, res) => {
  try {
    const status = req.query.status;
    const conversations = await aland.listConversations({
      status: status ? String(status).split(',').map((s) => s.trim()).filter(Boolean) : undefined,
      limit: Math.min(parseInt(req.query.limit, 10) || 100, 300)
    });
    res.json({ success: true, conversations });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/admin/monitor/alerts', requireRole('admin'), requireAdminPermission('aland.view'), async (req, res) => {
  try {
    const alerts = await aland.listInjectionAlerts({
      limit: Math.min(parseInt(req.query.limit, 10) || 50, 200)
    });
    res.json({ success: true, alerts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/admin/conversations/:id/messages', requireRole('admin'), requireAdminPermission('mensajes.view'), async (req, res) => {
  const conversation = await aland.getConversationById(req.params.id);
  if (!conversation) return res.status(404).json({ error: 'No encontrada' });
  const messages = await aland.listMessages(conversation.id);
  res.json({ success: true, conversation, messages });
});

// Monitor: mismo hilo, permiso aland.view (ver todas las conversaciones)
router.get('/admin/monitor/conversations/:id/messages', requireRole('admin'), requireAdminPermission('aland.view'), async (req, res) => {
  const conversation = await aland.getConversationById(req.params.id);
  if (!conversation) return res.status(404).json({ error: 'No encontrada' });
  const messages = await aland.listMessages(conversation.id);
  res.json({ success: true, conversation, messages });
});

router.post('/admin/conversations/:id/reply', requireRole('admin'), requireAdminPermission('mensajes.manage'), async (req, res) => {
  try {
    const text = String(req.body.message || '').trim();
    if (!text) return res.status(400).json({ error: 'Mensaje vacío' });

    const user = store.getUserById(req.session.user.id);
    const io = req.app.get('io');
    const result = await aland.processHumanReply({
      io,
      conversationId: req.params.id,
      senderType: 'admin',
      senderId: user.id,
      senderName: user.name,
      text
    });

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/admin/conversations/:id/close', requireRole('admin'), requireAdminPermission('mensajes.manage'), async (req, res) => {
  const updated = await aland.updateConversation(req.params.id, { status: 'closed', lastMessageAt: new Date() });
  res.json({ success: true, conversation: updated });
});

module.exports = router;
