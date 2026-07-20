// js/render/vegetation-renderer.js
// 3D vegetation rendering: procedural tree/shrub instances within landcover polygons.

import * as THREE from 'three';
import { seededUnit, pointInPolygon } from './math-utils.js';

const VEGETATION_TEMPLATES = [
  { id: 'conifer-cluster', radius: 0.32, height: 1.8 },
  { id: 'broadleaf-cluster', radius: 0.46, height: 1.35 },
  { id: 'shrub-cluster', radius: 0.28, height: 0.58 },
  { id: 'ridge-conifer', radius: 0.24, height: 2.2 },
  { id: 'low-cover', radius: 0.52, height: 0.3 }
];

const VEGETATION_COLORS = ['#839177', '#96A386', '#A9B394', '#73866C', '#BBC1A6'];

export function buildVegetationGroup(proj, terrainModel, vegetationAreas) {
  const group = new THREE.Group();
  const areas = Array.isArray(vegetationAreas) ? vegetationAreas : [];
  const materials = VEGETATION_TEMPLATES.map(
    (_, index) =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(VEGETATION_COLORS[index]),
        roughness: 0.9
      })
  );
  let count = 0;
  const areaBudgets = [];
  const chunks = [];
  for (const area of areas) {
    if (!area || area.licensed !== true || !Array.isArray(area.polygon)) continue;
    const points = createVegetationPoints(area, proj);
    const densityCap = vegetationDensityForCover(area.cover);
    const areaGroup = new THREE.Group();
    areaGroup.userData.vegetationChunk = true;
    areaGroup.userData.areaId = area.id || '';
    areaGroup.userData.cover = area.cover || '';
    areaGroup.userData.densityCap = densityCap;
    areaGroup.userData.instances = points.length;
    areaGroup.userData.sceneBounds = createVegetationAreaBounds(area, proj, terrainModel);
    areaBudgets.push({
      id: area.id || '',
      cover: area.cover || '',
      densityCap,
      instances: points.length
    });
    for (const point of points) {
      const template =
        VEGETATION_TEMPLATES[
          Math.abs(
            Math.floor(seededUnit(`${area.id}:${point.x}:${point.z}`) * VEGETATION_TEMPLATES.length)
          ) % VEGETATION_TEMPLATES.length
        ];
      const geometry = template.id.includes('conifer')
        ? new THREE.ConeGeometry(template.radius, template.height, 5)
        : new THREE.DodecahedronGeometry(template.radius, 0);
      const mesh = new THREE.Mesh(geometry, materials[VEGETATION_TEMPLATES.indexOf(template)]);
      mesh.position.set(
        point.x,
        terrainModel.heightAt(point.x, point.z) + template.height / 2,
        point.z
      );
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      areaGroup.add(mesh);
      count += 1;
    }
    group.add(areaGroup);
    chunks.push(areaGroup);
  }
  group.userData.templateCount = count;
  group.userData.areaBudgets = areaBudgets;
  group.userData.chunks = chunks;
  group.userData.chunkCount = chunks.length;
  group.userData.visibleChunkCount = chunks.length;
  group.userData.culledChunkCount = 0;
  group.userData.maxInstancesPerArea = Math.max(0, ...areaBudgets.map(area => area.instances));
  group.userData.densityCap = Math.max(0, ...areaBudgets.map(area => area.densityCap));
  group.userData.areaCount = areaBudgets.length;
  group.userData.requiresLicensedLandcover = true;
  return group;
}

function createVegetationPoints(area, proj) {
  const polygon = area.polygon.map(lnglat => proj.toScene(lnglat));
  if (polygon.length < 3) return [];
  const xs = polygon.map(point => point.x);
  const zs = polygon.map(point => point.z);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minZ = Math.min(...zs),
    maxZ = Math.max(...zs);
  const density = vegetationDensityForCover(area.cover);
  const points = [];
  for (let index = 0; index < density; index += 1) {
    const point = {
      x: minX + (maxX - minX) * seededUnit(`${area.id}:x:${index}`),
      z: minZ + (maxZ - minZ) * seededUnit(`${area.id}:z:${index}`)
    };
    if (pointInPolygon(point, polygon)) points.push(point);
  }
  return points;
}

function createVegetationAreaBounds(area, proj, terrainModel) {
  const polygon = Array.isArray(area?.polygon)
    ? area.polygon.map(lnglat => proj.toScene(lnglat))
    : [];
  if (polygon.length < 3) return null;
  const xs = polygon.map(point => point.x);
  const zs = polygon.map(point => point.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const baseY = Number(terrainModel.heightAt(centerX, centerZ)) || 0;
  return {
    min: { x: minX, y: baseY - 2, z: minZ },
    max: { x: maxX, y: baseY + 18, z: maxZ }
  };
}

function vegetationDensityForCover(cover) {
  return cover === 'forest' ? 12 : cover === 'scrub' ? 8 : 5;
}
