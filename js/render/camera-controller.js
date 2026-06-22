import * as THREE from 'three';

const CAMERA_PROFILES = {
  'micro-street': { minClearance: 6, maxClearance: 620, baseSpeed: 16, inspectDistance: 120 },
  citywalk: { minClearance: 10, maxClearance: 620, baseSpeed: 26, inspectDistance: 180 },
  'scenic-park': { minClearance: 16, maxClearance: 760, baseSpeed: 38, inspectDistance: 260 },
  hiking: { minClearance: 24, maxClearance: 980, baseSpeed: 54, inspectDistance: 340 },
  'region-overview': { minClearance: 60, maxClearance: 1200, baseSpeed: 120, inspectDistance: 520 }
};

const DEFAULT_PROFILE = CAMERA_PROFILES.citywalk;
const MOVEMENT_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);
const SPEED_UP_KEY = 'ShiftLeft';
const SPEED_UP_KEY_RIGHT = 'ShiftRight';
const PRECISION_KEY = 'AltLeft';
const PRECISION_KEY_RIGHT = 'AltRight';
const AUTO_ORBIT_MODES = new Set(['overview']);

export function getCameraProfile(terrainMode) {
  return resolveProfile(terrainMode);
}

export function createCameraController({
  camera,
  controls,
  domElement = null,
  eventTarget = typeof window !== 'undefined' ? window : null,
  idleResumeDelay = 25000,
  autoRotateSpeed = 2,
  terrainModel = null,
  terrainMode = null,
  groundOffsetY = 0,
  enabled = true,
  phase = 'idle'
}) {
  let mode = 'overview';
  let userInteracting = false;
  let idleTimer = null;
  let movementEnabled = Boolean(enabled);
  let currentPhase = phase;
  let currentTerrainModel = terrainModel;
  let currentGroundOffsetY = Number(groundOffsetY) || 0;
  let currentProfile = resolveProfile(terrainMode);
  const pressedKeys = new Set();
  const moveVector = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();

  controls.autoRotate = false;
  controls.autoRotateSpeed = autoRotateSpeed;

  function clearIdleTimer() {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  }

  function canAutoOrbit() {
    return currentPhase === 'steady' && AUTO_ORBIT_MODES.has(mode) && !userInteracting;
  }

  function syncAutoRotate() {
    controls.autoRotate = canAutoOrbit();
  }

  function setMode(nextMode) {
    mode = nextMode;
    syncAutoRotate();
  }

  function setEnabled(nextEnabled) {
    movementEnabled = Boolean(nextEnabled);
    if (!movementEnabled) pressedKeys.clear();
  }

  function setPhase(nextPhase) {
    currentPhase = nextPhase || 'idle';
    if (currentPhase !== 'steady') {
      controls.autoRotate = false;
      pressedKeys.clear();
      return;
    }
    syncAutoRotate();
  }

  function setSceneContext({
    terrainModel: nextTerrainModel,
    terrainMode: nextTerrainMode,
    groundOffsetY: nextGroundOffsetY
  } = {}) {
    if (nextTerrainModel !== undefined) currentTerrainModel = nextTerrainModel;
    if (nextTerrainMode !== undefined) currentProfile = resolveProfile(nextTerrainMode);
    if (Number.isFinite(nextGroundOffsetY)) currentGroundOffsetY = nextGroundOffsetY;
    if (currentPhase === 'steady') clampCameraY();
  }

  function markManualInput() {
    userInteracting = true;
    controls.autoRotate = false;
    clearIdleTimer();
  }

  function onStart() {
    markManualInput();
  }

  function onEnd() {
    userInteracting = false;
    clearIdleTimer();
    idleTimer = setTimeout(() => {
      syncAutoRotate();
    }, idleResumeDelay);
  }

  function onKeyDown(event) {
    if (!isMovementEvent(event) || isEditableTarget(event?.target)) return;
    if (!movementEnabled || currentPhase !== 'steady') return;
    event?.preventDefault?.();
    pressedKeys.add(event.code);
    markManualInput();
  }

  function onKeyUp(event) {
    if (!isMovementEvent(event)) return;
    pressedKeys.delete(event.code);
    if (!hasActiveMovement()) onEnd();
  }

  function onManualPointerInput() {
    markManualInput();
  }

  function hasActiveMovement() {
    return [...pressedKeys].some(code => MOVEMENT_KEYS.has(code));
  }

  function update(deltaSeconds = 0) {
    if (!movementEnabled || currentPhase !== 'steady') {
      controls.update?.();
      return false;
    }
    const moved = applyKeyboardMovement(deltaSeconds);
    clampCameraY();
    syncAdaptiveMode();
    controls.update?.();
    if (moved) updateInteractionAfterMovement();
    return moved;
  }

  function applyKeyboardMovement(deltaSeconds) {
    if (!hasActiveMovement()) return false;
    const dt = THREE.MathUtils.clamp(Number(deltaSeconds) || 0, 0, 0.08);
    if (dt <= 0) return false;

    forward.copy(controls.target).sub(camera.position);
    forward.y = 0;
    if (forward.lengthSq() < 0.0001) forward.set(0, 0, -1);
    else forward.normalize();

    right.set(-forward.z, 0, forward.x).normalize();
    moveVector.set(0, 0, 0);

    if (pressedKeys.has('KeyW')) moveVector.add(forward);
    if (pressedKeys.has('KeyS')) moveVector.sub(forward);
    if (pressedKeys.has('KeyD')) moveVector.add(right);
    if (pressedKeys.has('KeyA')) moveVector.sub(right);
    if (moveVector.lengthSq() < 0.0001) return false;

    moveVector.normalize().multiplyScalar(getCurrentSpeed() * dt);
    camera.position.add(moveVector);
    controls.target.add(moveVector);
    return true;
  }

  function updateInteractionAfterMovement() {
    userInteracting = true;
    controls.autoRotate = false;
    clearIdleTimer();
  }

  function getCurrentSpeed() {
    const clearance = Math.max(getClearance(), currentProfile.minClearance);
    const adaptive = currentProfile.baseSpeed * THREE.MathUtils.clamp(clearance / 70, 0.55, 4.5);
    const speedScale =
      pressedKeys.has(SPEED_UP_KEY) || pressedKeys.has(SPEED_UP_KEY_RIGHT)
        ? 1.8
        : pressedKeys.has(PRECISION_KEY) || pressedKeys.has(PRECISION_KEY_RIGHT)
          ? 0.35
          : 1;
    return adaptive * speedScale;
  }

  function getGroundY(x = camera.position.x, z = camera.position.z) {
    const terrainY = Number(currentTerrainModel?.heightAt?.(x, z));
    return (Number.isFinite(terrainY) ? terrainY : 0) + currentGroundOffsetY;
  }

  function getClearance() {
    return camera.position.y - getGroundY();
  }

  function clampCameraY() {
    const groundY = getGroundY();
    const clearance = camera.position.y - groundY;
    const clampedClearance = THREE.MathUtils.clamp(
      clearance,
      currentProfile.minClearance,
      currentProfile.maxClearance
    );
    camera.position.y = groundY + clampedClearance;
  }

  function syncAdaptiveMode() {
    if (mode !== 'overview' && mode !== 'route-focus' && mode !== 'inspect') return;
    const distance = camera.position.distanceTo(controls.target);
    const inspectDistance = Number(currentProfile.inspectDistance || 0);
    if (inspectDistance <= 0) return;
    const exitDistance = inspectDistance * 1.35;
    if (distance <= inspectDistance && mode !== 'inspect') {
      mode = 'inspect';
      syncAutoRotate();
    } else if (mode === 'inspect' && distance >= exitDistance) {
      mode = 'overview';
      syncAutoRotate();
    }
  }

  controls.addEventListener('start', onStart);
  controls.addEventListener('end', onEnd);
  eventTarget?.addEventListener?.('keydown', onKeyDown);
  eventTarget?.addEventListener?.('keyup', onKeyUp);
  domElement?.addEventListener?.('pointerdown', onManualPointerInput);
  domElement?.addEventListener?.('wheel', onManualPointerInput, { passive: true });

  return {
    setMode,
    setEnabled,
    setPhase,
    setSceneContext,
    notifyManualInput: markManualInput,
    update,
    getMode: () => mode,
    getDebugSnapshot() {
      const position = snapshotVector(camera.position);
      const target = snapshotVector(controls.target);
      return {
        mode,
        phase: currentPhase,
        autoRotate: Boolean(controls.autoRotate),
        userInteracting,
        movementEnabled,
        activeKeys: [...pressedKeys].filter(code => MOVEMENT_KEYS.has(code)).sort(),
        distance: Math.round(camera.position.distanceTo(controls.target)),
        polarAngle:
          typeof controls.getPolarAngle === 'function'
            ? Number(controls.getPolarAngle().toFixed(3))
            : 0,
        position,
        target,
        clearance: Number(getClearance().toFixed(2)),
        minClearance: currentProfile.minClearance,
        maxClearance: currentProfile.maxClearance,
        speed: Number(getCurrentSpeed().toFixed(2))
      };
    },
    dispose() {
      clearIdleTimer();
      pressedKeys.clear();
      controls.removeEventListener?.('start', onStart);
      controls.removeEventListener?.('end', onEnd);
      eventTarget?.removeEventListener?.('keydown', onKeyDown);
      eventTarget?.removeEventListener?.('keyup', onKeyUp);
      domElement?.removeEventListener?.('pointerdown', onManualPointerInput);
      domElement?.removeEventListener?.('wheel', onManualPointerInput);
    }
  };
}

function resolveProfile(terrainMode) {
  const id = typeof terrainMode === 'string' ? terrainMode : terrainMode?.id;
  return CAMERA_PROFILES[id] || DEFAULT_PROFILE;
}

function isMovementEvent(event) {
  return Boolean(event?.code && (MOVEMENT_KEYS.has(event.code) || isSpeedModifier(event.code)));
}

function isSpeedModifier(code) {
  return (
    code === SPEED_UP_KEY ||
    code === SPEED_UP_KEY_RIGHT ||
    code === PRECISION_KEY ||
    code === PRECISION_KEY_RIGHT
  );
}

function isEditableTarget(target) {
  const tagName = target?.tagName?.toLowerCase?.();
  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    target?.isContentEditable === true
  );
}

function snapshotVector(vector) {
  return {
    x: Number(vector.x.toFixed(2)),
    y: Number(vector.y.toFixed(2)),
    z: Number(vector.z.toFixed(2))
  };
}
