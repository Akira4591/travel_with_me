import { describe, expect, it } from 'vitest';

import { ROUTE_GUIDANCE } from '../route-guidance.js';
import { buildRouteGroup, set3DRouteHighlight } from '../render/route-guidance-renderer.js';

describe('route guidance renderer', () => {
  it('renders persisted route geometry with diagnostics and direction markers', () => {
    const group = buildRouteGroup(
      mockProjection(),
      mockTrip({
        geometry: {
          source: 'amap-webservice',
          mode: 'walking',
          paths: [
            [
              [116, 39],
              [116.005, 39.004],
              [116.01, 39.01]
            ]
          ]
        }
      }),
      'day-1',
      mockTerrainModel(),
      { routeSamples: 24 },
      'day-1-route-0'
    );

    expect(group.userData.realGeometryCount).toBe(1);
    expect(group.userData.routeHashes[0]).toMatch(/^[a-f0-9]{8}$/);
    expect(group.userData.routeEndpointKeys[0]).toBe('116.000000,39.000000>116.010000,39.010000');
    expect(group.userData.routeLengthMeters).toBeGreaterThan(0);
    expect(group.userData.routeClearanceP95Meters).toBeGreaterThan(0);
    expect(group.userData.routeClearanceP95Meters).toBeLessThanOrEqual(0.3);
    expect(group.children[0].userData.clearanceMetrics.p95Meters).toBeLessThanOrEqual(0.3);
    expect(group.children[0].userData.directionMarkers.children.length).toBeGreaterThan(0);
    expect(group.userData.grayOutlineMeshCount).toBe(0);
    expect(
      group.children[0].userData.guidanceMeshes.some(mesh =>
        ['bed', 'edge'].includes(mesh.userData.guidanceRole)
      )
    ).toBe(false);
    const lineMesh = group.children[0].userData.guidanceMeshes.find(
      mesh => mesh.userData.guidanceRole === 'line'
    );
    expect(lineMesh.material.depthWrite).toBe(false);
    expect(lineMesh.material.polygonOffset).toBe(true);
    expect(group.children[0].userData.isEstimated).toBe(false);
  });

  it('renders estimated fallback routes as dashed line meshes', () => {
    const group = buildRouteGroup(
      mockProjection(),
      mockTrip({ geometry: null }),
      'day-1',
      mockTerrainModel(),
      { routeSamples: 10 }
    );

    expect(group.userData.realGeometryCount).toBe(0);
    expect(group.children[0].userData.isEstimated).toBe(true);
    expect(
      group.children[0].userData.guidanceMeshes.every(mesh => mesh.userData.guidanceRole === 'line')
    ).toBe(true);
  });

  it('conforms wide route ribbon edges to terrain instead of measuring centerline height', () => {
    const group = buildRouteGroup(
      mockProjection(),
      mockTrip({
        geometry: {
          source: 'amap-webservice',
          mode: 'walking',
          paths: [
            [
              [116, 39],
              [116.02, 39]
            ]
          ]
        }
      }),
      'day-1',
      {
        bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
        heightAt: (x, z) => 4 + z * 0.85,
        foundationAt: () => 1,
        elevationAt: (x, z) => 40 + x * 0.01 + z * 0.01
      },
      { routeSamples: 24 }
    );

    expect(group.userData.routeClearanceP95Meters).toBeLessThanOrEqual(0.3);
    expect(group.children[0].userData.clearanceMetrics.maxMeters).toBeLessThanOrEqual(0.3);
  });

  it('clips rendered route geometry to the terrain work area bounds', () => {
    const group = buildRouteGroup(
      mockProjection(),
      mockTrip({
        geometry: {
          source: 'amap-webservice',
          mode: 'walking',
          paths: [
            [
              [115.99, 39],
              [116.02, 39]
            ]
          ]
        }
      }),
      'day-1',
      {
        bounds: { minX: 0, maxX: 10, minZ: -10, maxZ: 10 },
        heightAt: () => 4,
        foundationAt: () => 1,
        elevationAt: () => 40
      },
      { routeSamples: 24 }
    );

    expect(group.userData.realGeometryCount).toBe(1);
    expect(group.children).toHaveLength(1);
    const lineMesh = group.children[0].userData.guidanceMeshes.find(
      mesh => mesh.userData.guidanceRole === 'line'
    );
    const positions = lineMesh.geometry.attributes.position;
    for (let index = 0; index < positions.count; index += 1) {
      expect(positions.getX(index)).toBeGreaterThanOrEqual(0);
      expect(positions.getX(index)).toBeLessThanOrEqual(10);
      expect(positions.getZ(index)).toBeGreaterThanOrEqual(-10);
      expect(positions.getZ(index)).toBeLessThanOrEqual(10);
    }
    expect(group.userData.routeClearanceP95Meters).toBeLessThanOrEqual(0.3);
  });

  it('updates highlight state without rebuilding the route group', () => {
    const routeGroup = buildRouteGroup(
      mockProjection(),
      mockTrip({
        geometry: {
          source: 'amap-webservice',
          mode: 'walking',
          paths: [
            [
              [116, 39],
              [116.005, 39.004],
              [116.01, 39.01]
            ]
          ]
        }
      }),
      'day-1',
      mockTerrainModel(),
      { routeSamples: 24 }
    );
    const diorama = {
      routeGroup,
      container: { dataset: {} },
      activeRouteSegmentId: null
    };

    expect(set3DRouteHighlight(diorama, 'day-1-route-0')).toBe(true);
    expect(diorama.activeRouteSegmentId).toBe('day-1-route-0');
    expect(diorama.container.dataset.activeRouteSegment).toBe('day-1-route-0');
    const lineMesh = routeGroup.children[0].userData.guidanceMeshes.find(
      mesh => mesh.userData.guidanceRole === 'line'
    );
    expect(lineMesh.material.color.getHexString()).toBe(
      ROUTE_GUIDANCE.activeLine.replace('#', '').toLowerCase()
    );
  });
});

function mockTrip({ geometry }) {
  return {
    locations: {
      a: { id: 'a', lnglat: [116, 39] },
      b: { id: 'b', lnglat: [116.01, 39.01] }
    },
    days: [
      {
        id: 'day-1',
        events: [
          { id: 'event-1', locationId: 'a', routeToNext: { mode: 'walking', geometry } },
          { id: 'event-2', locationId: 'b' }
        ]
      }
    ]
  };
}

function mockProjection() {
  return {
    toScene: ([lng, lat]) => ({ x: (lng - 116) * 1000, z: (lat - 39) * 1000 }),
    metersToUnits: value => value * 0.5,
    unitsToMeters: value => value * 2
  };
}

function mockTerrainModel() {
  return {
    bounds: { minX: 0, maxX: 900, minZ: 0, maxZ: 900 },
    heightAt: (x, z) => 4 + x * 0.001 + z * 0.001,
    foundationAt: () => 1,
    elevationAt: (x, z) => 40 + x * 0.01 + z * 0.01
  };
}
