(function () {
  const page = document.getElementById('servicePage');
  if (!page) return;

  function t(key, vars) {
    return typeof FundezI18n !== 'undefined' ? FundezI18n.t(key, vars) : key;
  }

  const locale = document.documentElement.lang === 'en' ? 'en-US' : 'es-CL';
  const fmtCLP = n => new Intl.NumberFormat(locale, { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

  const serviceId = page.dataset.serviceId;
  const trackingId = page.dataset.tracking;
  const btnRequest = document.getElementById('btnRequest');
  const loaderOverlay = document.getElementById('loaderOverlay');
  const providerCard = document.getElementById('providerCard');
  const requestForm = document.getElementById('requestForm');
  const addressInput = document.getElementById('address');
  const latInput = document.getElementById('lat');
  const lngInput = document.getElementById('lng');
  const mapStatus = document.getElementById('mapStatus');
  const coverageAlert = document.getElementById('coverageAlert');
  const giftToggle = document.getElementById('giftToggle');
  const giftFields = document.getElementById('giftFields');
  const addressLabel = document.getElementById('addressLabel');
  const urgencyRadios = document.querySelectorAll('input[name="urgencyTier"]');

  let currentRequestId = trackingId || null;
  let selectedUrgencyTier = document.querySelector('input[name="urgencyTier"]:checked')?.value || 'tomorrow';
  let geocodeTimer = null;
  let addressCovered = null;
  const socket = io();

  const SANTIAGO = { lat: -33.4489, lng: -70.6693 };

  document.addEventListener('DOMContentLoaded', () => {
    if (typeof FundezMap !== 'undefined') {
      FundezMap.init(document.getElementById('addressMap'), {
        lat: SANTIAGO.lat, lng: SANTIAGO.lng, label: 'Santiago, Chile', zoom: 12
      });
    }

    updatePricePreview();

    if (new URLSearchParams(window.location.search).get('gift') === '1' && giftToggle) {
      giftToggle.checked = true;
      giftFields.classList.remove('hidden');
      if (addressLabel) addressLabel.textContent = t('client.js.gift_address');
    }

    if (trackingId) {
      requestForm.classList.add('hidden');
      loaderOverlay.classList.remove('hidden');
      startTracking(trackingId);
    }
  });

  addressInput.addEventListener('input', () => {
    clearTimeout(geocodeTimer);
    geocodeTimer = setTimeout(geocodeAddress, 800);
  });

  if (giftToggle) {
    giftToggle.addEventListener('change', () => {
      const isGift = giftToggle.checked;
      giftFields.classList.toggle('hidden', !isGift);
      if (addressLabel) {
        addressLabel.textContent = isGift ? t('client.js.gift_address') : t('client.js.service_address');
      }
    });
  }

  urgencyRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      selectedUrgencyTier = radio.value;
      document.querySelectorAll('.urgency-option').forEach(el => {
        const active = el.dataset.tier === selectedUrgencyTier;
        el.classList.toggle('border-zilo-accent', active);
        el.classList.toggle('bg-zilo-accent/5', active);
        el.classList.toggle('border-zilo-border', !active);
      });
      updatePricePreview();
    });
  });

  async function updatePricePreview() {
    const visitEl = document.getElementById('displayVisitPrice');
    if (!visitEl) return;
    try {
      const res = await fetch(`/cliente/precio-preview?tier=${encodeURIComponent(selectedUrgencyTier)}`);
      const data = await res.json();
      if (!data.success) return;
      const p = data.preview;
      const f = data.preview.formatted;
      visitEl.textContent = f.visitTotal;
      document.getElementById('displayServicePrice').textContent = f.servicePrice;
      document.getElementById('displayTotalPrice').textContent = f.estimatedTotal;

      const stickyTotal = document.getElementById('stickyTotal');
      if (stickyTotal) stickyTotal.textContent = f.estimatedTotal;

      const adjRow = document.getElementById('urgencyAdjustmentRow');
      if (adjRow) {
        if (p.adjustmentAmount !== 0) {
          adjRow.classList.remove('hidden');
          adjRow.classList.add('flex');
          document.getElementById('urgencyAdjustmentLabel').textContent =
            p.adjustmentPercent > 0
              ? t('client.js.surcharge_label', { label: p.tier.label })
              : t('client.js.discount_label', { label: p.tier.label });
          const adjEl = document.getElementById('displayUrgencyAdj');
          adjEl.textContent = (p.adjustmentAmount > 0 ? '+' : '') + f.adjustment;
          adjEl.className = p.adjustmentAmount > 0 ? 'text-orange-600' : 'text-emerald-600';
        } else {
          adjRow.classList.add('hidden');
          adjRow.classList.remove('flex');
        }
      }
    } catch (_) { /* silent */ }
  }

  const clientPhotoInput = document.getElementById('clientPhoto');
  const clientPhotoPreview = document.getElementById('clientPhotoPreview');
  if (clientPhotoInput && clientPhotoPreview) {
    clientPhotoInput.addEventListener('change', () => {
      const file = clientPhotoInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        clientPhotoPreview.querySelector('img').src = reader.result;
        clientPhotoPreview.classList.remove('hidden');
      };
      reader.readAsDataURL(file);
    });
  }

  function fileInputToBase64(input) {
    return new Promise((resolve) => {
      const file = input?.files?.[0];
      if (!file) return resolve(null);
      if (file.size > 6 * 1024 * 1024) {
        FundezNotify.show(t('client.js.photo_too_large'), 'warning');
        return resolve(null);
      }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  function setCoverageState(coverage) {
    addressCovered = coverage?.covered === true;
    if (!coverageAlert) return;

    if (!coverage || coverage.covered) {
      coverageAlert.classList.add('hidden');
      coverageAlert.textContent = '';
      btnRequest.disabled = false;
      const stickyBtn = document.getElementById('btnRequestSticky');
      if (stickyBtn) stickyBtn.disabled = false;
      return;
    }

    coverageAlert.classList.remove('hidden');
    coverageAlert.textContent = coverage.message
      || t('client.js.coverage_msg', { name: coverage.communeName || '' });
    btnRequest.disabled = true;
    const stickyBtn = document.getElementById('btnRequestSticky');
    if (stickyBtn) stickyBtn.disabled = true;
  }

  async function geocodeAddress() {
    const address = addressInput.value.trim();
    if (address.length < 5) return;

    mapStatus.textContent = t('client.js.geocoding');
    if (coverageAlert) {
      coverageAlert.classList.add('hidden');
      coverageAlert.textContent = '';
    }
    try {
      const res = await fetch('/cliente/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address })
      });
      const data = await res.json();
      if (data.success) {
        latInput.value = data.coords.lat;
        lngInput.value = data.coords.lng;
        FundezMap.update('addressMap', data.coords.lat, data.coords.lng, data.displayName || address);
        if (data.coverage?.covered) {
          mapStatus.textContent = data.displayName || t('client.js.location_found');
        } else {
          mapStatus.textContent = data.coverage?.communeName
            ? t('client.js.commune_detected', { name: data.coverage.communeName })
            : (data.displayName || t('client.js.location_found'));
        }
        setCoverageState(data.coverage);
      }
    } catch (_) {
      mapStatus.textContent = t('client.js.geocode_fail');
      setCoverageState(null);
    }
  }

  const loaderSteps = [
    { id: 'step1', text: t('client.js.loader_step1_text'), sub: t('client.js.loader_step1_sub') },
    { id: 'step2', text: t('client.service.found'), sub: t('client.service.found_sub') },
    { id: 'step3', text: t('client.service.connecting'), sub: t('client.service.connecting_sub') }
  ];

  function setStepActive(stepId) {
    document.querySelectorAll('.step-item').forEach(el => {
      el.className = 'step-item px-4 py-2.5 rounded-xl zilo-card-premium text-sm text-zilo-muted flex items-center gap-2';
    });
    const el = document.getElementById(stepId);
    if (el) el.className = 'step-item is-active px-4 py-2.5 rounded-xl text-sm flex items-center gap-2';
  }

  function animateLoader() {
    let step = 0;
    return setInterval(() => {
      if (step < loaderSteps.length) {
        setStepActive(loaderSteps[step].id);
        document.getElementById('loaderText').textContent = loaderSteps[step].text;
        document.getElementById('loaderSub').textContent = loaderSteps[step].sub;
        step++;
      }
    }, 1800);
  }

  function advanceTripStep(step) {
    document.querySelectorAll('.trip-step').forEach(el => {
      el.classList.remove('active');
      const ds = el.dataset.step;
      if (ds === 'paid' || ds === 'assigned') el.classList.add('done');
      else el.classList.remove('done');
    });
    const order = ['paid', 'assigned', 'enroute', 'arrived'];
    const idx = order.indexOf(step);
    order.slice(0, idx).forEach(s => {
      const el = document.querySelector(`.trip-step[data-step="${s}"]`);
      if (el) el.classList.add('done');
    });
    const current = document.querySelector(`.trip-step[data-step="${step}"]`);
    if (current) { current.classList.add('active'); current.classList.remove('done'); }
    const etaEl = document.getElementById('tripEta');
    if (!etaEl) return;
    if (step === 'enroute') etaEl.textContent = t('client.js.enroute_home');
    if (step === 'arrived') etaEl.textContent = t('client.js.arrived');
  }

  function syncTripFromRequest(request) {
    if (!request) return;
    const ts = request.techStatus;
    if (['diagnostico', 'reparando', 'comprando', 'presupuesto_pendiente', 'presupuesto_aprobado', 'completado'].includes(ts)) {
      advanceTripStep('arrived');
    } else if (ts === 'en_camino' || ts === 'en_sitio') {
      advanceTripStep('enroute');
    } else if (ts === 'aceptado' || ts === 'asignado' || request.providerId) {
      advanceTripStep('assigned');
    }
  }

  function renderVerificationBadges(provider) {
    const container = document.getElementById('providerVerification');
    if (!container) return;
    const v = provider.verification;
    if (!v?.badges?.length) {
      container.innerHTML = `<span class="zilo-badge !text-[10px]">${t('client.js.verification_pending')}</span>`;
      return;
    }
    container.innerHTML = v.badges.map(b =>
      `<span class="zilo-badge zilo-badge-success !text-[10px]">${b.label}</span>`
    ).join('');
    const statusEl = document.getElementById('providerVerifiedStatus');
    if (statusEl && v.faceVerified) {
      statusEl.textContent = v.faceScore
        ? t('client.js.identity_score', { score: v.faceScore })
        : t('client.js.identity_verified');
      statusEl.classList.remove('hidden');
    }
  }

  function showBudgetBanner(request) {
    const banner = document.getElementById('budgetBanner');
    if (!banner || !request?.siteReport) return;
    const sr = request.siteReport;
    if (request.techStatus !== 'presupuesto_pendiente' || sr.budgetStatus !== 'pending') {
      banner.classList.add('hidden');
      return;
    }
    document.getElementById('budgetBannerText').textContent =
      t('client.js.budget_sent', { amount: fmtCLP(sr.budgetAmount), desc: sr.budgetDescription || '' });
    banner.classList.remove('hidden');
  }

  async function respondBudget(approved) {
    if (!currentRequestId) return;
    const res = await fetch(`/cliente/presupuesto/${currentRequestId}/responder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ approved })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      FundezNotify.show(data.error || t('client.js.respond_error'), 'error');
      return;
    }
    FundezNotify.show(
      approved ? t('client.js.budget_approved') : t('client.js.budget_rejected'),
      approved ? 'success' : 'info'
    );
    document.getElementById('budgetBanner')?.classList.add('hidden');
  }

  document.getElementById('btnApproveBudget')?.addEventListener('click', () => respondBudget(true));
  document.getElementById('btnRejectBudget')?.addEventListener('click', () => respondBudget(false));

  function showProvider(provider, request) {
    if (request?.id) currentRequestId = request.id;

    document.getElementById('providerAvatar').textContent = provider.avatar;
    document.getElementById('providerName').textContent = provider.name;
    document.getElementById('providerRating').textContent = provider.rating;
    document.getElementById('providerReviews').textContent = t('client.js.reviews_count', { count: provider.reviewsCount });
    document.getElementById('providerStars').textContent = '★'.repeat(Math.round(provider.rating));
    document.getElementById('providerBio').textContent = provider.bio;
    document.getElementById('providerPhone').href = `tel:${provider.phone}`;
    document.getElementById('providerPhone').textContent = t('client.js.call', { phone: provider.phone });
    const emailEl = document.getElementById('providerEmail');
    if (emailEl && provider.email) {
      emailEl.href = `mailto:${provider.email}`;
      emailEl.textContent = t('client.js.email', { email: provider.email });
      emailEl.classList.remove('hidden');
    }
    renderVerificationBadges(provider);
    document.getElementById('tripProviderLabel').textContent = `${provider.name} · ${provider.rating}★`;
    if (request) showBudgetBanner(request);
    const waNum = page.dataset.whatsapp || '56912345678';
    const waMsg = encodeURIComponent(t('client.js.wa_help', { name: provider.name }));
    document.getElementById('whatsappSupport').href = `https://wa.me/${waNum.replace(/\D/g, '')}?text=${waMsg}`;

    if (request) syncTripFromRequest(request);

    document.getElementById('reviewsList').innerHTML = provider.reviews.map(r => `
      <div class="p-3 rounded-xl bg-zilo-bg">
        <div class="flex justify-between mb-1">
          <span class="text-xs font-semibold">${r.author}</span>
          <span class="text-xs text-yellow-600">${'★'.repeat(r.rating)}</span>
        </div>
        <p class="text-xs text-gray-600">${r.text}</p>
      </div>
    `).join('');

    if (request?.coords) {
      const tMap = document.getElementById('trackingMap');
      tMap.classList.remove('hidden');
      page.dataset.destLat = request.coords.lat;
      page.dataset.destLng = request.coords.lng;
      const prov = provider.location;
      FundezMap.initTracking(tMap, {
        destLat: request.coords.lat,
        destLng: request.coords.lng,
        destLabel: request.address,
        providerLat: prov?.lat,
        providerLng: prov?.lng
      });
      const locStatus = document.getElementById('providerLocationStatus');
      if (locStatus) {
        locStatus.classList.toggle('hidden', !prov);
        if (prov) locStatus.textContent = t('client.js.tech_live_location');
      }
    }

    loaderOverlay.classList.add('hidden');
    providerCard.classList.remove('hidden');
    requestForm.classList.add('hidden');
    FundezNotify.show(t('client.js.provider_found'), 'success');
  }

  function pollForProvider(requestId, attempts = 0) {
    if (attempts > 30) {
      loaderOverlay.classList.add('hidden');
      requestForm.classList.remove('hidden');
      FundezNotify.show(t('client.js.no_providers_later'), 'warning');
      return;
    }

    fetch(`/cliente/solicitud/${requestId}`)
      .then(r => r.json())
      .then(data => {
        if (data.provider) showProvider(data.provider, data.request);
        else setTimeout(() => pollForProvider(requestId, attempts + 1), 2000);
      });
  }

  function startTracking(requestId) {
    currentRequestId = requestId;
    const loaderInterval = animateLoader();
    socket.emit('register_client', requestId);
    socket.on(`request_update_${requestId}`, (payload) => {
      if (payload.provider) {
        clearInterval(loaderInterval);
        showProvider(payload.provider, payload.request);
      } else if (payload.request) {
        showBudgetBanner(payload.request);
        syncTripFromRequest(payload.request);
      }
    });
    socket.on(`provider_location_${requestId}`, (payload) => {
      const destLat = parseFloat(page.dataset.destLat);
      const destLng = parseFloat(page.dataset.destLng);
      if (!isNaN(destLat) && typeof FundezMap !== 'undefined') {
        FundezMap.updateProviderLocation('trackingMap', payload.lat, payload.lng, destLat, destLng);
      }
      const locStatus = document.getElementById('providerLocationStatus');
      if (locStatus) {
        locStatus.textContent = t('client.js.tech_live_location');
        locStatus.classList.remove('hidden');
      }
      advanceTripStep('enroute');
    });
    pollForProvider(requestId);
  }

  async function submitRequest() {
    const address = addressInput.value.trim();
    if (!address) {
      addressInput.focus();
      FundezNotify.show(t('client.js.address_required'), 'warning');
      return;
    }

    const isGift = giftToggle?.checked;
    let gift = null;
    if (isGift) {
      const name = document.getElementById('giftName')?.value.trim();
      const phone = document.getElementById('giftPhone')?.value.trim();
      if (!name) {
        FundezNotify.show(t('client.js.beneficiary_required'), 'warning');
        return;
      }
      gift = {
        name,
        phone: phone || '',
        message: document.getElementById('giftMessage')?.value.trim() || ''
      };
    }

    btnRequest.disabled = true;
    btnRequest.textContent = t('client.js.processing');
    const stickyBtn = document.getElementById('btnRequestSticky');
    if (stickyBtn) stickyBtn.disabled = true;

    try {
      if (!latInput.value) await geocodeAddress();
      if (addressCovered === false) {
        btnRequest.disabled = true;
        if (stickyBtn) stickyBtn.disabled = true;
        btnRequest.textContent = t('client.js.continue_payment');
        FundezNotify.show(t('client.js.coverage_blocked'), 'warning');
        return;
      }

      const clientPhoto = clientPhotoInput ? await fileInputToBase64(clientPhotoInput) : null;

      const res = await fetch('/cliente/solicitar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId,
          address,
          notes: document.getElementById('notes').value,
          lat: latInput.value,
          lng: lngInput.value,
          gift,
          clientPhoto,
          urgencyTier: selectedUrgencyTier
        })
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error || t('client.js.process_error'));

      window.location.href = `/pagos/checkout?ref=${data.request.id}`;
    } catch (err) {
      btnRequest.disabled = false;
      btnRequest.textContent = t('client.js.continue_payment');
      if (stickyBtn) stickyBtn.disabled = false;
      FundezNotify.show(err.message || t('client.js.process_error'), 'error');
    }
  }

  btnRequest.addEventListener('click', submitRequest);
  document.getElementById('btnRequestSticky')?.addEventListener('click', submitRequest);

  const stickyBar = document.getElementById('stickyOrderBar');
  const requestFormEl = document.getElementById('requestForm');
  if (stickyBar && requestFormEl && !trackingId) {
    const observer = new IntersectionObserver(([entry]) => {
      const visible = !entry.isIntersecting;
      stickyBar.classList.toggle('is-visible', visible);
      stickyBar.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }, { threshold: 0, rootMargin: '0px 0px -80px 0px' });
    observer.observe(requestFormEl);
  }
})();
