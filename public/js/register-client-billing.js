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

  function t(key) {
    return typeof FundezI18n !== 'undefined' ? FundezI18n.t(key) : key;
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
      nameLabel.textContent = isClient && isCompanyClient()
        ? t('register.contact_name')
        : t('register.name');
    }
    if (nameInput) {
      nameInput.placeholder = isClient && isCompanyClient()
        ? t('register.contact_name_placeholder')
        : t('register.name_placeholder');
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
