window.ZiloMap = {
  maps: {},
  markers: {},

  _destIcon() {
    return L.divIcon({
      className: '',
      html: '<div style="width:22px;height:22px;background:#C9A962;border:3px solid white;border-radius:50%;box-shadow:0 2px 12px rgba(201,169,98,0.5)"></div>',
      iconSize: [22, 22],
      iconAnchor: [11, 11]
    });
  },

  _providerIcon() {
    return L.divIcon({
      className: '',
      html: '<div style="width:22px;height:22px;background:#6B8F71;border:3px solid white;border-radius:50%;box-shadow:0 2px 12px rgba(107,143,113,0.5)"></div>',
      iconSize: [22, 22],
      iconAnchor: [11, 11]
    });
  },

  init(container, { lat, lng, label, zoom = 14, draggable = false }) {
    if (!container || typeof L === 'undefined') return null;

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    if (isNaN(latitude) || isNaN(longitude)) return null;

    const mapId = container.id || `map-${Date.now()}`;
    container.id = mapId;

    if (this.maps[mapId]) {
      this.maps[mapId].remove();
      delete this.markers[mapId];
    }

    const map = L.map(container, {
      zoomControl: true,
      attributionControl: true,
      dragging: draggable,
      scrollWheelZoom: draggable
    }).setView([latitude, longitude], zoom);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19
    }).addTo(map);

    const marker = L.marker([latitude, longitude], { icon: this._destIcon() }).addTo(map);
    if (label) marker.bindPopup(label).openPopup();

    setTimeout(() => map.invalidateSize(), 300);
    this.maps[mapId] = map;
    this.markers[mapId] = { destination: marker };
    return map;
  },

  initTracking(container, { destLat, destLng, destLabel, providerLat, providerLng }) {
    this.init(container, { lat: destLat, lng: destLng, label: destLabel, zoom: 14 });
    const mapId = container.id;
    if (providerLat != null && providerLng != null) {
      const pm = L.marker([parseFloat(providerLat), parseFloat(providerLng)], { icon: this._providerIcon() })
        .addTo(this.maps[mapId])
        .bindPopup('Técnico en camino');
      this.markers[mapId].provider = pm;
      this.maps[mapId].fitBounds(L.latLngBounds([
        [destLat, destLng],
        [providerLat, providerLng]
      ]).pad(0.2));
    }
    return this.maps[mapId];
  },

  update(containerId, lat, lng, label) {
    const map = this.maps[containerId];
    if (!map) return;
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    map.setView([latitude, longitude], 15);
    map.eachLayer(layer => {
      if (layer instanceof L.Marker) map.removeLayer(layer);
    });
    const marker = L.marker([latitude, longitude], { icon: this._destIcon() }).addTo(map);
    if (label) marker.bindPopup(label).openPopup();
    this.markers[containerId] = { destination: marker };
  },

  updateProviderLocation(containerId, lat, lng, destLat, destLng) {
    const map = this.maps[containerId];
    if (!map || typeof L === 'undefined') return;

    const plat = parseFloat(lat);
    const plng = parseFloat(lng);
    const store = this.markers[containerId] || {};

    if (store.provider) {
      store.provider.setLatLng([plat, plng]);
    } else {
      store.provider = L.marker([plat, plng], { icon: this._providerIcon() })
        .addTo(map)
        .bindPopup('Técnico en camino');
      this.markers[containerId] = store;
    }

    if (destLat != null && destLng != null) {
      map.fitBounds(L.latLngBounds([[destLat, destLng], [plat, plng]]).pad(0.15));
    }
  }
};
