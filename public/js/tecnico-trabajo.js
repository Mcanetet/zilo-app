(function () {
  const page = document.getElementById('trabajoPage');
  if (!page) return;

  const requestId = page.dataset.requestId;
  const notify = (msg, type) => { if (window.FundezNotify) window.FundezNotify.show(msg, type); };

  function fileToBase64(input) {
    return new Promise((resolve, reject) => {
      const file = input?.files?.[0];
      if (!file) return reject(new Error('Selecciona un archivo'));
      if (file.size > 6 * 1024 * 1024) return reject(new Error('Máximo 6 MB'));
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function previewFile(input, previewEl) {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      previewEl.querySelector('img').src = reader.result;
      previewEl.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  }

  const photoStart = document.getElementById('photoStart');
  const photoEnd = document.getElementById('photoEnd');
  if (photoStart) photoStart.addEventListener('change', () => previewFile(photoStart, document.getElementById('photoStartPreview')));
  if (photoEnd) photoEnd.addEventListener('change', () => previewFile(photoEnd, document.getElementById('photoEndPreview')));

  document.getElementById('btnLlegada')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnLlegada');
    const diagnosis = document.getElementById('diagnosis').value.trim();
    if (!diagnosis) return notify('Describe lo que observas', 'warning');
    btn.disabled = true;
    try {
      const photoData = await fileToBase64(photoStart);
      const res = await fetch(`/tecnico/trabajo/${requestId}/llegada`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ diagnosis, photoStart: photoData })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Error');
      notify('Llegada registrada', 'success');
      location.reload();
    } catch (err) {
      btn.disabled = false;
      notify(err.message || 'No se pudo registrar', 'error');
    }
  });

  document.querySelectorAll('.action-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const res = await fetch(`/tecnico/trabajo/${requestId}/accion`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ action: btn.dataset.action })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Error');
        notify('Acción registrada', 'success');
        location.reload();
      } catch (err) {
        btn.disabled = false;
        notify(err.message || 'Error', 'error');
      }
    });
  });

  document.getElementById('btnPresupuesto')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnPresupuesto');
    btn.disabled = true;
    try {
      const res = await fetch(`/tecnico/trabajo/${requestId}/presupuesto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          amount: document.getElementById('budgetAmount').value,
          description: document.getElementById('budgetDesc').value
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Error');
      notify('Presupuesto enviado al cliente', 'success');
      location.reload();
    } catch (err) {
      btn.disabled = false;
      notify(err.message || 'Error', 'error');
    }
  });

  document.getElementById('btnAddMaterial')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnAddMaterial');
    const description = document.getElementById('matDesc').value.trim();
    const amount = document.getElementById('matAmount').value;
    if (!description || !amount) return notify('Completa descripción y precio', 'warning');
    btn.disabled = true;
    try {
      let receipt = null;
      const receiptInput = document.getElementById('matReceipt');
      if (receiptInput?.files?.[0]) receipt = await fileToBase64(receiptInput);
      const res = await fetch(`/tecnico/trabajo/${requestId}/material`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ description, amount, receipt })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Error');
      notify('Material agregado', 'success');
      location.reload();
    } catch (err) {
      btn.disabled = false;
      notify(err.message || 'Error', 'error');
    }
  });

  document.getElementById('btnCompletar')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnCompletar');
    const workNotes = document.getElementById('workNotes').value.trim();
    if (!workNotes) return notify('Escribe el resumen del trabajo', 'warning');
    btn.disabled = true;
    try {
      const photoData = await fileToBase64(photoEnd);
      const res = await fetch(`/tecnico/trabajo/${requestId}/completar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ workNotes, photoEnd: photoData })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Error');
      notify('¡Visita completada!', 'success');
      setTimeout(() => { window.location.href = '/tecnico'; }, 800);
    } catch (err) {
      btn.disabled = false;
      notify(err.message || 'Error al completar', 'error');
    }
  });

  const socket = io();
  socket.on(`request_update_${requestId}`, (payload) => {
    const r = payload.request;
    if (r?.siteReport?.budgetStatus === 'approved' && r.techStatus === 'presupuesto_aprobado') {
      notify('¡El cliente aprobó el presupuesto!', 'success');
      setTimeout(() => location.reload(), 600);
    }
  });
})();
