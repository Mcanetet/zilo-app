(function () {
  const notify = (msg, type) => { if (window.FundezNotify) window.FundezNotify.show(msg, type); };
  const watchers = {};

  const STATUS_LABELS = {
    asignado: 'Asignado',
    aceptado: 'Aceptado',
    en_camino: 'En camino',
    en_sitio: 'En el sitio',
    diagnostico: 'Diagnóstico',
    reparando: 'Reparando',
    comprando: 'Comprando',
    presupuesto_pendiente: 'Presupuesto',
    presupuesto_aprobado: 'Aprobado',
    completado: 'Completado'
  };

  const WORK_STATUSES = ['en_sitio', 'diagnostico', 'reparando', 'comprando', 'presupuesto_pendiente', 'presupuesto_aprobado'];

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

    const addLink = (label, href) => {
      const a = document.createElement('a');
      a.href = href;
      a.className = 'flex-1 py-2.5 rounded-xl zilo-btn-primary !text-sm text-center';
      a.textContent = label;
      actions.appendChild(a);
    };

    if (WORK_STATUSES.includes(status)) {
      if (status === 'en_camino') startSharing(card);
      addLink(status === 'en_sitio' ? 'Registrar llegada' : 'Continuar visita', `/tecnico/trabajo/${card.dataset.jobId}`);
      return;
    }

    const transition = async (btn, next, successMsg, redirect) => {
      btn.disabled = true;
      try {
        await postStatus(card.dataset.jobId, next);
        card.dataset.techStatus = next;
        if (next === 'en_camino') startSharing(card);
        if (redirect) {
          notify(successMsg, 'success');
          window.location.href = redirect;
          return;
        }
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
      info.innerHTML = '<span class="w-2 h-2 rounded-full bg-zilo-success animate-pulse"></span> GPS activo';
      actions.appendChild(info);
      addBtn('Llegué', 'py-2.5 px-4 rounded-xl zilo-btn-primary !text-sm', (b) =>
        transition(b, 'en_sitio', 'Bienvenido al domicilio', `/tecnico/trabajo/${card.dataset.jobId}`)
      );
      startSharing(card);
    }
  }

  document.querySelectorAll('#jobList [data-job-id]').forEach(render);
})();
