// js/render/icons.js
// 内置黑白行程图标集合。存储层只保存 icon id，UI 统一渲染 SVG。

const ICON_PATHS = {
  pin: '<path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/>',
  train: '<path d="M7 5h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3Z"/><path d="M8 18l-2 3"/><path d="M16 18l2 3"/><path d="M8 9h8"/><path d="M8 14h.01"/><path d="M16 14h.01"/>',
  hotel: '<path d="M4 20V5"/><path d="M20 20v-9a3 3 0 0 0-3-3H9v12"/><path d="M4 11h5"/><path d="M9 14h11"/><path d="M4 20h16"/>',
  food: '<path d="M7 3v8"/><path d="M4 3v5a3 3 0 0 0 6 0V3"/><path d="M7 11v10"/><path d="M17 3v18"/><path d="M14 3h3a3 3 0 0 1 3 3v5h-6Z"/>',
  school: '<path d="M3 9l9-5 9 5-9 5Z"/><path d="M7 11v5c2 2 8 2 10 0v-5"/><path d="M21 9v6"/>',
  park: '<path d="M12 3C8 7 6 10 6 13a6 6 0 0 0 12 0c0-3-2-6-6-10Z"/><path d="M12 13v8"/><path d="M9 16h6"/>',
  shop: '<path d="M6 8h12l-1 12H7L6 8Z"/><path d="M9 8a3 3 0 0 1 6 0"/>'
};

const ICON_KEYWORDS = {
  train: [
    '交通', '抵达', '出发', '送', '回程', '返程',
    '站', '车站', '火车', '高铁', '动车', '地铁', '公交', '机场', '航站楼', '打车'
  ],
  hotel: [
    '酒店', '住宿', '民宿', '宾馆', '放行李', '休息', '入住', 'Check-in', 'check-in'
  ],
  food: [
    '吃', '饭', '餐', '午餐', '晚餐', '早餐', '小吃', '咖啡', '茶', '寿司', '紫光园'
  ],
  school: [
    '大学', '校园', '校区', '学校', '人大', '学院'
  ],
  park: [
    '公园', '森林', '河', '湖', '水岸', '运河', '漫步', '踏青', '户外', '骑行'
  ],
  shop: [
    '商场', '购物', '逛', '街', '市集', '书店', '书', '阅读', '撸猫', '猫', '万象汇', '蓝色港湾'
  ],
  pin: [
    '地点', '目的地', '到达'
  ]
};

export const EVENT_ICON_OPTIONS = [
  createIconOption('pin', '地点'),
  createIconOption('train', '交通'),
  createIconOption('hotel', '酒店'),
  createIconOption('food', '餐饮'),
  createIconOption('school', '校园'),
  createIconOption('park', '户外'),
  createIconOption('shop', '逛逛')
];

const ICON_ALIASES = new Map([
  ['book', 'shop']
]);

const LEGACY_ICON_MAP = new Map([
  ['📍', 'pin'],
  ['🚄', 'train'],
  ['🚲', 'park'],
  ['👋', 'train'],
  ['🏨', 'hotel'],
  ['🍣', 'food'],
  ['🦆', 'food'],
  ['🍽️', 'food'],
  ['🍔', 'food'],
  ['🍷', 'food'],
  ['🐱', 'shop'],
  ['📚', 'shop'],
  ['🎓', 'school'],
  ['🌊', 'park'],
  ['🌳', 'park']
]);

const ICON_IDS = new Set(EVENT_ICON_OPTIONS.map(option => option.id));

function createIconOption(id, label) {
  return {
    id,
    label,
    keywords: compileKeywords(ICON_KEYWORDS[id]),
    paths: ICON_PATHS[id]
  };
}

function compileKeywords(words = []) {
  return new RegExp(words.map(escapeRegExp).join('|'), 'i');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeIconId(icon) {
  if (!icon) return '';
  if (ICON_IDS.has(icon)) return icon;
  if (ICON_ALIASES.has(icon)) return ICON_ALIASES.get(icon);
  return LEGACY_ICON_MAP.get(icon) || '';
}

export function inferIconId(text) {
  const source = String(text || '');
  return EVENT_ICON_OPTIONS.find(option => option.keywords.test(source))?.id || 'pin';
}

export function getIconIdForEvent(event, location) {
  return normalizeIconId(event?.icon) || inferIconId(`${event?.title || ''} ${location?.name || ''}`);
}

export function renderIconSVG(iconId, className = 'event-icon-svg') {
  const icon = EVENT_ICON_OPTIONS.find(option => option.id === normalizeIconId(iconId)) || EVENT_ICON_OPTIONS[0];
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon.paths}</svg>`;
}

// Canvas 渲染（如分享图）需要拿到原始 SVG 路径自己包外层 svg。
export function getIconPaths(iconId) {
  const id = normalizeIconId(iconId) || 'pin';
  return ICON_PATHS[id] || ICON_PATHS.pin;
}

export function renderIconPickerHTML(selectedId = 'pin') {
  const selected = normalizeIconId(selectedId) || 'pin';
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

export function bindIconPicker(root, initialId = 'pin') {
  let selectedId = normalizeIconId(initialId) || 'pin';
  const update = (nextId) => {
    selectedId = normalizeIconId(nextId) || 'pin';
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
