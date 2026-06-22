// js/render/search-modal.js
// 搜索弹窗：先调 PlaceSearch 得到候选 POI，用户选一个 + 填标题，最后回调
//
// 这个模块只管"画 UI + 收集表单数据"，不直接读 state、不直接动 trip
// 调用方传 handlers：
//   - onSearch(keyword) → Promise<places[]> —— 关键词搜索（全城）
//   - onNearbySearch(userInput) → Promise<places[]> —— "搜附近"（基于锚点周围最多 4 个）
//   - onConfirm({ place, event }) → 调用方负责真正写入 trip
//   - nearbyAnchor: { name } | null —— 决定"搜附近"tab 文案；为 null 时退化为全城搜
//
// 设计成单例：同时只能开一个弹窗，重复 open 会先关掉旧的

import { createLogger } from '../logger.js';
import { escapeHTML } from '../utils.js';
import { bindIconPicker, inferIconId, renderIconPickerHTML, renderIconSVG } from './icons.js';
import { TIME_SLOT_OPTIONS, normalizeTimeSlot } from '../time-slots.js';
import { modalSingleton } from './modal-base.js';

const log = createLogger('search-modal');

export const openSearchModal = modalSingleton(handlers => {
  const root = createModal(handlers);
  document.body.appendChild(root);
  // 推迟到下一帧 focus，避免 focus 时 DOM 还没接到事件循环
  requestAnimationFrame(() => {
    root.querySelector('.modal-search-input')?.focus();
  });
});

// ─── 内部 ──────────────────────────────────────────────

function createModal(handlers) {
  const anchorName = handlers?.nearbyAnchor?.name || '';
  const radiusKm = Math.round(Number(handlers?.nearbyAnchor?.radius || 5000) / 1000);
  const maxResults = Number(handlers?.nearbyAnchor?.maxResults || 4);
  const nearbyHintHTML = anchorName
    ? `以「<span class="search-nearby-anchor"></span>」为中心搜索 ${radiusKm}km 内附近最多 ${maxResults} 个地点`
    : '当天还没有地点，将基于关键词全城搜索';

  const root = document.createElement('div');
  root.className = 'modal-overlay';
  root.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="搜索并添加地点">
      <div class="modal-header">
        <h2>搜索并添加地点</h2>
        <button type="button" class="modal-close" aria-label="关闭">×</button>
      </div>
      <div class="modal-body">
        <div class="place-search-panel">
          <div class="editor-search-tabs" role="tablist" aria-label="搜索方式">
            <button type="button" class="editor-search-tab active" data-search-mode="keyword" role="tab" aria-selected="true">关键词搜索</button>
            <button type="button" class="editor-search-tab" data-search-mode="nearby" role="tab" aria-selected="false">搜附近</button>
          </div>
          <div class="place-search-title" data-mode-text="keyword">先搜索地点</div>
          <div class="place-search-title search-nearby-hint" data-mode-text="nearby" hidden>${nearbyHintHTML}</div>
          <div class="modal-search-row">
            <input type="text" class="modal-search-input" placeholder="例如：颐和园、王府井小吃街" />
            <button type="button" class="modal-search-btn">搜索</button>
          </div>
        </div>
        <div class="modal-results" data-state="idle">
          <div class="modal-hint">输入关键词后点击"搜索"，从下方结果中选一个地点</div>
        </div>
        <form class="modal-event-form" hidden>
          <div class="modal-form-row">
            <label>标题</label>
            <input type="text" class="modal-event-title" placeholder="在这里做什么" required />
          </div>
          <div class="modal-form-row icon-form-row">
            <label>图标</label>
            ${renderIconPickerHTML('place')}
          </div>
          <div class="modal-form-row time-form-row">
            <label>时间</label>
            ${renderTimeSlotPickerHTML('')}
          </div>
          <div class="modal-form-row note-form-row">
            <label>备注</label>
            <textarea class="modal-event-note" placeholder="请输入备注信息，例如预约时间、注意事项、同行人安排"></textarea>
          </div>
          <div class="modal-actions">
            <button type="button" class="modal-cancel">取消</button>
            <button type="submit" class="modal-submit">添加到行程</button>
          </div>
        </form>
      </div>
    </div>
  `;

  // 把 anchor 名字注入到提示文案里（避免 innerHTML 直接拼接出现 XSS）
  if (anchorName) {
    const anchorEl = root.querySelector('.search-nearby-anchor');
    if (anchorEl) anchorEl.textContent = anchorName;
  }

  bindEvents(root, handlers);
  return root;
}

function bindEvents(root, handlers) {
  const input = root.querySelector('.modal-search-input');
  const searchBtn = root.querySelector('.modal-search-btn');
  const resultsEl = root.querySelector('.modal-results');
  const form = root.querySelector('.modal-event-form');
  const titleInput = form.querySelector('.modal-event-title');
  const iconPicker = bindIconPicker(form, 'place');
  const timeSlotPicker = bindTimeSlotPicker(form);

  let searchMode = 'keyword'; // 'keyword' | 'nearby'
  let selected = null;

  const doSearch = async () => {
    const keyword = input.value.trim();
    if (!keyword) return;
    const isNearby = searchMode === 'nearby';
    const runner = isNearby ? handlers?.onNearbySearch : handlers?.onSearch;
    if (!runner) return;

    selected = null;
    form.hidden = true;
    setResultsState(resultsEl, 'loading', '<div class="modal-hint">搜索中...</div>');

    try {
      const places = await runner(keyword);
      if (!places || !places.length) {
        const emptyHTML = isNearby
          ? '<div class="modal-hint">附近没找到相关地点，换个关键词试试</div>'
          : '<div class="modal-hint">没有找到结果，换个关键词试试</div>';
        setResultsState(resultsEl, 'empty', emptyHTML);
        return;
      }
      renderResults(resultsEl, places, place => {
        selected = place;
        // 自动用地点名做标题，降低用户输入负担；用户仍可在保存前改。
        titleInput.value = place.name || '';
        iconPicker.setValue(
          inferIconId({
            name: place.name,
            addr: place.addr,
            type: place.type,
            tag: place.tag
          })
        );
        form.hidden = false;
        titleInput.focus();
        titleInput.select();
      });
    } catch (err) {
      log.error('搜索地点失败：', err);
      setResultsState(resultsEl, 'error', '<div class="modal-hint">搜索失败，请重试</div>');
    }
  };

  // 关键词 / 搜附近 两种搜索模式切换
  const tabs = root.querySelectorAll('.editor-search-tab');
  const switchMode = mode => {
    if (searchMode === mode) return;
    searchMode = mode;
    tabs.forEach(t => {
      const active = t.dataset.searchMode === mode;
      t.classList.toggle('active', active);
      t.setAttribute('aria-selected', String(active));
    });
    root.querySelectorAll('[data-mode-text]').forEach(el => {
      el.hidden = el.dataset.modeText !== mode;
    });
    if (mode === 'nearby') {
      input.placeholder = '例如：川菜、咖啡馆、便利店';
    } else {
      input.placeholder = '例如：颐和园、王府井小吃街';
    }
    input.value = '';
    selected = null;
    form.hidden = true;
    setResultsState(
      resultsEl,
      'idle',
      '<div class="modal-hint">输入关键词后点击"搜索"，从下方结果中选一个地点</div>'
    );
    input.focus();
  };
  tabs.forEach(tab => {
    tab.addEventListener('click', () => switchMode(tab.dataset.searchMode));
  });

  searchBtn.addEventListener('click', doSearch);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      doSearch();
    }
  });

  root.querySelector('.modal-close').addEventListener('click', openSearchModal.close);
  root.querySelector('.modal-cancel').addEventListener('click', openSearchModal.close);

  form.addEventListener('submit', e => {
    e.preventDefault();
    if (!selected || !handlers?.onConfirm) return;
    const title = form.querySelector('.modal-event-title').value.trim() || selected.name || '';
    if (!title) return;

    handlers.onConfirm({
      place: selected,
      event: {
        title,
        icon: iconPicker.getValue(),
        timeSlot: timeSlotPicker.getValue(),
        note: form.querySelector('.modal-event-note').value.trim()
      }
    });
    openSearchModal.close();
  });
}

function renderTimeSlotPickerHTML(value) {
  const selected = normalizeTimeSlot(value);
  return `
    <div class="time-slot-picker" role="radiogroup" aria-label="选择时间">
      ${TIME_SLOT_OPTIONS.map(
        option => `
        <button type="button" class="time-slot-btn ${option.id === selected ? 'active' : ''}" data-time-slot="${option.id}" role="radio" aria-checked="${option.id === selected}">
          ${escapeHTML(option.label)}
        </button>
      `
      ).join('')}
    </div>
  `;
}

function bindTimeSlotPicker(root) {
  let value = normalizeTimeSlot(
    root.querySelector('.time-slot-btn.active')?.dataset.timeSlot || ''
  );
  root.querySelectorAll('.time-slot-btn').forEach(button => {
    button.addEventListener('click', () => {
      value = normalizeTimeSlot(button.dataset.timeSlot || '');
      root.querySelectorAll('.time-slot-btn').forEach(item => {
        const active = item === button;
        item.classList.toggle('active', active);
        item.setAttribute('aria-checked', String(active));
      });
    });
  });
  return { getValue: () => value };
}

// 推荐结果卡的图位——和 event-editor-modal 保持同款行为：
// 有真图就圆角矩形展示，没图（或加载失败）回落到 POI type 对应的 SVG 占位
function renderPhotoBanner(place) {
  const url = String(place.photo || '').trim();
  const iconHTML = renderIconSVG(
    inferIconId({
      name: place.name,
      addr: place.addr,
      type: place.type,
      tag: place.tag
    }),
    'placeholder-icon-svg'
  );
  if (url) {
    const httpsUrl = url.replace(/^http:\/\//i, 'https://');
    return `
      <figure class="modal-result-photo">
        <img src="${escapeHTML(httpsUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer"
             onerror="this.parentElement.classList.add('is-placeholder');">
        <span class="placeholder-icon-holder">${iconHTML}</span>
      </figure>
    `;
  }
  return `<figure class="modal-result-photo is-placeholder"><span class="placeholder-icon-holder">${iconHTML}</span></figure>`;
}

// 高德 extensions=all 返回的真实数据 → chip。三项全空时返回空串
function renderMetaChips(place) {
  const chips = [];
  if (place.rating != null && Number(place.rating) > 0) {
    chips.push(`<span class="meta-chip meta-rating">⭐ ${escapeHTML(String(place.rating))}</span>`);
  }
  if (place.cost != null && Number(place.cost) > 0) {
    chips.push(`<span class="meta-chip meta-cost">¥${escapeHTML(String(place.cost))}/人</span>`);
  }
  const firstTag = String(place.tag || '')
    .split(/[;\s]+/)
    .filter(Boolean)[0];
  if (firstTag) {
    chips.push(`<span class="meta-chip meta-tag">${escapeHTML(firstTag)}</span>`);
  }
  return chips.length ? `<div class="modal-result-meta">${chips.join('')}</div>` : '';
}

function setResultsState(resultsEl, state, html) {
  resultsEl.dataset.state = state;
  resultsEl.innerHTML = html;
}

function renderResults(resultsEl, places, onPick) {
  resultsEl.dataset.state = 'ready';
  resultsEl.innerHTML = '';
  places.forEach(place => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'modal-result-item';
    const metaHTML = renderMetaChips(place);
    const photoHTML = renderPhotoBanner(place);
    item.innerHTML = `
      ${photoHTML}
      <div class="modal-result-name">${escapeHTML(place.name)}</div>
      <div class="modal-result-addr">${escapeHTML(place.addr || place.city || '地址未提供')}</div>
      ${metaHTML}
    `;
    item.addEventListener('click', () => {
      resultsEl
        .querySelectorAll('.modal-result-item')
        .forEach(el => el.classList.remove('selected'));
      item.classList.add('selected');
      onPick(place);
    });
    resultsEl.appendChild(item);
  });
}
