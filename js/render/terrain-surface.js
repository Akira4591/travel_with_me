import * as THREE from 'three';

export const ROUTE_LIFT = 8;
export const SURFACE_BASE_LIFT = 0.045;

export function registerGroundRevealMesh(mesh, terrainModel, foundationLift) {
  const positions = mesh.geometry?.attributes?.position;
  if (!positions) return;
  const restHeights = Float32Array.from({ length: positions.count }, (_, index) =>
    positions.getY(index)
  );
  const foundationHeights = Float32Array.from(
    { length: positions.count },
    (_, index) =>
      terrainModel.foundationAt(positions.getX(index), positions.getZ(index)) + foundationLift
  );
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  mesh.userData.surfaceReveal = {
    restHeights,
    foundationHeights,
    restOpacity: Number.isFinite(material?.opacity) ? material.opacity : 1
  };
}

export function buildTerrainRoutePointsFromLngLat(path, proj, terrainModel) {
  return path
    .map(point => {
      const lnglat = [Number(point[0]), Number(point[1])];
      if (!Number.isFinite(lnglat[0]) || !Number.isFinite(lnglat[1])) return null;
      const { x, z } = proj.toScene(lnglat);
      return new THREE.Vector3(x, terrainModel.heightAt(x, z) + ROUTE_LIFT, z);
    })
    .filter(Boolean);
}

export function buildFallbackTerrainRoutePoints(from, to, terrainModel, sampleCount = 24) {
  const points = [];
  const count = Math.max(8, sampleCount);
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    const x = from.x + (to.x - from.x) * t;
    const z = from.z + (to.z - from.z) * t;
    const y = terrainModel.heightAt(x, z) + ROUTE_LIFT + Math.sin(t * Math.PI) * 2;
    points.push(new THREE.Vector3(x, y, z));
  }
  return points;
}

export function normalizeTerrainRoutePoints(points, minimumSpacing = 0.02) {
  const normalized = [];
  const source = points || [];
  for (const [index, point] of source.entries()) {
    const previous = normalized[normalized.length - 1];
    if (!previous) {
      normalized.push(point);
      continue;
    }
    const horizontalDistance = Math.hypot(point.x - previous.x, point.z - previous.z);
    if (horizontalDistance >= minimumSpacing || index === source.length - 1) normalized.push(point);
  }
  return normalized;
}

export function createRouteRibbon(points, halfWidth, style = {}) {
  const vertices = [];
  const indices = [];
  for (let i = 0; i < points.length; i += 1) {
    const previous = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    let tangent = next.clone().sub(previous);
    if (tangent.lengthSq() < 0.0001) tangent = next.clone().sub(points[i]);
    if (tangent.lengthSq() < 0.0001) tangent = points[i].clone().sub(previous);
    if (tangent.lengthSq() < 0.0001) tangent = new THREE.Vector3(1, 0, 0);
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize().multiplyScalar(halfWidth);
    const point = points[i].clone();
    point.y -= ROUTE_LIFT - SURFACE_BASE_LIFT - (style.verticalOffset || 0);
    vertices.push(
      point.x + side.x,
      point.y,
      point.z + side.z,
      point.x - side.x,
      point.y,
      point.z - side.z
    );
    if (i > 0) indices.push((i - 1) * 2, (i - 1) * 2 + 1, i * 2, (i - 1) * 2 + 1, i * 2 + 1, i * 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const materialOptions = {
    color: new THREE.Color(style.color || '#9E9685'),
    transparent: true,
    opacity: style.opacity ?? 0.38,
    side: style.side ?? THREE.DoubleSide,
    depthWrite: style.depthWrite ?? true,
    depthTest: style.depthTest ?? true,
    polygonOffset: Boolean(style.polygonOffset),
    polygonOffsetFactor: style.polygonOffsetFactor ?? 0,
    polygonOffsetUnits: style.polygonOffsetUnits ?? 0
  };
  const material = style.unlit
    ? new THREE.MeshBasicMaterial({
        ...materialOptions,
        toneMapped: false
      })
    : new THREE.MeshStandardMaterial({
        ...materialOptions,
        roughness: style.roughness ?? 0.95,
        metalness: style.metalness ?? 0,
        emissive: new THREE.Color(style.emissive || '#000000'),
        emissiveIntensity: style.emissiveIntensity ?? 0
      });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = style.renderOrder ?? 0;
  mesh.userData.guidanceRole = style.guidanceRole || null;
  mesh.userData.surfaceLift = SURFACE_BASE_LIFT + (style.verticalOffset || 0);
  mesh.userData.restOpacity = style.opacity ?? 0.38;
  return mesh;
}
