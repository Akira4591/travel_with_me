import * as THREE from 'three';

import {
  buildTerrainRoutePointsFromLngLat,
  createRouteRibbon,
  registerGroundRevealMesh
} from './terrain-surface.js';

const GEO_COLORS = {
  water: '#A8B8C8',
  bridge: '#9E9685',
  road: { major: '#E6DED1', local: '#EEE8DC', path: '#F4EFE6' }
};

const ROAD_OPACITY = { major: 0.22, local: 0.16, path: 0.12 };

export function buildWaterGroup(proj, terrainModel, waterways) {
  const group = new THREE.Group();
  group.userData.revealTargets = [];
  let renderableWaterways = 0;
  for (const waterway of waterways) {
    const polygon =
      waterway.polygon?.length >= 3
        ? waterway.polygon
        : createRibbonPolygon(waterway.centerline, waterway.widthMeters, proj);
    if (polygon.length < 3) continue;
    renderableWaterways += 1;
    const points = polygon.map(lnglat => proj.toScene(lnglat));
    const shape = new THREE.Shape();
    shape.moveTo(points[0].x, -points[0].z);
    points.slice(1).forEach(point => shape.lineTo(point.x, -point.z));
    shape.closePath();
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(GEO_COLORS.water),
      roughness: 0.22,
      metalness: 0.08,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
    mesh.rotation.x = -Math.PI / 2;
    const restY = Math.min(...points.map(point => terrainModel.heightAt(point.x, point.z))) + 0.12;
    mesh.position.y = restY;
    mesh.userData.surfaceReveal = {
      restY,
      foundationY: terrainModel.foundationHeight + 0.12,
      restOpacity: material.opacity
    };
    group.userData.revealTargets.push(mesh);
    group.add(mesh);
  }
  group.userData.count = group.children.length;
  group.userData.coverageRatio = ratio(
    group.children.length,
    renderableWaterways || waterways.length
  );
  return group;
}

export function buildBridgeGroup(proj, terrainModel, bridges) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(GEO_COLORS.bridge),
    roughness: 0.7,
    metalness: 0.12,
    transparent: true,
    opacity: 0.92
  });
  group.userData.revealMaterials = [{ material, restOpacity: material.opacity }];
  let bridgesWithDeck = 0;
  for (const bridge of bridges) {
    const path = bridge.centerline.map(lnglat => proj.toScene(lnglat));
    if (path.length < 2) continue;
    let hasDeck = false;
    const deckHeight = proj.metersToUnits(bridge.deckHeightMeters);
    for (let index = 0; index < path.length - 1; index += 1) {
      const start = path[index],
        end = path[index + 1];
      const midpoint = { x: (start.x + end.x) / 2, z: (start.z + end.z) / 2 };
      const length = Math.hypot(end.x - start.x, end.z - start.z);
      if (length < 0.01) continue;
      const deckY =
        Math.max(terrainModel.heightAt(start.x, start.z), terrainModel.heightAt(end.x, end.z)) +
        deckHeight;
      const deck = new THREE.Mesh(
        new THREE.BoxGeometry(proj.metersToUnits(bridge.widthMeters), 0.5, length),
        material
      );
      deck.position.set(midpoint.x, deckY, midpoint.z);
      deck.rotation.y = Math.atan2(end.x - start.x, end.z - start.z);
      deck.castShadow = true;
      deck.receiveShadow = true;
      deck.userData.bridgePart = 'deck';
      group.add(deck);
      hasDeck = true;

      for (const pierPoint of Array.isArray(bridge.piers) ? bridge.piers : []) {
        const pierScene = proj.toScene(pierPoint);
        const groundY = terrainModel.heightAt(pierScene.x, pierScene.z);
        const height = Math.max(0.2, deckY - groundY);
        const pier = new THREE.Mesh(new THREE.BoxGeometry(0.65, height, 0.65), material);
        pier.position.set(pierScene.x, groundY + height / 2, pierScene.z);
        pier.userData.bridgePart = 'pier';
        group.add(pier);
      }
    }
    if (hasDeck) bridgesWithDeck += 1;
  }
  group.userData.count = bridges.length;
  group.userData.deckCount = countBridgeParts(group, 'deck');
  group.userData.pierCount = countBridgeParts(group, 'pier');
  group.userData.continuityRatio = ratio(bridgesWithDeck, bridges.length);
  return group;
}

export function buildRoadGroup(proj, terrainModel, roads) {
  const group = new THREE.Group();
  group.userData.revealTargets = [];
  for (const road of roads) {
    const points = buildTerrainRoutePointsFromLngLat(road.centerline, proj, terrainModel);
    if (points.length < 2) continue;
    const ribbon = createRouteRibbon(points, proj.metersToUnits(road.widthMeters) / 2, {
      color: GEO_COLORS.road[road.kind] || GEO_COLORS.road.local,
      opacity: ROAD_OPACITY[road.kind] || ROAD_OPACITY.local
    });
    registerGroundRevealMesh(ribbon, terrainModel, 0.08);
    group.userData.revealTargets.push(ribbon);
    group.add(ribbon);
  }
  group.userData.count = group.children.length;
  return group;
}

export function createRibbonPolygon(centerline, widthMeters, proj) {
  if (!Array.isArray(centerline) || centerline.length < 2) return [];
  if (!Number.isFinite(Number(widthMeters)) || Number(widthMeters) <= 0) return [];
  const width = proj.metersToUnits(widthMeters) / 2;
  const points = centerline.map(lnglat => proj.toScene(lnglat));
  const left = [],
    right = [];
  points.forEach((point, index) => {
    const previous = points[Math.max(0, index - 1)],
      next = points[Math.min(points.length - 1, index + 1)];
    const direction = new THREE.Vector2(next.x - previous.x, next.z - previous.z);
    if (direction.lengthSq() < 0.0001) return;
    direction.normalize();
    const sideX = -direction.y * width;
    const sideZ = direction.x * width;
    left.push(proj.toLngLat({ x: point.x + sideX, z: point.z + sideZ }));
    right.push(proj.toLngLat({ x: point.x - sideX, z: point.z - sideZ }));
  });
  return [...left, ...right.reverse()];
}

function countBridgeParts(group, bridgePart) {
  let count = 0;
  group.traverse(node => {
    if (node.isMesh && node.userData?.bridgePart === bridgePart) count += 1;
  });
  return count;
}

function ratio(numerator, denominator) {
  const bottom = Number(denominator) || 0;
  if (bottom <= 0) return 1;
  return Number(Math.min(1, Math.max(0, (Number(numerator) || 0) / bottom)).toFixed(3));
}
