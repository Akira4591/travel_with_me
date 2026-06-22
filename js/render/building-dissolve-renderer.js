const BUILDING_DETAIL_NEAR_DISTANCE = 260;
const BUILDING_DETAIL_FAR_DISTANCE = 760;
const BUILDING_DETAIL_HYSTERESIS_DISTANCE = 18;
const DETAIL_HOLD_ALPHA = 0.5;
const MASSING_HOLD_ALPHA = 0.35;

export function updateBuildingLod(diorama) {
  if (!diorama?.buildingLodEntries?.length || !diorama.camera) return;
  const buildingReveal = clamp(diorama.buildingRevealProgress ?? 1, 0, 1);
  const buildingDissolve = clamp(diorama.buildingDissolveProgress ?? 1, 0, 1);
  let detailCount = 0;
  let detailAlphaTotal = 0;
  const instancedLowMaterials = new Map();
  const distances = [];
  for (const entry of diorama.buildingLodEntries) {
    const distance = diorama.camera.position.distanceTo(entry.center);
    distances.push(distance);
    const target =
      getBuildingDetailAlphaWithHysteresis(distance, entry.detailAlpha) * buildingDissolve;
    entry.detailAlpha += (target - entry.detailAlpha) * 0.14;
    const detailAlpha = clamp(entry.detailAlpha, 0, 1);
    const lowAlpha = 1 - detailAlpha * 0.72;
    detailAlphaTotal += detailAlpha;

    if (entry.lowInstanced) {
      const bucket = instancedLowMaterials.get(entry.lowMaterial) || { total: 0, count: 0 };
      bucket.total += lowAlpha;
      bucket.count += 1;
      instancedLowMaterials.set(entry.lowMaterial, bucket);
    } else {
      entry.lowMaterial.opacity = lowAlpha * buildingReveal;
      entry.lowMaterial.depthWrite = lowAlpha * buildingReveal > 0.98;
    }
    entry.detail.visible = detailAlpha > 0.015 && buildingReveal > 0.015;
    if (detailAlpha >= 0.5) detailCount += 1;
    entry.detail.scale.y = 0.74 + detailAlpha * 0.26;
    entry.detail.position.y = (1 - detailAlpha) * -1.2;
    entry.detailMaterials.forEach(material => {
      material.opacity = detailAlpha * buildingReveal;
      material.depthWrite = detailAlpha * buildingReveal > 0.98;
    });
  }
  for (const [material, bucket] of instancedLowMaterials.entries()) {
    const lowAlpha = bucket.count > 0 ? bucket.total / bucket.count : 1;
    material.opacity = lowAlpha * buildingReveal;
    material.depthWrite = lowAlpha * buildingReveal > 0.98;
  }
  diorama.buildingDetailCount = detailCount;
  const total = diorama.buildingLodEntries.length;
  diorama.buildingGroup.userData.lodMetrics = {
    detailRatio: roundMetric(total > 0 ? detailCount / total : 0),
    detailAlphaAverage: roundMetric(total > 0 ? detailAlphaTotal / total : 0),
    distanceP50: roundMetric(percentile(distances, 0.5)),
    entryCount: total
  };
  diorama.container.dataset.buildingDetailCount = String(detailCount);
  diorama.container.dataset.buildingDetailRatio = String(
    diorama.buildingGroup.userData.lodMetrics.detailRatio
  );
}

export function didBuildingLodSignatureChange(diorama) {
  const metrics = diorama?.buildingGroup?.userData?.lodMetrics;
  if (!metrics) return false;
  const signature = [
    diorama.buildingDetailCount,
    metrics.detailRatio,
    metrics.detailAlphaAverage,
    metrics.distanceP50
  ].join(':');
  if (signature === diorama._lastPublishedBuildingLodSignature) return false;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (now - (diorama._lastPublishedBuildingLodAt || 0) < 120) return false;
  diorama._lastPublishedBuildingLodSignature = signature;
  diorama._lastPublishedBuildingLodAt = now;
  return true;
}

export function getBuildingDetailAlpha(distance) {
  const normalized =
    (Number(distance) - BUILDING_DETAIL_NEAR_DISTANCE) /
    (BUILDING_DETAIL_FAR_DISTANCE - BUILDING_DETAIL_NEAR_DISTANCE);
  const farProgress = smoothstep(clamp(normalized, 0, 1));
  return 1 - farProgress;
}

export function getBuildingDetailAlphaWithHysteresis(distance, previousAlpha = 0) {
  const alpha = Number(previousAlpha);
  const distanceBias =
    alpha >= DETAIL_HOLD_ALPHA
      ? -BUILDING_DETAIL_HYSTERESIS_DISTANCE
      : alpha <= MASSING_HOLD_ALPHA
        ? BUILDING_DETAIL_HYSTERESIS_DISTANCE
        : 0;
  return getBuildingDetailAlpha(Number(distance) + distanceBias);
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function percentile(values, ratio) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1);
  return roundMetric(sorted[index]);
}

function roundMetric(value) {
  return Number((Number(value) || 0).toFixed(3));
}
