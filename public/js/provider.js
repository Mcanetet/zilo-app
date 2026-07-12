(function () {
  const dashboard = document.getElementById('providerDashboard');
  if (!dashboard) return;

  const providerId = dashboard.dataset.providerId;
  const socket = io();

  function t(key, vars) {
    return typeof FundezI18n !== 'undefined' ? FundezI18n.t(key, vars) : key;
  }

  const locale = document.documentElement.lang === 'en' ? 'en-US' : 'es-CL';
  const fmt = n => new Intl.NumberFormat(locale, { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

  const onlineToggle = document.getElementById('onlineToggle');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const statusSub = document.getElementById('statusSub');
  const requestModal = document.getElementById('requestModal');
  const workWall = document.getElementById('workWall');
  const workWallList = document.getElementById('workWallList');
  const workWallEmpty = document.getElementById('workWallEmpty');
  const workWallCount = document.getElementById('workWallCount');
  const stickyBar = document.getElementById('providerStickyBar');
  const stickyPendingCount = document.getElementById('stickyPendingCount');
  const stickyOnlineDot = document.getElementById('stickyOnlineDot');

  let currentRequest = null;
  let alertInterval = null;
  let audioCtx = null;
  let locationWatchId = null;
  let activeRequestId = null;
  let wallItems = new Map();

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

  function getAudioContext() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
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
        new Notification(title, {
          body,
          icon: '/favicon-32.png',
          requireInteraction: true,
          tag: 'fundez-work-wall'
        });
      } catch (_) {
        new Notification(title, { body, icon: '/favicon-32.png' });
      }
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  }

  function syncStickyBar() {
    if (!stickyBar) return;
    const online = onlineToggle?.checked;
    stickyBar.classList.toggle('is-visible', online);
    stickyBar.setAttribute('aria-hidden', online ? 'false' : 'true');
    if (stickyPendingCount) {
      stickyPendingCount.textContent = t('provider.js.available_count', { count: wallItems.size });
    }
    if (stickyOnlineDot) {
      stickyOnlineDot.className = `w-2.5 h-2.5 rounded-full shrink-0 ${online ? 'bg-zilo-success animate-pulse' : 'bg-zilo-muted/40'}`;
    }
  }

  function renderWorkWall() {
    if (!workWallList) return;
    const items = [...wallItems.values()];
    if (workWallCount) workWallCount.textContent = String(items.length);
    if (workWallEmpty) workWallEmpty.classList.toggle('hidden', items.length > 0);
    workWallList.innerHTML = '';
    syncStickyBar();

    items.forEach(data => {
      const urgency = data.request.urgencyTierLabel
        ? `<p class="text-[10px] text-orange-600 mb-1">${t('provider.js.urgency')}: ${data.request.urgencyTierLabel}</p>`
        : '';
      const gift = data.request.isGift
        ? `<span class="text-[10px] text-zilo-accent block mb-1">${t('provider.js.gift')} · ${data.request.beneficiaryName || t('provider.js.beneficiary_fallback')}</span>`
        : '';
      const card = document.createElement('article');
      card.className = 'p-4 rounded-2xl zilo-card-premium border border-zilo-accent/15 provider-wall-card';
      card.dataset.requestId = data.request.id;
      card.innerHTML = `
        <div class="flex items-start justify-between gap-3 mb-2">
          <div class="min-w-0">
            <strong class="text-sm block">${data.service.name}</strong>
            <span class="text-xs text-zilo-muted block truncate">${data.client.name}</span>
            ${gift}
          </div>
          <span class="zilo-badge zilo-badge-success shrink-0">${t('provider.js.available')}</span>
        </div>
        <p class="text-xs text-zilo-muted mb-1 truncate">${data.request.address}</p>
        ${urgency}
        <p class="text-xs font-semibold text-zilo-accent mb-3">${t('provider.js.visit_label')}: ${fmt(data.request.estimatedVisit)}</p>
        <button type="button" class="w-full py-2.5 rounded-xl zilo-modal-accept !text-sm" data-take="${data.request.id}">${t('provider.js.take_job')}</button>
      `;
      workWallList.appendChild(card);
    });

    workWallList.querySelectorAll('[data-take]').forEach(btn => {
      btn.addEventListener('click', () => acceptRequest(btn.dataset.take, btn));
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
    if (currentRequest?.id === requestId) closeModal();
  }

  async function loadWorkWall() {
    if (!onlineToggle?.checked) return;
    try {
      const res = await fetch('/proveedor/muro');
      const data = await res.json();
      wallItems.clear();
      (data.items || []).forEach(upsertWallItem);
      renderWorkWall();
    } catch (_) {}
  }

  function fillModal(data) {
    currentRequest = data.request;
    document.getElementById('modalServiceIcon').innerHTML = FundezIcons.wrap(data.service.icon, data.service.color, 'w-12 h-12', 28);
    document.getElementById('modalServiceName').textContent = data.service.name;
    document.getElementById('modalClient').textContent = data.client.name;
    document.getElementById('modalAddress').textContent = data.request.address;
    document.getElementById('modalCoords').textContent =
      data.request.coords ? `${data.request.coords.lat}, ${data.request.coords.lng}` : '-33.4489, -70.6693';

    const mapEl = document.getElementById('modalMap');
    if (data.request.coords && typeof FundezMap !== 'undefined') {
      setTimeout(() => {
        FundezMap.init(mapEl, {
          lat: data.request.coords.lat,
          lng: data.request.coords.lng,
          label: data.request.address,
          zoom: 16
        });
      }, 400);
    }

    document.getElementById('modalPrice').textContent = `${t('provider.js.visit_est')}: ${fmt(data.request.estimatedVisit)}`;
    document.getElementById('modalNotes').textContent = data.request.notes || t('provider.js.no_details');

    let urgencyEl = document.getElementById('modalUrgency');
    if (!urgencyEl) {
      const notesEl = document.getElementById('modalNotes');
      urgencyEl = document.createElement('p');
      urgencyEl.id = 'modalUrgency';
      urgencyEl.className = 'text-[11px] text-orange-600 mb-2 hidden';
      notesEl.parentNode.insertBefore(urgencyEl, notesEl);
    }
    if (data.request.urgencyTierLabel) {
      urgencyEl.textContent = `${t('provider.js.urgency')}: ${data.request.urgencyTierLabel}`;
      urgencyEl.classList.remove('hidden');
    } else {
      urgencyEl.classList.add('hidden');
    }

    const giftBadge = document.getElementById('modalGiftBadge');
    if (data.request.isGift) {
      giftBadge.classList.remove('hidden');
      document.getElementById('modalBeneficiary').textContent = data.request.beneficiaryName;
      document.getElementById('modalGiftPhone').textContent = data.request.beneficiaryPhone ? `Tel: ${data.request.beneficiaryPhone}` : '';
      document.getElementById('modalGiftMessage').textContent = data.request.giftMessage ? `"${data.request.giftMessage}"` : '';
      document.getElementById('modalClient').textContent = t('provider.js.payer', { name: data.client.name });
    } else {
      giftBadge.classList.add('hidden');
      document.getElementById('modalClient').textContent = data.client.name;
    }
  }

  function showRequestModal(data) {
    upsertWallItem(data);
    fillModal(data);
    requestModal.classList.remove('hidden');
    playAlertSound();
    startRepeatingAlert();
    pushBrowserNotification(t('provider.js.new_request_title'), `${data.service.name} · ${data.request.address}`);
  }

  function closeModal() {
    stopRepeatingAlert();
    requestModal.classList.add('hidden');
    currentRequest = null;
  }

  async function acceptRequest(requestId, btn) {
    if (btn) btn.disabled = true;
    const res = await fetch(`/proveedor/accept/${requestId}`, { method: 'POST' });
    const data = await res.json();

    if (!data.success) {
      if (btn) btn.disabled = false;
      FundezNotify.show(data.error || t('provider.js.take_error'), 'warning');
      if (res.status === 409) removeWallItem(requestId);
      return;
    }

    removeWallItem(requestId);
    closeModal();
    activeRequestId = requestId;
    startLocationWatch();
    FundezNotify.show(t('provider.js.job_taken_exclaim'), 'success');
    if (document.querySelector('#activeJobsList') || window.location.pathname.includes('/proveedor/mando')) {
      setTimeout(() => {
        window.location.href = '/proveedor/mando';
      }, 600);
    } else {
      setTimeout(() => location.reload(), 800);
    }
  }

  socket.on('connect', () => {
    socket.emit('register_provider', providerId);
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
    showRequestModal(data);
  });

  socket.on('new_request', (data) => {
    if (!onlineToggle?.checked) return;
    upsertWallItem(data);
    if (!requestModal.classList.contains('hidden') && currentRequest?.id === data.request.id) return;
    showRequestModal(data);
  });

  socket.on('request_taken', ({ requestId }) => {
    removeWallItem(requestId);
  });

  function sendLocation(lat, lng) {
    const body = { lat, lng };
    if (activeRequestId) body.requestId = activeRequestId;
    fetch('/proveedor/ubicacion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).catch(() => {});
  }

  function startLocationWatch() {
    if (locationWatchId != null || !navigator.geolocation) return;
    locationWatchId = navigator.geolocation.watchPosition(
      (pos) => sendLocation(pos.coords.latitude, pos.coords.longitude),
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );
  }

  function stopLocationWatch() {
    if (locationWatchId != null) {
      navigator.geolocation.clearWatch(locationWatchId);
      locationWatchId = null;
    }
  }

  if (onlineToggle?.checked) {
    fetch('/proveedor/toggle-online', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ online: true })
    }).then(() => {
      startLocationWatch();
      loadWorkWall();
    });
  }

  setInterval(() => {
    if (onlineToggle?.checked) loadWorkWall();
  }, 15000);

  onlineToggle?.addEventListener('change', async () => {
    const online = onlineToggle.checked;
    const res = await fetch('/proveedor/toggle-online', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ online })
    });
    const data = await res.json();

    if (!data.success) {
      onlineToggle.checked = false;
      const msg = data.missing?.length
        ? FundezI18n.t('js.verification_missing', { items: data.missing.join(', ') })
        : (data.error || FundezI18n.t('js.cannot_go_online'));
      FundezNotify.show(msg, 'warning');
      if (data.redirect) setTimeout(() => { window.location.href = data.redirect; }, 1800);
      return;
    }

    if (online) {
      statusDot.className = 'w-3 h-3 rounded-full bg-zilo-success shadow-lg shadow-zilo-success/40 animate-pulse';
      statusText.textContent = FundezI18n.t('provider.online');
      statusSub.textContent = FundezI18n.t('provider.status_online_sub');
      FundezNotify.show(data.dispatched > 0 ? FundezI18n.t('js.requests_on_wall', { count: data.dispatched }) : FundezI18n.t('js.online_activated'), 'success');
      startLocationWatch();
      loadWorkWall();
      syncStickyBar();
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    } else {
      statusDot.className = 'w-3 h-3 rounded-full bg-zilo-muted/40';
      statusText.textContent = FundezI18n.t('provider.offline');
      statusSub.textContent = FundezI18n.t('provider.status_offline_sub');
      wallItems.clear();
      renderWorkWall();
      closeModal();
      stopLocationWatch();
      syncStickyBar();
      FundezNotify.show(FundezI18n.t('js.offline_mode'), 'info');
    }
  });

  document.getElementById('btnRefreshWall')?.addEventListener('click', () => {
    loadWorkWall();
    workWall?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    FundezNotify.show(t('provider.js.wall_updated'), 'info');
  });

  document.getElementById('btnAccept')?.addEventListener('click', () => {
    if (currentRequest) acceptRequest(currentRequest.id);
  });

  document.getElementById('btnDecline')?.addEventListener('click', () => {
    closeModal();
    workWall?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    FundezNotify.show(FundezI18n.t('js.still_on_wall'), 'info');
  });

  socket.on('modules_updated', () => {
    setTimeout(() => location.reload(), 600);
  });
})();
