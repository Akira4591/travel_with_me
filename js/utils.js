// js/utils.js
// Pure utility functions: no app state and no external API calls.

export function escapeHTML(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function cleanText(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function unique(arr) {
  return Array.from(new Set(arr.map(item => String(item).trim()).filter(Boolean)));
}

export function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : 0;
}

export function formatDistance(meters) {
  const value = toNumber(meters);
  if (!value) return '距离待确认';
  if (value >= 1000) {
    const km = value / 1000;
    return `${km >= 10 ? km.toFixed(0) : km.toFixed(1)} 公里`;
  }
  return `${Math.round(value)} 米`;
}

export function formatDuration(seconds) {
  const value = toNumber(seconds);
  if (!value) return '用时待确认';
  const minutes = Math.max(1, Math.round(value / 60));
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}

// Haversine distance in meters, multiplied by 1.25 to approximate road detours.
export function calculateDistance(a, b) {
  const toRad = deg => (deg * Math.PI) / 180;
  const earthRadius = 6371000;
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) * 1.25);
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value) {
  return typeof value === 'string' && ISO_DATE_RE.test(value);
}

export function formatDateCN(value) {
  if (!isISODate(value)) return String(value || '');
  const [, m, d] = value.split('-');
  return `${Number(m)}月${Number(d)}日`;
}

export function todayISO() {
  return toISO(new Date());
}

export function addDaysISO(iso, n = 1) {
  if (!isISODate(iso)) return todayISO();
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + n);
  return toISO(date);
}

function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const TRANSPORT_LABELS = {
  walking: '步行',
  transit: '公共交通',
  driving: '打车/驾车',
  riding: '骑行'
};

const TRANSPORT_ICONS = {
  walking: '🚶',
  transit: '🚌',
  driving: '🚗',
  riding: '🚲'
};

export function getTransportLabel(mode) {
  return TRANSPORT_LABELS[mode] || TRANSPORT_LABELS.driving;
}

export function getTransportIcon(mode) {
  return TRANSPORT_ICONS[mode] || TRANSPORT_ICONS.driving;
}
