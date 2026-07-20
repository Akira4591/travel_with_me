/**
 * Terrain mesh rendering: vertex colors, mesh construction, context ground, insight panel.
 * Extracted from map-3d.js to isolate terrain geometry from scene orchestration.
 */

import * as THREE from 'three';
import { getBoundsSpan } from './camera-pose.js';

const BONE_WHITE = '#FCFAF5';

const TERRAIN_COLORS = {
  base: BONE_WHITE,
  low: '#FCFAF5',
  mid: '#F2EBDB',
  high: '#E0D4BE'
};

const TERRAIN_RELIEF_SHADING = true;

export function applyTerrainVertexColors(geom) {
  const positions = geom.attributes.position;
  const normals = geom.attributes.normal;
  const count = positions.count;
  const colors = new Float32Array(count * 3);

  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < count; i += 1) {
    const y = positions.getY(i);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const yRange = Math.max(0.001, maxY - minY);

  const lowColor = new THREE.Color(TERRAIN_COLORS.low);
  const midColor = new THREE.Color(TERRAIN_COLORS.mid);
  const highColor = new THREE.Color(TERRAIN_COLORS.high);

  const lightDir = new THREE.Vector3(-0.35, 0.78, -0.52).normalize();
  const ambient = 0.72;
  const diffuseStrength = 0.28;

  const tmpColor = new THREE.Color();
  const tmpNormal = new THREE.Vector3();

  for (let i = 0; i < count; i += 1) {
    const y = positions.getY(i);
    const t = Math.min(1, Math.max(0, (y - minY) / yRange));

    if (t < 0.5) {
      tmpColor.copy(lowColor).lerp(midColor, t * 2);
    } else {
      tmpColor.copy(midColor).lerp(highColor, (t - 0.5) * 2);
    }

    tmpNormal.set(normals.getX(i), normals.getY(i), normals.getZ(i));
    const lambert = Math.max(0, tmpNormal.dot(lightDir));
    const shade = ambient + lambert * diffuseStrength;

    colors[i * 3] = tmpColor.r * shade;
    colors[i * 3 + 1] = tmpColor.g * shade;
    colors[i * 3 + 2] = tmpColor.b * shade;
  }

  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

export function buildTerrainMesh(terrainModel) {
  const { bounds } = terrainModel;
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  const cols = terrainModel.grid?.cols || 18;
  const rows = terrainModel.grid?.rows || 18;
  const geom = new THREE.PlaneGeometry(width, depth, cols - 1, rows - 1);
  geom.rotateX(-Math.PI / 2);

  const positions = geom.attributes.position;
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    positions.setY(i, terrainModel.heightAt(x, z));
  }
  geom.computeVertexNormals();

  if (TERRAIN_RELIEF_SHADING) {
    applyTerrainVertexColors(geom);
  }

  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(TERRAIN_RELIEF_SHADING ? '#FFFFFF' : TERRAIN_COLORS.base),
    vertexColors: TERRAIN_RELIEF_SHADING,
    toneMapped: false
  });

  const mesh = new THREE.Mesh(geom, mat);
  const wire = new THREE.Mesh(
    geom,
    new THREE.MeshBasicMaterial({
      color: new THREE.Color('#E3DCCF'),
      transparent: true,
      opacity: 0.24,
      wireframe: true,
      depthWrite: false,
      toneMapped: false
    })
  );
  wire.renderOrder = 4;
  wire.userData.terrainFacetOverlay = true;
  mesh.add(wire);
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  mesh.userData.restHeights = Float32Array.from({ length: positions.count }, (_, index) =>
    positions.getY(index)
  );
  mesh.userData.foundationHeights = Float32Array.from(
    { length: positions.count },
    () => terrainModel.foundationHeight
  );
  return mesh;
}

export function buildContextGround(terrainModel) {
  const { bounds } = terrainModel;
  const span = getBoundsSpan(bounds);
  const geometry = new THREE.PlaneGeometry(span * 3, span * 3, 1, 1);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#F0ECE3'),
    transparent: true,
    opacity: 0.82,
    toneMapped: false,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(
    (bounds.minX + bounds.maxX) / 2,
    terrainModel.foundationHeight - 0.08,
    (bounds.minZ + bounds.maxZ) / 2
  );
  mesh.renderOrder = -10;
  mesh.userData.contextGround = true;
  return mesh;
}

export function getTerrainBounds(proj, span) {
  const size = proj.metersToUnits(span);
  const half = size / 2;
  return { minX: -half, maxX: half, minZ: -half, maxZ: half };
}

export function getTerrainHeightScale(proj, terrainMode) {
  if (terrainMode.id === 'hiking') return proj.metersToUnits(70);
  if (terrainMode.id === 'scenic-park') return proj.metersToUnits(45);
  if (terrainMode.id === 'region-overview') return proj.metersToUnits(28);
  if (terrainMode.id === 'micro-street') return proj.metersToUnits(10);
  return proj.metersToUnits(30);
}

export function renderTerrainInsight(container, terrainMode, terrainModel, poiCount) {
  const existing = container.querySelector('.terrain-insight-panel');
  if (existing) existing.remove();
  const panel = document.createElement('div');
  panel.className = 'terrain-insight-panel';
  const range = Math.round(terrainModel.metrics.range || 0);
  const confidence = terrainModel.terrainConfidence;
  const confidenceLabel =
    confidence === 'sampled'
      ? '采样地形'
      : confidence === 'low-relief'
        ? '低起伏'
        : confidence === 'estimated'
          ? '估算地形'
          : '平面降级';
  const claim = confidence === 'flat-fallback' ? '不输出坡度结论' : `高差约 ${range}m`;
  panel.innerHTML = `
    <div class="terrain-insight-title">${terrainMode.label}</div>
    <div class="terrain-insight-meta">
      <span>${confidenceLabel}</span>
      <span>${claim}</span>
      <span>${poiCount} 点</span>
    </div>
  `;
  container.appendChild(panel);
}
