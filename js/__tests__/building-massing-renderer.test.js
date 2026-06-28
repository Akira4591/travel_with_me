import { describe, expect, it } from 'vitest';

import { buildBuildingGroup } from '../render/building-massing-renderer.js';

describe('buildBuildingGroup', () => {
  it('builds deterministic neutral fallback massing across rebuilds', () => {
    const locations = [
      { id: 'coffee-a', name: 'Coffee A', type: 'food', lnglat: [1, 2] },
      { id: 'hotel-b', name: 'Hotel B', type: 'lodging', lnglat: [8, 4] }
    ];

    const first = buildBuildingGroup(mockProjection(), locations, flatTerrain());
    const second = buildBuildingGroup(mockProjection(), locations, flatTerrain());

    expect(first.userData.count).toBe(2);
    expect(first.userData.syntheticMassingCount).toBe(2);
    expect(first.userData.instancedMassingMeshCount).toBe(1);
    expect(first.userData.authoritativeCount).toBe(0);
    expect(second.userData.count).toBe(first.userData.count);
    expect(snapshotLodEntries(second)).toEqual(snapshotLodEntries(first));
    expect(snapshotInstancedMatrices(second)).toEqual(snapshotInstancedMatrices(first));
  });

  it('uses authoritative footprint extrusion when terrain intersection stays within tolerance', () => {
    const locations = [{ id: 'museum', name: 'Museum', type: 'culture', lnglat: [5, 5] }];
    const group = buildBuildingGroup(mockProjection(), locations, flatTerrain(), {
      buildings: [
        {
          id: 'real-museum',
          locationId: 'museum',
          heightMeters: 12,
          footprint: [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10]
          ]
        }
      ]
    });

    expect(group.userData.count).toBe(1);
    expect(group.userData.authoritativeCount).toBe(1);
    expect(group.userData.syntheticMassingCount).toBe(0);
    expect(group.userData.baseTerrainErrorP95Meters).toBe(0);
    expect(group.userData.lodEntries[0]).toMatchObject({
      authoritative: true,
      detailAlpha: 0
    });
  });

  it('downgrades rejected unlocated footprints to synthetic massing instead of dropping context', () => {
    const group = buildBuildingGroup(mockProjection(), [], slopedTerrain(), {
      buildings: [
        {
          id: 'steep-building',
          heightMeters: 10,
          footprint: [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10]
          ]
        }
      ]
    });

    expect(group.userData.count).toBe(1);
    expect(group.userData.authoritativeCount).toBe(0);
    expect(group.userData.syntheticMassingCount).toBe(1);
    expect(group.userData.instancedMassingMeshCount).toBe(1);
    expect(group.userData.lodEntries[0]).toMatchObject({
      syntheticMassing: true,
      lowInstanced: true
    });
  });
});

function snapshotLodEntries(group) {
  return group.userData.lodEntries.map(entry => ({
    center: entry.center.toArray().map(value => Number(value.toFixed(4))),
    detailTemplate: entry.detail.userData.template?.id || '',
    lowInstanced: Boolean(entry.lowInstanced),
    syntheticMassing: Boolean(entry.syntheticMassing)
  }));
}

function snapshotInstancedMatrices(group) {
  const mesh = group.children.find(child => child.isInstancedMesh);
  return mesh ? Array.from(mesh.instanceMatrix.array).map(value => Number(value.toFixed(4))) : [];
}

function mockProjection() {
  return {
    toScene([lng, lat]) {
      return { x: lng, z: lat };
    },
    metersToUnits(value) {
      return Number(value) || 0;
    },
    unitsToMeters(value) {
      return Number(value) || 0;
    }
  };
}

function flatTerrain() {
  return {
    bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
    heightAt: () => 4
  };
}

function slopedTerrain() {
  return {
    bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
    heightAt: (x, z) => (Number(x) + Number(z)) / 10
  };
}
