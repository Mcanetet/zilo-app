const { normalizeText } = require('./chile-geo');

const SANTIAGO_CENTER = { lat: -33.4489, lng: -70.6693 };
const communeCenterCache = new Map();

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

function parseStreetAndNumber(query) {
  const trimmed = (query || '').trim();
  const match = trimmed.match(/^(.+?)\s+(\d+[A-Za-z]?)$/);
  if (!match) return null;
  return { street: match[1].trim(), number: match[2] };
}

function roadsMatch(a, b) {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

async function reverseGeocode(lat, lng) {
  try {
    const data = await nominatimFetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=18`
    );
    if (!data || !data.address) return { found: false };
    return {
      found: true,
      displayName: data.display_name,
      address: data.address,
      road: data.address.road || data.address.pedestrian || data.address.residential || null,
      commune: data.address.suburb || data.address.city_district || data.address.city || data.address.town || null
    };
  } catch (_) {
    return { found: false };
  }
}

async function searchStructuredAddress({ street, number, communeName }) {
  if (!street || !number || !communeName) return [];
  try {
    const params = new URLSearchParams({
      format: 'json',
      limit: '6',
      countrycodes: 'cl',
      addressdetails: '1',
      featuretype: 'house',
      street: `${number} ${street}`,
      city: communeName,
      country: 'Chile'
    });
    const data = await nominatimFetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
    if (!Array.isArray(data)) return [];
    return data
      .filter((item) => item.lat && item.lon)
      .map(mapNominatimItem)
      .filter((item) => item.hasStreetNumber);
  } catch (_) {
    return [];
  }
}

async function lookupPlaceById(placeId) {
  if (!placeId) return null;
  try {
    const data = await nominatimFetch(
      `https://nominatim.openstreetmap.org/lookup?osm_ids=N${placeId}&format=json&addressdetails=1`
    );
    if (!Array.isArray(data) || !data[0]) return null;
    return mapNominatimItem(data[0]);
  } catch (_) {
    return null;
  }
}

async function coordsMatchAddress({ lat, lng, geo, communeName, maxDistanceKm = 1.2 }) {
  const distKm = haversineKm(lat, lng, geo.lat, geo.lng);
  if (distKm <= maxDistanceKm) return { ok: true, distKm };

  const reverse = await reverseGeocode(lat, lng);
  if (!reverse.found) return { ok: false, distKm };

  const sameRoad = roadsMatch(reverse.road, geo.address?.road);
  const sameCommune = !communeName || roadsMatch(reverse.commune, communeName);
  if (sameRoad && sameCommune && distKm <= 2.5) return { ok: true, distKm, adjusted: true };

  return { ok: false, distKm };
}

function buildSearchQuery(query, { communeName, regionName } = {}) {
  const parts = [(query || '').trim()];
  if (communeName) parts.push(communeName);
  if (regionName) parts.push(regionName);
  parts.push('Chile');
  return parts.filter(Boolean).join(', ');
}

function withCommuneContext(address, communeName) {
  const addr = (address || '').trim();
  if (!addr || !communeName) return addr;
  const normalizedAddr = normalizeText(addr);
  const normalizedCommune = normalizeText(communeName);
  if (normalizedAddr.includes(normalizedCommune)) return addr;
  return `${addr}, ${communeName}`;
}

async function geocodeCommuneCenter(communeName, regionName = 'Región Metropolitana de Santiago') {
  const cacheKey = normalizeText(`${communeName}|${regionName}`);
  if (communeCenterCache.has(cacheKey)) return communeCenterCache.get(cacheKey);

  const fallback = { ...SANTIAGO_CENTER, found: false, label: communeName };
  try {
    const encoded = encodeURIComponent(buildSearchQuery(communeName, { regionName }));
    const data = await nominatimFetch(
      `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1&countrycodes=cl`
    );
    if (data && data[0]) {
      const result = {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        found: true,
        label: communeName
      };
      communeCenterCache.set(cacheKey, result);
      return result;
    }
  } catch (_) {}

  communeCenterCache.set(cacheKey, fallback);
  return fallback;
}

async function searchAddressSuggestions(query, { limit = 6, communeName, regionName } = {}) {
  const q = (query || '').trim();
  if (q.length < 3 || !communeName) return [];

  try {
    const parsed = parseStreetAndNumber(q);
    let results = [];
    if (parsed) {
      results = await searchStructuredAddress({
        street: parsed.street,
        number: parsed.number,
        communeName
      });
    }

    if (!results.length) {
      const encoded = encodeURIComponent(buildSearchQuery(q, {
        communeName,
        regionName: regionName || 'Región Metropolitana de Santiago'
      }));
      const data = await nominatimFetch(
        `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=${limit}&countrycodes=cl&addressdetails=1&featuretype=house`
      );
      if (Array.isArray(data)) {
        results = data
          .filter((item) => item.lat && item.lon)
          .map(mapNominatimItem)
          .filter((item) => item.label.length >= 5 && item.hasStreetNumber);
      }
    }

    return results.slice(0, limit);
  } catch (_) {
    return [];
  }
}

async function geocodeAddress(address, { strict = false, communeName } = {}) {
  const notFound = { lat: null, lng: null, displayName: address, address: null, found: false, placeId: null };
  const searchAddress = withCommuneContext(address, communeName);
  try {
    const query = encodeURIComponent(`${searchAddress}, Chile`);
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
  geocodeCommuneCenter,
  searchAddressSuggestions,
  reverseGeocode,
  coordsMatchAddress,
  lookupPlaceById,
  randomSantiagoCoords,
  haversineKm,
  formatShortLabel,
  hasStreetNumber,
  withCommuneContext,
  parseStreetAndNumber,
  roadsMatch
};
