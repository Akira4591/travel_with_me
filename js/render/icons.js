// js/render/icons.js
// 内置黑白行程图标集合。存储层只保存 icon id，UI 统一渲染 SVG。

export const EVENT_ICON_OPTIONS = [
  {
    id: 'pin',
    label: '地点',
    keywords: /地点|目的|到达/,
    paths: '<path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/>'
  },
  {
    id: 'train',
    label: '交通',
    keywords: /站|高铁|火车|抵达|送|交通|地铁|车/,
    paths: '<path d="M7 5h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3Z"/><path d="M8 18l-2 3"/><path d="M16 18l2 3"/><path d="M8 9h8"/><path d="M8 14h.01"/><path d="M16 14h.01"/>'
  },
  {
    id: 'hotel',
    label: '酒店',
    keywords: /酒店|住宿|休息|放行李/,
    paths: '<path d="M4 20V5"/><path d="M20 20v-9a3 3 0 0 0-3-3H9v12"/><path d="M4 11h5"/><path d="M9 14h11"/><path d="M4 20h16"/>'
  },
  {
    id: 'food',
    label: '餐饮',
    keywords: /吃|饭|餐|寿司|紫光园|万象汇|港湾|小吃|咖啡|茶/,
    paths: '<path d="M7 3v8"/><path d="M4 3v5a3 3 0 0 0 6 0V3"/><path d="M7 11v10"/><path d="M17 3v18"/><path d="M14 3h3a3 3 0 0 1 3 3v5h-6Z"/>'
  },
  {
    id: 'book',
    label: '书店',
    keywords: /书店|书|猫|阅读/,
    paths: '<path d="M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 0-4-4Z"/><path d="M5 4v12"/><path d="M9 8h6"/>'
  },
  {
    id: 'school',
    label: '校园',
    keywords: /大学|校园|人大|学校/,
    paths: '<path d="M3 9l9-5 9 5-9 5Z"/><path d="M7 11v5c2 2 8 2 10 0v-5"/><path d="M21 9v6"/>'
  },
  {
    id: 'park',
    label: '户外',
    keywords: /公园|河|漫步|森林|踏青|骑行|水岸/,
    paths: '<path d="M12 3C8 7 6 10 6 13a6 6 0 0 0 12 0c0-3-2-6-6-10Z"/><path d="M12 13v8"/><path d="M9 16h6"/>'
  },
  {
    id: 'shop',
    label: '逛街',
    keywords: /商场|逛|购物|万象汇|蓝色港湾/,
    paths: '<path d="M6 8h12l-1 12H7L6 8Z"/><path d="M9 8a3 3 0 0 1 6 0"/>'
  }
];

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
  ['🐱', 'book'],
  ['🎓', 'school'],
  ['🌊', 'park'],
  ['🌳', 'park']
]);

export function normalizeIconId(icon) {
  if (!icon) return '';
  if (EVENT_ICON_OPTIONS.some(option => option.id === icon)) return icon;
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
