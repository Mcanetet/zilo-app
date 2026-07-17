(function () {
  const page = document.getElementById('trabajoPage');
  if (!page) return;

  const requestId = page.dataset.requestId;
  const returnUrl = page.dataset.returnUrl || '/tecnico';
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

  document.getElementById('btnTrayecto')?.addEventListener('click', async (event) => {
    const btn = event.currentTarget;
    btn.disabled = true;
    try {
      const res = await fetch(`/tecnico/status/${requestId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ techStatus: btn.dataset.nextStatus })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo actualizar el estado');
      location.reload();
    } catch (err) {
      btn.disabled = false;
      notify(err.message || 'No se pudo actualizar el estado', 'error');
    }
  });

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

  function toggleOtherFields() {
    const select = document.getElementById('changeActivityId');
    const box = document.getElementById('changeOtherFields');
    if (!select || !box) return;
    box.classList.toggle('hidden', select.value !== 'otro');
  }

  async function loadChangeActivities() {
    const select = document.getElementById('changeActivityId');
    if (!select) return;
    try {
      const res = await fetch(`/tecnico/trabajo/${requestId}/subservicios`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Error');
      select.innerHTML = '<option value="">Elige el subservicio correcto…</option>';
      (data.activities || []).forEach((a) => {
        if (a.id === data.currentActivityId) return;
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = `${a.name} — ${a.basePriceLabel}`;
        select.appendChild(opt);
      });
      const other = document.createElement('option');
      other.value = 'otro';
      other.textContent = 'Otro — describir manualmente';
      select.appendChild(other);
      select.addEventListener('change', toggleOtherFields);
      toggleOtherFields();
    } catch (_) {
      select.innerHTML = '<option value="">No se pudieron cargar subservicios</option>';
    }
  }
  loadChangeActivities();

  document.getElementById('btnProposeChange')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnProposeChange');
    const activityId = document.getElementById('changeActivityId')?.value;
    const notes = document.getElementById('changeNotes')?.value.trim();
    const customName = document.getElementById('changeCustomName')?.value.trim();
    const customBasePrice = document.getElementById('changeCustomBasePrice')?.value;
    if (!activityId) return notify('Elige el nuevo subservicio', 'warning');
    if (!notes) return notify('Explica el cambio', 'warning');
    if (activityId === 'otro') {
      if (!customName || customName.length < 4) {
        return notify('En Otro, escribe el nombre del servicio', 'warning');
      }
      if (!customBasePrice || Number(customBasePrice) < 100000) {
        return notify('En Otro, indica el precio base (mín. $100.000)', 'warning');
      }
    }
    btn.disabled = true;
    try {
      const photo = await fileToBase64(document.getElementById('changePhoto'));
      const res = await fetch(`/tecnico/trabajo/${requestId}/cambio-servicio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ activityId, notes, photo, customName, customBasePrice })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Error');
      notify('Cambio enviado al cliente para aprobación', 'success');
      location.reload();
    } catch (err) {
      btn.disabled = false;
      notify(err.message || 'No se pudo proponer el cambio', 'error');
    }
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
      showSettlement(data.settlement);
    } catch (err) {
      btn.disabled = false;
      notify(err.message || 'Error al completar', 'error');
    }
  });

  function showSettlement(s) {
    const box = document.getElementById('settlementResult');
    if (!s || !s.completed || !box) {
      setTimeout(() => { window.location.href = returnUrl; }, 800);
      return;
    }
    const fmt = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n || 0);
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    set('setCharged', fmt(s.grandTotal));
    set('setAppLabel', `Comisión Fundez ${Math.round((s.laborCommissionRate || 0) * 100)}%`);
    set('setApp', `−${fmt(s.laborCommission)}`);
    if (s.materialsCommission) {
      set('setMaterials', `−${fmt(s.materialsCommission)}`);
    } else {
      document.getElementById('setMaterialsRow')?.classList.add('hidden');
    }
    set('setCardLabel', `Cargo tarjeta ${s.merchantCardFeePercent || 0}%`);
    set('setCard', `−${fmt(s.cardFee)}`);
    set('setIvaLabel', `IVA ${Math.round((s.ivaRate || 0) * 100)}% sobre comisión/cargos`);
    set('setIva', `−${fmt(s.ivaOnFees)}`);
    set('setPayout', fmt(s.providerPayout));

    document.querySelectorAll('#trabajoPage main > section').forEach((el) => {
      if (el.id !== 'settlementResult') el.classList.add('hidden');
    });
    box.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const socket = io();
  socket.on(`request_update_${requestId}`, (payload) => {
    const r = payload.request;
    if (r?.siteReport?.budgetStatus === 'approved' && r.techStatus === 'presupuesto_aprobado') {
      notify('¡El cliente aprobó el presupuesto!', 'success');
      setTimeout(() => location.reload(), 600);
    }
  });
})();
