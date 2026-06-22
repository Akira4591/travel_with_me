import * as THREE from 'three';

import { ROUTE_GUIDANCE, getRouteGuidanceColor } from '../route-guidance.js';
import { createRouteGeometryDiagnostics, getPrimaryRoutePath } from '../route-geometry.js';
import {
  buildFallbackTerrainRoutePoints,
  buildTerrainRoutePointsFromLngLat,
  createRouteRibbon,
  normalizeTerrainRoutePoints,
  registerGroundRevealMesh
} from './terrain-surface.js';

const ROUTE_COLORS = {
  bed: ROUTE_GUIDANCE.roadBed,
  outline: '#625C51'
};

export function buildRouteGroup(
  proj,
  trip,
  activeDayId,
  terrainModel,
  terrainMode,
  activeSegmentId = null
) {
  const group = new THREE.Group();
  group.userData.revealTargets = [];
  group.userData.routeHashes = [];
  group.userData.routeEndpointKeys = [];
  group.userData.routeDiagnostics = [];
  group.userData.routeLengthMeters = 0;
  group.userData.routeClearancesMeters = [];
  let realGeometryCount = 0;

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
      const segmentId = `${d.id}-route-${i}`;
      const realRoutePath = getPrimaryRoutePath(routeToNext?.geometry);
      const isEstimated = realRoutePath.length < 2;
      const isActive = activeSegmentId === segmentId;
      const routeDiagnostics = createRouteGeometryDiagnostics({
        source: routeToNext?.geometry?.source,
        mode: routeToNext?.geometry?.mode || routeToNext?.mode,
        paths: realRoutePath.length >= 2 ? [realRoutePath] : []
      });
      if (realRoutePath.length >= 2) {
        realGeometryCount += 1;
        group.userData.routeHashes.push(routeDiagnostics.hash);
        group.userData.routeEndpointKeys.push(getRouteEndpointKey(routeDiagnostics));
        group.userData.routeLengthMeters += routeDiagnostics.lengthMeters;
        group.userData.routeDiagnostics.push({
          segmentId,
          cached: routeToNext?.geometry?.diagnostics || null,
          rendered: routeDiagnostics
        });
      }
      const overviewScale = getOverviewFeatureScale(terrainModel.bounds);
      const roadWidth =
        (isWalking ? 1.1 : routeToNext?.mode === 'riding' ? 1.8 : 3.2) * overviewScale;
      const rawPoints =
        realRoutePath.length >= 2
          ? buildTerrainRoutePointsFromLngLat(realRoutePath, proj, terrainModel)
          : buildFallbackTerrainRoutePoints(from, to, terrainModel, terrainMode.routeSamples);
      const points = normalizeTerrainRoutePoints(rawPoints, Math.max(0.4, roadWidth * 0.65));
      if (points.length < 2) continue;
      const guidanceMeshes = createRouteGuidance(points, roadWidth, { isActive, isEstimated });
      const clearanceMetrics = measureRouteClearance(guidanceMeshes, terrainModel, proj);
      group.userData.routeClearancesMeters.push(...clearanceMetrics.samples);
      const segmentGroup = new THREE.Group();
      segmentGroup.name = segmentId;
      segmentGroup.userData = {
        isRouteSegment: true,
        focusPoint: getRouteFocusPoint(points),
        focusSpan: getRouteFocusSpan(points),
        metrics: getRouteMetrics(points, proj, terrainModel),
        clearanceMetrics,
        routeDiagnostics,
        guidanceMeshes,
        isEstimated
      };
      for (const [index, mesh] of guidanceMeshes.entries()) {
        registerGroundRevealMesh(mesh, terrainModel, 0.12 + index * 0.015);
        group.userData.revealTargets.push(mesh);
        segmentGroup.add(mesh);
      }
      if (!isEstimated) {
        const directionMarkers = createRouteDirectionMarkers(points, roadWidth, {
          active: isActive
        });
        segmentGroup.userData.directionMarkers = directionMarkers;
        segmentGroup.add(directionMarkers);
      }
      group.add(segmentGroup);
    }
  }

  group.userData.realGeometryCount = realGeometryCount;
  group.userData.routeLengthMeters = Math.round(group.userData.routeLengthMeters);
  group.userData.routeClearanceP95Meters = percentile(group.userData.routeClearancesMeters, 0.95);
  group.userData.routeClearanceMaxMeters = maxMetric(group.userData.routeClearancesMeters);
  return group;
}

export function set3DRouteHighlight(diorama, segmentId = null) {
  if (!diorama?.routeGroup) return false;
  let matched = false;
  for (const segmentGroup of diorama.routeGroup.children) {
    if (!segmentGroup.userData?.isRouteSegment) continue;
    const isActive = segmentGroup.name === segmentId;
    if (isActive) matched = true;
    segmentGroup.userData.guidanceMeshes?.forEach(mesh => {
      const role = mesh.userData?.guidanceRole;
      if (role === 'halo') mesh.visible = isActive;
      if (role === 'line') {
        mesh.material.color.set(getRouteGuidanceColor({ active: isActive }));
        mesh.material.opacity = isActive ? 1 : mesh.userData.restOpacity;
      }
    });
    segmentGroup.userData.directionMarkers?.traverse(node => {
      if (node.isMesh && node.userData?.guidanceRole === 'direction') {
        node.material.color.set(getRouteGuidanceColor({ active: isActive }));
      }
    });
  }
  diorama.activeRouteSegmentId = matched ? segmentId : null;
  if (matched) diorama.container.dataset.activeRouteSegment = segmentId;
  else delete diorama.container.dataset.activeRouteSegment;
  return matched;
}

function getRouteEndpointKey(diagnostics) {
  const first = diagnostics.firstPoint;
  const last = diagnostics.lastPoint;
  if (!first || !last) return '';
  return `${formatRoutePoint(first)}>${formatRoutePoint(last)}`;
}

function formatRoutePoint(point) {
  return `${Number(point[0]).toFixed(6)},${Number(point[1]).toFixed(6)}`;
}

function createRouteGuidance(points, halfWidth, { isActive = false, isEstimated = false } = {}) {
  const lineColor = getRouteGuidanceColor({ active: isActive });
  if (isEstimated) {
    return createEstimatedRouteDashes(points, Math.max(halfWidth * 0.23, 0.22), lineColor);
  }
  const bedWidth = Math.max(halfWidth * 1.55, halfWidth + 0.9);
  const outlineWidth = Math.max(halfWidth * 0.68, 0.52);
  const stripeWidth = Math.max(halfWidth * 0.42, 0.6);
  const meshes = [
    createRouteRibbon(points, bedWidth, {
      color: ROUTE_COLORS.bed,
      opacity: isActive ? 1 : 0.98,
      roughness: 0.84,
      verticalOffset: 0.06,
      guidanceRole: 'bed'
    }),
    createRouteRibbon(points, outlineWidth, {
      color: ROUTE_COLORS.outline,
      opacity: 0.94,
      roughness: 0.72,
      verticalOffset: 0.04,
      guidanceRole: 'edge'
    }),
    createRouteRibbon(points, stripeWidth, {
      color: lineColor,
      opacity: 1,
      roughness: 0.62,
      verticalOffset: 0.075,
      guidanceRole: 'line',
      emissive: lineColor,
      emissiveIntensity: 0.18
    })
  ];
  const halo = createRouteRibbon(points, bedWidth * 1.18, {
    color: lineColor,
    opacity: ROUTE_GUIDANCE.halo.strokeOpacity,
    roughness: 0.9,
    verticalOffset: 0.005,
    guidanceRole: 'halo'
  });
  halo.visible = isActive;
  meshes.unshift(halo);
  return meshes;
}

function createEstimatedRouteDashes(points, halfWidth, color) {
  const dashes = [];
  for (let index = 0; index < points.length - 1; index += 2) {
    const dashPoints = [points[index], points[Math.min(index + 1, points.length - 1)]];
    dashes.push(
      createRouteRibbon(dashPoints, halfWidth, {
        color,
        opacity: 0.86,
        roughness: 0.7,
        verticalOffset: 0.075,
        guidanceRole: 'line',
        emissive: color,
        emissiveIntensity: 0.14
      })
    );
  }
  return dashes;
}

function createRouteDirectionMarkers(points, halfWidth, { active = false } = {}) {
  const group = new THREE.Group();
  if (points.length < 3) return group;
  const markerCount = Math.min(3, Math.max(1, Math.floor(points.length / 24)));
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(getRouteGuidanceColor({ active })),
    transparent: true,
    opacity: 0.96
  });
  for (let index = 1; index <= markerCount; index += 1) {
    const pointIndex = Math.round((points.length - 1) * (index / (markerCount + 1)));
    const point = points[pointIndex];
    const previous = points[Math.max(0, pointIndex - 1)];
    const next = points[Math.min(points.length - 1, pointIndex + 1)];
    const tangent = next.clone().sub(previous);
    tangent.y = 0;
    if (tangent.lengthSq() < 0.0001) continue;
    tangent.normalize();
    const marker = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(0.28, halfWidth * 0.24), Math.max(0.6, halfWidth * 0.7), 3),
      material
    );
    marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
    marker.position.copy(point);
    marker.position.y += 0.5;
    marker.userData.guidanceRole = 'direction';
    group.add(marker);
  }
  return group;
}

function getRouteFocusPoint(points) {
  const point = points[Math.floor(points.length / 2)] || new THREE.Vector3();
  return point.clone();
}

function getRouteFocusSpan(points) {
  if (!points.length) return 0;
  const xs = points.map(point => point.x);
  const zs = points.map(point => point.z);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
}

function getRouteMetrics(points, proj, terrainModel) {
  let distanceUnits = 0;
  let ascent = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    distanceUnits += Math.hypot(current.x - previous.x, current.z - previous.z);
    const rise =
      terrainModel.elevationAt(current.x, current.z) -
      terrainModel.elevationAt(previous.x, previous.z);
    if (rise > 0) ascent += rise;
  }
  return {
    distanceMeters: Math.round(proj.unitsToMeters(distanceUnits)),
    ascentMeters: Math.round(ascent)
  };
}

function measureRouteClearance(meshes, terrainModel, proj) {
  const samples = [];
  for (const mesh of meshes) {
    const positions = mesh.geometry?.attributes?.position;
    if (!positions) continue;
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      const z = positions.getZ(index);
      const groundY = terrainModel.heightAt(x, z);
      const clearanceUnits = Math.max(0, y - groundY);
      samples.push(roundMetric(proj.unitsToMeters(clearanceUnits)));
    }
  }
  return {
    sampleCount: samples.length,
    p95Meters: percentile(samples, 0.95),
    maxMeters: maxMetric(samples),
    samples
  };
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

function getOverviewFeatureScale(bounds) {
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
  return THREE.MathUtils.clamp(span / 850, 1, 6);
}
