(function () {
  const listEl = document.getElementById('providerMensajesList');
  if (!listEl) return;

  const chatBox = document.getElementById('providerChatBox');
  const threadEl = document.getElementById('providerChatThread');
  const titleEl = document.getElementById('providerChatTitle');
  const form = document.getElementById('providerChatForm');
  const input = document.getElementById('providerChatInput');
  const convInput = document.getElementById('providerConversationId');

  let activeId = null;
  let socket = null;

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function statusLabel(status) {
    const map = {
      ai_active: 'Con Aland IA',
      awaiting_provider: 'Esperando tu respuesta',
      awaiting_admin: 'En administración',
      closed: 'Cerrada'
    };
    return map[status] || status;
  }

  function renderMsg(msg) {
    const mine = msg.senderType === 'provider';
    const align = mine ? 'text-right' : 'text-left';
    const bg = mine ? 'bg-zilo-accent text-white' : 'bg-zilo-bg border border-zilo-border';
    return `<div class="${align}"><div class="inline-block max-w-[92%] px-3 py-2 rounded-xl text-sm ${bg}"><span class="block text-[10px] opacity-70">${escapeHtml(msg.senderName || msg.senderType)}</span>${escapeHtml(msg.body).replace(/\n/g, '<br>')}</div></div>`;
  }

  async function loadList() {
    const res = await fetch('/aland/provider/conversations', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    const data = await res.json();
    if (!data.success) return;
    const items = data.conversations || [];
    if (!items.length) {
      listEl.innerHTML = '<p class="text-xs text-zilo-muted p-4 rounded-xl bg-zilo-bg border border-zilo-border">No hay mensajes pendientes.</p>';
      return;
    }
    listEl.innerHTML = items.map((c) => `
      <button type="button" class="w-full text-left p-3 rounded-xl bg-zilo-card border border-zilo-border hover:border-zilo-accent/40 provider-msg-item" data-id="${c.id}">
        <div class="flex justify-between gap-2"><strong class="text-sm">${escapeHtml(c.clientName)}</strong><span class="text-[10px] uppercase text-violet-600">${escapeHtml(statusLabel(c.status))}</span></div>
        <p class="text-xs text-zilo-muted mt-1">${escapeHtml(c.serviceName)} · ${c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleString('es-CL') : ''}</p>
      </button>
    `).join('');

    listEl.querySelectorAll('.provider-msg-item').forEach((btn) => {
      btn.addEventListener('click', () => openConversation(btn.dataset.id, btn));
    });
  }

  async function openConversation(id, btn) {
    activeId = id;
    convInput.value = id;
    chatBox.classList.remove('hidden');
    listEl.querySelectorAll('.provider-msg-item').forEach((b) => b.classList.remove('ring-2', 'ring-zilo-accent'));
    btn?.classList.add('ring-2', 'ring-zilo-accent');

    const res = await fetch(`/aland/provider/${id}/messages`, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    const data = await res.json();
    if (!data.success) return;
    titleEl.textContent = `${data.conversation.clientName} · ${data.conversation.serviceName}`;
    threadEl.innerHTML = (data.messages || []).map(renderMsg).join('');
    threadEl.scrollTop = threadEl.scrollHeight;

    if (window.io) {
      if (!socket) {
        socket = io();
        const providerId = document.querySelector('[data-provider-id]')?.dataset?.providerId;
        socket.emit('aland_join', { providerId });
        socket.on('aland_message', (payload) => {
          if (payload.conversationId === activeId && payload.message) {
            threadEl.insertAdjacentHTML('beforeend', renderMsg(payload.message));
            threadEl.scrollTop = threadEl.scrollHeight;
          }
        });
        socket.on('aland_escalated', () => loadList());
      }
      socket.emit('aland_join', { conversationId: id });
    }
  }

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    const id = convInput.value;
    if (!text || !id) return;
    input.disabled = true;
    try {
      const res = await fetch(`/aland/provider/${id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ message: text })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Error');
      if (data.message) {
        threadEl.insertAdjacentHTML('beforeend', renderMsg(data.message));
        threadEl.scrollTop = threadEl.scrollHeight;
      }
      input.value = '';
      loadList();
    } catch (err) {
      if (window.FundezNotify) FundezNotify.show(err.message, 'error');
    } finally {
      input.disabled = false;
    }
  });

  loadList();
  setInterval(loadList, 60000);
})();
