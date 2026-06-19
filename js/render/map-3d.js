// js/render/map-3d.js
// 3D 任务简报式地形沙盘渲染器
//
// 依赖: Three.js (通过 import map 加载)
// 设计规范: 见 ARCHITECTURE.md ADR-6
//
// 使用方式:
//   import { initDiorama, enter3DMode, exit3DMode } from './render/map-3d.js';
//   const diorama = await initDiorama({ container, trip, day });
//   diorama.enter(trip2DMapCenter);

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createGeoProjection } from './geo-project.js';
import { fetchElevationGrid } from '../api/elevation.js';
import { createLogger } from '../logger.js';

const log = createLogger('map-3d');

// ─── 颜色常量（ADR-6 §一） ───────────────────────────────

const C = {
  terrainBase: '#EDE8DD',
  terrainLow: '#D5CFC2',
  terrainMid: '#C4BBA8',
  terrainHigh: '#B0A590',
  water: '#A8B8C8',
  shadow: '#9E9685',
  contour: '#D9D2C5',
  building: '#C8BFAD',
  routeLine: '#C4A44A',
  markerActive: '#D4A830',
  markerInactive: '#B0A590',
  markerStem: '#9E9685',
  bgTop: '#1A1917',
  bgBottom: '#2D2A26',
  particle: '#FCFAF5',
  sliceStrata: ['#C4BBA8', '#B8B5A7', '#B0A590', '#A89D8C']
};

// ─── 参数常量 ──────────────────────────────────────────

const TERRAIN_RESOLUTION = 40; // 高程网格分辨率
const BUILDING_MIN_HEIGHT = 3; // 最小建筑高度 (scene units)
const BUILDING_MAX_HEIGHT = 25;
const MARKER_STEM_HEIGHT = 15;
const MARKER_HEAD_RADIUS = 2.8;
const ROUTE_LIFT = 8; // 路线在地形上方的偏移
const DIORAMA_SLICE_THICKNESS = 20;
const PARTICLE_COUNT = 50;

// 空闲环视
const IDLE_RESUME_DELAY = 30000; // 30s 无操作后恢复环视
const AUTO_ROTATE_SPEED = 0.18; // 度/秒

// 浮升动画参数 (ADR-6 §四)
const EMERGE_DURATION = 1400;
const EXIT_DURATION = 900;

// ─── 状态 ──────────────────────────────────────────────

let instance = null; // 单例

/**
 * @typedef {object} DioramaInstance
 * @property {HTMLElement} container
 * @property {THREE.Scene} scene
 * @property {THREE.PerspectiveCamera} camera
 * @property {THREE.WebGLRenderer} renderer
 * @property {OrbitControls} controls
 * @property {THREE.Group} dioramaGroup — 整体抬升容器
 * @property {THREE.Mesh} terrainMesh
 * @property {THREE.Group} buildingGroup
 * @property {THREE.Group} markerGroup
 * @property {THREE.Group} routeGroup
 * @property {import('./geo-project.js').GeoProjection} proj
 * @property {Function} dispose
 */

// ─── 初始化 ──────────────────────────────────────────────

/**
 * 创建 3D diorama 实例（不立即进入 3D 模式）
 * @param {object} options
 * @param {HTMLElement} options.container — #map-3d 容器元素
 * @returns {Promise<DioramaInstance>}
 */
export async function initDiorama({ container }) {
  if (instance) return instance;

  const width = container.clientWidth || 800;
  const height = container.clientHeight || 600;

  // Scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(C.bgBottom);
  scene.fog = new THREE.Fog(C.bgBottom, 80, 600);

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
  renderer.toneMappingExposure = 1.1;
  container.appendChild(renderer.domElement);

  // Controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 0, 0);
  controls.minDistance = 30;
  controls.maxDistance = 600;
  controls.maxPolarAngle = Math.PI * 0.48; // 不翻到底部
  controls.autoRotate = false;
  controls.autoRotateSpeed = AUTO_ROTATE_SPEED;
  controls.update();

  // Diorama 根容器 (用于整体抬升)
  const dioramaGroup = new THREE.Group();
  scene.add(dioramaGroup);

  // 粒子
  const particles = createParticles();
  scene.add(particles);

  // 光照
  setupLighting(scene);

  // 动画循环
  let animId;
  function animate() {
    animId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  // 空闲环视管理
  let idleTimer = null;
  controls.addEventListener('start', () => {
    controls.autoRotate = false;
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  });
  controls.addEventListener('end', () => {
    idleTimer = setTimeout(() => {
      controls.autoRotate = true;
    }, IDLE_RESUME_DELAY);
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
    markerGroup: null,
    routeGroup: null,
    proj: null,
    particles,
    _animId: animId,
    dispose() {
      cancelAnimationFrame(animId);
      controls.dispose();
      renderer.dispose();
      scene.clear();
      container.innerHTML = '';
      instance = null;
    }
  };

  log.info('3D diorama 初始化完成');
  return instance;
}

// ─── 进入 3D 模式 ──────────────────────────────────────

/**
 * 进入 3D 模式：加载高程 + 构建地形 → 执行浮升动画
 * @param {DioramaInstance} diorama
 * @param {object} options
 * @param {import('../data/trip.js').Trip} options.trip — 当前行程
 * @param {string} options.activeDayId — 当前选中的 day ID ('all' | day.id)
 * @returns {Promise<void>}
 */
export async function enter3DMode(diorama, { trip, activeDayId }) {
  const { dioramaGroup, camera, controls, renderer, container } = diorama;

  // 1. 收集地点坐标
  const lnglats = collectDayLngLats(trip, activeDayId);
  if (!lnglats.length) {
    log.warn('没有地点坐标，无法进入 3D');
    return;
  }

  // 2. 计算投影和范围
  const center = computeCenter(lnglats);
  const proj = createGeoProjection({ center, scale: 0.5 }); // 1 scene unit ≈ 2m
  diorama.proj = proj;
  const span = computeSpan(lnglats);
  log.debug('投影中心', center, '范围', span);

  // 3. 加载高程数据
  const grid = await fetchElevationGrid({ center, span, resolution: TERRAIN_RESOLUTION });
  log.debug('高程数据', grid ? `${grid.rows}×${grid.cols}` : '无');

  // 4. 构建地形
  if (diorama.terrainMesh) {
    dioramaGroup.remove(diorama.terrainMesh);
  }
  diorama.terrainMesh = buildTerrainMesh(proj, grid, span);
  dioramaGroup.add(diorama.terrainMesh);

  // 5. 构建建筑
  if (diorama.buildingGroup) {
    dioramaGroup.remove(diorama.buildingGroup);
  }
  diorama.buildingGroup = buildBuildingGroup(proj, lnglats, trip);
  dioramaGroup.add(diorama.buildingGroup);

  // 6. 构建路线
  if (diorama.routeGroup) {
    dioramaGroup.remove(diorama.routeGroup);
  }
  diorama.routeGroup = buildRouteGroup(proj, trip, activeDayId);
  dioramaGroup.add(diorama.routeGroup);

  // 7. 构建标记
  if (diorama.markerGroup) {
    dioramaGroup.remove(diorama.markerGroup);
  }
  diorama.markerGroup = buildMarkerGroup(proj, trip, activeDayId);
  dioramaGroup.add(diorama.markerGroup);

  // 8. 构建切片边缘
  const bounds = getTerrainBounds(proj, grid, span);
  const sliceEdge = buildSliceEdge(bounds);
  dioramaGroup.add(sliceEdge);

  // 9. 显示容器，开始浮升动画
  container.hidden = false;
  renderer.setSize(container.clientWidth, container.clientHeight);

  // 相机初始化：正上方俯视
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const w = bounds.maxX - bounds.minX;
  camera.position.set(cx, w * 0.9, cz + w * 0.15);
  controls.target.set(cx, 0, cz);
  controls.update();

  // 执行浮升动画
  await animateEmergence(diorama, bounds);

  // 启动空闲环视
  controls.autoRotate = true;
  log.info('3D 模式就绪');
}

// ─── 退出 3D 模式 ──────────────────────────────────────

/**
 * 退出 3D 模式（回退动画 + 清理几何体）
 * @param {DioramaInstance} diorama
 */
export async function exit3DMode(diorama) {
  const { dioramaGroup, controls, container } = diorama;
  controls.autoRotate = false;

  // 回退动画：下降 + terrain Z 塌缩
  await animateExit(diorama);

  // 清理
  [diorama.terrainMesh, diorama.buildingGroup, diorama.markerGroup, diorama.routeGroup].forEach(
    obj => {
      if (obj) dioramaGroup.remove(obj);
    }
  );
  container.hidden = true;
}

// ─── 地形构建 ──────────────────────────────────────────

/**
 * @param {import('./geo-project.js').GeoProjection} proj
 * @param {import('../api/elevation.js').ElevationGrid|null} grid
 * @param {number} span
 * @returns {THREE.Mesh}
 */
function buildTerrainMesh(proj, grid, span) {
  const size = proj.metersToUnits(span);
  const segs = TERRAIN_RESOLUTION - 1;
  const geom = new THREE.PlaneGeometry(size, size, segs, segs);
  geom.rotateX(-Math.PI / 2); // 水平放置

  // 应用高程数据
  if (grid && grid.heights.length) {
    const positions = geom.attributes.position;
    const heights = grid.heights;
    const rows = heights.length;
    const cols = heights[0].length;
    const minElev = min2D(heights);
    const maxElev = max2D(heights);
    const elevRange = Math.max(1, maxElev - minElev);
    const elevScale = proj.metersToUnits(30); // 最大 30m 高差

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      // Plane 的 xz → 网格 col,row
      const col = Math.round((x / size + 0.5) * (cols - 1));
      const row = Math.round((z / size + 0.5) * (rows - 1));
      if (row >= 0 && row < rows && col >= 0 && col < cols) {
        const t = (heights[row][col] - minElev) / elevRange;
        positions.setY(i, t * elevScale);
      }
    }
    geom.computeVertexNormals();
  }

  // 材质：带等高线纹理
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(C.terrainBase),
    roughness: 0.75,
    metalness: 0.0
  });

  const mesh = new THREE.Mesh(geom, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

// ─── 建筑构建 ──────────────────────────────────────────

/**
 * @param {import('./geo-project.js').GeoProjection} proj
 * @param {Array<[number, number]>} lnglats
 * @param {import('../data/trip.js').Trip} trip
 * @returns {THREE.Group}
 */
function buildBuildingGroup(proj, lnglats, trip) {
  const group = new THREE.Group();
  const buildingMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(C.building),
    roughness: 0.55,
    metalness: 0.05
  });

  // 按 POI type 估算建筑体量
  const buildingTypes = new Set([
    '酒店',
    '住宿',
    '商场',
    '购物',
    '展馆',
    '博物馆',
    '景点',
    '医院',
    '学校'
  ]);
  const smallTypes = new Set(['咖啡', '餐厅', '小吃', '快餐', '酒吧', '便利店']);

  for (const ll of lnglats) {
    const { x, z } = proj.toScene(ll);
    const loc = findLocationAt(trip, ll);
    const type = loc?.type || '';
    const isLarge = buildingTypes.has(type) || /酒店|商场|博物|展|mall/i.test(loc?.name || '');
    const isSmall = smallTypes.has(type) || /咖啡|餐厅|小吃|快餐|便利/i.test(loc?.name || '');
    const h = isLarge
      ? BUILDING_MAX_HEIGHT * (0.5 + Math.random() * 0.5)
      : isSmall
        ? BUILDING_MIN_HEIGHT * (0.6 + Math.random() * 0.4)
        : BUILDING_MIN_HEIGHT * (0.8 + Math.random() * 1.2);

    const w = isLarge ? 3 + Math.random() * 3 : 1.5 + Math.random() * 2;
    const geom = new THREE.BoxGeometry(w, h, w);
    const building = new THREE.Mesh(geom, buildingMat);
    building.position.set(x, h / 2, z);
    building.castShadow = true;
    building.receiveShadow = true;
    group.add(building);
  }

  return group;
}

// ─── 路线构建 ──────────────────────────────────────────

/**
 * @param {import('./geo-project.js').GeoProjection} proj
 * @param {import('../data/trip.js').Trip} trip
 * @param {string} activeDayId
 * @returns {THREE.Group}
 */
function buildRouteGroup(proj, trip, activeDayId) {
  const group = new THREE.Group();

  const day = activeDayId === 'all' ? null : trip.days.find(d => d.id === activeDayId);
  const days = day ? [day] : trip.days;

  for (const d of days) {
    const events = d.events || [];
    for (let i = 0; i < events.length - 1; i++) {
      const fromLoc = trip.locations[events[i].locationId];
      const toLoc = trip.locations[events[i + 1].locationId];
      if (!fromLoc?.lnglat || !toLoc?.lnglat) continue;

      const from = proj.toScene(fromLoc.lnglat);
      const to = proj.toScene(toLoc.lnglat);

      const routeToNext = events[i].routeToNext;
      const isWalking = routeToNext?.mode === 'walking';

      const mid = { x: (from.x + to.x) / 2, z: (from.z + to.z) / 2 + 8 };
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(from.x, ROUTE_LIFT, from.z),
        new THREE.Vector3(mid.x, ROUTE_LIFT + 5, mid.z),
        new THREE.Vector3(to.x, ROUTE_LIFT, to.z)
      );

      const points = curve.getPoints(20);
      const lineGeom = new THREE.BufferGeometry().setFromPoints(points);

      if (isWalking) {
        // 虚线 — 用多个短线段模拟
        const dashedGroup = new THREE.Group();
        for (let j = 0; j < points.length - 1; j += 2) {
          const seg = new THREE.BufferGeometry().setFromPoints([
            points[j],
            points[Math.min(j + 1, points.length - 1)]
          ]);
          const line = new THREE.Line(
            seg,
            new THREE.LineBasicMaterial({
              color: new THREE.Color(C.routeLine),
              transparent: true,
              opacity: 0.7
            })
          );
          dashedGroup.add(line);
        }
        group.add(dashedGroup);
      } else {
        const line = new THREE.Line(
          lineGeom,
          new THREE.LineBasicMaterial({
            color: new THREE.Color(C.routeLine),
            linewidth: 1
          })
        );
        group.add(line);
      }
    }
  }

  return group;
}

// ─── 标记构建 ──────────────────────────────────────────

/**
 * @param {import('./geo-project.js').GeoProjection} proj
 * @param {import('../data/trip.js').Trip} trip
 * @param {string} activeDayId
 * @returns {THREE.Group}
 */
function buildMarkerGroup(proj, trip, activeDayId) {
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
      const markerGroup = new THREE.Group();

      // 针杆
      const stemGeom = new THREE.CylinderGeometry(0.4, 0.5, MARKER_STEM_HEIGHT, 8);
      const stem = new THREE.Mesh(stemGeom, stemMat);
      stem.position.y = MARKER_STEM_HEIGHT / 2;
      markerGroup.add(stem);

      // 球头
      const headGeom = new THREE.SphereGeometry(MARKER_HEAD_RADIUS, 16, 16);
      const head = new THREE.Mesh(headGeom, headMat);
      head.position.y = MARKER_STEM_HEIGHT + MARKER_HEAD_RADIUS;
      head.castShadow = true;
      markerGroup.add(head);

      // 脉冲环
      const ringGeom = new THREE.TorusGeometry(5, 0.3, 8, 24);
      const ring = new THREE.Mesh(ringGeom, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.1;
      ring.userData = { baseScale: 1, phase: Math.random() * Math.PI * 2 };
      markerGroup.add(ring);

      markerGroup.position.set(x, 0, z);
      markerGroup.userData = { eventId: event.id, globalIndex: globalIndex++ };
      group.add(markerGroup);
    }
  }

  return group;
}

// ─── 切片边缘 ──────────────────────────────────────────

/**
 * @param {{ minX, maxX, minZ, maxZ }} bounds
 * @returns {THREE.Group}
 */
function buildSliceEdge(bounds) {
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

// ─── 粒子 ──────────────────────────────────────────────

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

// ─── 光照 ──────────────────────────────────────────────

function setupLighting(scene) {
  // Ambient
  scene.add(new THREE.AmbientLight(C.bgBottom, 0.35));

  // Key (带阴影)
  const key = new THREE.DirectionalLight('#FFF5E8', 0.8);
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
  const fill = new THREE.DirectionalLight('#E8EEF5', 0.15);
  fill.position.set(-60, 20, -60);
  scene.add(fill);

  // Rim
  const rim = new THREE.DirectionalLight('#FFFDF5', 0.2);
  rim.position.set(0, 10, -80);
  scene.add(rim);
}

// ─── 浮升动画 ──────────────────────────────────────────

function animateEmergence(diorama, bounds) {
  const { dioramaGroup, camera, controls } = diorama;
  const w = bounds.maxX - bounds.minX;
  const liftTarget = w * 1.0; // 1:1 高度
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;

  return new Promise(resolve => {
    const startTime = performance.now();
    // terrain scale 独立追踪
    const terrainScale = new THREE.Vector3(1, 0.01, 1);
    if (diorama.terrainMesh) {
      diorama.terrainMesh.scale.copy(terrainScale);
    }

    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / EMERGE_DURATION, 1);

      if (progress < 0.14) {
        // Phase 1: 2D 固化（暂无需要动画的内容，等待）
      } else if (progress < 0.5) {
        // Phase 2: 地形隆起 (ease-out-back)
        const t = (progress - 0.14) / 0.36;
        const eased = easeOutBack(Math.min(t, 1));
        terrainScale.y = 0.01 + eased * 0.99;
        if (diorama.terrainMesh) diorama.terrainMesh.scale.y = terrainScale.y;
      } else if (progress < 0.79) {
        // Phase 3: 整体抬升
        const t = (progress - 0.5) / 0.29;
        const eased = easeInOutCubic(Math.min(t, 1));
        dioramaGroup.position.y = eased * liftTarget;
        // 相机同时倾斜
        const targetY = liftTarget + w * 0.85;
        const targetZ = cz + w * 0.3;
        camera.position.lerp(new THREE.Vector3(cx, targetY, targetZ), eased * 0.6);
        controls.target.lerp(new THREE.Vector3(cx, liftTarget / 2, cz), eased);
        controls.update();
      } else {
        // Phase 4: 落定微调
        dioramaGroup.position.y = liftTarget;
        terrainScale.y = 1;
        if (diorama.terrainMesh) diorama.terrainMesh.scale.y = 1;
      }

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        dioramaGroup.position.y = liftTarget;
        if (diorama.terrainMesh) diorama.terrainMesh.scale.set(1, 1, 1);
        resolve();
      }
    }
    requestAnimationFrame(step);
  });
}

function animateExit(diorama) {
  const { dioramaGroup } = diorama;

  return new Promise(resolve => {
    const startTime = performance.now();
    const startY = dioramaGroup.position.y;
    const startScaleY = diorama.terrainMesh?.scale.y || 1;

    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / EXIT_DURATION, 1);

      const t1 = Math.min(progress / 0.35, 1); // 下降
      const t2 = Math.max(0, Math.min((progress - 0.35) / 0.65, 1)); // 塌缩

      dioramaGroup.position.y = startY * (1 - easeInCubic(t1));
      if (diorama.terrainMesh) {
        diorama.terrainMesh.scale.y = startScaleY * (1 - easeInCubic(t2));
      }

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        dioramaGroup.position.y = 0;
        if (diorama.terrainMesh) diorama.terrainMesh.scale.set(1, 1, 1);
        resolve();
      }
    }
    requestAnimationFrame(step);
  });
}

// ─── 导出 ──────────────────────────────────────────────

/**
 * 导出当前 3D 画面为 PNG dataURL
 * @param {DioramaInstance} diorama
 * @returns {string}
 */
export function captureFrame(diorama) {
  diorama.renderer.render(diorama.scene, diorama.camera);
  return diorama.renderer.domElement.toDataURL('image/png');
}

// ─── 工具函数 ──────────────────────────────────────────

function collectDayLngLats(trip, activeDayId) {
  const lnglats = [];
  const days = activeDayId === 'all' ? trip.days : trip.days.filter(d => d.id === activeDayId);

  for (const day of days) {
    for (const event of day.events || []) {
      const loc = trip.locations[event.locationId];
      if (loc?.lnglat && isValidLngLat(loc.lnglat)) {
        lnglats.push(loc.lnglat);
      }
    }
  }
  return lnglats;
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

function computeSpan(lnglats) {
  if (lnglats.length <= 1) return 600;
  let minLng = Infinity,
    maxLng = -Infinity,
    minLat = Infinity,
    maxLat = -Infinity;
  for (const [lng, lat] of lnglats) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  const dLng = (maxLng - minLng) * 111320 * Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const dLat = (maxLat - minLat) * 111320;
  const raw = Math.max(dLng, dLat) * 1.3;
  return Math.max(600, Math.min(8000, Math.round(raw)));
}

function isValidLngLat(v) {
  return Array.isArray(v) && v.length >= 2 && Number.isFinite(v[0]) && Number.isFinite(v[1]);
}

function getTerrainBounds(proj, grid, span) {
  const size = proj.metersToUnits(span);
  const half = size / 2;
  return { minX: -half, maxX: half, minZ: -half, maxZ: half };
}

function findLocationAt(trip, [lng, lat]) {
  for (const [, loc] of Object.entries(trip.locations || {})) {
    if (!loc.lnglat) continue;
    const dx = Math.abs(loc.lnglat[0] - lng);
    const dy = Math.abs(loc.lnglat[1] - lat);
    if (dx < 0.0001 && dy < 0.0001) return loc;
  }
  return null;
}

function min2D(arr) {
  return Math.min(...arr.map(row => Math.min(...row)));
}
function max2D(arr) {
  return Math.max(...arr.map(row => Math.max(...row)));
}

// ─── 缓动函数 ──────────────────────────────────────────

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
