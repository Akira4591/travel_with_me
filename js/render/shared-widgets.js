// js/render/shared-widgets.js
// 共享 UI 组件：消除 search-modal.js 与 event-editor-modal.js 间的重复
//
// 包含：
//   - renderTimeSlotPickerHTML / bindTimeSlotPicker
//   - renderPhotoBanner / renderMetaChips
//   - renderSearchResults / setResultsState

import { escapeHTML } from '../utils.js';
import { TIME_SLOT_OPTIONS, normalizeTimeSlot } from '../time-slots.js';
import { inferIconId, renderIconSVG } from './icons.js';

// ─── Time slot picker ──────────────────────────────────────

/**
 * 生成时间段选择器的 HTML
 * @param {string} value - 当前选中的时间段 ID
 * @returns {string} HTML 字符串
 */
export function renderTimeSlotPickerHTML(value) {
  const selected = normalizeTimeSlot(value);
  return `
    <div class="time-slot-picker" role="radiogroup" aria-label="选择时间">
      ${TIME_SLOT_OPTIONS.map(
        option => `
        <button type="button"
          class="time-slot-btn ${option.id === selected ? 'active' : ''}"
          data-time-slot="${option.id}"
          role="radio"
          aria-checked="${option.id === selected}">
          ${escapeHTML(option.label)}
        </button>
      `
      ).join('')}
    </div>
  `;
}

/**
 * 绑定时间段选择器的交互
 * @param {HTMLElement} root - 包含 .time-slot-btn 按钮的容器
 * @returns {{ getValue: () => string }}
 */
export function bindTimeSlotPicker(root) {
  const initialBtn = root.querySelector('.time-slot-btn.active');
  let value = normalizeTimeSlot(initialBtn?.dataset.timeSlot || '');

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

// ─── Place card widgets ────────────────────────────────────

/**
 * 渲染搜索结果卡的图片位
 * @param {object} place - POI 对象（含 photo/name/type 等字段）
 * @returns {string} HTML 字符串
 */
export function renderPhotoBanner(place) {
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

/**
 * 渲染 POI 元数据 chips（评分/人均/标签）
 * @param {object} place - POI 对象
 * @returns {string} HTML 字符串，无数据时为空
 */
export function renderMetaChips(place) {
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

// ─── Search results rendering ──────────────────────────────

/**
 * 设置结果容器的状态和内容
 * @param {HTMLElement} resultsEl - 结果容器元素
 * @param {string} state - 状态名（idle/loading/empty/error/ready）
 * @param {string} html - innerHTML 内容
 */
export function setResultsState(resultsEl, state, html) {
  resultsEl.dataset.state = state;
  resultsEl.innerHTML = html;
}

/**
 * 渲染搜索结果列表
 * @param {HTMLElement} resultsEl - 结果容器元素
 * @param {Array<object>} places - POI 数组
 * @param {(place: object) => void} onPick - 选中回调
 * @param {object} [options]
 * @param {(place: object) => string} [options.getAddrText] - 自定义地址文本
 */
export function renderSearchResults(resultsEl, places, onPick, options = {}) {
  const getAddrText = options.getAddrText || (place => place.addr || place.city || '地址未提供');

  resultsEl.dataset.state = 'ready';
  resultsEl.innerHTML = '';

  places.forEach(place => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'modal-result-item';
    const addrText = getAddrText(place);
    const metaHTML = renderMetaChips(place);
    const photoHTML = renderPhotoBanner(place);
    item.innerHTML = `
      ${photoHTML}
      <div class="modal-result-name">${escapeHTML(place.name)}</div>
      <div class="modal-result-addr">${escapeHTML(addrText)}</div>
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
