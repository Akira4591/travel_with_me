// js/render/map-3d.js
// Three.js planning diorama renderer.
//
// Design contract: see ARCHITECTURE.md ADR-6 and docs/3d-top-down-execution-roadmap.md.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createGeoProjection } from './geo-project.js';
import { createLogger } from '../logger.js';
import { chooseTerrainMode } from './terrain-mode.js?v=20260621-region-grid-v2';
import { createTerrainModel } from './terrain-model.js';
import { getAnnotationType } from '../annotations.js';
import { chooseBuildingTemplate } from './building-templates.js';
import { getAppState } from '../state.js';
import { ROUTE_GUIDANCE } from '../route-guidance.js';
import { createSceneBuildContext } from './scene-build-context.js';
import { publishDioramaDebug } from './scene-debug.js';
import { buildBridgeGroup, buildRoadGroup, buildWaterGroup } from './geo-asset-renderer.js';
import { buildRouteGroup, set3DRouteHighlight } from './route-guidance-renderer.js';
import { createCameraController, getCameraProfile } from './camera-controller.js';
import { createGenerationTimeline } from './generation-timeline.js';
import { GENERATION_TIMING_MS } from './generation-timing.js';
import { createFoundationMetrics } from './terrain-foundation.js';
import { applyTerrainCarving } from './terrain-carving.js';

export { set3DRouteHighlight };

const log = createLogger('map-3d');

// Color constants.

const BONE_WHITE = '#FCFAF5';

const C = {
  terrainBase: BONE_WHITE,
  terrainLow: BONE_WHITE,
  terrainMid: BONE_WHITE,
  terrainHigh: BONE_WHITE,
  water: '#A8B8C8',
  shadow: '#9E9685',
  contour: '#D9D2C5',
  building: '#D8D2C6',
  routeBed: ROUTE_GUIDANCE.roadBed,
  routeOutline: '#625C51',
  routeLine: ROUTE_GUIDANCE.line,
  markerActive: ROUTE_GUIDANCE.activeLine,
  markerInactive: '#B0A590',
  markerStem: '#9E9685',
  annotationStem: '#EFE8D6',
  bgTop: BONE_WHITE,
  bgBottom: BONE_WHITE,
  particle: BONE_WHITE,
  sliceStrata: ['#C4BBA8', '#B8B5A7', '#B0A590', '#A89D8C']
};

// Render constants.

const BUILDING_MIN_HEIGHT = 3;
const BUILDING_MAX_HEIGHT = 14;
const BUILDING_DETAIL_NEAR_DISTANCE = 260;
const BUILDING_DETAIL_FAR_DISTANCE = 760;
const MARKER_STEM_HEIGHT = 15;
const MARKER_HEAD_RADIUS = 2.8;
const ANNOTATION_STEM_HEIGHT = 11;
const ANNOTATION_HEAD_RADIUS = 2.2;
const DIORAMA_SLICE_THICKNESS = 20;
const PARTICLE_COUNT = 0;

// Auto orbit resumes after user drag only in overview-like modes.
const IDLE_RESUME_DELAY = 25000;
const AUTO_ROTATE_SPEED = 0.5;
const OVERVIEW_CAMERA_OFFSET = {
  x: 0.55,
  y: 0.9,
  z: 0.72
};

// Emergence animation constants.
const EMERGE_DURATION = GENERATION_TIMING_MS.total;
const EMERGE_PHASE_MS = GENERATION_TIMING_MS.foundationRise;
const FOUNDATION_END = EMERGE_PHASE_MS / EMERGE_DURATION;
const GEOLOGY_END = (EMERGE_PHASE_MS * 2) / EMERGE_DURATION;
const BUILDING_MASSING_END = (EMERGE_PHASE_MS * 3) / EMERGE_DURATION;
const EXIT_DURATION = 900;
const CLICK_MOVE_TOLERANCE = 6;
const FIRST_SLAB_ELEVATION_BUDGET_MS = 1200;
const DEFAULT_WORK_AREA_SPAN_METERS = 800;
const MIN_WORK_AREA_SPAN_METERS = 300;
const WORK_AREA_HARD_CAP_METERS = 2000;

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
 * 鍒涘缓 3D diorama 瀹炰緥锛堜笉绔嬪嵆杩涘叆 3D 妯″紡锛? * @param {object} options
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
  camera.position.set(0, 120, 180);
  camera.lookAt(0, 0, 0);

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
  controls.target.set(0, 0, 0);
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

  // Ambient particles are currently disabled.
  const particles = createParticles();
  scene.add(particles);

  // 鍏夌収
  setupLighting(scene);

  // 鍔ㄧ敾寰幆
  let animId;
  let lastFrameTime = performance.now();
  function animate(now = performance.now()) {
    animId = requestAnimationFrame(animate);
    const deltaSeconds = Math.min((now - lastFrameTime) / 1000, 0.08);
    lastFrameTime = now;
    const moved = instance?.cameraController
      ? instance.cameraController.update(deltaSeconds)
      : controls.update();
    if ((moved || instance?.debug?.camera?.activeKeys?.length) && instance) {
      updateThreeDebug(instance);
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
    particles,
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

function withTimeout(promise, ms, fallbackValue) {
  let timerId;
  const timeout = new Promise(resolve => {
    timerId = setTimeout(() => resolve(fallbackValue), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timerId));
}

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
  diorama.buildingGroup = buildBuildingGroup(proj, locations, terrainModel, sceneContext.geoAssets);
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
  diorama.cameraController?.setPhase('steady');
  diorama.cameraController?.setEnabled(true);
  diorama.cameraController?.setMode('overview');
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

  // 娓呯悊
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

// Terrain geometry.

function buildTerrainMesh(terrainModel) {
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

  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(C.terrainBase),
    toneMapped: false
  });

  const mesh = new THREE.Mesh(geom, mat);
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

function buildContextGround(terrainModel) {
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

// Building geometry.

/**
 * @param {import('./geo-project.js').GeoProjection} proj
 * @param {Array<[number, number]>} lnglats
 * @param {import('../data/trip.js').Trip} trip
 * @returns {THREE.Group}
 */
function buildBuildingGroup(proj, locations, terrainModel, geoAssets = {}) {
  const group = new THREE.Group();
  const lodEntries = [];
  const baseTerrainErrorsMeters = [];
  const featureScale = getOverviewFeatureScale(terrainModel.bounds);
  const authoritativeBuildings = Array.isArray(geoAssets.buildings) ? geoAssets.buildings : [];
  const realBuildings = new Map(
    authoritativeBuildings.filter(asset => asset.locationId).map(asset => [asset.locationId, asset])
  );

  authoritativeBuildings
    .filter(asset => !asset.locationId)
    .forEach(asset => {
      const entry = createAuthoritativeBuildingLod(asset, proj, terrainModel);
      if (!entry) return;
      group.add(entry.low, entry.detail);
      lodEntries.push(entry);
      baseTerrainErrorsMeters.push(...entry.baseTerrainErrorsMeters);
    });

  for (const loc of locations) {
    const { x, z } = proj.toScene(loc.lnglat);
    const realBuilding = realBuildings.get(loc.id);
    if (realBuilding) {
      const entry = createAuthoritativeBuildingLod(realBuilding, proj, terrainModel);
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
    const lowMaterial = createBuildingMaterial(C.building, 0.9);
    const low = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), lowMaterial);
    low.position.set(x, terrainY + h / 2, z);
    low.castShadow = true;
    low.receiveShadow = true;

    const detail = createDetailedBuilding({ x, z, terrainY, width: w, height: h, seed, template });
    detail.visible = false;
    group.add(low, detail);
    baseTerrainErrorsMeters.push(0);
    lodEntries.push({
      center: new THREE.Vector3(x, terrainY + h / 2, z),
      low,
      detail,
      lowMaterial,
      detailMaterials: detail.userData.materials,
      detailAlpha: 0
    });
  }

  group.userData.lodEntries = lodEntries;
  group.userData.authoritativeCount = lodEntries.filter(entry => entry.authoritative).length;
  group.userData.count = lodEntries.length;
  group.userData.baseTerrainErrorsMeters = baseTerrainErrorsMeters;
  group.userData.baseTerrainErrorP95Meters = percentile(baseTerrainErrorsMeters, 0.95);
  group.userData.baseTerrainErrorMaxMeters = maxMetric(baseTerrainErrorsMeters);
  return group;
}

function createAuthoritativeBuildingLod(asset, proj, terrainModel) {
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
  const lowMaterial = createBuildingMaterial(C.building, 0.9);
  const low = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false }),
    lowMaterial
  );
  low.rotation.x = -Math.PI / 2;
  low.position.y = terrainY;
  low.castShadow = true;
  low.receiveShadow = true;

  const detailMaterial = createBuildingMaterial('#E9E4DA', 0);
  const roofMaterial = createBuildingMaterial('#B8AA91', 0);
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
  const facadeMaterial = createBuildingMaterial('#E9E4DA', 0);
  const roofMaterial = createBuildingMaterial('#C4BBA8', 0);
  const accentMaterial = createBuildingMaterial('#B0A590', 0);
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

function updateBuildingLod(diorama) {
  if (!diorama?.buildingLodEntries?.length || !diorama.camera) return;
  const buildingReveal = clamp(diorama.buildingRevealProgress ?? 1, 0, 1);
  const buildingDissolve = clamp(diorama.buildingDissolveProgress ?? 1, 0, 1);
  let detailCount = 0;
  let detailAlphaTotal = 0;
  const distances = [];
  for (const entry of diorama.buildingLodEntries) {
    const distance = diorama.camera.position.distanceTo(entry.center);
    distances.push(distance);
    const target = getBuildingDetailAlpha(distance) * buildingDissolve;
    entry.detailAlpha += (target - entry.detailAlpha) * 0.14;
    const detailAlpha = clamp(entry.detailAlpha, 0, 1);
    const lowAlpha = 1 - detailAlpha * 0.72;
    detailAlphaTotal += detailAlpha;

    entry.lowMaterial.opacity = lowAlpha * buildingReveal;
    entry.lowMaterial.depthWrite = lowAlpha * buildingReveal > 0.98;
    entry.detail.visible = detailAlpha > 0.015 && buildingReveal > 0.015;
    if (detailAlpha >= 0.5) detailCount += 1;
    entry.detail.scale.y = 0.74 + detailAlpha * 0.26;
    entry.detail.position.y = (1 - detailAlpha) * -1.2;
    entry.detailMaterials.forEach(material => {
      material.opacity = detailAlpha * buildingReveal;
      material.depthWrite = detailAlpha * buildingReveal > 0.98;
    });
  }
  diorama.buildingDetailCount = detailCount;
  const total = diorama.buildingLodEntries.length;
  diorama.buildingGroup.userData.lodMetrics = {
    detailRatio: roundMetric(total > 0 ? detailCount / total : 0),
    detailAlphaAverage: roundMetric(total > 0 ? detailAlphaTotal / total : 0),
    distanceP50: roundMetric(percentile(distances, 0.5)),
    entryCount: total
  };
  diorama.container.dataset.buildingDetailCount = String(detailCount);
  diorama.container.dataset.buildingDetailRatio = String(
    diorama.buildingGroup.userData.lodMetrics.detailRatio
  );
}

function didBuildingLodSignatureChange(diorama) {
  const metrics = diorama?.buildingGroup?.userData?.lodMetrics;
  if (!metrics) return false;
  const signature = [
    diorama.buildingDetailCount,
    metrics.detailRatio,
    metrics.detailAlphaAverage,
    metrics.distanceP50
  ].join(':');
  if (signature === diorama._lastPublishedBuildingLodSignature) return false;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (now - (diorama._lastPublishedBuildingLodAt || 0) < 120) return false;
  diorama._lastPublishedBuildingLodSignature = signature;
  diorama._lastPublishedBuildingLodAt = now;
  return true;
}

export function getBuildingDetailAlpha(distance) {
  const normalized =
    (Number(distance) - BUILDING_DETAIL_NEAR_DISTANCE) /
    (BUILDING_DETAIL_FAR_DISTANCE - BUILDING_DETAIL_NEAR_DISTANCE);
  const farProgress = smoothstep(clamp(normalized, 0, 1));
  return 1 - farProgress;
}

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

function buildVegetationGroup(proj, terrainModel, vegetationAreas) {
  const group = new THREE.Group();
  const areas = Array.isArray(vegetationAreas) ? vegetationAreas : [];
  const templates = [
    { id: 'conifer-cluster', radius: 0.32, height: 1.8 },
    { id: 'broadleaf-cluster', radius: 0.46, height: 1.35 },
    { id: 'shrub-cluster', radius: 0.28, height: 0.58 },
    { id: 'ridge-conifer', radius: 0.24, height: 2.2 },
    { id: 'low-cover', radius: 0.52, height: 0.3 }
  ];
  const materials = templates.map(
    (_, index) =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(['#839177', '#96A386', '#A9B394', '#73866C', '#BBC1A6'][index]),
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
    areaBudgets.push({
      id: area.id || '',
      cover: area.cover || '',
      densityCap,
      instances: points.length
    });
    for (const point of points) {
      const template =
        templates[
          Math.abs(Math.floor(seededUnit(`${area.id}:${point.x}:${point.z}`) * templates.length)) %
            templates.length
        ];
      const geometry = template.id.includes('conifer')
        ? new THREE.ConeGeometry(template.radius, template.height, 5)
        : new THREE.DodecahedronGeometry(template.radius, 0);
      const mesh = new THREE.Mesh(geometry, materials[templates.indexOf(template)]);
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

function vegetationDensityForCover(cover) {
  return cover === 'forest' ? 12 : cover === 'scrub' ? 8 : 5;
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i],
      b = polygon[j];
    const crosses =
      a.z > point.z !== b.z > point.z &&
      point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

// Marker and annotation geometry.

/**
 * @param {import('./geo-project.js').GeoProjection} proj
 * @param {import('../data/trip.js').Trip} trip
 * @param {string} activeDayId
 * @returns {THREE.Group}
 */
function buildMarkerGroup(proj, trip, activeDayId, terrainModel) {
  const group = new THREE.Group();
  const stemMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(C.markerStem),
    roughness: 0.6,
    metalness: 0.3
  });
  const headMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(C.markerActive),
    roughness: 0.25,
    metalness: 0.2
  });
  const ringMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(C.routeLine),
    transparent: true,
    opacity: 0.4
  });

  const day = activeDayId === 'all' ? null : trip.days.find(d => d.id === activeDayId);
  const days = day ? [day] : trip.days;

  let globalIndex = 1;
  for (const d of days) {
    for (const event of d.events || []) {
      const loc = trip.locations[event.locationId];
      if (!loc?.lnglat) continue;

      const { x, z } = proj.toScene(loc.lnglat);
      const terrainY = terrainModel.heightAt(x, z);
      const markerGroup = new THREE.Group();

      // Stem.
      const stemGeom = new THREE.CylinderGeometry(0.4, 0.5, MARKER_STEM_HEIGHT, 8);
      const stem = new THREE.Mesh(stemGeom, stemMat);
      stem.position.y = MARKER_STEM_HEIGHT / 2;
      markerGroup.add(stem);

      // Head.
      const headGeom = new THREE.SphereGeometry(MARKER_HEAD_RADIUS, 16, 16);
      const head = new THREE.Mesh(headGeom, headMat);
      head.position.y = MARKER_STEM_HEIGHT + MARKER_HEAD_RADIUS;
      head.castShadow = true;
      markerGroup.add(head);

      const ringGeom = new THREE.TorusGeometry(5, 0.3, 8, 24);
      const ring = new THREE.Mesh(ringGeom, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.1;
      ring.userData = { baseScale: 1, phase: seededUnit(event.id || loc.name) * Math.PI * 2 };
      markerGroup.add(ring);

      markerGroup.position.set(x, terrainY, z);
      markerGroup.userData = { eventId: event.id, globalIndex: globalIndex++ };
      group.add(markerGroup);
    }
  }

  return group;
}

function buildAnnotationGroup(proj, trip, terrainModel) {
  const group = new THREE.Group();
  const stemMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(C.annotationStem),
    roughness: 0.45,
    metalness: 0.15
  });
  const annotations = Array.isArray(trip.annotations) ? trip.annotations : [];
  const materialCache = new Map();
  let count = 0;

  for (const annotation of annotations) {
    if (!isValidLngLat(annotation?.lnglat)) continue;
    const type = getAnnotationType(annotation.type);
    const { x, z } = proj.toScene(annotation.lnglat);
    const terrainY = terrainModel.heightAt(x, z);
    const marker = new THREE.Group();

    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.34, ANNOTATION_STEM_HEIGHT, 8),
      stemMat
    );
    stem.position.y = ANNOTATION_STEM_HEIGHT / 2;
    marker.add(stem);

    const head = new THREE.Mesh(
      createAnnotationHeadGeometry(type.id),
      getAnnotationMaterial(materialCache, type)
    );
    head.position.y = ANNOTATION_STEM_HEIGHT + ANNOTATION_HEAD_RADIUS;
    head.castShadow = true;
    marker.add(head);

    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(3.4, 0.18, 8, 24),
      getAnnotationHaloMaterial(materialCache, type)
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.2;
    marker.add(halo);

    marker.position.set(x, terrainY, z);
    marker.userData = {
      annotationId: annotation.id,
      type: type.id,
      title: annotation.title
    };
    group.add(marker);
    count += 1;
  }

  group.userData = { count };
  return group;
}

function renderTerrainInsight(container, terrainMode, terrainModel, poiCount) {
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

function formatRouteDistance(distanceMeters) {
  const meters = Number(distanceMeters) || 0;
  return meters >= 1000 ? `路线 ${Math.round((meters / 1000) * 10) / 10}km` : `路线 ${meters}m`;
}
function createAnnotationHeadGeometry(typeId) {
  if (typeId === 'risk') return new THREE.ConeGeometry(ANNOTATION_HEAD_RADIUS, 5, 3);
  if (typeId === 'transfer') return new THREE.BoxGeometry(3.8, 3.8, 3.8);
  if (typeId === 'entrance') return new THREE.CylinderGeometry(2.2, 2.2, 3.4, 6);
  return new THREE.SphereGeometry(ANNOTATION_HEAD_RADIUS, 16, 16);
}

function getAnnotationMaterial(cache, type) {
  const key = `head:${type.id}`;
  if (!cache.has(key)) {
    cache.set(
      key,
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(type.color),
        roughness: 0.28,
        metalness: 0.18
      })
    );
  }
  return cache.get(key);
}

function getAnnotationHaloMaterial(cache, type) {
  const key = `halo:${type.id}`;
  if (!cache.has(key)) {
    cache.set(
      key,
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(type.color),
        transparent: true,
        opacity: 0.26
      })
    );
  }
  return cache.get(key);
}

// Slice edge geometry kept for experiments; production currently leaves terrain unboxed.

/**
 * @param {{ minX, maxX, minZ, maxZ }} bounds
 * @returns {THREE.Group}
 */
function _buildSliceEdge(bounds) {
  const group = new THREE.Group();
  const thickness = DIORAMA_SLICE_THICKNESS;
  const w = bounds.maxX - bounds.minX;
  const d = bounds.maxZ - bounds.minZ;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;

  const boxGeom = new THREE.BoxGeometry(w + 2, thickness, d + 2);
  const edgeMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(C.sliceStrata[0]),
    roughness: 0.82,
    metalness: 0.0
  });

  const edge = new THREE.Mesh(boxGeom, edgeMat);
  edge.position.set(cx, -thickness / 2, cz);
  edge.receiveShadow = true;
  group.add(edge);

  return group;
}

// Particles.

function createParticles() {
  const geom = new THREE.BufferGeometry();
  const count = PARTICLE_COUNT;
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 200;
    positions[i * 3 + 1] = 10 + Math.random() * 80;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 200;
  }

  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: new THREE.Color(C.particle),
    size: 0.8,
    transparent: true,
    opacity: 0.2,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  return new THREE.Points(geom, mat);
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
  diorama.cameraController?.setMode(name === 'inspect' ? 'inspect' : 'overview');
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

function disposeSceneObject(object) {
  object.traverse(node => {
    node.geometry?.dispose?.();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.filter(Boolean).forEach(material => material.dispose?.());
  });
}

// Export helpers.

/**
 * Export the current 3D frame as a PNG data URL.
 * @param {DioramaInstance} diorama
 * @returns {string}
 */
export function captureFrame(diorama) {
  diorama.renderer.render(diorama.scene, diorama.camera);
  return diorama.renderer.domElement.toDataURL('image/png');
}

// Utility functions.

function collectDayLocations(trip, activeDayId) {
  const locations = [];
  const days = activeDayId === 'all' ? trip.days : trip.days.filter(d => d.id === activeDayId);

  for (const day of days) {
    for (const event of day.events || []) {
      const loc = trip.locations[event.locationId];
      if (loc?.lnglat && isValidLngLat(loc.lnglat)) {
        locations.push({ id: event.locationId, eventId: event.id, ...loc });
      }
    }
  }
  return locations;
}

function computeCenter(lnglats) {
  let sumLng = 0,
    sumLat = 0;
  for (const [lng, lat] of lnglats) {
    sumLng += lng;
    sumLat += lat;
  }
  return [sumLng / lnglats.length, sumLat / lnglats.length];
}

function normalizeWorkArea(workArea, fallbackLnglats) {
  const fallbackCenter = computeCenter(fallbackLnglats);
  const hardCapMeters = clamp(
    Number(workArea?.hardCapMeters) || WORK_AREA_HARD_CAP_METERS,
    MIN_WORK_AREA_SPAN_METERS,
    WORK_AREA_HARD_CAP_METERS
  );
  const requestedSpan = Number(workArea?.spanMeters);
  const spanMeters = clamp(
    Number.isFinite(requestedSpan) ? requestedSpan : DEFAULT_WORK_AREA_SPAN_METERS,
    MIN_WORK_AREA_SPAN_METERS,
    hardCapMeters
  );
  const center = isValidLngLat(workArea?.center) ? workArea.center.map(Number) : fallbackCenter;
  return {
    source: workArea?.source || 'fallback-trip-center',
    center,
    spanMeters: Math.round(spanMeters),
    hardCapMeters: Math.round(hardCapMeters),
    profile: workArea?.profile || 'default',
    bounds: squareBounds(center, spanMeters)
  };
}

function squareBounds(center, spanMeters) {
  const half = spanMeters / 2;
  const latDelta = half / 111320;
  const lngDelta = half / (111320 * Math.cos((center[1] * Math.PI) / 180));
  return {
    minLng: center[0] - lngDelta,
    maxLng: center[0] + lngDelta,
    minLat: center[1] - latDelta,
    maxLat: center[1] + latDelta
  };
}

function isValidLngLat(v) {
  return Array.isArray(v) && v.length >= 2 && Number.isFinite(v[0]) && Number.isFinite(v[1]);
}

function computeRouteLength(lnglats) {
  let total = 0;
  for (let i = 0; i < lnglats.length - 1; i += 1) {
    total += distanceMeters(lnglats[i], lnglats[i + 1]);
  }
  return total;
}

function distanceMeters([lngA, latA], [lngB, latB]) {
  const midLat = ((latA + latB) / 2) * (Math.PI / 180);
  const dx = (lngB - lngA) * 111320 * Math.cos(midLat);
  const dy = (latB - latA) * 111320;
  return Math.sqrt(dx * dx + dy * dy);
}

function getTerrainBounds(proj, span) {
  const size = proj.metersToUnits(span);
  const half = size / 2;
  return { minX: -half, maxX: half, minZ: -half, maxZ: half };
}

function getTerrainHeightScale(proj, terrainMode) {
  if (terrainMode.id === 'hiking') return proj.metersToUnits(70);
  if (terrainMode.id === 'scenic-park') return proj.metersToUnits(45);
  if (terrainMode.id === 'region-overview') return proj.metersToUnits(28);
  if (terrainMode.id === 'micro-street') return proj.metersToUnits(10);
  return proj.metersToUnits(30);
}

function getOverviewFeatureScale(bounds) {
  const span = getBoundsSpan(bounds);
  return THREE.MathUtils.clamp(span / 850, 1, 6);
}

function getBoundsSpan(bounds) {
  return Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
}

export function getOverviewCameraPose(bounds, { terrainModel = null, terrainMode = null } = {}) {
  const { span, liftTarget, centerX: cx, centerZ: cz } = createFoundationMetrics(bounds);
  const centerTerrainY = Number(terrainModel?.heightAt?.(cx, cz));
  const targetY = liftTarget + (Number.isFinite(centerTerrainY) ? centerTerrainY : 0);
  const target = new THREE.Vector3(cx, targetY, cz);
  const positionX = cx + span * OVERVIEW_CAMERA_OFFSET.x;
  const positionZ = cz + span * OVERVIEW_CAMERA_OFFSET.z;
  const desiredY = targetY + span * OVERVIEW_CAMERA_OFFSET.y;
  const profile = getCameraProfile(terrainMode);
  const terrainY = Number(terrainModel?.heightAt?.(positionX, positionZ));
  const groundY = (Number.isFinite(terrainY) ? terrainY : 0) + liftTarget;
  const positionY = clamp(desiredY, groundY + profile.minClearance, groundY + profile.maxClearance);
  return {
    position: new THREE.Vector3(positionX, positionY, positionZ),
    target
  };
}

function applyOverviewCameraPose(diorama, bounds) {
  if (!diorama?.camera || !diorama?.controls) return null;
  const pose = getOverviewCameraPose(bounds, {
    terrainModel: diorama.terrainModel,
    terrainMode: diorama.sceneBuildContext?.terrainMode
  });
  diorama.camera.position.copy(pose.position);
  diorama.controls.target.copy(pose.target);
  diorama.controls.update();
  return pose;
}

function getCameraControlDistances(sceneSpan, terrainMode) {
  const profile = getCameraProfile(terrainMode);
  const inspectDistance = Number(profile.inspectDistance) || 180;
  const minDistance = THREE.MathUtils.clamp(sceneSpan * 0.06, 36, inspectDistance * 0.75);
  return {
    minDistance,
    maxDistance: Math.max(minDistance * 4, sceneSpan * 2.1)
  };
}

function seededUnit(value) {
  const text = String(value || '');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

// Easing functions.

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeInCubic(t) {
  return t * t * t;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function percentile(values, ratio) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1);
  return roundMetric(sorted[index]);
}

function maxMetric(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? roundMetric(Math.max(...finite)) : 0;
}

function roundMetric(value) {
  return Number((Number(value) || 0).toFixed(3));
}
