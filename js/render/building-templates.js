// Stable procedural fallbacks. They are only used when an authoritative footprint/model is absent.

export const BUILDING_TEMPLATES = Object.freeze({
  lodging: ['courtyard', 'tower', 'terrace', 'annex', 'canopy'],
  food: ['shopfront', 'gable', 'arcade', 'terrace', 'annex'],
  retail: ['arcade', 'box', 'canopy', 'terrace', 'tower'],
  culture: ['courtyard', 'gable', 'terrace', 'tower', 'box'],
  transport: ['canopy', 'arcade', 'box', 'tower', 'annex'],
  residential: ['gable', 'terrace', 'courtyard', 'annex', 'tower'],
  generic: ['box', 'gable', 'terrace', 'annex', 'courtyard']
});

const SCENARIO_RULES = [
  ['lodging', /酒店|宾馆|民宿|客栈|hotel|hostel/i],
  ['food', /餐|咖啡|茶|酒吧|小吃|food|cafe|restaurant/i],
  ['retail', /商场|购物|店|market|mall|shop/i],
  ['culture', /博物|展馆|剧院|寺|景区|museum|gallery|theatre/i],
  ['transport', /车站|机场|地铁|码头|station|airport|terminal/i],
  ['residential', /住宅|社区|公寓|小区|apartment|residence/i]
];

export function classifyBuildingScenario(location = {}) {
  const text = `${location.type || ''} ${location.name || ''}`;
  return SCENARIO_RULES.find(([, pattern]) => pattern.test(text))?.[0] || 'generic';
}

export function chooseBuildingTemplate(location, seed) {
  const scenario = classifyBuildingScenario(location);
  const templates = BUILDING_TEMPLATES[scenario];
  const index = Math.min(templates.length - 1, Math.floor(Math.abs(seed) * templates.length));
  return { scenario, id: templates[index], index };
}
