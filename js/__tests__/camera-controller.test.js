import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import { createCameraController } from '../render/camera-controller.js';

describe('camera controller', () => {
  it('tracks interaction state and restores orbit only in overview steady mode', () => {
    vi.useFakeTimers();
    const controls = mockControls();
    const controller = createCameraController({
      camera: mockCamera(),
      controls,
      eventTarget: mockEventTarget(),
      idleResumeDelay: 100,
      autoRotateSpeed: 2,
      phase: 'steady'
    });

    controls.emit('start');
    expect(controller.getDebugSnapshot()).toMatchObject({
      mode: 'overview',
      phase: 'steady',
      autoRotate: false,
      userInteracting: true
    });

    controls.emit('end');
    vi.advanceTimersByTime(100);
    expect(controller.getDebugSnapshot()).toMatchObject({
      autoRotate: true,
      userInteracting: false
    });

    controller.setMode('inspect');
    controls.emit('start');
    controls.emit('end');
    vi.advanceTimersByTime(100);
    expect(controller.getDebugSnapshot()).toMatchObject({
      mode: 'inspect',
      autoRotate: false
    });

    controller.dispose();
    vi.useRealTimers();
  });

  it('moves camera and target forward with WASD in steady phase', () => {
    const eventTarget = mockEventTarget();
    const controls = mockControls();
    const camera = mockCamera({ x: 0, y: 30, z: 100 });
    controls.target.set(0, 10, 0);
    const controller = createCameraController({
      camera,
      controls,
      eventTarget,
      phase: 'steady',
      terrainMode: 'citywalk',
      terrainModel: flatTerrain(0),
      groundOffsetY: 0
    });

    eventTarget.dispatch('keydown', keyboardEvent('KeyW'));
    const moved = controller.update(1);
    eventTarget.dispatch('keyup', keyboardEvent('KeyW'));

    expect(moved).toBe(true);
    expect(camera.position.z).toBeLessThan(100);
    expect(controls.target.z).toBeLessThan(0);
    expect(controller.getDebugSnapshot().activeKeys).toEqual([]);
    controller.dispose();
  });

  it('moves right relative to the current camera view', () => {
    const eventTarget = mockEventTarget();
    const controls = mockControls();
    const camera = mockCamera({ x: 0, y: 30, z: 100 });
    controls.target.set(0, 10, 0);
    const controller = createCameraController({
      camera,
      controls,
      eventTarget,
      phase: 'steady',
      terrainMode: 'citywalk',
      terrainModel: flatTerrain(0)
    });

    eventTarget.dispatch('keydown', keyboardEvent('KeyD'));
    controller.update(1);

    expect(camera.position.x).toBeGreaterThan(0);
    expect(controls.target.x).toBeGreaterThan(0);
    controller.dispose();
  });

  it('ignores movement keys from editable elements', () => {
    const eventTarget = mockEventTarget();
    const controls = mockControls();
    const camera = mockCamera({ x: 0, y: 30, z: 100 });
    const controller = createCameraController({
      camera,
      controls,
      eventTarget,
      phase: 'steady',
      terrainModel: flatTerrain(0)
    });

    eventTarget.dispatch(
      'keydown',
      keyboardEvent('KeyW', { target: { tagName: 'INPUT', isContentEditable: false } })
    );
    controller.update(1);

    expect(camera.position.z).toBe(100);
    expect(controller.getDebugSnapshot().activeKeys).toEqual([]);
    controller.dispose();
  });

  it('clamps camera y by terrain-relative min and max clearance', () => {
    const controls = mockControls();
    const camera = mockCamera({ x: 0, y: 500, z: 0 });
    const controller = createCameraController({
      camera,
      controls,
      eventTarget: mockEventTarget(),
      phase: 'steady',
      terrainMode: 'micro-street',
      terrainModel: flatTerrain(30),
      groundOffsetY: 20
    });

    controller.update(0.016);
    expect(camera.position.y).toBe(90);
    expect(controller.getDebugSnapshot()).toMatchObject({
      clearance: 40,
      minClearance: 6,
      maxClearance: 40
    });

    camera.position.y = 40;
    controller.update(0.016);
    expect(camera.position.y).toBe(56);
    expect(controller.getDebugSnapshot().clearance).toBe(6);
    controller.dispose();
  });

  it('switches between overview and inspect based on close camera distance', () => {
    const controls = mockControls();
    const camera = mockCamera({ x: 0, y: 20, z: 90 });
    controls.target.set(0, 10, 0);
    const controller = createCameraController({
      camera,
      controls,
      eventTarget: mockEventTarget(),
      phase: 'steady',
      terrainMode: 'micro-street',
      terrainModel: flatTerrain(0)
    });

    controller.update(0.016);
    expect(controller.getDebugSnapshot().mode).toBe('inspect');

    camera.position.set(0, 40, 220);
    controller.update(0.016);
    expect(controller.getDebugSnapshot().mode).toBe('overview');
    controller.dispose();
  });

  it('allows a focused route camera to continue into inspect distance', () => {
    const controls = mockControls();
    const camera = mockCamera({ x: 0, y: 22, z: 95 });
    controls.target.set(0, 10, 0);
    const controller = createCameraController({
      camera,
      controls,
      eventTarget: mockEventTarget(),
      phase: 'steady',
      terrainMode: 'micro-street',
      terrainModel: flatTerrain(0)
    });

    controller.setMode('route-focus');
    controller.update(0.016);

    expect(controller.getDebugSnapshot().mode).toBe('inspect');
    controller.dispose();
  });

  it('does not apply movement or y clamp before steady phase', () => {
    const eventTarget = mockEventTarget();
    const controls = mockControls();
    const camera = mockCamera({ x: 0, y: 500, z: 100 });
    const controller = createCameraController({
      camera,
      controls,
      eventTarget,
      phase: 'emerging',
      terrainMode: 'micro-street',
      terrainModel: flatTerrain(30)
    });

    eventTarget.dispatch('keydown', keyboardEvent('KeyW'));
    controller.update(1);

    expect(camera.position.y).toBe(500);
    expect(camera.position.z).toBe(100);
    controller.dispose();
  });
});

function mockControls() {
  const listeners = new Map();
  return {
    target: new THREE.Vector3(0, 0, 0),
    autoRotate: false,
    autoRotateSpeed: 0,
    addEventListener(event, callback) {
      listeners.set(event, callback);
    },
    removeEventListener(event) {
      listeners.delete(event);
    },
    update: vi.fn(),
    getPolarAngle() {
      return 0.8;
    },
    emit(event) {
      listeners.get(event)?.();
    }
  };
}

function mockCamera(position = { x: 0, y: 120, z: 180 }) {
  return {
    position: new THREE.Vector3(position.x, position.y, position.z)
  };
}

function mockEventTarget() {
  const listeners = new Map();
  return {
    addEventListener(event, callback) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(callback);
    },
    removeEventListener(event, callback) {
      listeners.get(event)?.delete(callback);
    },
    dispatch(event, payload) {
      for (const callback of listeners.get(event) || []) callback(payload);
    }
  };
}

function keyboardEvent(code, overrides = {}) {
  return {
    code,
    target: { tagName: 'BODY', isContentEditable: false },
    preventDefault: vi.fn(),
    ...overrides
  };
}

function flatTerrain(height) {
  return {
    heightAt: vi.fn(() => height)
  };
}
