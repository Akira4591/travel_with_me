/**
 * Visual debug controls: test/exposure hooks for camera presets and emergence progress.
 * Extracted from map-3d.js to isolate debug tooling from scene orchestration.
 */

import * as THREE from 'three';
import { getBoundsSpan } from './camera-pose.js';
import { getCameraProfile } from './camera-controller.js';
import { updateBuildingLod } from './building-dissolve-renderer.js';
import { applyEmergenceProgress, updateGenerationTimeline } from './emergence-animation.js';
import { focus3DRoute } from './route-interaction.js';
import { updateThreeDebug } from './scene-debug.js';

export function installVisualDebugControls(
  diorama,
  bounds,
  { allowEmergenceProgress = false } = {}
) {
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

export function applyVisualCameraPreset(diorama, bounds, name, preset = {}) {
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
