// js/render/lighting.js
// Three.js scene lighting setup for the planning diorama.

import * as THREE from 'three';

const BONE_WHITE = '#FCFAF5';

export function setupLighting(scene) {
  scene.add(new THREE.AmbientLight(BONE_WHITE, 0.72));

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

  const fill = new THREE.DirectionalLight('#FFF8EC', 0.34);
  fill.position.set(-60, 20, -60);
  scene.add(fill);

  const rim = new THREE.DirectionalLight('#FFFDF5', 0.28);
  rim.position.set(0, 10, -80);
  scene.add(rim);
}
