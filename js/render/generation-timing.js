export const GENERATION_TIMING_MS = Object.freeze({
  foundationRise: 1000,
  terrainWaterRoadBridge: 1000,
  buildingMassing: 1000,
  buildingDissolve: 1000,
  get total() {
    return (
      this.foundationRise +
      this.terrainWaterRoadBridge +
      this.buildingMassing +
      this.buildingDissolve
    );
  }
});
