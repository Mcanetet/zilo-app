(function () {
  const notify = (msg, type) => { if (window.FundezNotify) window.FundezNotify.show(msg, type); };

  document.querySelectorAll('[data-role="assign-btn"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('[data-request-id]');
      const select = card.querySelector('[data-role="tech-select"]');
      const technicianId = select.value;
      if (!technicianId) { notify('Selecciona un técnico', 'warning'); return; }

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
          `<p class="text-xs">Técnico: <strong>${name}</strong></p>`;
        const statusEl = card.querySelector('[data-role="status"]');
        if (statusEl) statusEl.textContent = 'Técnico asignado';
        notify(`Asignado a ${name}`, 'success');
      } catch (err) {
        btn.disabled = false;
        notify(err.message || 'No se pudo asignar', 'error');
      }
    });
  });

  if (typeof io !== 'undefined') {
    const socket = io();
    socket.on('connect', () => {
      document.querySelectorAll('[data-request-id]').forEach(card => {
        socket.emit('register_client', card.dataset.requestId);
      });
    });
    document.querySelectorAll('[data-request-id]').forEach(card => {
      const requestId = card.dataset.requestId;
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
      });
    });
  }
})();
