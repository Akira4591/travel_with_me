// js/render/emergence-animation.js
// Diorama emergence animation: slab rise, terrain reveal, building massing,
// building dissolve, and exit animation.

import * as THREE from 'three';
import { GENERATION_TIMING_MS } from './generation-timing.js';
import { createGenerationTimeline } from './generation-timeline.js';
import { createFoundationMetrics } from './terrain-foundation.js';
import { applyOverviewCameraPose } from './camera-pose.js';
import { publishDioramaDebug } from './scene-debug.js';
import { updateBuildingLod } from './building-dissolve-renderer.js';
import { clamp, smoothstep, easeInOutCubic, easeOutBack, easeInCubic } from './math-utils.js';

const EMERGE_DURATION = GENERATION_TIMING_MS.total;
const EMERGE_PHASE_MS = GENERATION_TIMING_MS.foundationRise;
const FOUNDATION_END = EMERGE_PHASE_MS / EMERGE_DURATION;
const GEOLOGY_END = (EMERGE_PHASE_MS * 2) / EMERGE_DURATION;
const BUILDING_MASSING_END = (EMERGE_PHASE_MS * 3) / EMERGE_DURATION;
const EXIT_DURATION = 900;

export { EXIT_DURATION };

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
  );
}

export function shouldFreezeEmergenceForVisualQa() {
  return Boolean(globalThis.window?.__visualFreezeEmergence);
}

function updateThreeDebug(diorama) {
  const debug = publishDioramaDebug(diorama, diorama.sceneBuildContext);
  diorama.debug = debug;
}

export function animateEmergence(diorama, bounds) {
  return new Promise(resolve => {
    if (prefersReducedMotion()) {
      applyEmergenceProgress(diorama, bounds, 1);
      updateGenerationTimeline(diorama, 1, true);
      resolve();
      return;
    }

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

export function applyEmergenceProgress(diorama, bounds, rawProgress) {
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

export function updateGenerationTimeline(diorama, progress, steady = false) {
  if (!diorama?.generationTimeline) return;
  if (steady) diorama.generationTimeline.setSteady();
  else diorama.generationTimeline.updateFromOverallProgress(progress);
  updateThreeDebug(diorama);
}

export function animateExit(diorama) {
  const { dioramaGroup } = diorama;

  return new Promise(resolve => {
    if (prefersReducedMotion()) {
      dioramaGroup.position.y = 0;
      setTerrainReveal(diorama.terrainMesh, 1);
      setGroundAssetReveal(diorama.waterGroup, 1);
      setGroundAssetReveal(diorama.roadGroup, 1);
      setGroundAssetReveal(diorama.routeGroup, 1);
      setStaticGroupReveal(diorama.bridgeGroup, 1);
      setBuildingReveal(diorama, 1);
      setOverlayVisibility(diorama, true);
      resolve();
      return;
    }

    const startTime = performance.now();
    const startY = dioramaGroup.position.y;

    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / EXIT_DURATION, 1);

      const t1 = Math.min(progress / 0.35, 1);
      const t2 = Math.max(0, Math.min((progress - 0.35) / 0.65, 1));

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

export function setTerrainReveal(mesh, progress) {
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

export function setGroundAssetReveal(group, progress) {
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

export function setStaticGroupReveal(group, progress) {
  const opacity = smoothstep(clamp(progress, 0, 1));
  for (const { material, restOpacity } of group?.userData?.revealMaterials || []) {
    material.opacity = restOpacity * opacity;
    material.transparent = true;
  }
}

export function setBuildingReveal(diorama, progress, dissolveProgress = progress) {
  const reveal = smoothstep(clamp(progress, 0, 1));
  const dissolve = smoothstep(clamp(dissolveProgress, 0, 1));
  diorama.buildingRevealProgress = reveal;
  diorama.buildingDissolveProgress = dissolve;
  if (diorama.buildingGroup) diorama.buildingGroup.visible = reveal > 0.01;
}

export function setOverlayVisibility(diorama, visible) {
  if (diorama.markerGroup) diorama.markerGroup.visible = visible;
  if (diorama.annotationGroup) diorama.annotationGroup.visible = visible;
}
