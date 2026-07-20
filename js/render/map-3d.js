// js/render/map-3d.js
// Three.js planning diorama renderer.
//
// Design contract: see ARCHITECTURE.md ADR-6 and docs/architecture/3d/top-down-execution-roadmap.md.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createGeoProjection } from './geo-project.js';
import { createLogger } from '../logger.js';
import { chooseTerrainMode } from './terrain-mode.js?v=20260621-region-grid-v2';
import { createTerrainModel } from './terrain-model.js';
import { getAppState } from '../state.js';
import { createSceneBuildContext } from './scene-build-context.js';
import { publishDioramaDebug } from './scene-debug.js';
import { buildBridgeGroup, buildRoadGroup, buildWaterGroup } from './geo-asset-renderer.js';
import { buildRouteGroup, set3DRouteHighlight } from './route-guidance-renderer.js';
import { buildBuildingGroup } from './building-massing-renderer.js';
import {
  didBuildingLodSignatureChange,
  getBuildingDetailAlpha,
  updateBuildingLod
} from './building-dissolve-renderer.js';
import { createCameraController, getCameraProfile } from './camera-controller.js';
import { createGenerationTimeline } from './generation-timeline.js';
import { GENERATION_TIMING_MS } from './generation-timing.js';
import { createFoundationMetrics } from './terrain-foundation.js';
import { applyTerrainCarving } from './terrain-carving.js';
import {
  clamp,
  smoothstep,
  withTimeout,
  easeOutBack,
  easeInOutCubic,
  easeInCubic
} from './math-utils.js';
import {
  getBoundsSpan,
  getInitialOverviewCameraPose,
  applyOverviewCameraPose,
  getCameraControlDistances
} from './camera-pose.js';
import {
  buildTerrainMesh,
  buildContextGround,
  getTerrainBounds,
  getTerrainHeightScale,
  renderTerrainInsight
} from './terrain-renderer.js';
import {
  normalizeWorkArea,
  computeRouteLength,
  formatRouteDistance,
  disposeSceneObject,
  collectDayLocations
} from './geo-utils.js';
import { buildMarkerGroup, buildAnnotationGroup } from './marker-renderer.js';
import { buildVegetationGroup } from './vegetation-renderer.js';

export { set3DRouteHighlight };
export { getBuildingDetailAlpha };

const log = createLogger('map-3d');

// Color constants.

const BONE_WHITE = '#FCFAF5';

const C = {
  building: '#EDE7DC',
  bgTop: BONE_WHITE,
  bgBottom: BONE_WHITE
};

// Render constants.

// Auto orbit resumes after user drag only in overview-like modes.
const IDLE_RESUME_DELAY = 25000;
const AUTO_ROTATE_SPEED = 0.5;

// Emergence animation constants.
const EMERGE_DURATION = GENERATION_TIMING_MS.total;
const EMERGE_PHASE_MS = GENERATION_TIMING_MS.foundationRise;
const FOUNDATION_END = EMERGE_PHASE_MS / EMERGE_DURATION;
const GEOLOGY_END = (EMERGE_PHASE_MS * 2) / EMERGE_DURATION;
const BUILDING_MASSING_END = (EMERGE_PHASE_MS * 3) / EMERGE_DURATION;
const EXIT_DURATION = 900;
const CLICK_MOVE_TOLERANCE = 6;
const FIRST_SLAB_ELEVATION_BUDGET_MS = 1200;

let instance = null;

/**
 * @typedef {object} DioramaInstance
 * @property {HTMLElement} container
 * @property {THREE.Scene} scene
 * @property {THREE.PerspectiveCamera} camera
 * @property {THREE.WebGLRenderer} renderer
 * @property {OrbitControls} controls
 * @property {THREE.Group} dioramaGroup lifted scene container
 * @property {THREE.Mesh} terrainMesh
 * @property {THREE.Group} buildingGroup
 * @property {THREE.Group} markerGroup
 * @property {THREE.Group} annotationGroup
 * @property {THREE.Group} routeGroup
 * @property {import('./geo-project.js').GeoProjection} proj
 * @property {Function} dispose
 */

/**
 * Create a 3D diorama instance without entering 3D mode immediately.
 * @param {object} options
 * @param {HTMLElement} options.container #map-3d container
 * @returns {Promise<DioramaInstance>}
 */
export async function initDiorama({ container }) {
  if (instance) return instance;

  const width = container.clientWidth || 800;
  const height = container.clientHeight || 600;

  // Scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(C.bgBottom);
  scene.fog = new THREE.Fog(C.bgBottom, 220, 900);

  // Camera
  const camera = new THREE.PerspectiveCamera(50, width / height, 0.5, 2000);
  const initialCameraPose = getInitialOverviewCameraPose();
  camera.position.copy(initialCameraPose.position);
  camera.lookAt(initialCameraPose.target);

  // Renderer
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;
  container.appendChild(renderer.domElement);

  // Controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.copy(initialCameraPose.target);
  controls.minDistance = 30;
  controls.maxDistance = 600;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.autoRotate = false;
  controls.autoRotateSpeed = AUTO_ROTATE_SPEED;
  controls.update();

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let pointerDown = null;
  renderer.domElement.addEventListener('pointerdown', event => {
    pointerDown = { x: event.clientX, y: event.clientY };
  });
  renderer.domElement.addEventListener('click', event => {
    if (!instance?.terrainMesh || !instance?.proj || !instance?.terrainModel) return;
    if (pointerDown) {
      const dx = event.clientX - pointerDown.x;
      const dy = event.clientY - pointerDown.y;
      if (Math.sqrt(dx * dx + dy * dy) > CLICK_MOVE_TOLERANCE) return;
    }
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    raycaster.setFromCamera(pointer, camera);
    const hitPoint = getTerrainClickPoint(raycaster, instance);
    if (!hitPoint) return;
    const lnglat = instance.proj.toLngLat({ x: hitPoint.x, z: hitPoint.z });
    const elevation = instance.terrainModel.elevationAt(hitPoint.x, hitPoint.z);
    instance.onAnnotationRequest?.({
      lnglat,
      elevation: Number.isFinite(elevation) ? Math.round(elevation) : null,
      terrainY: hitPoint.y
    });
  });

  // Root group lifted by the entrance animation.
  const dioramaGroup = new THREE.Group();
  scene.add(dioramaGroup);

  // 鍏夌収
  setupLighting(scene);

  // 鍔ㄧ敾寰幆
  let animId;
  let lastFrameTime = performance.now();
  const DEBUG_THROTTLE_MS = 500;
  let lastDebugUpdate = 0;

  function animate(now = performance.now()) {
    animId = requestAnimationFrame(animate);
    const deltaSeconds = Math.min((now - lastFrameTime) / 1000, 0.08);
    lastFrameTime = now;
    const moved = instance?.cameraController
      ? instance.cameraController.update(deltaSeconds)
      : controls.update();
    if ((moved || instance?.debug?.camera?.activeKeys?.length) && instance) {
      if (now - lastDebugUpdate >= DEBUG_THROTTLE_MS) {
        lastDebugUpdate = now;
        updateThreeDebug(instance);
      }
    }
    updateBuildingLod(instance);
    if (instance && didBuildingLodSignatureChange(instance)) {
      updateThreeDebug(instance);
    }
    renderer.render(scene, camera);
  }
  animate();

  const cameraController = createCameraController({
    camera,
    controls,
    domElement: renderer.domElement,
    enabled: false,
    phase: 'idle',
    idleResumeDelay: IDLE_RESUME_DELAY,
    autoRotateSpeed: AUTO_ROTATE_SPEED
  });

  instance = {
    container,
    scene,
    camera,
    renderer,
    controls,
    dioramaGroup,
    terrainMesh: null,
    buildingGroup: null,
    buildingLodEntries: [],
    markerGroup: null,
    annotationGroup: null,
    routeGroup: null,
    contextGround: null,
    workArea: null,
    activeRouteSegmentId: null,
    sliceEdge: null,
    terrainModel: null,
    cameraController,
    generationTimeline: createGenerationTimeline(),
    buildingDetailCount: 0,
    buildingRevealProgress: 1,
    onAnnotationRequest: null,
    proj: null,
    _animId: animId,
    dispose() {
      cancelAnimationFrame(animId);
      cameraController.dispose();
      controls.dispose();
      renderer.dispose();
      scene.clear();
      container.innerHTML = '';
      instance = null;
    }
  };

  log.info('3D diorama initialized');
  return instance;
}

// withTimeout is imported from math-utils.js.

/**
 * Enter 3D mode by loading terrain, building layers, and running emergence animation.
 * @param {DioramaInstance} diorama
 * @param {object} options
 * @param {import('../data/trip.js').Trip} options.trip current trip
 * @param {string} options.activeDayId current day id ('all' | day.id)
 * @returns {Promise<void>}
 */
export async function enter3DMode(
  diorama,
  { trip, activeDayId, onAnnotationRequest = null, loadElevationGrid = null, workArea = null }
) {
  const enterStartedAt = performance.now();
  const { dioramaGroup, camera, controls, renderer, container, scene } = diorama;
  diorama.onAnnotationRequest = onAnnotationRequest;
  diorama.cameraController?.setEnabled(false);
  diorama.cameraController?.setPhase('emerging');

  // 1. Collect coordinates.
  const locations = collectDayLocations(trip, activeDayId);
  const lnglats = locations.map(loc => loc.lnglat);
  if (!lnglats.length) {
    log.warn('No valid coordinates; cannot enter 3D mode');
    throw new Error('No valid coordinates; cannot enter 3D mode');
  }

  // 2. Compute projection and scene span.
  const selectedWorkArea = normalizeWorkArea(workArea, lnglats);
  const center = selectedWorkArea.center;
  const proj = createGeoProjection({ center, scale: 0.5 }); // 1 scene unit ~= 2m
  diorama.proj = proj;
  diorama.workArea = selectedWorkArea;
  const span = selectedWorkArea.spanMeters;
  const terrainMode = chooseTerrainMode({
    span,
    poiCount: locations.length,
    routeLength: computeRouteLength(lnglats),
    locations
  });
  log.debug('projection center', center, 'span', span, 'terrain mode', terrainMode.id);

  // 3. Load elevation data.
  // The public DEM endpoint accepts 100 coordinates per request. Cap the remote grid at 28x28
  // so scenic and hiking views stay below eight paced batches instead of degrading to a flat map.
  const grid = await withTimeout(
    typeof loadElevationGrid === 'function'
      ? loadElevationGrid({
          center,
          span,
          resolution: Math.min(terrainMode.terrainGrid, 28)
        })
      : Promise.resolve(null),
    FIRST_SLAB_ELEVATION_BUDGET_MS,
    null
  );
  log.debug('elevation grid', grid ? `${grid.rows}x${grid.cols}` : 'none');

  // 4. Build terrain model and carve water before rendering surfaces.
  const bounds = getTerrainBounds(proj, span);
  const terrainModel = createTerrainModel({
    bounds,
    grid,
    heightScale: getTerrainHeightScale(proj, terrainMode)
  });
  diorama.terrainModel = terrainModel;
  diorama.cameraController?.setSceneContext({
    terrainModel,
    terrainMode,
    groundOffsetY: 0
  });
  const sceneContext = createSceneBuildContext({
    trip,
    activeDayId,
    locations,
    terrainMode,
    terrainModel
  });
  applyTerrainCarving(terrainModel, proj, sceneContext.geoAssets.waterways);
  diorama.sceneBuildContext = sceneContext;
  container.dataset.terrainMode = terrainMode.id;
  container.dataset.terrainConfidence = terrainModel.terrainConfidence;
  container.dataset.elevationRange = String(Math.round(terrainModel.metrics.range || 0));
  container.dataset.workAreaSource = selectedWorkArea.source;
  container.dataset.workAreaSpanMeters = String(selectedWorkArea.spanMeters);
  container.dataset.workAreaHardCapMeters = String(selectedWorkArea.hardCapMeters);
  container.dataset.workAreaCenter = selectedWorkArea.center
    .map(value => value.toFixed(6))
    .join(',');
  container.dataset.workAreaAnchorAdjusted = String(Boolean(selectedWorkArea.anchorAdjusted));
  container.dataset.workAreaAnchorDistanceMeters = String(
    selectedWorkArea.anchorDistanceMeters || 0
  );
  container.dataset.workAreaAnchorType = selectedWorkArea.anchorType || '';
  container.dataset.provenanceSourceCount = String(sceneContext.provenanceManifest.sources.length);
  container.dataset.waterCarveCount = String(terrainModel.carving?.waterwayCount || 0);
  renderTerrainInsight(container, terrainMode, terrainModel, locations.length);

  if (diorama.contextGround) {
    dioramaGroup.remove(diorama.contextGround);
  }
  diorama.contextGround = buildContextGround(terrainModel);
  dioramaGroup.add(diorama.contextGround);

  if (diorama.terrainMesh) {
    dioramaGroup.remove(diorama.terrainMesh);
  }
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

  // 5. Build route before buildings so the guidance line remains the visual anchor.
  if (diorama.routeGroup) {
    dioramaGroup.remove(diorama.routeGroup);
  }
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

  // 6. Build buildings after the terrain/asset/route skeleton has emerged.
  if (diorama.buildingGroup) {
    dioramaGroup.remove(diorama.buildingGroup);
  }
  diorama.buildingGroup = buildBuildingGroup(
    proj,
    locations,
    terrainModel,
    sceneContext.geoAssets,
    {
      buildingColor: C.building
    }
  );
  diorama.buildingLodEntries = diorama.buildingGroup.userData.lodEntries || [];
  container.dataset.buildingCount = String(diorama.buildingGroup.userData.count || 0);
  dioramaGroup.add(diorama.buildingGroup);

  // Vegetation is data-gated and appears after the route to avoid hiding guidance.
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

  // 7. Build POI markers.
  if (diorama.markerGroup) {
    dioramaGroup.remove(diorama.markerGroup);
  }
  diorama.markerGroup = buildMarkerGroup(proj, trip, activeDayId, terrainModel);
  dioramaGroup.add(diorama.markerGroup);

  // 8. Build 3D annotations.
  if (diorama.annotationGroup) {
    dioramaGroup.remove(diorama.annotationGroup);
  }
  diorama.annotationGroup = buildAnnotationGroup(proj, trip, terrainModel);
  container.dataset.annotationCount = String(diorama.annotationGroup.userData.count || 0);
  container.dataset.buildingDetailCount = '0';
  dioramaGroup.add(diorama.annotationGroup);
  updateThreeDebug(diorama);

  // 9. Keep terrain unboxed; do not render finite slice edges.
  if (diorama.sliceEdge) {
    dioramaGroup.remove(diorama.sliceEdge);
  }
  diorama.sliceEdge = null;
  terrainModel.sideSkirts = null;

  // 10. Show container and start emergence animation.
  container.hidden = false;
  container.dataset.firstSlabMs = String(Math.round(performance.now() - enterStartedAt));
  renderer.setSize(container.clientWidth, container.clientHeight);

  // Initialize camera on the same orbit used by idle overview mode.
  const sceneSpan = getBoundsSpan(bounds);
  camera.far = Math.max(2000, sceneSpan * 6);
  camera.updateProjectionMatrix();
  if (scene.fog) {
    scene.fog.near = Math.max(120, sceneSpan * 0.38);
    scene.fog.far = Math.max(900, sceneSpan * 3.6);
  }
  const cameraDistances = getCameraControlDistances(sceneSpan, terrainMode);
  controls.minDistance = cameraDistances.minDistance;
  controls.maxDistance = cameraDistances.maxDistance;
  diorama.cameraController?.setSceneContext({
    terrainModel,
    terrainMode,
    groundOffsetY: 0
  });
  applyOverviewCameraPose(diorama, bounds);

  if (shouldFreezeEmergenceForVisualQa()) {
    diorama.generationTimeline = createGenerationTimeline();
    applyEmergenceProgress(diorama, bounds, 0);
    installVisualDebugControls(diorama, bounds, { allowEmergenceProgress: true });
    updateThreeDebug(diorama);
    return;
  }

  // Run emergence animation.
  await animateEmergence(diorama, bounds);

  // Keep the first steady frame on the same orbit as the entry frame.
  applyOverviewCameraPose(diorama, bounds);
  diorama.cameraController?.setSceneContext({
    terrainModel,
    terrainMode,
    groundOffsetY: dioramaGroup.position.y
  });
  diorama.cameraController?.setMode('overview');
  diorama.cameraController?.setPhase('steady');
  diorama.cameraController?.setEnabled(true);
  diorama.cameraController?.update(0);
  installVisualDebugControls(diorama, bounds);
  updateThreeDebug(diorama);
  log.info('3D mode steady');
}

/**
 * Exit 3D mode with a reverse animation and geometry cleanup.
 * @param {DioramaInstance} diorama
 */
export async function exit3DMode(diorama) {
  const { dioramaGroup, controls, container } = diorama;
  diorama.cameraController?.setEnabled(false);
  diorama.cameraController?.setPhase('exiting');
  controls.autoRotate = false;

  // Reverse animation: lower the lifted group and hide layers.
  await animateExit(diorama);

  // Cleanup scene layers.
  [
    diorama.terrainMesh,
    diorama.waterGroup,
    diorama.bridgeGroup,
    diorama.roadGroup,
    diorama.buildingGroup,
    diorama.vegetationGroup,
    diorama.markerGroup,
    diorama.annotationGroup,
    diorama.routeGroup,
    diorama.contextGround,
    diorama.sliceEdge
  ].forEach(obj => {
    if (!obj) return;
    dioramaGroup.remove(obj);
    disposeSceneObject(obj);
  });
  diorama.terrainModel = null;
  diorama.sceneBuildContext = null;
  diorama.workArea = null;
  diorama.contextGround = null;
  diorama.annotationGroup = null;
  diorama.sliceEdge = null;
  delete container.dataset.annotationCount;
  delete container.dataset.buildingDetailCount;
  delete container.dataset.buildingCount;
  delete container.dataset.elevationRange;
  delete container.dataset.vegetationTemplateCount;
  delete container.dataset.waterwayCount;
  delete container.dataset.bridgeCount;
  delete container.dataset.roadCount;
  delete container.dataset.waterCarveCount;
  delete container.dataset.routeGeometryCount;
  delete container.dataset.routeHash;
  delete container.dataset.routeLengthMeters;
  delete container.dataset.routeEndpointKey;
  delete container.dataset.workAreaSource;
  delete container.dataset.workAreaSpanMeters;
  delete container.dataset.workAreaHardCapMeters;
  delete container.dataset.workAreaCenter;
  delete container.dataset.workAreaAnchorAdjusted;
  delete container.dataset.workAreaAnchorDistanceMeters;
  delete container.dataset.workAreaAnchorType;
  delete container.dataset.firstSlabMs;
  delete container.dataset.provenanceSourceCount;
  container.querySelector('.terrain-insight-panel')?.remove();
  if (typeof window !== 'undefined') delete window.__threeDebug__;
  container.hidden = true;
}

export function refresh3DAnnotations(diorama, { trip }) {
  if (!diorama?.proj || !diorama?.terrainModel || !diorama?.dioramaGroup) return 0;
  if (diorama.annotationGroup) {
    diorama.dioramaGroup.remove(diorama.annotationGroup);
  }
  diorama.annotationGroup = buildAnnotationGroup(diorama.proj, trip, diorama.terrainModel);
  diorama.container.dataset.annotationCount = String(diorama.annotationGroup.userData.count || 0);
  diorama.dioramaGroup.add(diorama.annotationGroup);
  updateThreeDebug(diorama);
  return diorama.annotationGroup.userData.count || 0;
}

function getTerrainClickPoint(raycaster, diorama) {
  const [hit] = raycaster.intersectObject(diorama.terrainMesh, false);
  if (hit?.point) return hit.point.clone();

  const ray = raycaster.ray;
  const targetY = Number(diorama.controls?.target?.y);
  if (!Number.isFinite(targetY) || Math.abs(ray.direction.y) < 0.001) return null;
  const t = (targetY - ray.origin.y) / ray.direction.y;
  if (t < 0) return null;

  const point = ray.origin.clone().addScaledVector(ray.direction, t);
  const bounds = diorama.terrainModel?.bounds;
  if (!bounds) return null;

  point.x = clamp(point.x, bounds.minX, bounds.maxX);
  point.z = clamp(point.z, bounds.minZ, bounds.maxZ);
  point.y =
    (Number(diorama.terrainModel?.heightAt?.(point.x, point.z)) || 0) +
    (Number(diorama.dioramaGroup?.position?.y) || 0);
  return point;
}

// Terrain geometry is imported from terrain-renderer.js.

/**
 * Reuse the 2D route segmentId in 3D and focus the camera on the rendered route.
 */
export function focus3DRoute(diorama, segmentId) {
  if (!set3DRouteHighlight(diorama, segmentId)) return Promise.resolve(false);
  const segmentGroup = diorama.routeGroup.getObjectByName(segmentId);
  const focusPoint = segmentGroup?.userData?.focusPoint;
  if (!focusPoint) return Promise.resolve(false);

  const { camera, controls } = diorama;
  diorama.cameraController?.setMode('route-focus');
  const startPosition = camera.position.clone();
  const startTarget = controls.target.clone();
  const offset = startPosition.clone().sub(startTarget);
  const segmentSpan = segmentGroup.userData.focusSpan || controls.minDistance;
  const distance = THREE.MathUtils.clamp(
    Math.max(segmentSpan * 0.36, controls.minDistance * 1.15),
    controls.minDistance,
    controls.maxDistance
  );
  const direction = offset.normalize();
  const target = focusPoint.clone();
  target.y += diorama.dioramaGroup.position.y;
  const endPosition = target.clone().addScaledVector(direction, distance);
  endPosition.y = Math.max(endPosition.y, target.y + distance * 0.48);

  controls.autoRotate = false;
  renderRouteInsight(diorama, segmentGroup);
  return animateCameraFocus(camera, controls, startPosition, startTarget, endPosition, target).then(
    () => true
  );
}

function animateCameraFocus(camera, controls, startPosition, startTarget, endPosition, endTarget) {
  const duration = 520;
  const start = performance.now();
  return new Promise(resolve => {
    const frame = now => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      camera.position.lerpVectors(startPosition, endPosition, eased);
      controls.target.lerpVectors(startTarget, endTarget, eased);
      controls.update();
      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });
}

// renderTerrainInsight is imported from terrain-renderer.js.

function updateThreeDebug(diorama) {
  const debug = publishDioramaDebug(diorama, diorama.sceneBuildContext);
  diorama.debug = debug;
}

function renderRouteInsight(diorama, segmentGroup) {
  const panel = diorama.container.querySelector('.terrain-insight-panel');
  if (!panel) return;
  const metrics = segmentGroup.userData.metrics || {};
  const confidence = diorama.terrainModel?.terrainConfidence;
  const distance = formatRouteDistance(metrics.distanceMeters);
  const ascent =
    confidence === 'flat-fallback'
      ? '高程估算'
      : `累计爬升 +${Math.max(0, metrics.ascentMeters || 0)}m`;
  const pathState = segmentGroup.userData.isEstimated ? '估算路径' : '真实路径';
  panel.innerHTML = `
    <div class="terrain-insight-title">路线地形引导</div>
    <div class="terrain-insight-meta">
      <span>${pathState}</span>
      <span>${distance}</span>
      <span>${ascent}</span>
    </div>
  `;
}

// Lighting.

function setupLighting(scene) {
  // Ambient
  scene.add(new THREE.AmbientLight(C.bgTop, 0.72));

  // Key light with soft shadows.
  const key = new THREE.DirectionalLight('#FFF8EC', 1.05);
  key.position.set(80, 100, 60);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 500;
  key.shadow.camera.left = -150;
  key.shadow.camera.right = 150;
  key.shadow.camera.top = 150;
  key.shadow.camera.bottom = -150;
  key.shadow.bias = -0.0005;
  scene.add(key);

  // Fill
  const fill = new THREE.DirectionalLight('#FFF8EC', 0.34);
  fill.position.set(-60, 20, -60);
  scene.add(fill);

  // Rim
  const rim = new THREE.DirectionalLight('#FFFDF5', 0.28);
  rim.position.set(0, 10, -80);
  scene.add(rim);
}

// Emergence animation.

function animateEmergence(diorama, bounds) {
  return new Promise(resolve => {
    const startTime = performance.now();
    diorama.generationTimeline = createGenerationTimeline();
    applyEmergenceProgress(diorama, bounds, 0);

    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / EMERGE_DURATION, 1);
      applyEmergenceProgress(diorama, bounds, progress);

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        updateGenerationTimeline(diorama, 1, true);
        resolve();
      }
    }
    requestAnimationFrame(step);
  });
}

function applyEmergenceProgress(diorama, bounds, rawProgress) {
  const progress = clamp(rawProgress, 0, 1);
  const { dioramaGroup } = diorama;
  const { liftTarget } = createFoundationMetrics(bounds);
  updateGenerationTimeline(diorama, progress);
  applyOverviewCameraPose(diorama, bounds);

  if (progress < FOUNDATION_END) {
    const eased = easeInOutCubic(progress / FOUNDATION_END);
    dioramaGroup.position.y = eased * liftTarget;
    setTerrainReveal(diorama.terrainMesh, 0);
    setGroundAssetReveal(diorama.waterGroup, 0);
    setGroundAssetReveal(diorama.roadGroup, 0);
    setGroundAssetReveal(diorama.routeGroup, 0);
    setStaticGroupReveal(diorama.bridgeGroup, 0);
    setBuildingReveal(diorama, 0, 0);
    setOverlayVisibility(diorama, false);
  } else if (progress < GEOLOGY_END) {
    dioramaGroup.position.y = liftTarget;
    const t = (progress - FOUNDATION_END) / (GEOLOGY_END - FOUNDATION_END);
    const eased = easeOutBack(Math.min(t, 1));
    setTerrainReveal(diorama.terrainMesh, eased);
    setGroundAssetReveal(diorama.waterGroup, eased);
    setGroundAssetReveal(diorama.roadGroup, eased);
    setGroundAssetReveal(diorama.routeGroup, eased);
    setStaticGroupReveal(diorama.bridgeGroup, eased);
    setBuildingReveal(diorama, 0, 0);
    setOverlayVisibility(diorama, false);
  } else if (progress < BUILDING_MASSING_END) {
    const t = (progress - GEOLOGY_END) / (BUILDING_MASSING_END - GEOLOGY_END);
    const eased = easeInOutCubic(Math.min(t, 1));
    dioramaGroup.position.y = liftTarget;
    setTerrainReveal(diorama.terrainMesh, 1);
    setGroundAssetReveal(diorama.waterGroup, 1);
    setGroundAssetReveal(diorama.roadGroup, 1);
    setGroundAssetReveal(diorama.routeGroup, 1);
    setStaticGroupReveal(diorama.bridgeGroup, 1);
    setBuildingReveal(diorama, eased, 0);
    setOverlayVisibility(diorama, false);
  } else if (progress < 1) {
    const t = (progress - BUILDING_MASSING_END) / (1 - BUILDING_MASSING_END);
    const eased = easeInOutCubic(Math.min(t, 1));
    dioramaGroup.position.y = liftTarget;
    setTerrainReveal(diorama.terrainMesh, 1);
    setGroundAssetReveal(diorama.waterGroup, 1);
    setGroundAssetReveal(diorama.roadGroup, 1);
    setGroundAssetReveal(diorama.routeGroup, 1);
    setStaticGroupReveal(diorama.bridgeGroup, 1);
    setBuildingReveal(diorama, 1, eased);
    setOverlayVisibility(diorama, eased > 0.72);
  } else {
    dioramaGroup.position.y = liftTarget;
    setTerrainReveal(diorama.terrainMesh, 1);
    setGroundAssetReveal(diorama.waterGroup, 1);
    setGroundAssetReveal(diorama.roadGroup, 1);
    setGroundAssetReveal(diorama.routeGroup, 1);
    setStaticGroupReveal(diorama.bridgeGroup, 1);
    setBuildingReveal(diorama, 1, 1);
    setOverlayVisibility(diorama, true);
  }

  updateBuildingLod(diorama);
  updateThreeDebug(diorama);
  diorama.renderer.render(diorama.scene, diorama.camera);
}

function shouldFreezeEmergenceForVisualQa() {
  return Boolean(globalThis.window?.__visualFreezeEmergence);
}

function installVisualDebugControls(diorama, bounds, { allowEmergenceProgress = false } = {}) {
  if (typeof window === 'undefined' || !window.__visualExpose3DControls) return;
  const controls = {
    async focusRoute(segmentId) {
      const focused = await focus3DRoute(diorama, segmentId);
      updateThreeDebug(diorama);
      return { focused, debug: window.__threeDebug };
    },
    setCameraPreset(name, preset = {}) {
      const applied = applyVisualCameraPreset(diorama, bounds, name, preset);
      updateThreeDebug(diorama);
      return { applied, debug: window.__threeDebug };
    }
  };
  if (allowEmergenceProgress) {
    controls.setEmergenceProgress = progress => {
      applyEmergenceProgress(diorama, bounds, progress);
      return window.__threeDebug;
    };
    controls.finishEmergence = () => {
      applyEmergenceProgress(diorama, bounds, 1);
      updateGenerationTimeline(diorama, 1, true);
      updateThreeDebug(diorama);
      return window.__threeDebug;
    };
  }
  window.__threeDebugControls = controls;
}

function applyVisualCameraPreset(diorama, bounds, name, preset = {}) {
  if (!diorama?.camera || !diorama?.controls) return false;
  const { camera, controls, dioramaGroup, proj } = diorama;
  const span = getBoundsSpan(bounds);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const targetY = dioramaGroup.position.y + span * 0.04;
  const distanceMeters = Number(preset.distanceMeters);
  const requestedDistance = Number.isFinite(distanceMeters)
    ? proj.metersToUnits(distanceMeters)
    : span * (name === 'inspect' ? 0.32 : 0.95);
  const profile = getCameraProfile(diorama.sceneBuildContext?.terrainMode);
  const inspectDistance = Number(profile.inspectDistance) || 180;
  const distance =
    name === 'inspect'
      ? Math.min(requestedDistance, inspectDistance * 0.85)
      : Math.max(requestedDistance, inspectDistance * 1.45);
  const heading = THREE.MathUtils.degToRad(Number(preset.heading) || 38);
  const pitch = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(Number(preset.pitch) || 52, 18, 72));
  const horizontalBase = Math.max(controls.minDistance, distance) * Math.cos(pitch);
  const horizontal =
    name === 'inspect' ? horizontalBase : Math.max(horizontalBase, inspectDistance * 1.45);
  const target = new THREE.Vector3(cx, targetY, cz);
  const position = new THREE.Vector3(
    cx + Math.sin(heading) * horizontal,
    targetY + Math.max(controls.minDistance * 0.35, distance * Math.sin(pitch)),
    cz + Math.cos(heading) * horizontal
  );

  camera.position.copy(position);
  controls.target.copy(target);
  diorama.cameraController?.setMode(
    name === 'inspect' ? 'inspect' : name === 'route-focus' ? 'route-focus' : 'overview'
  );
  diorama.cameraController?.update(0);
  controls.update();
  updateBuildingLod(diorama);
  diorama.renderer.render(diorama.scene, camera);
  return true;
}

function updateGenerationTimeline(diorama, progress, steady = false) {
  if (!diorama?.generationTimeline) return;
  if (steady) diorama.generationTimeline.setSteady();
  else diorama.generationTimeline.updateFromOverallProgress(progress);
  updateThreeDebug(diorama);
}

function animateExit(diorama) {
  const { dioramaGroup } = diorama;

  return new Promise(resolve => {
    const startTime = performance.now();
    const startY = dioramaGroup.position.y;

    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / EXIT_DURATION, 1);

      const t1 = Math.min(progress / 0.35, 1); // Lower buildings.
      const t2 = Math.max(0, Math.min((progress - 0.35) / 0.65, 1)); // Collapse terrain.

      setBuildingReveal(diorama, 1 - easeInCubic(t1));
      setOverlayVisibility(diorama, t1 < 0.2);
      setTerrainReveal(diorama.terrainMesh, 1 - easeInCubic(t2));
      setGroundAssetReveal(diorama.waterGroup, 1 - easeInCubic(t2));
      setGroundAssetReveal(diorama.roadGroup, 1 - easeInCubic(t2));
      setGroundAssetReveal(diorama.routeGroup, 1 - easeInCubic(t2));
      setStaticGroupReveal(diorama.bridgeGroup, 1 - easeInCubic(t2));
      dioramaGroup.position.y = startY * (1 - easeInCubic(t2));

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        dioramaGroup.position.y = 0;
        setTerrainReveal(diorama.terrainMesh, 1);
        setGroundAssetReveal(diorama.waterGroup, 1);
        setGroundAssetReveal(diorama.roadGroup, 1);
        setGroundAssetReveal(diorama.routeGroup, 1);
        setStaticGroupReveal(diorama.bridgeGroup, 1);
        setBuildingReveal(diorama, 1);
        setOverlayVisibility(diorama, true);
        resolve();
      }
    }
    requestAnimationFrame(step);
  });
}

function setTerrainReveal(mesh, progress) {
  const positions = mesh?.geometry?.attributes?.position;
  const restHeights = mesh?.userData?.restHeights;
  const foundationHeights = mesh?.userData?.foundationHeights;
  if (!positions || !restHeights || !foundationHeights) return;
  for (let i = 0; i < positions.count; i += 1) {
    positions.setY(i, THREE.MathUtils.lerp(foundationHeights[i], restHeights[i], progress));
  }
  positions.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
}

function setGroundAssetReveal(group, progress) {
  const revealProgress = smoothstep(Math.max(0, Math.min(progress, 1)));
  for (const mesh of group?.userData?.revealTargets || []) {
    const reveal = mesh.userData?.surfaceReveal;
    if (!reveal) continue;
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (Number.isFinite(reveal.restY)) {
      mesh.position.y = THREE.MathUtils.lerp(reveal.foundationY, reveal.restY, progress);
    } else {
      const positions = mesh.geometry?.attributes?.position;
      if (positions && reveal.restHeights && reveal.foundationHeights) {
        for (let index = 0; index < positions.count; index += 1) {
          positions.setY(
            index,
            THREE.MathUtils.lerp(
              reveal.foundationHeights[index],
              reveal.restHeights[index],
              progress
            )
          );
        }
        positions.needsUpdate = true;
      }
    }
    if (material && Number.isFinite(reveal.restOpacity)) {
      material.opacity = reveal.restOpacity * revealProgress;
      material.transparent = true;
    }
  }
}

function setStaticGroupReveal(group, progress) {
  const opacity = smoothstep(clamp(progress, 0, 1));
  for (const { material, restOpacity } of group?.userData?.revealMaterials || []) {
    material.opacity = restOpacity * opacity;
    material.transparent = true;
  }
}

function setBuildingReveal(diorama, progress, dissolveProgress = progress) {
  const reveal = smoothstep(clamp(progress, 0, 1));
  const dissolve = smoothstep(clamp(dissolveProgress, 0, 1));
  diorama.buildingRevealProgress = reveal;
  diorama.buildingDissolveProgress = dissolve;
  if (diorama.buildingGroup) diorama.buildingGroup.visible = reveal > 0.01;
}

function setOverlayVisibility(diorama, visible) {
  if (diorama.markerGroup) diorama.markerGroup.visible = visible;
  if (diorama.annotationGroup) diorama.annotationGroup.visible = visible;
}

// getTerrainBounds, getTerrainHeightScale are imported from terrain-renderer.js.
// Geo utilities are imported from geo-utils.js.
// Camera pose functions are imported from camera-pose.js.
// Easing and math utilities are imported from math-utils.js.
