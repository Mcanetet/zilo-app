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
  let selectedUrgencyTier = document.querySelector('input[name="urgencyTier"]:checked')?.value || 'scheduled';
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

  const activitySelect = document.getElementById('activityId');
  const customActivityFields = document.getElementById('customActivityFields');
  function toggleClientOtherFields() {
    if (!activitySelect || !customActivityFields) return;
    customActivityFields.classList.toggle('hidden', activitySelect.value !== 'otro');
  }
  function selectedActivityBase() {
    const opt = activitySelect?.selectedOptions?.[0];
    const base = opt?.dataset?.base;
    const n = base ? parseInt(base, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  activitySelect?.addEventListener('change', () => {
    toggleClientOtherFields();
    updatePricePreview();
  });
  toggleClientOtherFields();

  function deviceLocalClock() {
    const now = new Date();
    const localTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    let timeZone = 'America/Santiago';
    try {
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || timeZone;
    } catch (_) { /* fallback Chile */ }
    return { localTime, timeZone };
  }

  async function updatePricePreview() {
    const visitEl = document.getElementById('displayVisitPrice');
    if (!visitEl) return;
    try {
      const base = selectedActivityBase();
      const clock = deviceLocalClock();
      const params = new URLSearchParams({
        tier: selectedUrgencyTier,
        localTime: clock.localTime,
        timeZone: clock.timeZone
      });
      if (base) params.set('base', String(base));
      const res = await fetch(`/cliente/precio-preview?${params.toString()}`);
      const data = await res.json();
      if (!data.success) return;
      const p = data.preview;
      const f = data.preview.formatted;
      visitEl.textContent = f.baseVisit;
      document.getElementById('displayServicePrice').textContent = f.servicePrice;
      document.getElementById('displayTotalPrice').textContent = f.estimatedTotal;

      const stickyTotal = document.getElementById('stickyTotal');
      if (stickyTotal) stickyTotal.textContent = f.estimatedTotal;

      const svcRow = document.getElementById('servicePriceRow');
      if (svcRow) {
        if (p.servicePrice > 0) svcRow.classList.remove('hidden');
        else svcRow.classList.add('hidden');
      }

      const adjRow = document.getElementById('urgencyAdjustmentRow');
      if (adjRow) {
        if (p.adjustmentAmount !== 0) {
          adjRow.classList.remove('hidden');
          adjRow.classList.add('flex');
          const horarioLabel = p.tariff?.horarioBand === 'nocturno'
            ? 'madrugada'
            : (p.tariff?.horarioBand || '');
          const band = p.tariff
            ? `${horarioLabel} / ${p.tariff.urgenciaBand || ''}`
            : p.tier.label;
          document.getElementById('urgencyAdjustmentLabel').textContent =
            p.adjustmentAmount > 0
              ? t('client.js.surcharge_label', { label: band })
              : t('client.js.discount_label', { label: band });
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

  function renderCompletionSummary(totals, vouchers, request) {
    const box = document.getElementById('completionSummary');
    if (!box || !totals?.completed) return;
    document.getElementById('finalVisit').textContent = fmtCLP(totals.visitPaid || 0);
    document.getElementById('finalService').textContent = fmtCLP(totals.serviceAmount || 0);
    document.getElementById('finalServiceRow')?.classList.toggle('hidden', !totals.serviceAmount);
    document.getElementById('finalMaterials').textContent = fmtCLP(totals.materialsTotal || 0);
    document.getElementById('finalGrandTotal').textContent = fmtCLP(totals.grandTotal || 0);

    const materialsBlock = document.getElementById('finalMaterialsBlock');
    const list = document.getElementById('finalMaterialsList');
    const materials = Array.isArray(totals.materials) ? totals.materials : [];
    materialsBlock?.classList.toggle('hidden', !totals.materialsTotal);
    if (list) {
      list.replaceChildren();
      materials.forEach((material) => {
        const row = document.createElement('div');
        row.className = 'flex justify-between gap-3';
        const description = document.createElement('span');
        description.textContent = material.description || 'Material';
        const amount = document.createElement('span');
        amount.textContent = fmtCLP(material.amount || 0);
        row.append(description, amount);
        list.appendChild(row);
      });
    }
    const voucher = (vouchers || []).find((item) => item.phase === 'job_settlement');
    const voucherLink = document.getElementById('finalVoucherLink');
    if (voucher?.url && voucherLink) {
      voucherLink.href = voucher.url;
      voucherLink.classList.remove('hidden');
    }
    const invoiceLink = document.getElementById('finalProviderInvoiceLink');
    if (request?.providerInvoicePlan?.status === 'issued' && request.providerInvoicePlan.url && invoiceLink) {
      invoiceLink.href = request.providerInvoicePlan.url;
      invoiceLink.classList.remove('hidden');
    }
    const reviewLink = document.getElementById('finalReviewLink');
    if (reviewLink && request?.id) {
      reviewLink.href = `/cliente/historial?calificar=${encodeURIComponent(request.id)}`;
      reviewLink.classList.toggle('hidden', Boolean(request.clientReview));
    }
    box.classList.remove('hidden');
  }

  async function loadCompletionSummary(requestId) {
    try {
      const res = await fetch(`/cliente/solicitud/${requestId}`);
      const data = await res.json();
      renderCompletionSummary(data.request?.clientTotals, data.request?.vouchers, data.request);
    } catch (_) { /* se reintentará con la próxima actualización */ }
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

  function showActivityChangeBanner(request) {
    const banner = document.getElementById('activityChangeBanner');
    if (!banner) return;
    const change = request?.siteReport?.activityChange;
    if (!change || change.status !== 'pending') {
      banner.classList.add('hidden');
      return;
    }
    const label = change.manual ? 'Servicio propuesto por el socio' : 'Cambio de subservicio';
    document.getElementById('activityChangeText').textContent =
      `${label}: ${change.fromActivityName || '—'} → ${change.toActivityName || '—'} · ${fmtCLP(change.proposedTotal)}\n${change.notes || ''}`;
    const photo = document.getElementById('activityChangePhoto');
    if (change.photoUrl && photo) {
      photo.src = change.photoUrl;
      photo.classList.remove('hidden');
    } else if (photo) {
      photo.classList.add('hidden');
    }
    banner.classList.remove('hidden');
  }

  function showAdditionalPaymentBanner(request) {
    const banner = document.getElementById('additionalPaymentBanner');
    if (!banner) return;
    const charge = request?.additionalCharge;
    if (!charge || charge.status !== 'pending') {
      banner.classList.add('hidden');
      return;
    }
    document.getElementById('additionalPaymentText').textContent =
      `${charge.description || 'Ajuste de servicio'} · ${fmtCLP(charge.amountDue || 0)}`;
    document.getElementById('additionalPaymentLink').href = `/pagos/ajuste?ref=${request.id}`;
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
    if (data.redirect) window.location.href = data.redirect;
  }

  async function respondActivityChange(approved) {
    if (!currentRequestId) return;
    const res = await fetch(`/cliente/cambio-servicio/${currentRequestId}/responder`, {
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
      approved ? t('client.js.activity_change_ok') : t('client.js.activity_change_no'),
      approved ? 'success' : 'info'
    );
    document.getElementById('activityChangeBanner')?.classList.add('hidden');
    if (data.redirect) window.location.href = data.redirect;
  }

  document.getElementById('btnApproveBudget')?.addEventListener('click', () => respondBudget(true));
  document.getElementById('btnRejectBudget')?.addEventListener('click', () => respondBudget(false));
  document.getElementById('btnApproveActivityChange')?.addEventListener('click', () => respondActivityChange(true));
  document.getElementById('btnRejectActivityChange')?.addEventListener('click', () => respondActivityChange(false));

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
    if (request) {
      showBudgetBanner(request);
      showActivityChangeBanner(request);
      showAdditionalPaymentBanner(request);
      renderCompletionSummary(request.clientTotals, request.vouchers);
    }
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
        showActivityChangeBanner(payload.request);
        showAdditionalPaymentBanner(payload.request);
        syncTripFromRequest(payload.request);
        if (payload.request.status === 'completed' || payload.request.techStatus === 'completado') {
          loadCompletionSummary(requestId);
        }
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

      const activityId = document.getElementById('activityId')?.value || '';
      const customName = document.getElementById('customActivityName')?.value.trim() || '';
      const notes = document.getElementById('notes')?.value.trim() || '';
      if (document.getElementById('activityId') && !activityId) {
        FundezNotify.show(t('client.js.need_subservice'), 'warning');
        return;
      }
      if (activityId === 'otro' && customName.length < 4) {
        FundezNotify.show('En Otro, describe el servicio que necesitas', 'warning');
        document.getElementById('customActivityName')?.focus();
        return;
      }
      if (!notes) {
        FundezNotify.show(t('client.js.need_notes'), 'warning');
        return;
      }
      const clientPhoto = clientPhotoInput ? await fileInputToBase64(clientPhotoInput) : null;
      if (!clientPhoto) {
        FundezNotify.show(t('client.js.need_photo'), 'warning');
        return;
      }

      const clock = deviceLocalClock();
      const res = await fetch('/cliente/solicitar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId,
          address,
          notes,
          lat: latInput.value,
          lng: lngInput.value,
          gift,
          clientPhoto,
          urgencyTier: selectedUrgencyTier,
          activityId,
          customName: activityId === 'otro' ? customName : undefined,
          localTime: clock.localTime,
          timeZone: clock.timeZone
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
