const DEFAULT_HEIGHT_SCALE = 30;

export function createTerrainModel({
  bounds,
  grid = null,
  heightScale = DEFAULT_HEIGHT_SCALE
} = {}) {
  const safeBounds = normalizeBounds(bounds);
  const metrics = getElevationMetrics(grid);
  const terrainConfidence = getTerrainConfidence(grid, metrics);

  function heightAt(x, z) {
    if (!grid?.heights?.length || !metrics.range) return proceduralFallbackHeight(x, z, safeBounds);
    const u = clamp((x - safeBounds.minX) / Math.max(1, safeBounds.maxX - safeBounds.minX), 0, 1);
    const v = clamp((z - safeBounds.minZ) / Math.max(1, safeBounds.maxZ - safeBounds.minZ), 0, 1);
    const rowFloat = v * (grid.rows - 1);
    const colFloat = u * (grid.cols - 1);
    const row0 = Math.floor(rowFloat);
    const col0 = Math.floor(colFloat);
    const row1 = Math.min(grid.rows - 1, row0 + 1);
    const col1 = Math.min(grid.cols - 1, col0 + 1);
    const rowT = rowFloat - row0;
    const colT = colFloat - col0;

    const h00 = grid.heights[row0]?.[col0] ?? metrics.min;
    const h10 = grid.heights[row0]?.[col1] ?? h00;
    const h01 = grid.heights[row1]?.[col0] ?? h00;
    const h11 = grid.heights[row1]?.[col1] ?? h01;
    const top = lerp(h00, h10, colT);
    const bottom = lerp(h01, h11, colT);
    return ((lerp(top, bottom, rowT) - metrics.min) / metrics.range) * heightScale;
  }

  return {
    bounds: safeBounds,
    grid,
    heightAt,
    mesh: null,
    sideSkirts: null,
    terrainConfidence,
    metrics
  };
}

export function getElevationMetrics(grid) {
  if (!grid?.heights?.length) {
    return { min: 0, max: 0, range: 0, roughness: 0 };
  }

  let min = Infinity;
  let max = -Infinity;
  let roughnessSum = 0;
  let roughnessCount = 0;
  for (let row = 0; row < grid.heights.length; row += 1) {
    for (let col = 0; col < grid.heights[row].length; col += 1) {
      const value = Number(grid.heights[row][col]) || 0;
      min = Math.min(min, value);
      max = Math.max(max, value);
      if (col > 0) {
        roughnessSum += Math.abs(value - (Number(grid.heights[row][col - 1]) || 0));
        roughnessCount += 1;
      }
      if (row > 0) {
        roughnessSum += Math.abs(value - (Number(grid.heights[row - 1][col]) || 0));
        roughnessCount += 1;
      }
    }
  }

  return {
    min,
    max,
    range: Math.max(0, max - min),
    roughness: roughnessCount ? roughnessSum / roughnessCount : 0
  };
}

function getTerrainConfidence(grid, metrics) {
  if (!grid?.heights?.length) return 'flat-fallback';
  if (grid.rows < 16 || grid.cols < 16) return 'estimated';
  if (metrics.range < 8 && metrics.roughness < 2) return 'low-relief';
  return 'sampled';
}

function proceduralFallbackHeight(x, z, bounds) {
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const depth = Math.max(1, bounds.maxZ - bounds.minZ);
  const nx = (x - bounds.minX) / width;
  const nz = (z - bounds.minZ) / depth;
  return (Math.sin(nx * Math.PI * 2) + Math.cos(nz * Math.PI * 2)) * 0.35 + 0.7;
}

function normalizeBounds(bounds = {}) {
  return {
    minX: Number.isFinite(bounds.minX) ? bounds.minX : -100,
    maxX: Number.isFinite(bounds.maxX) ? bounds.maxX : 100,
    minZ: Number.isFinite(bounds.minZ) ? bounds.minZ : -100,
    maxZ: Number.isFinite(bounds.maxZ) ? bounds.maxZ : 100
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
