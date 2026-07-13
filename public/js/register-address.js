(function () {
  const form = document.getElementById('registrationForm');
  const addressInput = document.getElementById('address');
  if (!form || !addressInput) return;

  function t(key, vars) {
    return typeof FundezI18n !== 'undefined' ? FundezI18n.t(key, vars) : key;
  }

  const communeSelect = document.getElementById('address_commune');
  const latInput = document.getElementById('address_lat');
  const lngInput = document.getElementById('address_lng');
  const placeInput = document.getElementById('address_place_id');
  const unitInput = document.getElementById('address_unit');
  const suggestionsEl = document.getElementById('addressSuggestions');
  const mapStatus = document.getElementById('addressMapStatus');
  const mapActions = document.getElementById('addressMapActions');
  const useGpsBtn = document.getElementById('addressUseGps');
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
  let selectedCommune = null;

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
        : t('register.address_street');
    }
    if (addressHint) {
      addressHint.textContent = isProviderRole()
        ? t('register.address_provider_hint')
        : t('register.address_hint');
    }
  }

  function hideCoverage() {
    if (!coverageAlert) return;
    coverageAlert.classList.add('hidden');
    coverageAlert.textContent = '';
  }

  function showCoverage(coverage) {
    if (!coverageAlert) return;
    if (!coverage || coverage.covered) {
      hideCoverage();
      return;
    }
    coverageAlert.textContent = coverage.message || t('coverage.not_available');
    coverageAlert.classList.remove('hidden');
  }

  function setMapStatus(text) {
    if (mapStatus) mapStatus.textContent = text || '';
  }

  function onPinDrag(lat, lng) {
    if (latInput) latInput.value = Number(lat).toFixed(6);
    if (lngInput) lngInput.value = Number(lng).toFixed(6);
    setMapStatus(t('register.address_pin_adjusted'));
  }

  function enablePinAdjustment(label) {
    if (mapActions) mapActions.classList.remove('hidden');
    setMapStatus(t('register.address_map_tap_hint'));
    if (typeof FundezMap !== 'undefined') {
      FundezMap.enableMapPick('registerAddressMap', onPinDrag, {
        draggable: true,
        onMarkerDrag: onPinDrag
      });
    }
    if (label) {
      const map = FundezMap?.maps?.registerAddressMap;
      const marker = FundezMap?.markers?.registerAddressMap?.destination;
      if (marker) marker.bindPopup(label);
    }
  }

  function disablePinAdjustment() {
    if (mapActions) mapActions.classList.add('hidden');
    if (typeof FundezMap !== 'undefined') {
      FundezMap.disableMapPick('registerAddressMap');
    }
  }

  function showMapAt(lat, lng, label, zoom, { draggable = false } = {}) {
    if (typeof FundezMap === 'undefined' || typeof L === 'undefined') return;
    const mapEl = document.getElementById('registerAddressMap');
    if (!mapEl) return;

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    if (isNaN(latitude) || isNaN(longitude)) return;

    const mapZoom = zoom || 16;
    const markerOptions = {
      zoom: mapZoom,
      markerDraggable: draggable,
      onMarkerDrag: draggable ? onPinDrag : null
    };

    if (!FundezMap.maps.registerAddressMap) {
      FundezMap.init(mapEl, {
        lat: latitude,
        lng: longitude,
        label: label || '',
        zoom: mapZoom,
        interactive: true,
        markerDraggable: draggable,
        onMarkerDrag: draggable ? onPinDrag : null
      });
    } else {
      FundezMap.update('registerAddressMap', latitude, longitude, label || '', markerOptions);
    }
  }

  function resetMapToDefault() {
    showMapAt(SANTIAGO.lat, SANTIAGO.lng, 'Santiago, Chile', 11);
    setMapStatus('');
  }

  function resetMapToCommune() {
    if (selectedCommune) {
      showMapAt(selectedCommune.lat, selectedCommune.lng, selectedCommune.name, 13);
      return;
    }
    resetMapToDefault();
  }

  function clearAddressSelection() {
    addressConfirmed = false;
    lastSelectedLabel = '';
    if (latInput) latInput.value = '';
    if (lngInput) lngInput.value = '';
    if (placeInput) placeInput.value = '';
    hideCoverage();
    disablePinAdjustment();
    resetMapToCommune();
  }

  function setAddressFieldEnabled(enabled) {
    addressInput.disabled = !enabled;
    addressInput.placeholder = enabled
      ? t('register.address_street_placeholder')
      : t('register.address_commune_first');
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

  function getCommuneCode() {
    return communeSelect ? communeSelect.value : '';
  }

  async function loadCommune(code) {
    if (!code) {
      selectedCommune = null;
      setAddressFieldEnabled(false);
      addressInput.value = '';
      hideSuggestions();
      hideCoverage();
      resetMapToDefault();
      return;
    }

    setMapStatus(t('register.commune_loading'));
    try {
      const res = await fetch(`/registro/comunas/${encodeURIComponent(code)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'commune_error');

      selectedCommune = {
        code: data.code,
        name: data.name,
        lat: data.lat,
        lng: data.lng
      };

      setAddressFieldEnabled(true);
      addressInput.value = '';
      clearAddressSelection();
      showMapAt(data.lat, data.lng, data.name, 13);
      if (data.coverage) showCoverage(data.coverage);
      setMapStatus(t('register.commune_selected', { name: data.name }));
    } catch (_) {
      selectedCommune = null;
      setAddressFieldEnabled(false);
      setMapStatus(t('register.address_search_fail'));
    }
  }

  function selectSuggestion(item) {
    addressInput.value = item.label;
    lastSelectedLabel = item.label;
    addressConfirmed = true;
    if (latInput) latInput.value = item.lat;
    if (lngInput) lngInput.value = item.lng;
    if (placeInput) placeInput.value = item.placeId || '';
    hideSuggestions();
    showMapAt(item.lat, item.lng, item.label, 19, { draggable: true });
    enablePinAdjustment(item.label);

    fetch('/registro/direcciones/validar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: item.label,
        lat: item.lat,
        lng: item.lng,
        placeId: item.placeId,
        communeCode: getCommuneCode()
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
        clearAddressSelection();
        setMapStatus(err.message || t('register.error_address_street_number'));
      });
  }

  function renderSuggestions(items) {
    if (!suggestionsEl) return;
    if (items.length === 1) {
      selectSuggestion(items[0]);
      return;
    }

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
    const communeCode = getCommuneCode();
    if (!communeCode) {
      setMapStatus(t('register.validation_commune_required'));
      return;
    }

    try {
      const res = await fetch(
        `/registro/direcciones?q=${encodeURIComponent(query)}&commune=${encodeURIComponent(communeCode)}`
      );
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

  if (communeSelect) {
    communeSelect.addEventListener('change', () => {
      loadCommune(communeSelect.value);
    });
  }

  if (useGpsBtn) {
    useGpsBtn.addEventListener('click', () => {
      if (!addressConfirmed || !navigator.geolocation) {
        setMapStatus(t('register.address_gps_error'));
        return;
      }
      setMapStatus(t('register.address_gps_loading'));
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          onPinDrag(latitude, longitude);
          showMapAt(latitude, longitude, addressInput.value, 19, { draggable: true });
          enablePinAdjustment(addressInput.value);
        },
        () => setMapStatus(t('register.address_gps_error')),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
      );
    });
  }

  addressInput.addEventListener('input', () => {
    if (addressInput.disabled) return;

    const value = addressInput.value.trim();
    if (value !== lastSelectedLabel) clearAddressSelection();

    clearTimeout(suggestTimer);
    if (value.length < 3) {
      hideSuggestions();
      if (selectedCommune) {
        setMapStatus(t('register.commune_selected', { name: selectedCommune.name }));
      } else {
        setMapStatus('');
      }
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
    if (!getCommuneCode()) {
      e.preventDefault();
      if (communeSelect) {
        communeSelect.setCustomValidity(t('register.validation_commune_required'));
        communeSelect.reportValidity();
      }
      return;
    }
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
    if (communeSelect) communeSelect.setCustomValidity('');
    addressInput.setCustomValidity('');
    if (unitInput) unitInput.setCustomValidity('');
  });

  form.addEventListener('invalid', (event) => {
    const field = event.target;
    if (field === communeSelect) {
      field.setCustomValidity(t('register.validation_commune_required'));
      return;
    }
    if (field !== addressInput) return;
    field.setCustomValidity('');
    if (field.validity.valueMissing) {
      field.setCustomValidity(t('register.validation_required'));
    } else if (!addressConfirmed || !latInput.value) {
      field.setCustomValidity(t('register.validation_address_select'));
    }
  }, true);

  addressInput.addEventListener('input', () => addressInput.setCustomValidity(''));
  if (communeSelect) communeSelect.addEventListener('change', () => communeSelect.setCustomValidity(''));
  if (unitInput) unitInput.addEventListener('input', () => unitInput.setCustomValidity(''));

  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  onReady(async () => {
    syncAddressCopy();

    const savedAddress = addressInput.value.trim();
    const communeCode = getCommuneCode();
    if (communeCode) {
      await loadCommune(communeCode);
      if (savedAddress) addressInput.value = savedAddress;

      const hasCoords = latInput && latInput.value && lngInput && lngInput.value;
      if (hasCoords) {
        showMapAt(
          parseFloat(latInput.value),
          parseFloat(lngInput.value),
          addressInput.value,
          19,
          { draggable: true }
        );
        enablePinAdjustment(addressInput.value);
        addressConfirmed = true;
        lastSelectedLabel = addressInput.value.trim();
      }
    } else {
      setAddressFieldEnabled(false);
      resetMapToDefault();
    }
  });
})();
