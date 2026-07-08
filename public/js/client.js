(function () {
  const page = document.getElementById('servicePage');
  if (!page) return;

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
  const giftToggle = document.getElementById('giftToggle');
  const giftFields = document.getElementById('giftFields');
  const addressLabel = document.getElementById('addressLabel');

  let currentRequestId = trackingId || null;
  let geocodeTimer = null;
  const socket = io();

  const SANTIAGO = { lat: -33.4489, lng: -70.6693 };

  document.addEventListener('DOMContentLoaded', () => {
    if (typeof FundezMap !== 'undefined') {
      FundezMap.init(document.getElementById('addressMap'), {
        lat: SANTIAGO.lat, lng: SANTIAGO.lng, label: 'Santiago, Chile', zoom: 12
      });
    }

    if (new URLSearchParams(window.location.search).get('gift') === '1' && giftToggle) {
      giftToggle.checked = true;
      giftFields.classList.remove('hidden');
      if (addressLabel) addressLabel.textContent = 'Dirección del beneficiario';
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
        addressLabel.textContent = isGift
          ? 'Dirección del beneficiario'
          : 'Dirección del servicio';
      }
    });
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
        FundezNotify.show('La foto no puede superar 6 MB', 'warning');
        return resolve(null);
      }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  async function geocodeAddress() {
    const address = addressInput.value.trim();
    if (address.length < 5) return;

    mapStatus.textContent = 'Buscando ubicación...';
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
        mapStatus.textContent = data.displayName || 'Ubicación encontrada';
      }
    } catch (_) {
      mapStatus.textContent = 'No se pudo geocodificar';
    }
  }

  const loaderSteps = [
    { id: 'step1', text: 'Buscando proveedor cercano...', sub: 'Usando tu ubicación en Santiago' },
    { id: 'step2', text: 'Encontramos técnicos disponibles', sub: 'Verificando especialidad y rating' },
    { id: 'step3', text: 'Conectando con tu proveedor', sub: 'Casi listo...' }
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
      if (['paid','assigned'].includes(el.dataset.step) || el.dataset.step === step) el.classList.add('done');
    });
    const current = document.querySelector(`.trip-step[data-step="${step}"]`);
    if (current) { current.classList.add('active'); current.classList.remove('done'); }
    if (step === 'enroute') document.getElementById('tripEta').textContent = 'ETA ~12 min';
    if (step === 'arrived') document.getElementById('tripEta').textContent = '¡Ha llegado!';
  }

  function renderVerificationBadges(provider) {
    const container = document.getElementById('providerVerification');
    if (!container) return;
    const v = provider.verification;
    if (!v?.badges?.length) {
      container.innerHTML = '<span class="zilo-badge !text-[10px]">Verificación en proceso</span>';
      return;
    }
    container.innerHTML = v.badges.map(b =>
      `<span class="zilo-badge zilo-badge-success !text-[10px]">${b.label}</span>`
    ).join('');
    const statusEl = document.getElementById('providerVerifiedStatus');
    if (statusEl && v.faceVerified) {
      statusEl.textContent = v.faceScore ? `Identidad verificada · ${v.faceScore}%` : 'Identidad verificada por Fundez';
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
    const fmt = n => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);
    document.getElementById('budgetBannerText').textContent =
      `El técnico envió un presupuesto de ${fmt(sr.budgetAmount)}: ${sr.budgetDescription || ''}`;
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
      FundezNotify.show(data.error || 'Error al responder', 'error');
      return;
    }
    FundezNotify.show(approved ? 'Presupuesto aprobado' : 'Presupuesto rechazado', approved ? 'success' : 'info');
    document.getElementById('budgetBanner')?.classList.add('hidden');
  }

  document.getElementById('btnApproveBudget')?.addEventListener('click', () => respondBudget(true));
  document.getElementById('btnRejectBudget')?.addEventListener('click', () => respondBudget(false));

  function showProvider(provider, request) {
    if (request?.id) currentRequestId = request.id;

    document.getElementById('providerAvatar').textContent = provider.avatar;
    document.getElementById('providerName').textContent = provider.name;
    document.getElementById('providerRating').textContent = provider.rating;
    document.getElementById('providerReviews').textContent = `(${provider.reviewsCount} reseñas)`;
    document.getElementById('providerStars').textContent = '★'.repeat(Math.round(provider.rating));
    document.getElementById('providerBio').textContent = provider.bio;
    document.getElementById('providerPhone').href = `tel:${provider.phone}`;
    document.getElementById('providerPhone').textContent = `Llamar · ${provider.phone}`;
    const emailEl = document.getElementById('providerEmail');
    if (emailEl && provider.email) {
      emailEl.href = `mailto:${provider.email}`;
      emailEl.textContent = `Correo · ${provider.email}`;
      emailEl.classList.remove('hidden');
    }
    renderVerificationBadges(provider);
    document.getElementById('tripProviderLabel').textContent = `${provider.name} · ${provider.rating}★`;
    if (request) showBudgetBanner(request);
    const waNum = page.dataset.whatsapp || '56912345678';
    const waMsg = encodeURIComponent(`Hola Fundez, tengo un servicio en curso con ${provider.name}. Necesito ayuda.`);
    document.getElementById('whatsappSupport').href = `https://wa.me/${waNum.replace(/\D/g, '')}?text=${waMsg}`;

    setTimeout(() => advanceTripStep('enroute'), 8000);
    setTimeout(() => advanceTripStep('arrived'), 20000);

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
        if (prov) locStatus.textContent = 'Ubicación del técnico en tiempo real';
      }
    }

    loaderOverlay.classList.add('hidden');
    providerCard.classList.remove('hidden');
    requestForm.classList.add('hidden');
    FundezNotify.show('¡Proveedor asignado!', 'success');
  }

  function pollForProvider(requestId, attempts = 0) {
    if (attempts > 30) {
      loaderOverlay.classList.add('hidden');
      requestForm.classList.remove('hidden');
      FundezNotify.show('No hay proveedores disponibles. Intenta más tarde.', 'warning');
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
        if (payload.request.techStatus === 'en_camino' || payload.request.techStatus === 'en_sitio') {
          advanceTripStep('enroute');
        }
        if (['diagnostico', 'reparando', 'comprando'].includes(payload.request.techStatus)) {
          advanceTripStep('arrived');
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
        locStatus.textContent = 'Ubicación del técnico en tiempo real';
        locStatus.classList.remove('hidden');
      }
      advanceTripStep('enroute');
    });
    pollForProvider(requestId);
  }

  btnRequest.addEventListener('click', async () => {
    const address = addressInput.value.trim();
    if (!address) {
      addressInput.focus();
      FundezNotify.show('Ingresa una dirección', 'warning');
      return;
    }

    const isGift = giftToggle?.checked;
    let gift = null;
    if (isGift) {
      const name = document.getElementById('giftName')?.value.trim();
      const phone = document.getElementById('giftPhone')?.value.trim();
      if (!name) {
        FundezNotify.show('Ingresa el nombre del beneficiario', 'warning');
        return;
      }
      gift = {
        name,
        phone: phone || '',
        message: document.getElementById('giftMessage')?.value.trim() || ''
      };
    }

    btnRequest.disabled = true;
    btnRequest.textContent = 'Procesando...';

    try {
      if (!latInput.value) await geocodeAddress();

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
          clientPhoto
        })
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Error');

      window.location.href = `/pagos/checkout?ref=${data.request.id}`;
    } catch (err) {
      btnRequest.disabled = false;
      btnRequest.textContent = 'Continuar al pago';
      FundezNotify.show(err.message || 'Error al procesar', 'error');
    }
  });
})();
