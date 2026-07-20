// js/render/map-3d.js
// Three.js planning diorama renderer — core orchestration.
//
// Design contract: see ARCHITECTURE.md ADR-6 and docs/architecture/3d/top-down-execution-roadmap.md.
// Extracted modules: camera-pose, terrain-renderer, marker-renderer, vegetation-renderer,
// emergence-animation, lighting, scene-builder, route-interaction, visual-debug, math-utils, geo-utils.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createGeoProjection } from './geo-project.js';
import { createLogger } from '../logger.js';
import { chooseTerrainMode } from './terrain-mode.js?v=20260621-region-grid-v2';
import { createTerrainModel } from './terrain-model.js';
import { createSceneBuildContext } from './scene-build-context.js';
import { updateThreeDebug } from './scene-debug.js';
import { didBuildingLodSignatureChange, updateBuildingLod } from './building-dissolve-renderer.js';
import {
  animateEmergence,
  applyEmergenceProgress,
  animateExit,
  shouldFreezeEmergenceForVisualQa
} from './emergence-animation.js';
import { createCameraController } from './camera-controller.js';
import { createGenerationTimeline } from './generation-timeline.js';
import { applyTerrainCarving } from './terrain-carving.js';
import { setupLighting } from './lighting.js';
import { withTimeout } from './math-utils.js';
import {
  getBoundsSpan,
  getInitialOverviewCameraPose,
  applyOverviewCameraPose,
  getCameraControlDistances
} from './camera-pose.js';
import {
  getTerrainBounds,
  getTerrainHeightScale,
  renderTerrainInsight
} from './terrain-renderer.js';
import {
  normalizeWorkArea,
  computeRouteLength,
  collectDayLocations,
  disposeSceneObject,
  clearDioramaDataset
} from './geo-utils.js';
import { buildAnnotationGroup } from './marker-renderer.js';
import { buildSceneLayers } from './scene-builder.js';
import { getTerrainClickPoint } from './route-interaction.js';
import { installVisualDebugControls } from './visual-debug.js';

export { set3DRouteHighlight } from './route-guidance-renderer.js';
export { getBuildingDetailAlpha } from './building-dissolve-renderer.js';
export { focus3DRoute } from './route-interaction.js';

const log = createLogger('map-3d');

const BONE_WHITE = '#FCFAF5';

const IDLE_RESUME_DELAY = 25000;
const AUTO_ROTATE_SPEED = 0.5;
const CLICK_MOVE_TOLERANCE = 6;
const FIRST_SLAB_ELEVATION_BUDGET_MS = 1200;

let instance = null;

/**
 * Create a 3D diorama instance without entering 3D mode immediately.
 * @param {object} options
 * @param {HTMLElement} options.container #map-3d container
 * @returns {Promise<object>}
 */
export async function initDiorama({ container }) {
  if (instance) return instance;

  const width = container.clientWidth || 800;
  const height = container.clientHeight || 600;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BONE_WHITE);
  scene.fog = new THREE.Fog(BONE_WHITE, 220, 900);

  const camera = new THREE.PerspectiveCamera(50, width / height, 0.5, 2000);
  const initialCameraPose = getInitialOverviewCameraPose();
  camera.position.copy(initialCameraPose.position);
  camera.lookAt(initialCameraPose.target);

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

  const dioramaGroup = new THREE.Group();
  scene.add(dioramaGroup);

  setupLighting(scene);

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

/**
 * Enter 3D mode by loading terrain, building layers, and running emergence animation.
 * @param {object} diorama
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

  const locations = collectDayLocations(trip, activeDayId);
  const lnglats = locations.map(loc => loc.lnglat);
  if (!lnglats.length) {
    log.warn('No valid coordinates; cannot enter 3D mode');
    throw new Error('No valid coordinates; cannot enter 3D mode');
  }

  const selectedWorkArea = normalizeWorkArea(workArea, lnglats);
  const center = selectedWorkArea.center;
  const proj = createGeoProjection({ center, scale: 0.5 });
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

  buildSceneLayers(diorama, {
    proj,
    trip,
    activeDayId,
    terrainModel,
    terrainMode,
    sceneContext,
    locations
  });
  updateThreeDebug(diorama);

  container.hidden = false;
  container.dataset.firstSlabMs = String(Math.round(performance.now() - enterStartedAt));
  renderer.setSize(container.clientWidth, container.clientHeight);

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

  await animateEmergence(diorama, bounds);

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
 * @param {object} diorama
 */
export async function exit3DMode(diorama) {
  const { dioramaGroup, controls, container } = diorama;
  diorama.cameraController?.setEnabled(false);
  diorama.cameraController?.setPhase('exiting');
  controls.autoRotate = false;

  await animateExit(diorama);

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
  clearDioramaDataset(container);
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
