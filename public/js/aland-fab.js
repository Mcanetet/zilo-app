(function () {
  const root = document.getElementById('alandFabRoot');
  if (!root) return;

  const panel = document.getElementById('alandFabPanel');
  const toggle = document.getElementById('alandFabToggle');
  const closeBtn = document.getElementById('alandFabClose');
  const messagesEl = document.getElementById('alandFabMessages');
  const form = document.getElementById('alandFabForm');
  const input = document.getElementById('alandFabInput');
  const waBox = document.getElementById('alandFabWhatsapp');
  const waLink = document.getElementById('alandFabWhatsappLink');

  let conversationId = null;
  let socket = null;
  let starting = false;

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderMessage(msg) {
    const isClient = msg.senderType === 'client';
    const isAland = msg.senderType === 'aland';
    const isSystem = msg.senderType === 'system';
    const align = isClient ? 'text-right' : 'text-left';
    const bg = isClient
      ? 'bg-violet-600 text-white'
      : isAland
        ? 'bg-white border border-slate-200'
        : isSystem
          ? 'bg-amber-50 text-amber-900 border border-amber-200'
          : 'bg-blue-50 border border-blue-100';
    const name = msg.senderName || (isAland ? 'Aland IA' : msg.senderType);
    return `<div class="${align}"><div class="inline-block max-w-[92%] px-3 py-2 rounded-xl text-sm ${bg}"><span class="block text-[10px] opacity-70 mb-0.5">${escapeHtml(name)}</span>${escapeHtml(msg.body).replace(/\n/g, '<br>')}</div></div>`;
  }

  function appendMessage(msg) {
    if (!messagesEl || !msg) return;
    messagesEl.insertAdjacentHTML('beforeend', renderMessage(msg));
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function showWhatsapp(url) {
    if (!url || !waBox || !waLink) return;
    waLink.href = url;
    waBox.classList.remove('hidden');
  }

  async function startSupportChat() {
    if (conversationId || starting) return;
    starting = true;
    try {
      const res = await fetch('/aland/client/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ mode: 'support' })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo iniciar Aland IA');
      conversationId = data.conversation.id;
      messagesEl.innerHTML = '';
      (data.messages || []).forEach(appendMessage);

      if (window.io) {
        socket = io();
        socket.emit('aland_join', { conversationId, clientId: data.conversation.clientId });
        socket.on('aland_message', (payload) => {
          if (payload.conversationId === conversationId && payload.message) {
            appendMessage(payload.message);
            const wa = payload.message?.meta?.whatsappUrl;
            if (wa) showWhatsapp(wa);
          }
        });
      }

      if (!data.openaiConfigured) {
        appendMessage({
          senderType: 'system',
          senderName: 'Sistema',
          body: 'Aland IA requiere OPENAI_API_KEY en el servidor.'
        });
      }
    } finally {
      starting = false;
    }
  }

  async function openPanel() {
    panel.classList.remove('hidden');
    if (!conversationId) {
      try {
        await startSupportChat();
      } catch (err) {
        if (window.FundezNotify) FundezNotify.show(err.message, 'error');
        else appendMessage({ senderType: 'system', senderName: 'Sistema', body: err.message });
      }
    }
    input?.focus();
  }

  function closePanel() {
    panel.classList.add('hidden');
  }

  toggle?.addEventListener('click', () => {
    if (panel.classList.contains('hidden')) openPanel();
    else closePanel();
  });
  closeBtn?.addEventListener('click', closePanel);

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = (input?.value || '').trim();
    if (!text) return;
    if (!conversationId) {
      try {
        await startSupportChat();
      } catch (err) {
        if (window.FundezNotify) FundezNotify.show(err.message, 'error');
        return;
      }
    }
    input.value = '';
    try {
      const res = await fetch(`/aland/client/${conversationId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ message: text })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo enviar');
      if (data.clientMessage) appendMessage(data.clientMessage);
      if (data.alandMessage) appendMessage(data.alandMessage);
      if (data.handoffMessage) appendMessage(data.handoffMessage);
      if (data.whatsappUrl) showWhatsapp(data.whatsappUrl);
    } catch (err) {
      if (window.FundezNotify) FundezNotify.show(err.message, 'error');
    }
  });

  // Enlaces de soporte / concierge → abrir Aland
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-open-aland], a[href="#aland-support"], #whatsappSupport, a[data-support-aland]');
    if (!a) return;
    e.preventDefault();
    openPanel();
  });

  if (/[?&]aland=1\b/.test(location.search) || location.hash === '#aland-support') {
    setTimeout(openPanel, 300);
  }

  window.FundezOpenAland = openPanel;
})();
