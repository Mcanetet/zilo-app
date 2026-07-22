(function () {
  const notify = (msg, type) => { if (window.FundezNotify) window.FundezNotify.show(msg, type); };
  const myRole = 'provider';
  let activeChatId = null;

  const chatModal = document.getElementById('jobChatModal');
  const chatThread = document.getElementById('jobChatThread');
  const chatTitle = document.getElementById('jobChatTitle');
  const chatForm = document.getElementById('jobChatForm');
  const chatInput = document.getElementById('jobChatInput');

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatTime(iso) {
    try {
      return new Date(iso).toLocaleString('es-CL', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
      });
    } catch (_) {
      return '';
    }
  }

  function renderMessage(msg) {
    const isSystem = msg.senderType === 'system';
    const isMine = !isSystem && msg.senderType === myRole;
    const cls = isSystem ? 'job-chat-bubble--system' : (isMine ? 'job-chat-bubble--mine' : 'job-chat-bubble--theirs');
    const meta = isSystem
      ? ''
      : `<span class="job-chat-meta">${escapeHtml(msg.senderName || '')} · ${escapeHtml(formatTime(msg.createdAt))}</span>`;
    return `<div class="job-chat-bubble ${cls}" data-msg-id="${escapeHtml(msg.id)}">${meta}${escapeHtml(msg.body)}</div>`;
  }

  function appendMessage(msg) {
    if (!chatThread || !msg?.id) return;
    if (chatThread.querySelector(`[data-msg-id="${msg.id}"]`)) return;
    chatThread.insertAdjacentHTML('beforeend', renderMessage(msg));
    chatThread.scrollTop = chatThread.scrollHeight;
  }

  async function openChat(requestId, peerName) {
    if (!chatModal || !requestId) return;
    activeChatId = requestId;
    if (chatTitle) chatTitle.textContent = peerName || 'Cliente';
    if (chatThread) chatThread.innerHTML = '<p class="text-xs text-zilo-muted text-center">Cargando…</p>';
    chatModal.classList.remove('hidden');
    try {
      const res = await fetch(`/proveedor/chat/${requestId}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo abrir el chat');
      if (chatTitle && data.peerName) chatTitle.textContent = data.peerName;
      if (chatThread) {
        chatThread.innerHTML = (data.messages || []).map(renderMessage).join('')
          || '<p class="text-xs text-zilo-muted text-center">Sin mensajes aún. Saluda al cliente para coordinar.</p>';
        chatThread.scrollTop = chatThread.scrollHeight;
      }
      if (typeof io !== 'undefined') {
        const socket = window.__fundezMandoSocket || io();
        window.__fundezMandoSocket = socket;
        socket.emit('register_client', requestId);
        const event = `request_chat_${requestId}`;
        if (!socket.__fundezChatHandlers) socket.__fundezChatHandlers = new Set();
        if (!socket.__fundezChatHandlers.has(event)) {
          socket.__fundezChatHandlers.add(event);
          socket.on(event, (payload) => {
            if (payload?.message && activeChatId === requestId) appendMessage(payload.message);
          });
        }
      }
      setTimeout(() => chatInput?.focus(), 150);
    } catch (err) {
      notify(err.message || 'No se pudo abrir el chat', 'error');
      chatModal.classList.add('hidden');
    }
  }

  function closeChat() {
    activeChatId = null;
    chatModal?.classList.add('hidden');
  }

  document.querySelectorAll('[data-role="assign-btn"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('[data-request-id]');
      const select = card.querySelector('[data-role="tech-select"]');
      const technicianId = select?.value;
      if (!technicianId) { notify('Selecciona un técnico en la lista', 'warning'); select?.focus(); return; }

      btn.disabled = true;
      try {
        const res = await fetch(`/proveedor/asignar/${btn.dataset.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ technicianId })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Error');

        const name = data.request.technicianName;
        card.querySelector('[data-role="assign-area"]').innerHTML =
          `<p class="text-xs">Técnico: <strong>${escapeHtml(name)}</strong></p>`;
        const statusEl = card.querySelector('[data-role="status"]');
        if (statusEl) statusEl.textContent = 'Técnico asignado';
        notify(`Asignado a ${name}`, 'success');
      } catch (err) {
        btn.disabled = false;
        notify(err.message || 'No se pudo asignar', 'error');
      }
    });
  });

  document.querySelectorAll('[data-role="open-chat"]').forEach((btn) => {
    btn.addEventListener('click', () => openChat(btn.dataset.id, btn.dataset.client));
  });

  chatModal?.querySelector('[data-role="chat-close"]')?.addEventListener('click', closeChat);
  chatModal?.querySelector('[data-role="chat-backdrop"]')?.addEventListener('click', closeChat);

  chatForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeChatId || !chatInput) return;
    const body = chatInput.value.trim();
    if (!body) return;
    chatInput.value = '';
    try {
      const res = await fetch(`/proveedor/chat/${activeChatId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ body })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo enviar');
      appendMessage(data.message);
    } catch (err) {
      notify(err.message || 'No se pudo enviar', 'error');
    }
  });

  const params = new URLSearchParams(window.location.search);
  const openChatId = params.get('chat');
  if (openChatId) {
    const btn = document.querySelector(`[data-role="open-chat"][data-id="${openChatId}"]`);
    openChat(openChatId, btn?.dataset.client || 'Cliente');
  }

  if (typeof io !== 'undefined') {
    const socket = io();
    window.__fundezMandoSocket = socket;
    socket.on('connect', () => {
      document.querySelectorAll('[data-request-id]').forEach(card => {
        socket.emit('register_client', card.dataset.requestId);
      });
    });
    document.querySelectorAll('[data-request-id]').forEach(card => {
      const requestId = card.dataset.requestId;
      let lastStatus = card.querySelector('[data-role="status"]')?.dataset?.status || null;
      socket.on(`request_update_${requestId}`, (payload) => {
        if (!payload?.request) return;
        const statusEl = card.querySelector('[data-role="status"]');
        const ts = payload.request.techStatus;
        const labels = {
          asignado: 'Asignado',
          aceptado: 'Aceptado',
          en_camino: 'En camino',
          en_sitio: 'En sitio',
          diagnostico: 'Diagnóstico',
          reparando: 'Reparando',
          comprando: 'Comprando materiales',
          presupuesto_pendiente: 'Presupuesto pendiente',
          presupuesto_aprobado: 'Presupuesto aprobado',
          completado: 'Completado'
        };
        if (statusEl && labels[ts]) statusEl.textContent = labels[ts];
        if (ts && ts !== lastStatus && labels[ts] && window.FundezAlerts) {
          const isDone = ts === 'completado';
          FundezAlerts.notify({
            type: isDone ? 'success' : 'update',
            title: 'Actualización del servicio',
            body: labels[ts],
            tag: 'fundez-track-' + requestId
          });
          lastStatus = ts;
        } else if (ts) {
          lastStatus = ts;
        }
        if (payload.chatMessage && activeChatId === requestId) {
          appendMessage(payload.chatMessage);
        }
      });
    });
  }
})();
