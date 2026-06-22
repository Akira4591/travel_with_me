const ALLOWED_CONTENT_TYPES = new Set(['model/gltf-binary', 'model/gltf+json']);
const ALLOWED_PROTOCOLS = new Set(['fixture:', 'https:']);
const MAX_MODEL_BYTES = 8 * 1024 * 1024;
const MAX_TEXTURE_BYTES = 16 * 1024 * 1024;
const MAX_TRIANGLES = 60_000;
const MAX_MATERIALS = 32;
const MAX_FOOTPRINT_DRIFT_METERS = 5;
const REQUIRED_LOD_LEVELS = new Set(['LOD1', 'placeholder']);

export function validateLandmarkAsset(landmark = {}) {
  const errors = [];
  const warnings = [];
  const modelUrl = String(landmark.modelUrl || '').trim();
  const asset = landmark.asset && typeof landmark.asset === 'object' ? landmark.asset : {};
  const sourceFormat = String(asset.sourceFormat || '').trim();
  const contentType = String(asset.contentType || '').trim();
  const byteSize = Number(asset.byteSize || 0);
  const textureBytes = Number(asset.textureBytes || 0);
  const triangleCount = Number(asset.triangleCount || 0);
  const materialCount = Number(asset.materialCount || 0);
  const footprintDriftMeters = Number(asset.footprintDriftMeters || 0);
  const lods = normalizeLods(asset.lods);

  validateModelUrl(modelUrl, errors);
  if (!sourceFormat) errors.push('LANDMARK_SOURCE_FORMAT_MISSING');
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) errors.push(`LANDMARK_CONTENT_TYPE:${contentType}`);
  if (!isPositiveWithin(byteSize, MAX_MODEL_BYTES)) errors.push(`LANDMARK_SIZE:${byteSize}`);
  if (!isPositiveWithin(triangleCount, MAX_TRIANGLES)) {
    errors.push(`LANDMARK_TRIANGLE_BUDGET:${triangleCount}`);
  }
  if (!isPositiveWithin(materialCount, MAX_MATERIALS)) {
    errors.push(`LANDMARK_MATERIAL_BUDGET:${materialCount}`);
  }
  if (textureBytes < 0 || textureBytes > MAX_TEXTURE_BYTES) {
    errors.push(`LANDMARK_TEXTURE_BUDGET:${textureBytes}`);
  }
  if (!Number.isFinite(footprintDriftMeters) || footprintDriftMeters > MAX_FOOTPRINT_DRIFT_METERS) {
    errors.push(`LANDMARK_FOOTPRINT_DRIFT:${footprintDriftMeters}`);
  }
  if (asset.optimized !== true) errors.push('LANDMARK_NOT_OPTIMIZED');
  if (!isSha256Integrity(asset.integrity)) errors.push('LANDMARK_INTEGRITY_MISSING');
  if (!Array.isArray(asset.lods) || asset.lods.length === 0) {
    errors.push('LANDMARK_LODS_MISSING');
  }

  const levels = new Set(lods.map(lod => lod.level));
  for (const required of REQUIRED_LOD_LEVELS) {
    if (!levels.has(required)) errors.push(`LANDMARK_LOD_MISSING:${required}`);
  }
  for (const lod of lods) {
    validateModelUrl(lod.modelUrl, errors, `LANDMARK_LOD_URL:${lod.level}`);
    if (!isSha256Integrity(lod.integrity)) errors.push(`LANDMARK_LOD_INTEGRITY:${lod.level}`);
    if (!isPositiveWithin(lod.byteSize, MAX_MODEL_BYTES)) {
      errors.push(`LANDMARK_LOD_SIZE:${lod.level}:${lod.byteSize}`);
    }
    if (!isPositiveWithin(lod.triangleCount, MAX_TRIANGLES)) {
      errors.push(`LANDMARK_LOD_TRIANGLES:${lod.level}:${lod.triangleCount}`);
    }
  }
  if (!levels.has('LOD2')) warnings.push('LANDMARK_LOD2_RECOMMENDED');

  return {
    passed: errors.length === 0,
    errors: uniqueStrings(errors),
    warnings: uniqueStrings(warnings),
    policy: {
      maxModelBytes: MAX_MODEL_BYTES,
      maxTextureBytes: MAX_TEXTURE_BYTES,
      maxTriangles: MAX_TRIANGLES,
      maxMaterials: MAX_MATERIALS,
      maxFootprintDriftMeters: MAX_FOOTPRINT_DRIFT_METERS,
      requiredLodLevels: [...REQUIRED_LOD_LEVELS]
    },
    normalizedAsset: {
      sourceFormat,
      contentType,
      byteSize,
      textureBytes,
      triangleCount,
      materialCount,
      footprintDriftMeters,
      optimized: asset.optimized === true,
      integrity: String(asset.integrity || '').trim(),
      lods
    }
  };
}

function validateModelUrl(modelUrl, errors, code = 'LANDMARK_MODEL_URL') {
  if (!modelUrl) {
    errors.push(`${code}:MISSING`);
    return;
  }
  try {
    const url = new URL(modelUrl);
    if (!ALLOWED_PROTOCOLS.has(url.protocol)) errors.push(`${code}:PROTOCOL:${url.protocol}`);
    if (url.protocol === 'https:' && !url.hostname.endsWith('.travel-with-me.example')) {
      errors.push(`${code}:HOST:${url.hostname}`);
    }
  } catch {
    errors.push(`${code}:INVALID`);
  }
}

function normalizeLods(lods) {
  return (Array.isArray(lods) ? lods : []).map(item => ({
    level: String(item?.level || '').trim(),
    modelUrl: String(item?.modelUrl || '').trim(),
    byteSize: Number(item?.byteSize || 0),
    triangleCount: Number(item?.triangleCount || 0),
    integrity: String(item?.integrity || '').trim()
  }));
}

function isPositiveWithin(value, max) {
  return Number.isFinite(value) && value > 0 && value <= max;
}

function isSha256Integrity(value) {
  return /^sha256-[A-Za-z0-9+/=_-]{16,}$/.test(String(value || '').trim());
}

function uniqueStrings(items) {
  return [...new Set(items.map(item => String(item)).filter(Boolean))];
}
