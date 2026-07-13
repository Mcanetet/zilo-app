window.FundezMap = {
  maps: {},
  markers: {},

  tileLayer: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 20
  },

  _pinHtml(color) {
    return `<svg width="32" height="42" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M16 1C9.1 1 4 6.45 4 13.4c0 8.55 11.2 20.95 11.55 21.35a1.2 1.2 0 0 0 1.7 0C17.6 34.35 28 22.15 28 13.4 28 6.45 22.9 1 16 1Z" fill="${color}" stroke="#FFFFFF" stroke-width="2.5"/>
      <circle cx="16" cy="13.5" r="5" fill="#FFFFFF"/>
    </svg>`;
  },

  _destIcon() {
    return L.divIcon({
      className: 'fundez-map-pin',
      html: this._pinHtml('#2563EB'),
      iconSize: [32, 42],
      iconAnchor: [16, 42],
      popupAnchor: [0, -38]
    });
  },

  _providerIcon() {
    return L.divIcon({
      className: 'fundez-map-pin',
      html: this._pinHtml('#6B8F71'),
      iconSize: [32, 42],
      iconAnchor: [16, 42],
      popupAnchor: [0, -38]
    });
  },

  _bindMarkerDrag(marker, mapId, onMarkerDrag) {
    marker.off('dragend');
    if (!onMarkerDrag) return;
    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      onMarkerDrag(pos.lat, pos.lng, mapId);
    });
  },

  init(container, {
    lat,
    lng,
    label,
    zoom = 14,
    interactive = true,
    markerDraggable = false,
    onMarkerDrag
  } = {}) {
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
      dragging: interactive,
      scrollWheelZoom: interactive,
      touchZoom: interactive,
      doubleClickZoom: interactive
    }).setView([latitude, longitude], zoom);

    L.tileLayer(this.tileLayer.url, {
      attribution: this.tileLayer.attribution,
      subdomains: this.tileLayer.subdomains,
      maxZoom: this.tileLayer.maxZoom,
      detectRetina: true
    }).addTo(map);

    const marker = L.marker([latitude, longitude], {
      icon: this._destIcon(),
      draggable: markerDraggable
    }).addTo(map);
    if (label) marker.bindPopup(label);
    this._bindMarkerDrag(marker, mapId, onMarkerDrag);

    setTimeout(() => map.invalidateSize(), 300);
    setTimeout(() => map.invalidateSize(), 800);
    this.maps[mapId] = map;
    this.markers[mapId] = { destination: marker, onMarkerDrag };
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

  update(containerId, lat, lng, label, {
    zoom = 17,
    markerDraggable = false,
    onMarkerDrag
  } = {}) {
    const map = this.maps[containerId];
    if (!map) return;
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    map.setView([latitude, longitude], zoom);
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker) map.removeLayer(layer);
    });
    const marker = L.marker([latitude, longitude], {
      icon: this._destIcon(),
      draggable: markerDraggable
    }).addTo(map);
    if (label) marker.bindPopup(label).openPopup();
    this._bindMarkerDrag(marker, containerId, onMarkerDrag);
    const store = this.markers[containerId] || {};
    store.destination = marker;
    store.onMarkerDrag = onMarkerDrag;
    this.markers[containerId] = store;
    setTimeout(() => map.invalidateSize(), 100);
  },

  setMarkerDraggable(containerId, draggable, onMarkerDrag) {
    const store = this.markers[containerId];
    if (!store?.destination) return;
    store.destination.dragging[draggable ? 'enable' : 'disable']();
    store.onMarkerDrag = onMarkerDrag || store.onMarkerDrag;
    this._bindMarkerDrag(store.destination, containerId, store.onMarkerDrag);
  },

  enableMapPick(containerId, onPick, { draggable = true, onMarkerDrag } = {}) {
    const map = this.maps[containerId];
    if (!map) return;
    map.off('click.mapPick');
    map.on('click.mapPick', (event) => {
      const { lat, lng } = event.latlng;
      const store = this.markers[containerId] || {};
      const label = store.destination?.getPopup?.()?.getContent?.() || '';
      this.update(containerId, lat, lng, label, {
        zoom: Math.max(map.getZoom(), 18),
        markerDraggable: draggable,
        onMarkerDrag: onMarkerDrag || store.onMarkerDrag
      });
      if (onPick) onPick(lat, lng);
    });
  },

  disableMapPick(containerId) {
    const map = this.maps[containerId];
    if (!map) return;
    map.off('click.mapPick');
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
