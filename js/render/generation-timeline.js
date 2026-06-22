export const GENERATION_PHASES = [
  'freeze-2d',
  'derive-scene-envelope',
  'slab-rise',
  'terrain-refine',
  'water-carve',
  'road-emerge',
  'bridge-resolve',
  'route-highlight',
  'building-massing',
  'building-dissolve',
  'steady'
];

const PHASE_WINDOWS = [
  { phase: 'freeze-2d', start: 0, end: 0.02 },
  { phase: 'derive-scene-envelope', start: 0.02, end: 0.04 },
  { phase: 'slab-rise', start: 0.04, end: 0.25 },
  { phase: 'terrain-refine', start: 0.25, end: 0.34 },
  { phase: 'water-carve', start: 0.34, end: 0.42 },
  { phase: 'road-emerge', start: 0.42, end: 0.47 },
  { phase: 'bridge-resolve', start: 0.47, end: 0.49 },
  { phase: 'route-highlight', start: 0.49, end: 0.5 },
  { phase: 'building-massing', start: 0.5, end: 0.75 },
  { phase: 'building-dissolve', start: 0.75, end: 1 }
];

export function createGenerationTimeline() {
  const state = {
    phase: 'freeze-2d',
    phaseProgress: 0,
    phaseStartedAt: now(),
    progress: createProgressMap()
  };

  return {
    updateFromOverallProgress(overallProgress) {
      const normalized = clamp01(overallProgress);
      const window = getPhaseWindow(normalized);
      const phaseProgress = window
        ? clamp01((normalized - window.start) / Math.max(window.end - window.start, 0.001))
        : 1;
      setPhaseState(state, window?.phase || 'steady', phaseProgress);
      updateProgressMap(state.progress, normalized);
      return this.snapshot();
    },
    setSteady() {
      setPhaseState(state, 'steady', 1);
      updateProgressMap(state.progress, 1);
      return this.snapshot();
    },
    snapshot() {
      return {
        phase: state.phase,
        phaseProgress: state.phaseProgress,
        phaseStartedAt: state.phaseStartedAt,
        ...state.progress
      };
    }
  };
}

export function getPhaseWindow(overallProgress) {
  const progress = clamp01(overallProgress);
  return PHASE_WINDOWS.find(item => progress >= item.start && progress < item.end) || null;
}

function createProgressMap() {
  return {
    foundationProgress: 0,
    terrainRefineProgress: 0,
    carvingProgress: 0,
    roadBridgeProgress: 0,
    routeDrawProgress: 0,
    buildingMassingProgress: 0,
    buildingDissolveProgress: 0
  };
}

function updateProgressMap(target, overallProgress) {
  target.foundationProgress = phaseProgress(overallProgress, 0, 0.25);
  target.terrainRefineProgress = phaseProgress(overallProgress, 0.25, 0.5);
  target.carvingProgress = phaseProgress(overallProgress, 0.25, 0.5);
  target.roadBridgeProgress = phaseProgress(overallProgress, 0.25, 0.5);
  target.routeDrawProgress = phaseProgress(overallProgress, 0.25, 0.5);
  target.buildingMassingProgress = phaseProgress(overallProgress, 0.5, 0.75);
  target.buildingDissolveProgress = phaseProgress(overallProgress, 0.75, 1);
}

function phaseProgress(overallProgress, start, end) {
  return clamp01((overallProgress - start) / Math.max(end - start, 0.001));
}

function setPhaseState(state, phase, phaseProgress) {
  if (state.phase !== phase) {
    state.phase = phase;
    state.phaseStartedAt = now();
  }
  state.phaseProgress = clamp01(phaseProgress);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
