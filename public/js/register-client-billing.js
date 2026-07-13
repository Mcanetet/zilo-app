(function () {
  const form = document.getElementById('registrationForm');
  if (!form) return;

  const clientBillingFields = document.getElementById('clientBillingFields');
  const clientCompanyFields = document.getElementById('clientCompanyFields');
  const clientRut = document.getElementById('client_rut');
  const clientLegalName = document.getElementById('client_legal_name');
  const clientGiro = document.getElementById('client_giro');
  const nameLabel = document.getElementById('nameLabel');
  const nameInput = document.getElementById('name');
  const billingTypeInputs = document.querySelectorAll('input[name="client_billing_type"]');

  function t(key, fallback) {
    if (typeof FundezI18n !== 'undefined') {
      const value = FundezI18n.t(key);
      if (value && value !== key) return value;
    }
    return fallback || key;
  }

  function isClientRole() {
    const role = document.querySelector('input[name="role"]:checked');
    return role && role.value === 'client';
  }

  function isCompanyClient() {
    const selected = document.querySelector('input[name="client_billing_type"]:checked');
    return selected && selected.value === 'empresa';
  }

  function syncClientBilling() {
    const isClient = isClientRole();
    if (clientBillingFields) clientBillingFields.classList.toggle('hidden', !isClient);

    if (clientRut) clientRut.required = isClient;
    if (clientLegalName) clientLegalName.required = isClient && isCompanyClient();
    if (clientGiro) clientGiro.required = isClient && isCompanyClient();

    if (clientCompanyFields) {
      clientCompanyFields.classList.toggle('hidden', !isClient || !isCompanyClient());
    }

    if (nameLabel) {
      const company = isClient && isCompanyClient();
      nameLabel.textContent = company
        ? (nameLabel.dataset.labelCompany || t('register.contact_name', 'Nombre del contacto'))
        : (nameLabel.dataset.labelNatural || t('register.name', 'Nombre completo'));
    }
    if (nameInput) {
      const company = isClient && isCompanyClient();
      nameInput.placeholder = company
        ? (nameInput.dataset.placeholderCompany || t('register.contact_name_placeholder', 'Quién gestiona la cuenta'))
        : (nameInput.dataset.placeholderNatural || t('register.name_placeholder', 'Tu nombre'));
    }
  }

  billingTypeInputs.forEach((input) => {
    input.addEventListener('change', syncClientBilling);
  });

  document.querySelectorAll('input[name="role"]').forEach((input) => {
    input.addEventListener('change', syncClientBilling);
  });

  if (clientRut) {
    clientRut.addEventListener('blur', () => {
      clientRut.value = clientRut.value.trim();
    });
  }

  syncClientBilling();
})();
