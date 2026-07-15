(function () {
  const page = document.getElementById('tecnicoPage');
  if (!page) return;

  const tecnicoId = page.dataset.tecnicoId;
  const notify = (msg, type) => { if (window.FundezNotify) window.FundezNotify.show(msg, type); };

  function t(key, vars) {
    return typeof FundezI18n !== 'undefined' ? FundezI18n.t(key, vars) : key;
  }

  const locale = document.documentElement.lang === 'en' ? 'en-US' : 'es-CL';
  const fmt = n => new Intl.NumberFormat(locale, { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

  function statusLabel(key) {
    const map = {
      asignado: 'status.tech.asignado',
      aceptado: 'status.tech.aceptado',
      en_camino: 'status.tech.en_camino',
      en_sitio: 'status.tech.en_sitio',
      diagnostico: 'status.tech.diagnostico_label',
      reparando: 'status.tech.reparando',
      comprando: 'status.tech.comprando',
      presupuesto_pendiente: 'status.tech.presupuesto_pendiente',
      presupuesto_aprobado: 'status.tech.presupuesto_aprobado',
      completado: 'status.tech.completado'
    };
    return map[key] ? t(map[key]) : key;
  }

  const watchers = {};
  const socket = typeof io !== 'undefined' ? io() : null;

  const onlineToggle = document.getElementById('techOnlineToggle');
  const statusDot = document.getElementById('techStatusDot');
  const statusText = document.getElementById('techStatusText');
  const statusSub = document.getElementById('techStatusSub');
  const workWallList = document.getElementById('techWorkWallList');
  const workWallEmpty = document.getElementById('techWorkWallEmpty');
  const workWallCount = document.getElementById('techWorkWallCount');

  let wallItems = new Map();
  let alertInterval = null;
  let audioCtx = null;

  const WORK_STATUSES = ['en_sitio', 'diagnostico', 'reparando', 'comprando', 'presupuesto_pendiente', 'presupuesto_aprobado'];

  function getAudioContext() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function playAlertSound() {
    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;
      [0, 0.12, 0.24, 0.36].forEach((delay, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = i % 2 === 0 ? 880 : 1175;
        gain.gain.setValueAtTime(0, now + delay);
        gain.gain.linearRampToValueAtTime(0.35, now + delay + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + delay);
        osc.stop(now + delay + 0.28);
      });
    } catch (_) {}
  }

  function startRepeatingAlert() {
    stopRepeatingAlert();
    alertInterval = setInterval(playAlertSound, 2500);
  }

  function stopRepeatingAlert() {
    if (alertInterval) {
      clearInterval(alertInterval);
      alertInterval = null;
    }
  }

  function pushBrowserNotification(title, body) {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'granted') {
      try {
        new Notification(title, { body, icon: '/favicon-32.png', requireInteraction: true, tag: 'fundez-tech-wall' });
      } catch (_) {
        new Notification(title, { body, icon: '/favicon-32.png' });
      }
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  }

  function renderWorkWall() {
    if (!workWallList) return;
    const items = [...wallItems.values()];
    if (workWallCount) workWallCount.textContent = String(items.length);
    if (workWallEmpty) workWallEmpty.classList.toggle('hidden', items.length > 0);
    workWallList.innerHTML = '';

    items.forEach(data => {
      const card = document.createElement('article');
      card.className = 'p-4 rounded-2xl zilo-card-premium border border-zilo-accent/15';
      card.innerHTML = `
        <div class="flex items-start justify-between gap-3 mb-2">
          <div class="min-w-0">
            <strong class="text-sm block">${data.service.name}</strong>
            <span class="text-xs text-zilo-muted block truncate">${data.client.name}</span>
          </div>
          <span class="zilo-badge zilo-badge-success shrink-0">${t('tecnico.js.wall_available')}</span>
        </div>
        <p class="text-xs text-zilo-muted mb-2 truncate">${data.request.address}</p>
        <p class="text-xs font-semibold text-zilo-success mb-3">${t('provider.js.your_payout')}: ${fmt(data.request.providerPayout ?? data.request.estimatedVisit)}</p>
        <button type="button" class="w-full py-2.5 rounded-xl zilo-btn-primary !text-sm" data-take="${data.request.id}">${t('tecnico.js.take_job')}</button>
      `;
      workWallList.appendChild(card);
    });

    workWallList.querySelectorAll('[data-take]').forEach(btn => {
      btn.addEventListener('click', () => acceptFromWall(btn.dataset.take, btn));
    });
  }

  function upsertWallItem(data) {
    if (!data?.request?.id) return;
    wallItems.set(data.request.id, data);
    renderWorkWall();
  }

  function removeWallItem(requestId) {
    wallItems.delete(requestId);
    renderWorkWall();
  }

  async function loadWorkWall() {
    if (!onlineToggle?.checked) return;
    try {
      const res = await fetch('/tecnico/muro');
      const data = await res.json();
      wallItems.clear();
      (data.items || []).forEach(upsertWallItem);
      renderWorkWall();
    } catch (_) {}
  }

  async function acceptFromWall(requestId, btn) {
    if (btn) btn.disabled = true;
    const res = await fetch(`/tecnico/accept/${requestId}`, { method: 'POST' });
    const data = await res.json();
    if (!data.success) {
      if (btn) btn.disabled = false;
      notify(data.error || t('provider.js.take_error'), 'warning');
      if (res.status === 409) removeWallItem(requestId);
      return;
    }
    removeWallItem(requestId);
    stopRepeatingAlert();
    notify(t('tecnico.js.job_taken_reload'), 'success');
    setTimeout(() => location.reload(), 800);
  }

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
      () => notify(t('tecnico.js.enable_gps'), 'warning'),
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
    if (badge) badge.textContent = statusLabel(status);
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
      addLink(status === 'en_sitio' ? t('tecnico.js.arrived_link') : t('tecnico.js.continue_visit'), `/tecnico/trabajo/${card.dataset.jobId}`);
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
        notify(err.message || t('tecnico.js.update_error'), 'error');
      }
    };

    if (status === 'asignado') {
      addBtn(t('tecnico.js.accept_job'), 'flex-1 py-2.5 rounded-xl zilo-btn-primary !text-sm', (b) => transition(b, 'aceptado', t('tecnico.js.job_accepted')));
    } else if (status === 'aceptado') {
      addBtn(t('tecnico.js.head_out'), 'flex-1 py-2.5 rounded-xl zilo-btn-primary !text-sm', (b) => transition(b, 'en_camino', t('tecnico.js.sharing_location')));
    } else if (status === 'en_camino') {
      const info = document.createElement('span');
      info.className = 'flex-1 py-2.5 text-xs text-zilo-success flex items-center gap-1.5';
      info.innerHTML = `<span class="w-2 h-2 rounded-full bg-zilo-success animate-pulse"></span> ${t('tecnico.js.gps_active')}`;
      actions.appendChild(info);
      addBtn(t('tecnico.js.arrived_btn'), 'py-2.5 px-4 rounded-xl zilo-btn-primary !text-sm', (b) =>
        transition(b, 'en_sitio', t('tecnico.js.welcome_site'), `/tecnico/trabajo/${card.dataset.jobId}`)
      );
      startSharing(card);
    }
  }

  if (socket) {
    socket.on('connect', () => {
      socket.emit('register_technico', tecnicoId);
      if (onlineToggle?.checked) loadWorkWall();
    });

    socket.on('work_wall_sync', ({ items }) => {
      wallItems.clear();
      (items || []).forEach(upsertWallItem);
      renderWorkWall();
    });

    socket.on('work_wall_new', (data) => {
      if (!onlineToggle?.checked) return;
      upsertWallItem(data);
      playAlertSound();
      startRepeatingAlert();
      pushBrowserNotification(t('tecnico.js.push_title'), `${data.service.name} · ${data.request.address}`);
    });

    socket.on('request_taken', ({ requestId }) => {
      removeWallItem(requestId);
    });

    socket.on(`tecnico_assignment_${tecnicoId}`, () => {
      setTimeout(() => location.reload(), 600);
    });
  }

  onlineToggle?.addEventListener('change', async () => {
    const online = onlineToggle.checked;
    const res = await fetch('/tecnico/toggle-online', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ online })
    });
    const data = await res.json();
    if (!data.success) {
      onlineToggle.checked = false;
      notify(data.error || t('tecnico.js.toggle_error'), 'error');
      return;
    }

    if (online) {
      statusDot.className = 'w-3 h-3 rounded-full bg-zilo-success shadow-lg shadow-zilo-success/40 animate-pulse';
      statusText.textContent = t('tecnico.online');
      statusSub.textContent = t('tecnico.online_sub');
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission();
      loadWorkWall();
      notify(data.synced > 0 ? t('provider.js.new_on_wall', { count: data.synced }) : t('tecnico.js.online_activated'), 'success');
    } else {
      statusDot.className = 'w-3 h-3 rounded-full bg-zilo-muted/40';
      statusText.textContent = t('tecnico.offline');
      statusSub.textContent = t('tecnico.offline_sub');
      wallItems.clear();
      renderWorkWall();
      stopRepeatingAlert();
      notify(t('tecnico.js.offline_mode'), 'info');
    }
  });

  if (onlineToggle?.checked) {
    fetch('/tecnico/toggle-online', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ online: true })
    }).then(() => loadWorkWall());
  }

  setInterval(() => {
    if (onlineToggle?.checked) loadWorkWall();
  }, 15000);

  document.querySelectorAll('#jobList [data-job-id]').forEach(render);
})();
