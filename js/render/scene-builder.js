/**
 * Scene layer builder: constructs and registers all 3D scene layers
 * (terrain, water, roads, bridges, route, buildings, vegetation, markers, annotations).
 * Extracted from map-3d.js to isolate scene construction from orchestration.
 */

import { buildContextGround, buildTerrainMesh } from './terrain-renderer.js';
import { buildWaterGroup, buildRoadGroup, buildBridgeGroup } from './geo-asset-renderer.js';
import { buildRouteGroup } from './route-guidance-renderer.js';
import { buildBuildingGroup } from './building-massing-renderer.js';
import { buildVegetationGroup } from './vegetation-renderer.js';
import { buildMarkerGroup, buildAnnotationGroup } from './marker-renderer.js';
import { getAppState } from '../state.js';

const BUILDING_COLOR = '#EDE7DC';

export function buildSceneLayers(
  diorama,
  { proj, trip, activeDayId, terrainModel, terrainMode, sceneContext, locations }
) {
  const { dioramaGroup, container } = diorama;

  if (diorama.contextGround) dioramaGroup.remove(diorama.contextGround);
  diorama.contextGround = buildContextGround(terrainModel);
  dioramaGroup.add(diorama.contextGround);

  if (diorama.terrainMesh) dioramaGroup.remove(diorama.terrainMesh);
  diorama.terrainMesh = buildTerrainMesh(terrainModel);
  terrainModel.mesh = diorama.terrainMesh;
  dioramaGroup.add(diorama.terrainMesh);

  if (diorama.waterGroup) dioramaGroup.remove(diorama.waterGroup);
  diorama.waterGroup = buildWaterGroup(proj, terrainModel, sceneContext.geoAssets.waterways);
  dioramaGroup.add(diorama.waterGroup);
  container.dataset.waterwayCount = String(diorama.waterGroup.userData.count || 0);

  if (diorama.roadGroup) dioramaGroup.remove(diorama.roadGroup);
  diorama.roadGroup = buildRoadGroup(proj, terrainModel, sceneContext.geoAssets.roads);
  dioramaGroup.add(diorama.roadGroup);
  container.dataset.roadCount = String(diorama.roadGroup.userData.count || 0);

  if (diorama.bridgeGroup) dioramaGroup.remove(diorama.bridgeGroup);
  diorama.bridgeGroup = buildBridgeGroup(proj, terrainModel, sceneContext.geoAssets.bridges);
  dioramaGroup.add(diorama.bridgeGroup);
  container.dataset.bridgeCount = String(diorama.bridgeGroup.userData.count || 0);

  if (diorama.routeGroup) dioramaGroup.remove(diorama.routeGroup);
  diorama.routeGroup = buildRouteGroup(
    proj,
    trip,
    activeDayId,
    terrainModel,
    terrainMode,
    getAppState().activeRouteSegmentId
  );
  container.dataset.routeGeometryCount = String(diorama.routeGroup.userData.realGeometryCount || 0);
  container.dataset.routeHash = diorama.routeGroup.userData.routeHashes?.join(',') || '';
  container.dataset.routeLengthMeters = String(diorama.routeGroup.userData.routeLengthMeters || 0);
  container.dataset.routeEndpointKey =
    diorama.routeGroup.userData.routeEndpointKeys?.join('|') || '';
  dioramaGroup.add(diorama.routeGroup);

  if (diorama.buildingGroup) dioramaGroup.remove(diorama.buildingGroup);
  diorama.buildingGroup = buildBuildingGroup(
    proj,
    locations,
    terrainModel,
    sceneContext.geoAssets,
    {
      buildingColor: BUILDING_COLOR
    }
  );
  diorama.buildingLodEntries = diorama.buildingGroup.userData.lodEntries || [];
  container.dataset.buildingCount = String(diorama.buildingGroup.userData.count || 0);
  dioramaGroup.add(diorama.buildingGroup);

  if (diorama.vegetationGroup) dioramaGroup.remove(diorama.vegetationGroup);
  diorama.vegetationGroup = buildVegetationGroup(
    proj,
    terrainModel,
    sceneContext.geoAssets.landcover
  );
  dioramaGroup.add(diorama.vegetationGroup);
  container.dataset.vegetationTemplateCount = String(
    diorama.vegetationGroup.userData.templateCount || 0
  );

  if (diorama.markerGroup) dioramaGroup.remove(diorama.markerGroup);
  diorama.markerGroup = buildMarkerGroup(proj, trip, activeDayId, terrainModel);
  dioramaGroup.add(diorama.markerGroup);

  if (diorama.annotationGroup) dioramaGroup.remove(diorama.annotationGroup);
  diorama.annotationGroup = buildAnnotationGroup(proj, trip, terrainModel);
  container.dataset.annotationCount = String(diorama.annotationGroup.userData.count || 0);
  container.dataset.buildingDetailCount = '0';
  dioramaGroup.add(diorama.annotationGroup);

  if (diorama.sliceEdge) dioramaGroup.remove(diorama.sliceEdge);
  diorama.sliceEdge = null;
  terrainModel.sideSkirts = null;
}
