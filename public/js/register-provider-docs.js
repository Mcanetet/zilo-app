(function () {
  const form = document.getElementById('registrationForm');
  if (!form) return;

  const providerFields = document.getElementById('providerFields');
  const docInputs = () => Array.from(document.querySelectorAll('.provider-doc-input'));
  const docStore = new Map();
  const MAX_BYTES = 6 * 1024 * 1024;

  function t(key) {
    return typeof FundezI18n !== 'undefined' ? FundezI18n.t(key) : key;
  }

  function isProviderRole() {
    const role = document.querySelector('input[name="role"]:checked');
    return role && role.value === 'provider';
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('read_failed'));
      reader.readAsDataURL(file);
    });
  }

  docInputs().forEach((input) => {
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      const status = input.parentElement?.querySelector('.provider-doc-status');
      if (!file) {
        docStore.delete(input.dataset.key);
        if (status) status.textContent = '';
        return;
      }
      if (file.size > MAX_BYTES) {
        input.value = '';
        docStore.delete(input.dataset.key);
        if (status) status.textContent = t('register.doc_file_too_large');
        return;
      }
      try {
        const dataUrl = await readFileAsDataUrl(file);
        docStore.set(input.dataset.key, dataUrl);
        if (status) status.textContent = `${t('register.doc_uploaded')}: ${file.name}`;
      } catch (_) {
        input.value = '';
        docStore.delete(input.dataset.key);
        if (status) status.textContent = t('register.doc_file_too_large');
      }
    });
  });

  function collectConsents() {
    const out = {};
    form.querySelectorAll('input[type="checkbox"][name^="consent_"]').forEach((cb) => {
      out[cb.name] = cb.checked;
    });
    return out;
  }

  function validateProviderForm() {
    const companyName = document.getElementById('company_legal_name');
    const companyRut = document.getElementById('company_rut');
    const repRut = document.getElementById('rep_rut');

    if (!companyName?.value.trim()) {
      companyName?.setCustomValidity(t('register.error_company_name'));
      companyName?.reportValidity();
      return false;
    }
    companyName.setCustomValidity('');

    if (!companyRut?.value.trim()) {
      companyRut?.setCustomValidity(t('register.error_company_rut'));
      companyRut?.reportValidity();
      return false;
    }
    companyRut.setCustomValidity('');

    if (!repRut?.value.trim()) {
      repRut?.setCustomValidity(t('register.error_rep_rut'));
      repRut?.reportValidity();
      return false;
    }
    repRut.setCustomValidity('');

    const specialties = form.querySelectorAll('input[name="specialties"]:checked');
    if (!specialties.length) {
      alert(t('register.error_specialties'));
      return false;
    }

    const requiredKeys = docInputs().map((i) => i.dataset.key);
    const missing = requiredKeys.filter((key) => !docStore.has(key));
    if (missing.length) {
      alert(t('register.error_provider_docs'));
      const firstMissing = docInputs().find((i) => missing.includes(i.dataset.key));
      firstMissing?.focus();
      return false;
    }

    return true;
  }

  function showFormError(message) {
    let box = document.getElementById('registerFormError');
    if (!box) {
      box = document.createElement('div');
      box.id = 'registerFormError';
      box.className = 'mb-4 p-3 rounded-xl bg-zilo-danger/10 border border-zilo-danger/30 text-zilo-danger text-sm text-center';
      form.parentElement.insertBefore(box, form);
    }
    box.textContent = message;
    box.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  form.addEventListener('submit', async (event) => {
    if (!isProviderRole()) return;

    event.preventDefault();
    document.getElementById('registerFormError')?.classList.add('hidden');

    if (!form.reportValidity()) return;
    if (!validateProviderForm()) return;

    const submitBtn = form.querySelector('button[type="submit"]');
    const originalLabel = submitBtn?.textContent;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = t('register.submitting');
    }

    const documents = {};
    docStore.forEach((value, key) => { documents[key] = value; });

    const payload = {
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      password: form.password.value,
      phone: form.phone.value.trim(),
      role: 'provider',
      address: form.address.value.trim(),
      address_unit: form.address_unit.value.trim(),
      address_lat: form.address_lat.value,
      address_lng: form.address_lng.value,
      address_place_id: form.address_place_id.value,
      specialties: Array.from(form.querySelectorAll('input[name="specialties"]:checked')).map((cb) => cb.value),
      company_legal_name: form.company_legal_name.value.trim(),
      company_rut: form.company_rut.value.trim(),
      rep_rut: form.rep_rut.value.trim(),
      provider_documents: documents,
      ...collectConsents()
    };

    try {
      const res = await fetch('/registro', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.redirect) {
        window.location.href = data.redirect;
        return;
      }
      showFormError(data.error || t('register.error_generic'));
    } catch (_) {
      showFormError(t('register.error_generic'));
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
      }
    }
  });

  document.querySelectorAll('input[name="role"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      document.getElementById('registerFormError')?.classList.add('hidden');
    });
  });
})();
