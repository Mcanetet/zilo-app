const SANTIAGO_CENTER = { lat: -33.4489, lng: -70.6693 };

const SANTIAGO_BOUNDS = {
  latMin: -33.52, latMax: -33.38,
  lngMin: -70.72, lngMax: -70.58
};

function randomSantiagoCoords() {
  const lat = SANTIAGO_BOUNDS.latMin + Math.random() * (SANTIAGO_BOUNDS.latMax - SANTIAGO_BOUNDS.latMin);
  const lng = SANTIAGO_BOUNDS.lngMin + Math.random() * (SANTIAGO_BOUNDS.lngMax - SANTIAGO_BOUNDS.lngMin);
  return { lat: parseFloat(lat.toFixed(6)), lng: parseFloat(lng.toFixed(6)) };
}

async function geocodeAddress(address) {
  try {
    const query = encodeURIComponent(`${address}, Santiago, Región Metropolitana, Chile`);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=cl`,
      { headers: { 'User-Agent': 'FundezApp/1.0 (servicios-domicilio)' } }
    );
    const data = await res.json();
    if (data && data[0]) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        displayName: data[0].display_name
      };
    }
  } catch (_) {}
  return { ...randomSantiagoCoords(), displayName: address };
}

module.exports = { SANTIAGO_CENTER, geocodeAddress, randomSantiagoCoords };
