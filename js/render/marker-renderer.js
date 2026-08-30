// js/render/marker-renderer.js
// 3D route point markers (flat rings) and annotation markers (stem + head + halo).

import * as THREE from 'three';
import { ROUTE_GUIDANCE } from '../route-guidance.js';
import { getAnnotationType } from '../annotations.js';
import { isValidLngLat } from './geo-utils.js';

const MARKER_RING_RADIUS = 2.7;
const MARKER_RING_TUBE_RADIUS = 0.22;

const ANNOTATION_STEM_HEIGHT = 7;
const ANNOTATION_HEAD_RADIUS = 1.45;

const ANNOTATION_STEM_COLOR = '#EFE8D6';

/**
 * @param {import('./geo-project.js').GeoProjection} proj
 * @param {import('../data/trip.js').Trip} trip
 * @param {string} activeDayId
 * @param {object} terrainModel
 * @returns {THREE.Group}
 */
export function buildMarkerGroup(proj, trip, activeDayId, terrainModel) {
  const group = new THREE.Group();
  const ringMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(ROUTE_GUIDANCE.line),
    transparent: true,
    opacity: 0.85
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

      const ringGeom = new THREE.TorusGeometry(MARKER_RING_RADIUS, MARKER_RING_TUBE_RADIUS, 8, 24);
      const ring = new THREE.Mesh(ringGeom, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, terrainY + 0.1, z);
      ring.userData = { eventId: event.id, globalIndex: globalIndex++ };
      group.add(ring);
    }
  }

  return group;
}

export function buildAnnotationGroup(proj, trip, terrainModel) {
  const group = new THREE.Group();
  const stemMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(ANNOTATION_STEM_COLOR),
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
