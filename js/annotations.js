const DEFAULT_TYPE = 'note';
const MAX_TITLE_LENGTH = 80;
const MAX_NOTE_LENGTH = 240;

export const ANNOTATION_TYPES = Object.freeze([
  createType('entrance', '\u5165\u53e3', '#E6AD00'),
  createType('viewpoint', '\u89c2\u666f', '#7D9A6D'),
  createType('supply', '\u8865\u7ed9', '#B77855'),
  createType('transfer', '\u4ea4\u901a', '#6E8FA8'),
  createType('risk', '\u98ce\u9669', '#B75B5B'),
  createType('note', '\u5907\u6ce8', '#9E9685')
]);

const TYPE_BY_ID = new Map(ANNOTATION_TYPES.map(type => [type.id, type]));
export const ANNOTATION_TYPE_IDS = new Set(TYPE_BY_ID.keys());

export function getAnnotationType(typeId) {
  return TYPE_BY_ID.get(normalizeAnnotationType(typeId)) || TYPE_BY_ID.get(DEFAULT_TYPE);
}

export function normalizeAnnotationType(typeId) {
  const id = String(typeId || '').trim();
  return TYPE_BY_ID.has(id) ? id : DEFAULT_TYPE;
}

export function normalizeAnnotation(input = {}, fallback = {}) {
  const lnglat = normalizeLngLat(input.lnglat);
  if (!lnglat) return null;

  const type = getAnnotationType(input.type);
  const id = String(input.id || fallback.id || '').trim();
  const createdAt = normalizeCreatedAt(input.createdAt || fallback.createdAt);
  const title = trimText(input.title, MAX_TITLE_LENGTH) || type.label;
  const note = trimText(input.note, MAX_NOTE_LENGTH);
  const elevation = Number.isFinite(Number(input.elevation)) ? Number(input.elevation) : null;

  return {
    id,
    type: type.id,
    lnglat,
    elevation,
    title,
    note,
    createdAt
  };
}

function createType(id, label, color) {
  return Object.freeze({ id, label, color });
}

function normalizeLngLat(value) {
  if (!Array.isArray(value) || value.length < 2) return null;
  const lng = Number(value[0]);
  const lat = Number(value[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;
  return [lng, lat];
}

function normalizeCreatedAt(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function trimText(value, maxLength) {
  return String(value || '')
    .trim()
    .slice(0, maxLength);
}
