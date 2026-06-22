export function createFoundationMetrics(bounds) {
  const span = getBoundsSpan(bounds);
  return {
    span,
    centerX: (bounds.minX + bounds.maxX) / 2,
    centerZ: (bounds.minZ + bounds.maxZ) / 2,
    liftTarget: span
  };
}

function getBoundsSpan(bounds) {
  return Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ, 1);
}
