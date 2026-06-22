export function applyTerrainCarving(terrainModel, proj, waterways = []) {
  const masks = buildWaterCarveMasks(proj, waterways);
  if (!masks.length) {
    terrainModel.carving = { waterwayCount: 0, maxDepth: 0, depthP50Meters: 0 };
    return terrainModel;
  }

  const baseHeightAt = terrainModel.heightAt;
  const baseSampleHeight = terrainModel.sampleHeight || baseHeightAt;
  const baseFoundationAt = terrainModel.foundationAt;

  function carveOffset(x, z) {
    let deepest = 0;
    for (const mask of masks) {
      deepest = Math.max(deepest, mask.depth * mask.strengthAt(x, z));
    }
    return deepest;
  }

  terrainModel.heightAt = (x, z) => baseHeightAt(x, z) - carveOffset(x, z);
  terrainModel.sampleHeight = (x, z) => baseSampleHeight(x, z) - carveOffset(x, z);
  terrainModel.foundationAt = (x, z) => baseFoundationAt(x, z);
  terrainModel.carving = {
    waterwayCount: masks.length,
    maxDepth: Math.max(...masks.map(mask => mask.depth)),
    depthP50Meters: percentile(
      masks.map(mask => unitsToMeters(proj, mask.depth)),
      0.5
    )
  };
  return terrainModel;
}

export function buildWaterCarveMasks(proj, waterways = []) {
  return (Array.isArray(waterways) ? waterways : [])
    .map(waterway => createWaterCarveMask(proj, waterway))
    .filter(Boolean);
}

function createWaterCarveMask(proj, waterway) {
  const rawWidthMeters = Number(waterway?.widthMeters);
  const hasProviderWidth = Number.isFinite(rawWidthMeters) && rawWidthMeters > 0;
  const width = Math.max(0.01, proj.metersToUnits(hasProviderWidth ? rawWidthMeters : 12));
  const depth = clamp(width * 0.12, 0.45, 5.5);

  if (Array.isArray(waterway?.polygon) && waterway.polygon.length >= 3) {
    const polygon = waterway.polygon.map(lnglat => proj.toScene(lnglat));
    return {
      depth,
      strengthAt(x, z) {
        if (!pointInPolygon({ x, z }, polygon)) return 0;
        const edgeDistance = distanceToPolyline({ x, z }, [...polygon, polygon[0]]);
        return smoothstep(0, width * 0.35, edgeDistance);
      }
    };
  }

  if (hasProviderWidth && Array.isArray(waterway?.centerline) && waterway.centerline.length >= 2) {
    const line = waterway.centerline.map(lnglat => proj.toScene(lnglat));
    const radius = width / 2;
    return {
      depth,
      strengthAt(x, z) {
        const distance = distanceToPolyline({ x, z }, line);
        if (distance >= radius) return 0;
        return 1 - smoothstep(radius * 0.45, radius, distance);
      }
    };
  }

  return null;
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index];
    const b = polygon[previous];
    const intersects =
      a.z > point.z !== b.z > point.z &&
      point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z || 1e-9) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function distanceToPolyline(point, line) {
  let best = Infinity;
  for (let index = 0; index < line.length - 1; index += 1) {
    best = Math.min(best, distanceToSegment(point, line[index], line[index + 1]));
  }
  return best;
}

function distanceToSegment(point, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq <= 1e-9) return Math.hypot(point.x - a.x, point.z - a.z);
  const t = clamp(((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSq, 0, 1);
  const x = a.x + dx * t;
  const z = a.z + dz * t;
  return Math.hypot(point.x - x, point.z - z);
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / Math.max(edge1 - edge0, 1e-9), 0, 1);
  return t * t * (3 - 2 * t);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function percentile(values, ratio) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1);
  return Number(sorted[index].toFixed(3));
}

function unitsToMeters(proj, value) {
  return typeof proj?.unitsToMeters === 'function' ? proj.unitsToMeters(value) : value;
}
