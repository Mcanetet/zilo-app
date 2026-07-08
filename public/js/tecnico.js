(function () {
  const notify = (msg, type) => { if (window.FundezNotify) window.FundezNotify.show(msg, type); };
  const watchers = {};

  const STATUS_LABELS = {
    asignado: 'Asignado',
    aceptado: 'Aceptado',
    en_camino: 'En camino',
    en_sitio: 'En el sitio',
    completado: 'Completado'
  };

  async function postStatus(jobId, techStatus) {
    const res = await fetch(`/tecnico/status/${jobId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ techStatus })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Error');
    return data;
  }

  function startSharing(card) {
    const jobId = card.dataset.jobId;
    if (!navigator.geolocation || watchers[jobId]) return;
    watchers[jobId] = navigator.geolocation.watchPosition(
      (pos) => {
        fetch('/tecnico/ubicacion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude, requestId: jobId })
        }).catch(() => {});
      },
      () => notify('Activa el GPS para compartir tu ubicación', 'warning'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
  }

  function stopSharing(jobId) {
    if (watchers[jobId] != null) {
      navigator.geolocation.clearWatch(watchers[jobId]);
      delete watchers[jobId];
    }
  }

  function render(card) {
    const status = card.dataset.techStatus;
    const actions = card.querySelector('[data-role="actions"]');
    const badge = card.querySelector('[data-role="status"]');
    if (badge) badge.textContent = STATUS_LABELS[status] || status;
    actions.innerHTML = '';

    const addBtn = (label, cls, handler) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = cls;
      b.textContent = label;
      b.addEventListener('click', () => handler(b));
      actions.appendChild(b);
    };

    const transition = async (btn, next, successMsg) => {
      btn.disabled = true;
      try {
        await postStatus(card.dataset.jobId, next);
        card.dataset.techStatus = next;
        if (next === 'en_camino') startSharing(card);
        if (next === 'en_sitio' || next === 'completado') stopSharing(card.dataset.jobId);
        if (next === 'completado') { card.remove(); notify('Trabajo completado', 'success'); return; }
        notify(successMsg, 'success');
        render(card);
      } catch (err) {
        btn.disabled = false;
        notify(err.message || 'No se pudo actualizar', 'error');
      }
    };

    if (status === 'asignado') {
      addBtn('Aceptar trabajo', 'flex-1 py-2.5 rounded-xl zilo-btn-primary !text-sm', (b) => transition(b, 'aceptado', 'Trabajo aceptado'));
    } else if (status === 'aceptado') {
      addBtn('Ir en camino', 'flex-1 py-2.5 rounded-xl zilo-btn-primary !text-sm', (b) => transition(b, 'en_camino', 'Compartiendo tu ubicación'));
    } else if (status === 'en_camino') {
      const info = document.createElement('span');
      info.className = 'flex-1 py-2.5 text-xs text-zilo-success flex items-center gap-1.5';
      info.innerHTML = '<span class="w-2 h-2 rounded-full bg-zilo-success animate-pulse"></span> Compartiendo ubicación';
      actions.appendChild(info);
      addBtn('Llegué', 'py-2.5 px-4 rounded-xl zilo-btn-primary !text-sm', (b) => transition(b, 'en_sitio', 'Marcaste llegada'));
      startSharing(card);
    } else if (status === 'en_sitio') {
      addBtn('Completar servicio', 'flex-1 py-2.5 rounded-xl zilo-btn-primary !text-sm', (b) => transition(b, 'completado', 'Trabajo completado'));
    }
  }

  document.querySelectorAll('#jobList [data-job-id]').forEach(render);
})();
