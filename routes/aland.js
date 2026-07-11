const express = require('express');
const router = express.Router();
const store = require('../models/store');
const aland = require('../lib/aland');
const { requireRole } = require('../middleware/auth');
const { requireModule } = require('../middleware/modules');
const { requireAdminPermission } = require('../middleware/adminAccess');

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
    const serviceId = String(req.body.serviceId || '').trim();
    const service = store.getServiceById(serviceId);
    if (!service || !service.enabled) {
      return res.status(404).json({ error: 'Servicio no disponible' });
    }

    const config = await aland.getConfig();
    if (!config.enabled) return res.status(503).json({ error: 'Aland IA no está disponible' });

    const user = store.getUserById(req.session.user.id);
    const conversation = await aland.createConversation({
      serviceId: service.id,
      serviceName: service.name,
      clientId: user.id,
      clientName: user.name,
      clientEmail: user.email
    });

    const greeting = (config.greetingMessage || config.greeting || aland.DEFAULT_CONFIG.greetingMessage)
      .replace('{service}', service.name);

    const welcome = await aland.addMessage({
      conversationId: conversation.id,
      senderType: 'aland',
      senderName: config.agentName || 'Aland IA',
      body: greeting
    });

    res.json({ success: true, conversation, messages: [welcome], openaiConfigured: aland.openai.isConfigured() });
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

router.post('/admin/knowledge', requireRole('admin'), requireAdminPermission('aland.manage'), async (req, res) => {
  try {
    const id = await aland.saveKnowledge(req.body);
    res.json({ success: true, id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/admin/knowledge/:id', requireRole('admin'), requireAdminPermission('aland.manage'), async (req, res) => {
  await aland.deleteKnowledge(req.params.id);
  res.json({ success: true });
});

router.post('/admin/knowledge/sync', requireRole('admin'), requireAdminPermission('aland.manage'), async (req, res) => {
  try {
    const synced = await aland.syncKnowledgeFromApp(store);
    res.json({ success: true, synced, knowledge: await aland.listKnowledge() });
  } catch (err) {
    res.status(500).json({ error: err.message });
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

router.get('/admin/conversations/:id/messages', requireRole('admin'), requireAdminPermission('mensajes.view'), async (req, res) => {
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
