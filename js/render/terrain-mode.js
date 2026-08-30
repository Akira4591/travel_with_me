import { clamp } from './math-utils.js';

export const TERRAIN_MODES = {
  microStreet: {
    id: 'micro-street',
    label: 'Micro Street',
    terrainGrid: 18,
    routeSamples: 18,
    labelBudget: 18,
    dataSource: 'open-meteo-or-flat'
  },
  citywalk: {
    id: 'citywalk',
    label: 'Citywalk',
    terrainGrid: 28,
    routeSamples: 24,
    labelBudget: 14,
    dataSource: 'open-meteo'
  },
  scenicPark: {
    id: 'scenic-park',
    label: 'Scenic Park',
    terrainGrid: 40,
    routeSamples: 32,
    labelBudget: 12,
    dataSource: 'open-meteo-dem-preferred'
  },
  hiking: {
    id: 'hiking',
    label: 'Hiking',
    terrainGrid: 48,
    routeSamples: 48,
    labelBudget: 8,
    dataSource: 'dem-required-for-strong-claims'
  },
  regionOverview: {
    id: 'region-overview',
    label: 'Region Overview',
    // 远景只服务于片区关系和路线可读性；14×14 保持首屏可用，细节留给 inspect 局部 DEM。
    terrainGrid: 14,
    routeSamples: 20,
    labelBudget: 8,
    dataSource: 'open-meteo-low-detail'
  }
};

const SCENIC_PATTERN =
  /\u666f\u533a|\u516c\u56ed|\u5c71|\u5cf0|\u5cad|\u8c37|\u5ce1|\u6e56|\u68ee\u6797|\u7d22\u9053|\u89c2\u666f|\u5bfa|trail|park|mount|hill/i;
const URBAN_PATTERN =
  /\u5496\u5561|\u9910|\u996d|\u5546\u573a|\u4e66\u5e97|\u9152\u5e97|\u80e1\u540c|\u5df7|\u8857|\u8def|\u5e97|bar|cafe|mall|hotel/i;

export function chooseTerrainMode(input = {}) {
  const span = clamp(Number(input.span) || 0, 200, 30000);
  const poiCount = Math.max(0, Number(input.poiCount) || 0);
  const routeLength = Math.max(0, Number(input.routeLength) || span);
  const elevationRange = Math.max(0, Number(input.elevationRange) || 0);
  const locations = Array.isArray(input.locations) ? input.locations : [];
  const scenicScore = locations.reduce((score, loc) => {
    const text = `${loc?.name || ''} ${loc?.type || ''} ${loc?.addr || ''}`;
    return score + (SCENIC_PATTERN.test(text) ? 1 : 0);
  }, 0);
  const urbanScore = locations.reduce((score, loc) => {
    const text = `${loc?.name || ''} ${loc?.type || ''} ${loc?.addr || ''}`;
    return score + (URBAN_PATTERN.test(text) ? 1 : 0);
  }, 0);
  const density = poiCount / Math.max(0.2, (span / 1000) ** 2);

  let mode = TERRAIN_MODES.citywalk;
  let reason = 'default-citywalk';

  if (span > 6000) {
    mode = TERRAIN_MODES.regionOverview;
    reason = 'large-span';
  } else if (
    span >= 2000 &&
    routeLength >= 3500 &&
    (elevationRange >= 120 || (routeLength >= 6000 && scenicScore > 0))
  ) {
    mode = TERRAIN_MODES.hiking;
    reason = 'long-route-with-elevation';
  } else if (span >= 1000 && scenicScore >= Math.max(1, Math.ceil(poiCount * 0.35))) {
    mode = TERRAIN_MODES.scenicPark;
    reason = 'scenic-poi-cluster';
  } else if (span < 1200 && density >= 4 && urbanScore >= scenicScore) {
    mode = TERRAIN_MODES.microStreet;
    reason = 'dense-urban-poi';
  }

  return {
    ...mode,
    reason,
    span,
    poiCount,
    routeLength,
    elevationRange,
    // 桌面端首版限制为 48x48：近景细节依赖局部重采样，而不是整幅地图无限加密。
    terrainGrid: clamp(mode.terrainGrid, 8, input.maxTerrainGrid || 48)
  };
}
