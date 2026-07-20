/**
 * Camera pose computation: overview, route-focus, and inspect camera positioning.
 * Extracted from map-3d.js to isolate camera geometry from scene construction.
 */

import * as THREE from 'three';
import { createFoundationMetrics } from './terrain-foundation.js';
import { getCameraProfile } from './camera-controller.js';
import { clamp } from './math-utils.js';

const DEFAULT_WORK_AREA_SPAN_METERS = 800;

const OVERVIEW_CAMERA_ORBIT = {
  headingDeg: 38,
  pitchDeg: 70,
  distanceScale: 1.35,
  minInspectDistanceScale: 1.45
};

const OVERVIEW_DISTANCE_SCALE_BY_MODE = {
  'micro-street': 0.62,
  citywalk: 0.78,
  'scenic-park': 0.95,
  hiking: 1.05,
  'region-overview': 1.35
};

const OVERVIEW_PITCH_BY_MODE = {
  'micro-street': 58,
  citywalk: 60,
  'scenic-park': 60,
  hiking: 62,
  'region-overview': 70
};

export function getBoundsSpan(bounds) {
  return Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
}

function getOverviewDistanceScale(terrainMode) {
  const id = typeof terrainMode === 'string' ? terrainMode : terrainMode?.id;
  return OVERVIEW_DISTANCE_SCALE_BY_MODE[id] || OVERVIEW_CAMERA_ORBIT.distanceScale;
}

function getOverviewPitchDeg(terrainMode) {
  const id = typeof terrainMode === 'string' ? terrainMode : terrainMode?.id;
  return OVERVIEW_PITCH_BY_MODE[id] || OVERVIEW_CAMERA_ORBIT.pitchDeg;
}

function getDefaultOverviewBounds() {
  const span = DEFAULT_WORK_AREA_SPAN_METERS;
  const half = span / 2;
  return { minX: -half, maxX: half, minZ: -half, maxZ: half };
}

export function getOverviewCameraPose(bounds, { terrainModel = null, terrainMode = null } = {}) {
  const { span, liftTarget, centerX: cx, centerZ: cz } = createFoundationMetrics(bounds);
  const centerTerrainY = Number(terrainModel?.heightAt?.(cx, cz));
  const targetY = liftTarget + (Number.isFinite(centerTerrainY) ? centerTerrainY : 0);
  const target = new THREE.Vector3(cx, targetY, cz);
  const profile = getCameraProfile(terrainMode);
  const inspectDistance = Number(profile.inspectDistance) || 180;
  const distanceScale = getOverviewDistanceScale(terrainMode);
  const distance = Math.max(
    span * distanceScale,
    inspectDistance * OVERVIEW_CAMERA_ORBIT.minInspectDistanceScale
  );
  const modePitch = Number(terrainMode?.cameraPitchDeg ?? getOverviewPitchDeg(terrainMode));
  const pitchDeg = Number.isFinite(modePitch) ? modePitch : OVERVIEW_CAMERA_ORBIT.pitchDeg;
  const pitch = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(pitchDeg, 58, 74));
  const heading = THREE.MathUtils.degToRad(OVERVIEW_CAMERA_ORBIT.headingDeg);
  const horizontalDistance = distance * Math.cos(pitch);
  const positionX = cx + Math.sin(heading) * horizontalDistance;
  const positionZ = cz + Math.cos(heading) * horizontalDistance;
  const desiredY = targetY + distance * Math.sin(pitch);
  const terrainY = Number(terrainModel?.heightAt?.(positionX, positionZ));
  const groundY = (Number.isFinite(terrainY) ? terrainY : 0) + liftTarget;
  const positionY = clamp(desiredY, groundY + profile.minClearance, groundY + profile.maxClearance);
  return {
    position: new THREE.Vector3(positionX, positionY, positionZ),
    target
  };
}

export function getInitialOverviewCameraPose() {
  return getOverviewCameraPose(getDefaultOverviewBounds(), { terrainMode: 'citywalk' });
}

export function applyOverviewCameraPose(diorama, bounds) {
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

export function getCameraControlDistances(sceneSpan, terrainMode) {
  const profile = getCameraProfile(terrainMode);
  const inspectDistance = Number(profile.inspectDistance) || 180;
  const minDistance = THREE.MathUtils.clamp(sceneSpan * 0.06, 36, inspectDistance * 0.75);
  return {
    minDistance,
    maxDistance: Math.max(minDistance * 4, sceneSpan * 2.1)
  };
}
