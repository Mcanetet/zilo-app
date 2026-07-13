function cleanRut(rut) {
  return String(rut || '').replace(/[^0-9kK]/g, '').toUpperCase();
}

function formatRut(rut) {
  const cleaned = cleanRut(rut);
  if (cleaned.length < 2) return String(rut || '').trim();
  const body = cleaned.slice(0, -1);
  const dv = cleaned.slice(-1);
  const withDots = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${withDots}-${dv}`;
}

function validateRut(rut) {
  const cleaned = cleanRut(rut);
  if (cleaned.length < 2) return false;

  const body = cleaned.slice(0, -1);
  const dv = cleaned.slice(-1);
  if (!/^\d+$/.test(body) || body.length < 7 || body.length > 8) return false;

  let sum = 0;
  let multiplier = 2;
  for (let i = body.length - 1; i >= 0; i -= 1) {
    sum += parseInt(body[i], 10) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const mod = 11 - (sum % 11);
  const expected = mod === 11 ? '0' : mod === 10 ? 'K' : String(mod);
  return dv === expected;
}

function parseRut(rut) {
  const cleaned = cleanRut(rut);
  if (!validateRut(cleaned)) {
    return { valid: false, formatted: formatRut(cleaned), clean: cleaned };
  }
  return { valid: true, formatted: formatRut(cleaned), clean: cleaned };
}

module.exports = {
  cleanRut,
  formatRut,
  validateRut,
  parseRut
};
