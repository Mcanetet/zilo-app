(function () {
  const section = document.getElementById('alandChatSection');
  if (!section) return;

  const serviceId = document.getElementById('servicePage')?.dataset?.serviceId;
  const toggleBtn = document.getElementById('alandChatToggle');
  const panel = document.getElementById('alandChatPanel');
  const messagesEl = document.getElementById('alandChatMessages');
  const form = document.getElementById('alandChatForm');
  const input = document.getElementById('alandChatInput');

  let conversationId = null;
  let socket = null;

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderMessage(msg) {
    const isClient = msg.senderType === 'client';
    const isAland = msg.senderType === 'aland';
    const isSystem = msg.senderType === 'system';
    const align = isClient ? 'text-right' : 'text-left';
    const bg = isClient ? 'bg-violet-600 text-white' : isAland ? 'bg-white border border-zilo-border' : isSystem ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-blue-50 border border-blue-200';
    const name = msg.senderName || (isAland ? 'Aland IA' : msg.senderType);
    return `<div class="${align}"><div class="inline-block max-w-[90%] px-3 py-2 rounded-xl text-sm ${bg}"><span class="block text-[10px] opacity-70 mb-0.5">${escapeHtml(name)}</span>${escapeHtml(msg.body).replace(/\n/g, '<br>')}</div></div>`;
  }

  function appendMessage(msg) {
    messagesEl.insertAdjacentHTML('beforeend', renderMessage(msg));
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function startChat() {
    const res = await fetch('/aland/client/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ serviceId })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'No se pudo iniciar el chat');
    conversationId = data.conversation.id;
    messagesEl.innerHTML = '';
    (data.messages || []).forEach(appendMessage);

    if (window.io) {
      socket = io();
      socket.emit('aland_join', { conversationId, clientId: data.conversation.clientId });
      socket.on('aland_message', (payload) => {
        if (payload.conversationId === conversationId && payload.message) {
          appendMessage(payload.message);
        }
      });
    }

    if (!data.openaiConfigured) {
      appendMessage({
        senderType: 'system',
        senderName: 'Sistema',
        body: 'Aland IA requiere OPENAI_API_KEY en el servidor. El administrador debe configurarla en Hostinger.'
      });
    }
  }

  toggleBtn?.addEventListener('click', async () => {
    panel.classList.toggle('hidden');
    toggleBtn.textContent = panel.classList.contains('hidden') ? 'Abrir chat' : 'Ocultar chat';
    if (!panel.classList.contains('hidden') && !conversationId) {
      try {
        toggleBtn.disabled = true;
        await startChat();
      } catch (err) {
        if (window.FundezNotify) FundezNotify.show(err.message, 'error');
      } finally {
        toggleBtn.disabled = false;
      }
    }
  });

  // Abrir automáticamente desde inicio (?aland=1) o si el chat es el foco
  if (section.dataset.autoOpen === '1' || /[?&]aland=1\b/.test(location.search)) {
    setTimeout(() => toggleBtn?.click(), 250);
  }

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || !conversationId) return;
    input.value = '';
    input.disabled = true;
    try {
      const res = await fetch(`/aland/client/${conversationId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ message: text })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Error al enviar');
      if (data.clientMessage) appendMessage(data.clientMessage);
      if (data.alandMessage) appendMessage(data.alandMessage);
      if (data.handoffMessage) appendMessage(data.handoffMessage);
      if (data.whatsappUrl) {
        appendMessage({
          senderType: 'system',
          senderName: 'Sistema',
          body: 'Tema de pagos: puedes continuar por WhatsApp con el equipo de Fundez.'
        });
        const wa = document.createElement('a');
        wa.href = data.whatsappUrl;
        wa.target = '_blank';
        wa.rel = 'noopener';
        wa.className = 'inline-block mt-1 text-xs font-semibold text-emerald-700 underline';
        wa.textContent = 'Abrir WhatsApp de pagos';
        const wrap = document.createElement('div');
        wrap.className = 'text-left px-1';
        wrap.appendChild(wa);
        messagesEl.appendChild(wrap);
      } else if (data.escalated) {
        appendMessage({
          senderType: 'system',
          senderName: 'Sistema',
          body: 'Te conectamos con un especialista del servicio. Si no responde en unos minutos, administración Fundez tomará el caso.'
        });
      }
    } catch (err) {
      if (window.FundezNotify) FundezNotify.show(err.message, 'error');
    } finally {
      input.disabled = false;
      input.focus();
    }
  });
})();
