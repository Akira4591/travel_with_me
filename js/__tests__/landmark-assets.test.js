import { describe, expect, it } from 'vitest';

import { validateLandmarkAsset } from '../render/landmark-assets.js';

describe('landmark asset release gate', () => {
  it('accepts allowlisted optimized landmark metadata with integrity and LODs', () => {
    const result = validateLandmarkAsset(validLandmark());

    expect(result.passed).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.normalizedAsset.lods.map(lod => lod.level)).toEqual([
      'LOD2',
      'LOD1',
      'placeholder'
    ]);
  });

  it('rejects remote models without allowlist, integrity, optimization, or budgets', () => {
    const result = validateLandmarkAsset({
      ...validLandmark(),
      modelUrl: 'https://untrusted.example/landmark.glb',
      asset: {
        contentType: 'application/octet-stream',
        byteSize: 99_999_999,
        triangleCount: 120_000,
        materialCount: 80,
        textureBytes: 99_999_999,
        footprintDriftMeters: 12,
        optimized: false,
        lods: []
      }
    });

    expect(result.passed).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'LANDMARK_MODEL_URL:HOST:untrusted.example',
        'LANDMARK_SOURCE_FORMAT_MISSING',
        'LANDMARK_CONTENT_TYPE:application/octet-stream',
        'LANDMARK_NOT_OPTIMIZED',
        'LANDMARK_INTEGRITY_MISSING',
        'LANDMARK_LODS_MISSING'
      ])
    );
  });
});

function validLandmark() {
  return {
    id: 'valid-landmark',
    lnglat: [116.4, 39.9],
    modelUrl: 'fixture://valid-landmark.glb',
    asset: {
      sourceFormat: 'owner-provided-glb',
      contentType: 'model/gltf-binary',
      byteSize: 4096,
      triangleCount: 300,
      materialCount: 1,
      textureBytes: 1024,
      footprintDriftMeters: 0.2,
      optimized: true,
      integrity: 'sha256-validRootIntegrity000000000000000=',
      lods: [
        {
          level: 'LOD2',
          modelUrl: 'fixture://valid-landmark-lod2.glb',
          byteSize: 4096,
          triangleCount: 300,
          integrity: 'sha256-validLod2Integrity000000000000000='
        },
        {
          level: 'LOD1',
          modelUrl: 'fixture://valid-landmark-lod1.glb',
          byteSize: 2048,
          triangleCount: 100,
          integrity: 'sha256-validLod1Integrity000000000000000='
        },
        {
          level: 'placeholder',
          modelUrl: 'fixture://valid-landmark-placeholder.glb',
          byteSize: 512,
          triangleCount: 12,
          integrity: 'sha256-validPlaceholderIntegrity000000='
        }
      ]
    }
  };
}
