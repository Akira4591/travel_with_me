export function createFallbackAMap() {
  return {
    __fallback: true,
    Map: FallbackMap,
    Marker: FallbackMarker,
    Polyline: FallbackPolyline,
    InfoWindow: FallbackInfoWindow,
    Pixel: FallbackPixel,
    LngLat: FallbackLngLat,
    ToolBar: class FallbackToolBar {},
    Geocoder: FallbackGeocoder,
    PlaceSearch: FallbackPlaceSearch,
    DrivingPolicy: { LEAST_TIME: 0 },
    TransferPolicy: { LEAST_TIME: 0 }
  };
}

class FallbackMap {
  constructor(id, options = {}) {
    this.container = typeof id === 'string' ? document.getElementById(id) : id;
    this.center = normalizeLngLat(options.center) || [116.397, 39.908];
    this.zoom = Number(options.zoom) || 11;
    this.overlays = new Set();
    this.handlers = new Map();
    this.bounds = null;

    this.root = document.createElement('div');
    this.root.className = 'fallback-map';
    this.root.innerHTML = `
      <div class="fallback-map-grid"></div>
      <svg class="fallback-map-routes" aria-hidden="true"></svg>
      <div class="fallback-map-markers"></div>
      <div class="fallback-map-badge">本地 2D 路线视图</div>
    `;
    this.svg = this.root.querySelector('.fallback-map-routes');
    this.markerLayer = this.root.querySelector('.fallback-map-markers');
    this.container.replaceChildren(this.root);
    this.resize();
  }

  addControl() {}

  add(overlay) {
    if (Array.isArray(overlay)) {
      overlay.forEach(item => this.add(item));
      return;
    }
    if (!overlay) return;
    this.overlays.add(overlay);
    overlay.attachTo?.(this);
    this.updateBounds();
    this.render();
  }

  remove(overlay) {
    if (!overlay) return;
    this.overlays.delete(overlay);
    overlay.detach?.();
    this.updateBounds();
    this.render();
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    this.width = Math.max(1, Math.round(rect.width || this.container.clientWidth || 800));
    this.height = Math.max(1, Math.round(rect.height || this.container.clientHeight || 600));
    this.svg.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`);
    this.render();
  }

  on(event, handler) {
    const handlers = this.handlers.get(event) || [];
    handlers.push(handler);
    this.handlers.set(event, handlers);
  }

  emit(event) {
    (this.handlers.get(event) || []).forEach(handler => handler());
  }

  getZoom() {
    return this.zoom;
  }

  getCenter() {
    return new FallbackLngLat(this.center[0], this.center[1]);
  }

  setZoomAndCenter(zoom, center) {
    this.zoom = Number(zoom) || this.zoom;
    this.center = normalizeLngLat(center) || this.center;
    this.render();
    this.emit('zoomchange');
    this.emit('zoomend');
  }

  setFitView(markers = [], _immediately = true, _padding = [], maxZoom = 17) {
    const points = markers.map(marker => normalizeLngLat(marker.getPosition?.())).filter(Boolean);
    if (!points.length) return;
    this.bounds = createBounds(points);
    this.center = [
      (this.bounds.minLng + this.bounds.maxLng) / 2,
      (this.bounds.minLat + this.bounds.maxLat) / 2
    ];
    this.zoom = Math.min(maxZoom || 17, Math.max(11, 17 - Math.log2(Math.max(points.length, 1))));
    this.render();
    this.emit('zoomchange');
    this.emit('zoomend');
  }

  project(lnglat) {
    const point = normalizeLngLat(lnglat) || this.center;
    const bounds = this.bounds || createBounds([this.center, point]);
    const lngSpan = Math.max(0.002, bounds.maxLng - bounds.minLng);
    const latSpan = Math.max(0.002, bounds.maxLat - bounds.minLat);
    const pad = 72;
    const x = pad + ((point[0] - bounds.minLng) / lngSpan) * Math.max(1, this.width - pad * 2);
    const y = pad + ((bounds.maxLat - point[1]) / latSpan) * Math.max(1, this.height - pad * 2);
    return [x, y];
  }

  updateBounds() {
    const points = [];
    for (const overlay of this.overlays) {
      const overlayPoints = overlay.getLngLats?.();
      if (Array.isArray(overlayPoints)) points.push(...overlayPoints);
    }
    if (points.length) this.bounds = createBounds(points);
  }

  render() {
    for (const overlay of this.overlays) overlay.render?.();
  }
}

class FallbackMarker {
  constructor(options = {}) {
    this.position = normalizeLngLat(options.position) || [116.397, 39.908];
    this.content = options.content || document.createElement('div');
    this.offset = options.offset || new FallbackPixel(0, 0);
    this.visible = true;
    this.handlers = new Map();
    this.element = document.createElement('button');
    this.element.type = 'button';
    this.element.className = 'fallback-marker-wrap';
    this.element.appendChild(this.content);
    this.element.addEventListener('click', event => {
      event.stopPropagation();
      this.handlers.get('click')?.({ target: this });
    });
  }

  attachTo(map) {
    this.map = map;
    map.markerLayer.appendChild(this.element);
    this.render();
  }

  detach() {
    this.element.remove();
    this.map = null;
  }

  getLngLats() {
    return [this.position];
  }

  setPosition(position) {
    this.position = normalizeLngLat(position) || this.position;
    this.render();
  }

  getPosition() {
    return new FallbackLngLat(this.position[0], this.position[1]);
  }

  on(event, handler) {
    this.handlers.set(event, handler);
  }

  show() {
    this.visible = true;
    this.render();
  }

  hide() {
    this.visible = false;
    this.render();
  }

  render() {
    if (!this.map) return;
    const [x, y] = this.map.project(this.position);
    this.element.style.transform = `translate(${x + this.offset.x}px, ${y + this.offset.y}px)`;
    this.element.hidden = !this.visible;
  }
}

class FallbackPolyline {
  constructor(options = {}) {
    this.path = normalizePath(options.path);
    this.options = { ...options };
    this.element = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    this.element.setAttribute('fill', 'none');
    this.element.setAttribute('stroke-linecap', 'round');
    this.element.setAttribute('stroke-linejoin', 'round');
  }

  attachTo(map) {
    this.map = map;
    map.svg.appendChild(this.element);
    this.render();
  }

  detach() {
    this.element.remove();
    this.map = null;
  }

  getLngLats() {
    return this.path;
  }

  getPath() {
    return this.path;
  }

  setOptions(options = {}) {
    this.options = { ...this.options, ...options };
    if (options.path) this.path = normalizePath(options.path);
    this.render();
  }

  show() {
    this.element.hidden = false;
  }

  hide() {
    this.element.hidden = true;
  }

  render() {
    if (!this.map) return;
    const points = this.path.map(point => this.map.project(point).join(',')).join(' ');
    this.element.setAttribute('points', points);
    this.element.setAttribute('stroke', this.options.strokeColor || '#d99a00');
    this.element.setAttribute('stroke-opacity', String(this.options.strokeOpacity ?? 0.95));
    this.element.setAttribute('stroke-width', String(this.options.strokeWeight || 5));
    if (this.options.strokeStyle === 'dashed') this.element.setAttribute('stroke-dasharray', '8 8');
    else this.element.removeAttribute('stroke-dasharray');
  }
}

class FallbackInfoWindow {
  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'fallback-info-window';
  }

  setContent(content) {
    this.element.innerHTML = content;
  }

  open(map, position) {
    if (!this.element.parentElement) map.root.appendChild(this.element);
    const [x, y] = map.project(position);
    this.element.style.transform = `translate(${x + 12}px, ${y - 18}px)`;
    this.element.hidden = false;
  }

  close() {
    this.element.hidden = true;
  }
}

class FallbackPixel {
  constructor(x = 0, y = 0) {
    this.x = Number(x) || 0;
    this.y = Number(y) || 0;
  }
}

class FallbackLngLat {
  constructor(lng, lat) {
    this.lng = Number(lng);
    this.lat = Number(lat);
  }

  getLng() {
    return this.lng;
  }

  getLat() {
    return this.lat;
  }
}

class FallbackGeocoder {
  getLocation(_keyword, callback) {
    callback('error', { geocodes: [] });
  }

  getAddress(_lnglat, callback) {
    callback('error', null);
  }
}

class FallbackPlaceSearch {
  search(_keyword, callback) {
    callback('error', { poiList: { pois: [] } });
  }

  searchNearBy(_keyword, _center, _radius, callback) {
    callback('error', { poiList: { pois: [] } });
  }
}

function normalizeLngLat(value) {
  if (Array.isArray(value)) return [Number(value[0]), Number(value[1])];
  if (value && typeof value.getLng === 'function')
    return [Number(value.getLng()), Number(value.getLat())];
  if (value && Number.isFinite(Number(value.lng)) && Number.isFinite(Number(value.lat))) {
    return [Number(value.lng), Number(value.lat)];
  }
  return null;
}

function normalizePath(path = []) {
  return (Array.isArray(path) ? path : []).map(normalizeLngLat).filter(Boolean);
}

function createBounds(points) {
  const lngs = points.map(point => point[0]);
  const lats = points.map(point => point[1]);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const lngPad = Math.max(0.001, (maxLng - minLng) * 0.2);
  const latPad = Math.max(0.001, (maxLat - minLat) * 0.2);
  return {
    minLng: minLng - lngPad,
    maxLng: maxLng + lngPad,
    minLat: minLat - latPad,
    maxLat: maxLat + latPad
  };
}
