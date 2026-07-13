(function () {
  const form = document.getElementById('registrationForm');
  const addressInput = document.getElementById('address');
  if (!form || !addressInput) return;

  function t(key, vars) {
    return typeof FundezI18n !== 'undefined' ? FundezI18n.t(key, vars) : key;
  }

  const latInput = document.getElementById('address_lat');
  const lngInput = document.getElementById('address_lng');
  const placeInput = document.getElementById('address_place_id');
  const unitInput = document.getElementById('address_unit');
  const suggestionsEl = document.getElementById('addressSuggestions');
  const mapStatus = document.getElementById('addressMapStatus');
  const coverageAlert = document.getElementById('addressCoverageAlert');
  const addressLabel = document.getElementById('addressLabel');
  const addressHint = document.getElementById('addressHint');
  const roleInputs = document.querySelectorAll('input[name="role"]');

  const SANTIAGO = { lat: -33.4489, lng: -70.6693 };
  let suggestTimer = null;
  let activeIndex = -1;
  let currentSuggestions = [];
  let addressConfirmed = false;
  let lastSelectedLabel = '';

  function currentRole() {
    const role = document.querySelector('input[name="role"]:checked');
    return role ? role.value : 'client';
  }

  function isProviderRole() {
    return currentRole() === 'provider';
  }

  function syncAddressCopy() {
    if (addressLabel) {
      addressLabel.textContent = isProviderRole()
        ? t('register.address_company')
        : t('register.address');
    }
    if (addressHint) {
      addressHint.textContent = isProviderRole()
        ? t('register.address_provider_hint')
        : t('register.address_hint');
    }
  }

  function clearCoords() {
    addressConfirmed = false;
    lastSelectedLabel = '';
    if (latInput) latInput.value = '';
    if (lngInput) lngInput.value = '';
    if (placeInput) placeInput.value = '';
    if (coverageAlert) {
      coverageAlert.classList.add('hidden');
      coverageAlert.textContent = '';
    }
    resetMapToDefault();
  }

  function setMapStatus(text) {
    if (mapStatus) mapStatus.textContent = text || '';
  }

  function showMapAt(lat, lng, label, zoom) {
    if (typeof FundezMap === 'undefined' || typeof L === 'undefined') return;
    const mapEl = document.getElementById('registerAddressMap');
    if (!mapEl) return;

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    if (isNaN(latitude) || isNaN(longitude)) return;

    const mapZoom = zoom || 16;
    if (!FundezMap.maps.registerAddressMap) {
      FundezMap.init(mapEl, { lat: latitude, lng: longitude, label: label || '', zoom: mapZoom });
    } else {
      FundezMap.update('registerAddressMap', latitude, longitude, label || '');
    }
  }

  function resetMapToDefault() {
    showMapAt(SANTIAGO.lat, SANTIAGO.lng, 'Santiago, Chile', 11);
    setMapStatus('');
  }

  function hideSuggestions() {
    activeIndex = -1;
    currentSuggestions = [];
    if (suggestionsEl) {
      suggestionsEl.classList.add('hidden');
      suggestionsEl.innerHTML = '';
    }
    addressInput.setAttribute('aria-expanded', 'false');
  }

  function showCoverage(coverage) {
    if (!coverageAlert) return;
    if (!coverage || coverage.covered) {
      coverageAlert.classList.add('hidden');
      coverageAlert.textContent = '';
      return;
    }
    coverageAlert.textContent = coverage.message || t('coverage.not_available');
    coverageAlert.classList.remove('hidden');
  }

  function selectSuggestion(item) {
    addressInput.value = item.label;
    lastSelectedLabel = item.label;
    addressConfirmed = true;
    if (latInput) latInput.value = item.lat;
    if (lngInput) lngInput.value = item.lng;
    if (placeInput) placeInput.value = item.placeId || '';
    hideSuggestions();
    setMapStatus(item.displayName || item.label);
    showMapAt(item.lat, item.lng, item.label, 16);

    fetch('/registro/direcciones/validar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: item.label,
        lat: item.lat,
        lng: item.lng,
        placeId: item.placeId
      })
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || data.success === false) {
          throw new Error(data.error || t('register.error_address_street_number'));
        }
        return data;
      })
      .then((data) => {
        if (data.coverage) showCoverage(data.coverage);
      })
      .catch((err) => {
        clearCoords();
        setMapStatus(err.message || t('register.error_address_street_number'));
      });
  }

  function renderSuggestions(items) {
    if (!suggestionsEl) return;
    currentSuggestions = items;
    activeIndex = -1;
    if (!items.length) {
      hideSuggestions();
      return;
    }

    suggestionsEl.innerHTML = items.map((item, index) => (
      `<button type="button" class="address-suggestion w-full text-left px-3 py-2.5 text-sm hover:bg-zilo-accent-soft transition border-b border-zilo-border last:border-b-0" data-index="${index}">
        <span class="block font-medium text-zilo-text">${escapeHtml(item.label)}</span>
        <span class="block text-[11px] text-zilo-muted mt-0.5 truncate">${escapeHtml(item.displayName)}</span>
      </button>`
    )).join('');

    suggestionsEl.classList.remove('hidden');
    addressInput.setAttribute('aria-expanded', 'true');
    suggestionsEl.querySelectorAll('.address-suggestion').forEach((btn) => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const item = currentSuggestions[Number(btn.dataset.index)];
        if (item) selectSuggestion(item);
      });
      btn.addEventListener('mouseenter', () => {
        const item = currentSuggestions[Number(btn.dataset.index)];
        if (item) showMapAt(item.lat, item.lng, item.label, 15);
      });
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function fetchSuggestions(query) {
    try {
      const res = await fetch(`/registro/direcciones?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      renderSuggestions(data.suggestions || []);
      if (!(data.suggestions || []).length && query.length >= 3) {
        setMapStatus(t('register.address_no_results'));
      }
    } catch (_) {
      setMapStatus(t('register.address_search_fail'));
      hideSuggestions();
    }
  }

  addressInput.addEventListener('input', () => {
    const value = addressInput.value.trim();
    if (value !== lastSelectedLabel) clearCoords();

    clearTimeout(suggestTimer);
    if (value.length < 3) {
      hideSuggestions();
      setMapStatus('');
      return;
    }

    setMapStatus(t('register.address_searching'));
    suggestTimer = setTimeout(() => fetchSuggestions(value), 450);
  });

  addressInput.addEventListener('keydown', (e) => {
    if (!currentSuggestions.length || suggestionsEl.classList.contains('hidden')) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, currentSuggestions.length - 1);
      highlightSuggestion();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      highlightSuggestion();
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      selectSuggestion(currentSuggestions[activeIndex]);
    } else if (e.key === 'Escape') {
      hideSuggestions();
    }
  });

  function highlightSuggestion() {
    suggestionsEl.querySelectorAll('.address-suggestion').forEach((btn, i) => {
      btn.classList.toggle('bg-zilo-accent-soft', i === activeIndex);
    });
    if (activeIndex >= 0 && currentSuggestions[activeIndex]) {
      const item = currentSuggestions[activeIndex];
      showMapAt(item.lat, item.lng, item.label, 15);
    }
  }

  document.addEventListener('click', (e) => {
    if (!suggestionsEl || suggestionsEl.classList.contains('hidden')) return;
    if (e.target === addressInput || suggestionsEl.contains(e.target)) return;
    hideSuggestions();
  });

  roleInputs.forEach((r) => r.addEventListener('change', syncAddressCopy));

  form.addEventListener('submit', (e) => {
    if (!addressConfirmed || !latInput.value || !lngInput.value) {
      e.preventDefault();
      addressInput.setCustomValidity(t('register.validation_address_select'));
      addressInput.reportValidity();
      return;
    }
    if (unitInput && unitInput.value.trim().length < 2) {
      e.preventDefault();
      unitInput.setCustomValidity(t('register.error_address_unit_required'));
      unitInput.reportValidity();
      return;
    }
    addressInput.setCustomValidity('');
    if (unitInput) unitInput.setCustomValidity('');
  });

  form.addEventListener('invalid', (event) => {
    const field = event.target;
    if (field !== addressInput) return;
    field.setCustomValidity('');
    if (field.validity.valueMissing) {
      field.setCustomValidity(t('register.validation_required'));
    } else if (!addressConfirmed || !latInput.value) {
      field.setCustomValidity(t('register.validation_address_select'));
    }
  }, true);

  addressInput.addEventListener('input', () => addressInput.setCustomValidity(''));
  if (unitInput) unitInput.addEventListener('input', () => unitInput.setCustomValidity(''));

  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  onReady(() => {
    syncAddressCopy();

    const hasCoords = latInput && latInput.value && lngInput && lngInput.value;
    if (hasCoords) {
      showMapAt(
        parseFloat(latInput.value),
        parseFloat(lngInput.value),
        addressInput.value,
        16
      );
      addressConfirmed = true;
      lastSelectedLabel = addressInput.value.trim();
    } else {
      resetMapToDefault();
    }
  });
})();
