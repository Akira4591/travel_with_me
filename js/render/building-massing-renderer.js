import * as THREE from 'three';

import { chooseBuildingTemplate } from './building-templates.js';
import { seededUnit, percentile, roundMetric } from './math-utils.js';

const BUILDING_MIN_HEIGHT = 3;
const BUILDING_MAX_HEIGHT = 14;
const DEFAULT_BUILDING_COLOR = '#EDE7DC';

export function buildBuildingGroup(
  proj,
  locations,
  terrainModel,
  geoAssets = {},
  { buildingColor = DEFAULT_BUILDING_COLOR } = {}
) {
  const group = new THREE.Group();
  const lodEntries = [];
  const baseTerrainErrorsMeters = [];
  const fallbackMassings = [];
  const featureScale = getOverviewFeatureScale(terrainModel.bounds);
  const authoritativeBuildings = Array.isArray(geoAssets.buildings) ? geoAssets.buildings : [];
  const realBuildings = new Map(
    authoritativeBuildings.filter(asset => asset.locationId).map(asset => [asset.locationId, asset])
  );

  authoritativeBuildings
    .filter(asset => !asset.locationId)
    .forEach(asset => {
      const entry = createAuthoritativeBuildingLod(asset, proj, terrainModel, buildingColor);
      if (entry) {
        group.add(entry.low, entry.detail);
        lodEntries.push(entry);
        baseTerrainErrorsMeters.push(...entry.baseTerrainErrorsMeters);
        return;
      }
      const fallbackMassing = createFallbackMassingFromAsset(
        asset,
        proj,
        terrainModel,
        featureScale
      );
      if (!fallbackMassing) return;
      fallbackMassings.push(fallbackMassing);
      group.add(fallbackMassing.detail);
      baseTerrainErrorsMeters.push(0);
    });

  for (const loc of locations) {
    const { x, z } = proj.toScene(loc.lnglat);
    const realBuilding = realBuildings.get(loc.id);
    if (realBuilding) {
      const entry = createAuthoritativeBuildingLod(realBuilding, proj, terrainModel, buildingColor);
      if (entry) {
        group.add(entry.low, entry.detail);
        lodEntries.push(entry);
        baseTerrainErrorsMeters.push(...entry.baseTerrainErrorsMeters);
        continue;
      }
    }
    const seed = seededUnit(loc.id || loc.name || `${x}:${z}`);
    const template = chooseBuildingTemplate(loc, seed);
    const isLarge = ['lodging', 'retail', 'culture', 'transport'].includes(template.scenario);
    const isSmall = template.scenario === 'food';
    const h =
      (isLarge
        ? BUILDING_MAX_HEIGHT * (0.5 + seed * 0.5)
        : isSmall
          ? BUILDING_MIN_HEIGHT * (0.6 + seed * 0.4)
          : BUILDING_MIN_HEIGHT * (0.8 + seed * 1.2)) * featureScale;

    const w = (isLarge ? 3 + seed * 3 : 1.5 + seed * 2) * featureScale;
    const terrainY = terrainModel.heightAt(x, z);

    const detail = createDetailedBuilding({ x, z, terrainY, width: w, height: h, seed, template });
    detail.visible = false;
    fallbackMassings.push({
      center: new THREE.Vector3(x, terrainY + h / 2, z),
      width: w,
      height: h,
      detail
    });
    group.add(detail);
    baseTerrainErrorsMeters.push(0);
  }

  addFallbackMassingInstances(group, lodEntries, fallbackMassings, buildingColor);
  group.userData.lodEntries = lodEntries;
  group.userData.authoritativeCount = lodEntries.filter(entry => entry.authoritative).length;
  group.userData.count = lodEntries.length;
  group.userData.syntheticMassingCount = fallbackMassings.length;
  group.userData.instancedMassingMeshCount = fallbackMassings.length > 0 ? 1 : 0;
  group.userData.baseTerrainErrorsMeters = baseTerrainErrorsMeters;
  group.userData.baseTerrainErrorP95Meters = percentile(baseTerrainErrorsMeters, 0.95);
  group.userData.baseTerrainErrorMaxMeters = maxMetric(baseTerrainErrorsMeters);
  return group;
}

function addFallbackMassingInstances(group, lodEntries, fallbackMassings, buildingColor) {
  if (!fallbackMassings.length) return;
  const material = createBuildingMaterial(buildingColor, 1);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.InstancedMesh(geometry, material, fallbackMassings.length);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.syntheticMassing = true;
  mesh.userData.instanceCount = fallbackMassings.length;

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  for (const [index, massing] of fallbackMassings.entries()) {
    position.copy(massing.center);
    scale.set(massing.width, massing.height, massing.width);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
    lodEntries.push({
      center: massing.center,
      low: mesh,
      lowMaterial: material,
      lowInstanced: true,
      lowAlpha: 1,
      instanceIndex: index,
      detail: massing.detail,
      detailMaterials: massing.detail.userData.materials,
      detailAlpha: 0,
      syntheticMassing: true
    });
  }
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
}

function createFallbackMassingFromAsset(asset, proj, terrainModel, featureScale) {
  if (!Array.isArray(asset?.footprint) || asset.footprint.length < 3) return null;
  const points = asset.footprint.map(lnglat => proj.toScene(lnglat));
  const xs = points.map(point => point.x);
  const zs = points.map(point => point.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const x = (minX + maxX) / 2;
  const z = (minZ + maxZ) / 2;
  const width = Math.max(maxX - minX, maxZ - minZ, 2 * featureScale);
  const height = Math.max(
    BUILDING_MIN_HEIGHT * featureScale,
    proj.metersToUnits(Number(asset.heightMeters) || BUILDING_MIN_HEIGHT)
  );
  const terrainY = terrainModel.heightAt(x, z);
  const seed = seededUnit(asset.id || `${x}:${z}`);
  const template = { id: 'box' };
  const detail = createDetailedBuilding({ x, z, terrainY, width, height, seed, template });
  detail.visible = false;
  detail.userData.syntheticFromRejectedFootprint = true;
  detail.userData.sourceAssetId = asset.id || '';
  return {
    center: new THREE.Vector3(x, terrainY + height / 2, z),
    width,
    height,
    detail,
    fallbackFromAuthoritativeAsset: true
  };
}

function createAuthoritativeBuildingLod(asset, proj, terrainModel, buildingColor) {
  const shape = new THREE.Shape();
  const points = asset.footprint.map(lnglat => proj.toScene(lnglat));
  shape.moveTo(points[0].x, -points[0].z);
  points.slice(1).forEach(point => shape.lineTo(point.x, -point.z));
  shape.closePath();
  const terrainY =
    points.reduce((sum, point) => sum + terrainModel.heightAt(point.x, point.z), 0) / points.length;
  const baseTerrainErrorsMeters = points.map(point =>
    roundMetric(proj.unitsToMeters(Math.abs(terrainY - terrainModel.heightAt(point.x, point.z))))
  );
  if (percentile(baseTerrainErrorsMeters, 0.95) > 0.25) return null;
  const height = proj.metersToUnits(asset.heightMeters);
  const lowMaterial = createBuildingMaterial(buildingColor, 1);
  const low = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false }),
    lowMaterial
  );
  low.rotation.x = -Math.PI / 2;
  low.position.y = terrainY;
  low.castShadow = true;
  low.receiveShadow = true;

  const detailMaterial = createBuildingMaterial('#F2EDE4', 0);
  const roofMaterial = createBuildingMaterial('#E2D8C7', 0);
  const detail = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false }),
    detailMaterial
  );
  body.rotation.x = -Math.PI / 2;
  body.position.y = terrainY;
  body.castShadow = true;
  body.receiveShadow = true;
  detail.add(body);
  const roof = new THREE.Mesh(new THREE.ShapeGeometry(shape), roofMaterial);
  roof.rotation.x = -Math.PI / 2;
  roof.position.y = terrainY + height + 0.08;
  roof.castShadow = true;
  detail.add(roof);
  detail.visible = false;

  const center = points
    .reduce(
      (sum, point) => sum.add(new THREE.Vector3(point.x, terrainY + height / 2, point.z)),
      new THREE.Vector3()
    )
    .multiplyScalar(1 / points.length);
  return {
    center,
    low,
    detail,
    lowMaterial,
    detailMaterials: [detailMaterial, roofMaterial],
    detailAlpha: 0,
    authoritative: true,
    baseTerrainErrorsMeters
  };
}

function createDetailedBuilding({ x, z, terrainY, width, height, seed, template }) {
  const group = new THREE.Group();
  const materials = [];
  const facadeMaterial = createBuildingMaterial('#F2EDE4', 0);
  const roofMaterial = createBuildingMaterial('#E2D8C7', 0);
  const accentMaterial = createBuildingMaterial('#CFC4B2', 0);
  materials.push(facadeMaterial, roofMaterial, accentMaterial);

  const inset = Math.max(0.32, width * (template.id === 'tower' ? 0.24 : 0.12));
  const bodyHeight = Math.max(BUILDING_MIN_HEIGHT, height * (template.id === 'tower' ? 0.9 : 0.76));
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(Math.max(0.8, width - inset), bodyHeight, Math.max(0.8, width - inset)),
    facadeMaterial
  );
  body.position.set(x, terrainY + bodyHeight / 2, z);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const roofHeight = Math.max(
    0.28,
    height * (template.id === 'terrace' || template.id === 'box' ? 0.06 : 0.16 + seed * 0.1)
  );
  const roof = new THREE.Mesh(
    template.id === 'terrace' || template.id === 'box' || template.id === 'canopy'
      ? new THREE.BoxGeometry(width * 0.9, roofHeight, width * 0.9)
      : new THREE.ConeGeometry(
          Math.max(0.6, width * 0.58),
          roofHeight,
          template.id === 'gable' ? 4 : 6
        ),
    roofMaterial
  );
  roof.rotation.y = template.id === 'gable' ? Math.PI * 0.25 : 0;
  roof.position.set(x, terrainY + bodyHeight + roofHeight / 2, z);
  roof.castShadow = true;
  group.add(roof);

  const entrance = new THREE.Mesh(
    new THREE.BoxGeometry(Math.max(0.22, width * 0.2), Math.max(0.4, bodyHeight * 0.28), 0.06),
    accentMaterial
  );
  entrance.position.set(x, terrainY + entrance.geometry.parameters.height / 2, z + width * 0.51);
  group.add(entrance);

  if (template.id === 'arcade' || template.id === 'canopy') {
    const awning = new THREE.Mesh(
      new THREE.BoxGeometry(width * 1.08, 0.16, width * 0.26),
      accentMaterial
    );
    awning.position.set(x, terrainY + bodyHeight * 0.4, z + width * 0.56);
    group.add(awning);
  }

  group.userData.materials = materials;
  group.userData.template = template;
  return group;
}

function createBuildingMaterial(color, opacity) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: 0.66,
    metalness: 0,
    transparent: true,
    opacity,
    depthWrite: opacity > 0.98
  });
}

function getOverviewFeatureScale(bounds) {
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
  return THREE.MathUtils.clamp(span / 850, 1, 6);
}

function maxMetric(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? roundMetric(Math.max(...finite)) : 0;
}

// seededUnit, percentile, roundMetric are imported from math-utils.js.
