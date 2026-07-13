const SANTIAGO_CENTER = { lat: -33.4489, lng: -70.6693 };

const SANTIAGO_BOUNDS = {
  latMin: -33.52, latMax: -33.38,
  lngMin: -70.72, lngMax: -70.58
};

const NOMINATIM_HEADERS = { 'User-Agent': 'FundezApp/1.0 (servicios-domicilio; contacto@soporte@fundez.cl)' };
let lastNominatimAt = 0;

function randomSantiagoCoords() {
  const lat = SANTIAGO_BOUNDS.latMin + Math.random() * (SANTIAGO_BOUNDS.latMax - SANTIAGO_BOUNDS.latMin);
  const lng = SANTIAGO_BOUNDS.lngMin + Math.random() * (SANTIAGO_BOUNDS.lngMax - SANTIAGO_BOUNDS.lngMin);
  return { lat: parseFloat(lat.toFixed(6)), lng: parseFloat(lng.toFixed(6)) };
}

async function nominatimFetch(url) {
  const now = Date.now();
  const wait = Math.max(0, 1100 - (now - lastNominatimAt));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatimAt = Date.now();

  const res = await fetch(url, { headers: NOMINATIM_HEADERS });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  return res.json();
}

function formatShortLabel(item) {
  const a = item.address || {};
  const street = a.road || a.pedestrian || a.footway || a.residential || a.street;
  const number = a.house_number;
  const line1 = street ? (number ? `${street} ${number}` : street) : null;
  const commune = a.suburb || a.city_district || a.city || a.town || a.municipality || a.village;
  const parts = [line1, commune, a.state?.replace('Región Metropolitana de ', 'RM ') || a.state]
    .filter(Boolean);
  return parts.join(', ') || item.display_name;
}

function hasStreetNumber(item) {
  const a = item?.address || {};
  if (a.house_number) return true;
  const label = item?.label || item?.display_name || '';
  return /\b\d{1,6}[A-Za-z]?\b/.test(label);
}

function mapNominatimItem(item) {
  return {
    placeId: String(item.place_id),
    label: formatShortLabel(item),
    displayName: item.display_name,
    lat: parseFloat(item.lat),
    lng: parseFloat(item.lon),
    address: item.address || null,
    type: item.type || null,
    hasStreetNumber: hasStreetNumber(item),
    found: true
  };
}

async function searchAddressSuggestions(query, { limit = 6 } = {}) {
  const q = (query || '').trim();
  if (q.length < 3) return [];

  try {
    const encoded = encodeURIComponent(`${q}, Chile`);
    const data = await nominatimFetch(
      `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=${limit}&countrycodes=cl&addressdetails=1`
    );
    if (!Array.isArray(data)) return [];

    return data
      .filter((item) => item.lat && item.lon)
      .map(mapNominatimItem)
      .filter((item) => item.label.length >= 5 && item.hasStreetNumber);
  } catch (_) {
    return [];
  }
}

async function geocodeAddress(address, { strict = false } = {}) {
  const notFound = { lat: null, lng: null, displayName: address, address: null, found: false, placeId: null };
  try {
    const query = encodeURIComponent(`${address}, Chile`);
    const data = await nominatimFetch(
      `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=cl&addressdetails=1`
    );
    if (data && data[0]) {
      const mapped = mapNominatimItem(data[0]);
      return {
        lat: mapped.lat,
        lng: mapped.lng,
        displayName: mapped.displayName,
        label: mapped.label,
        address: mapped.address,
        placeId: mapped.placeId,
        hasStreetNumber: mapped.hasStreetNumber,
        found: true
      };
    }
  } catch (_) {}

  if (strict) return notFound;
  return { ...randomSantiagoCoords(), displayName: address, address: null, found: false, placeId: null, label: address };
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

module.exports = {
  SANTIAGO_CENTER,
  geocodeAddress,
  searchAddressSuggestions,
  randomSantiagoCoords,
  haversineKm,
  formatShortLabel,
  hasStreetNumber
};
