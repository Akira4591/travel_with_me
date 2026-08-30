/**
 * Route interaction: terrain click raycasting and route focus camera animation.
 * Extracted from map-3d.js to isolate user interaction from scene orchestration.
 */

import * as THREE from 'three';
import { clamp } from './math-utils.js';
import { set3DRouteHighlight } from './route-guidance-renderer.js';
import { animateCameraFocus } from './camera-pose.js';
import { renderRouteInsight } from './terrain-renderer.js';

export function getTerrainClickPoint(raycaster, diorama) {
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
