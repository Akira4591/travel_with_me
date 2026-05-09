// js/render/icons.js
// 内置简约行程图标集合。存储层只保存 icon id，UI 统一渲染 SVG。

const ICON_PATHS = {
  place: '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  transport: '<path d="M4 6 2 7"/><path d="M10 6h4"/><path d="m22 7-2-1"/><rect width="16" height="16" x="4" y="3" rx="2"/><path d="M4 11h16"/><path d="M8 15h.01"/><path d="M16 15h.01"/><path d="M6 19v2"/><path d="M18 21v-2"/>',
  hotel: '<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>',
  food: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  coffee: '<path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/>',
  shopping: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  market: '<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2 2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7"/>',
  campus: '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
  park: '<path d="m17 14 3 3.3a1 1 0 0 1-.7 1.7H4.7a1 1 0 0 1-.7-1.7L7 14h-.3a1 1 0 0 1-.7-1.7L9 9h-.2A1 1 0 0 1 8 7.3L12 3l4 4.3a1 1 0 0 1-.8 1.7H15l3 3.3a1 1 0 0 1-.7 1.7H17Z"/><path d="M12 22v-3"/>',
  attraction: '<line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/>',
  museum: '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>',
  entertainment: '<circle cx="12" cy="12" r="2"/><path d="M12 2v4"/><path d="m6.8 15-3.5 2"/><path d="m20.7 7-3.5 2"/><path d="M6.8 9 3.3 7"/><path d="m20.7 17-3.5-2"/><path d="m9 22 3-8 3 8"/><path d="M8 22h8"/><path d="M18 18.7a9 9 0 1 0-12 0"/>',
  nightlife: '<path d="M17 11h1a3 3 0 0 1 0 6h-1"/><path d="M9 12v6"/><path d="M13 12v6"/><path d="M14 7.5c-1 0-1.44.5-3 .5s-2-.5-3-.5-1.72.5-2.5.5a2.5 2.5 0 0 1 0-5c.78 0 1.57.5 2.5.5S9.44 2 11 2s2 1.5 3 1.5 1.72-.5 2.5-.5a2.5 2.5 0 0 1 0 5c-.78 0-1.5-.5-2.5-.5Z"/><path d="M5 8v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8"/>'
};

const ICON_RULES = [
  {
    id: 'coffee',
    type: ['咖啡', '茶馆', '饮品', '奶茶', '甜品', '面包糕饼'],
    name: ['咖啡', 'coffee', '奶茶', '茶', '甜品', '蛋糕', '面包', '烘焙', '饮品', '冰淇淋']
  },
  {
    id: 'nightlife',
    type: ['酒吧', '夜总会', 'KTV'],
    name: ['酒吧', 'bar', '啤酒', '精酿', '夜店', '夜生活', '小酒馆', 'livehouse', 'live house', 'KTV']
  },
  {
    id: 'food',
    type: ['餐饮服务', '餐厅', '中餐厅', '外国餐厅', '快餐厅', '小吃', '美食'],
    name: ['吃', '饭', '餐', '午餐', '晚餐', '早餐', '小吃', '火锅', '烧烤', '寿司', '拉面', '面馆', '菜馆', '饭店', '餐厅', '食堂', '紫光园', '万象汇吃']
  },
  {
    id: 'hotel',
    type: ['住宿服务', '宾馆酒店', '旅馆招待所'],
    name: ['酒店', '住宿', '民宿', '宾馆', '旅店', '旅馆', '客栈', '放行李', '入住', '休息', 'check-in', 'checkin']
  },
  {
    id: 'transport',
    type: ['交通设施服务', '火车站', '地铁站', '公交车站', '长途汽车站', '机场', '港口码头'],
    name: ['交通', '抵达', '出发', '送站', '接站', '回程', '返程', '火车站', '高铁站', '动车站', '地铁站', '公交站', '汽车站', '机场', '航站楼', '码头', '港口', '打车', '北京南站']
  },
  {
    id: 'campus',
    type: ['科教文化服务;学校', '高等院校', '中学', '小学'],
    name: ['大学', '校园', '校区', '学校', '人大', '学院', '清华', '北大', '高校']
  },
  {
    id: 'museum',
    type: ['博物馆', '展览馆', '美术馆', '科技馆', '图书馆', '文化宫'],
    name: ['博物馆', '美术馆', '展览', '展馆', '科技馆', '图书馆', '艺术馆', '文化馆', '画廊', '书店', '阅读']
  },
  {
    id: 'park',
    type: ['公园广场', '公园', '植物园', '动物园', '自然地物'],
    name: ['公园', '森林', '河', '湖', '水岸', '运河', '漫步', '踏青', '户外', '骑行', '绿地', '植物园', '动物园']
  },
  {
    id: 'attraction',
    type: ['风景名胜', '寺庙道观', '纪念馆', '世界遗产', '旅游景点'],
    name: ['景点', '景区', '故宫', '颐和园', '长城', '天坛', '寺', '庙', '塔', '古城', '古镇', '打卡', '游览', '参观', '拍照', '摄影', '写真', '机位', '观景台', '日落', '日出', '夜景']
  },
  {
    id: 'entertainment',
    type: ['体育休闲服务', '影剧院', '游乐场', '娱乐场所'],
    name: ['游乐', '乐园', '剧院', '影院', '电影', '演出', '剧场', 'KTV', '密室', '脱口秀', '音乐节']
  },
  {
    id: 'market',
    type: ['商场;市场', '综合市场', '农副产品市场', '特色商业街'],
    name: ['市场', '市集', '夜市', '集市', '摊', '小商品', '菜市场', '花市']
  },
  {
    id: 'shopping',
    type: ['购物服务', '商场', '购物中心', '百货商场', '专卖店'],
    name: ['商场', '购物', '逛街', '逛商场', '买', '商城', '百货', '奥莱', 'outlets', '万象汇', '蓝色港湾', '书店', '书', '撸猫', '猫']
  },
  {
    id: 'place',
    type: ['地点'],
    name: ['地点', '目的地', '到达']
  }
];

export const EVENT_ICON_OPTIONS = [
  createIconOption('place', '地点'),
  createIconOption('transport', '交通'),
  createIconOption('hotel', '酒店'),
  createIconOption('food', '餐饮'),
  createIconOption('coffee', '咖啡甜品'),
  createIconOption('shopping', '购物'),
  createIconOption('market', '市集'),
  createIconOption('campus', '校园'),
  createIconOption('park', '公园户外'),
  createIconOption('attraction', '景点'),
  createIconOption('museum', '展馆'),
  createIconOption('entertainment', '娱乐游玩'),
  createIconOption('nightlife', '酒吧')
];

const ICON_ALIASES = new Map([
  ['pin', 'place'],
  ['train', 'transport'],
  ['school', 'campus'],
  ['shop', 'shopping'],
  ['book', 'shopping'],
  ['outdoor', 'park'],
  ['culture', 'museum'],
  ['photo', 'attraction']
]);

const LEGACY_ICON_MAP = new Map([
  ['📍', 'place'],
  ['🚄', 'transport'],
  ['🚲', 'park'],
  ['👋', 'transport'],
  ['🏨', 'hotel'],
  ['🍣', 'food'],
  ['🦆', 'food'],
  ['🍽️', 'food'],
  ['🍔', 'food'],
  ['🍷', 'nightlife'],
  ['☕', 'coffee'],
  ['🐱', 'shopping'],
  ['📚', 'shopping'],
  ['🎓', 'campus'],
  ['🌊', 'park'],
  ['🌳', 'park']
]);

const ICON_IDS = new Set(EVENT_ICON_OPTIONS.map(option => option.id));
const RULE_BY_ID = new Map(ICON_RULES.map(rule => [rule.id, rule]));

function createIconOption(id, label) {
  return {
    id,
    label,
    paths: ICON_PATHS[id]
  };
}

function compileKeywords(words = []) {
  return new RegExp(words.map(escapeRegExp).join('|'), 'i');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeWords(rule, key) {
  const words = rule[key] || [];
  if (!rule[`${key}Regex`]) rule[`${key}Regex`] = compileKeywords(words);
  return rule[`${key}Regex`];
}

function normalizeIconInput(input) {
  if (input && typeof input === 'object') {
    return {
      title: String(input.title || input.eventTitle || '').trim(),
      name: String(input.name || input.placeName || '').trim(),
      addr: String(input.addr || input.address || '').trim(),
      type: String(input.type || input.poiType || '').trim(),
      tag: String(input.tag || '').trim()
    };
  }
  return {
    title: String(input || '').trim(),
    name: '',
    addr: '',
    type: '',
    tag: ''
  };
}

export function normalizeIconId(icon) {
  if (!icon) return '';
  const id = String(icon).trim();
  if (ICON_IDS.has(id)) return id;
  if (ICON_ALIASES.has(id)) return ICON_ALIASES.get(id);
  return LEGACY_ICON_MAP.get(id) || '';
}

export function inferIconId(input) {
  const fields = normalizeIconInput(input);
  const intentText = `${fields.title} ${fields.name}`.trim();
  const typeText = `${fields.type} ${fields.tag}`.trim();
  const addressText = fields.addr;
  const scores = new Map();

  ICON_RULES.forEach(rule => {
    let score = 0;
    if (typeText && normalizeWords(rule, 'type').test(typeText)) score += 10;
    if (intentText && normalizeWords(rule, 'name').test(intentText)) score += 5;
    // 地址只作为弱信号，且不用于交通，避免“餐厅地址含某某站”误判成交通。
    if (addressText && rule.id !== 'transport' && normalizeWords(rule, 'name').test(addressText)) score += 1;
    if (score > 0) scores.set(rule.id, score);
  });

  let bestId = 'place';
  let bestScore = 0;
  for (const option of EVENT_ICON_OPTIONS) {
    const score = scores.get(option.id) || 0;
    if (score > bestScore) {
      bestId = option.id;
      bestScore = score;
    }
  }
  return bestId;
}

export function getIconIdForEvent(event, location) {
  return normalizeIconId(event?.icon) || inferIconId({
    title: event?.title,
    name: location?.name,
    addr: location?.addr,
    type: location?.type
  });
}

export function renderIconSVG(iconId, className = 'event-icon-svg') {
  const id = normalizeIconId(iconId) || 'place';
  const icon = EVENT_ICON_OPTIONS.find(option => option.id === id) || EVENT_ICON_OPTIONS[0];
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon.paths}</svg>`;
}

// Canvas 渲染（如分享图）需要拿到原始 SVG 路径自己包外层 svg。
export function getIconPaths(iconId) {
  const id = normalizeIconId(iconId) || 'place';
  return ICON_PATHS[id] || ICON_PATHS.place;
}

export function getIconRule(iconId) {
  return RULE_BY_ID.get(normalizeIconId(iconId));
}

export function renderIconPickerHTML(selectedId = 'place') {
  const selected = normalizeIconId(selectedId) || 'place';
  return `
    <div class="icon-picker" role="radiogroup" aria-label="选择图标">
      ${EVENT_ICON_OPTIONS.map(option => `
        <button type="button" class="icon-picker-btn ${option.id === selected ? 'active' : ''}" data-icon-id="${option.id}" role="radio" aria-checked="${option.id === selected}" title="${option.label}">
          ${renderIconSVG(option.id, 'icon-picker-svg')}
          <span>${option.label}</span>
        </button>
      `).join('')}
    </div>
  `;
}

export function bindIconPicker(root, initialId = 'place') {
  let selectedId = normalizeIconId(initialId) || 'place';
  const update = (nextId) => {
    selectedId = normalizeIconId(nextId) || 'place';
    root.querySelectorAll('.icon-picker-btn').forEach(button => {
      const active = button.dataset.iconId === selectedId;
      button.classList.toggle('active', active);
      button.setAttribute('aria-checked', String(active));
    });
  };

  root.querySelectorAll('.icon-picker-btn').forEach(button => {
    button.addEventListener('click', () => update(button.dataset.iconId));
  });

  return {
    getValue: () => selectedId,
    setValue: update
  };
}
