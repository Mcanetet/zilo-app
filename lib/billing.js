const { validateRut, formatRut } = require('./rut');

function normalizeBilling(raw) {
  const type = raw?.type === 'empresa' ? 'empresa' : 'natural';
  const rutRaw = String(raw?.rut || '').trim();
  return {
    type,
    rut: rutRaw ? formatRut(rutRaw) : '',
    legalName: String(raw?.legalName || '').trim(),
    giro: String(raw?.giro || '').trim(),
    fiscalAddress: String(raw?.fiscalAddress || '').trim(),
    invoiceEmail: String(raw?.invoiceEmail || '').trim().toLowerCase()
  };
}

function validateBilling(billing) {
  const b = normalizeBilling(billing);
  const errors = [];

  if (!b.rut) errors.push('Ingresa el RUT');
  else if (!validateRut(b.rut)) errors.push('El RUT no es válido');
  if (!b.legalName) {
    errors.push(b.type === 'empresa' ? 'Ingresa la razón social' : 'Ingresa el nombre para facturar');
  }
  if (b.type === 'empresa' && !b.giro) errors.push('Ingresa el giro comercial');
  if (!b.fiscalAddress) errors.push('Ingresa la dirección fiscal');
  if (!b.invoiceEmail) {
    errors.push('Ingresa el email de facturación');
  } else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.invoiceEmail)) {
    errors.push('El email de facturación no es válido');
  }

  return { ok: errors.length === 0, errors, billing: b };
}

function getBillingLabel(billing) {
  const b = normalizeBilling(billing);
  if (!b.legalName) return null;
  return b.type === 'empresa' ? `${b.legalName} (${b.rut})` : `${b.legalName} · ${b.rut}`;
}

function createBillingSnapshot(billing) {
  const result = validateBilling(billing);
  if (!result.ok) return null;
  return {
    ...result.billing,
    label: getBillingLabel(result.billing),
    capturedAt: new Date().toISOString()
  };
}

module.exports = {
  normalizeBilling,
  validateBilling,
  getBillingLabel,
  createBillingSnapshot
};
