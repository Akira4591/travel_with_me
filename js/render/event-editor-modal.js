// js/render/event-editor-modal.js
// 编辑行程事件：标题 + 手动校准地点，或通过 POI 搜索替换为新地点
//
// 这个模块只负责 UI 和表单收集，不直接读写 state。

import { escapeHTML } from '../utils.js';
import {
  bindIconPicker, getIconIdForEvent, inferIconId, renderIconPickerHTML
} from './icons.js';

let modalEl = null;
let currentHandlers = null;

export function openEventEditorModal({ event, location, handlers }) {
  closeEventEditorModal();
  currentHandlers = handlers;
  modalEl = createModal(event, location);
  document.body.appendChild(modalEl);
  requestAnimationFrame(() => {
    modalEl?.querySelector('.editor-title-input')?.focus();
  });
}

export function closeEventEditorModal() {
  if (!modalEl) return;
  modalEl.remove();
  modalEl = null;
  currentHandlers = null;
}

function createModal(event, location) {
  const root = document.createElement('div');
  root.className = 'modal-overlay';
  root.innerHTML = `
    <div class="modal editor-modal" role="dialog" aria-modal="true" aria-label="编辑日程">
      <div class="modal-header">
        <h2>编辑日程</h2>
        <button type="button" class="modal-close" aria-label="关闭">×</button>
      </div>
      <form class="modal-body editor-form">
        <div class="modal-form-row">
          <label>标题</label>
          <input type="text" class="editor-title-input" placeholder="在这里做什么" required value="${escapeHTML(event.title || '')}" />
        </div>
        <div class="modal-form-row icon-form-row">
          <label>图标</label>
          ${renderIconPickerHTML(getIconIdForEvent(event, location))}
        </div>

        <div class="editor-section-title">更新地点信息</div>
        <div class="editor-search-panel">
          <div class="editor-search-copy">请输入新的地点</div>
          <div class="editor-search-box">
            <svg class="editor-search-icon" width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"></path>
            </svg>
            <input type="text" class="editor-search-input" placeholder="搜索新地点" />
            <button type="button" class="editor-search-btn">搜索</button>
          </div>
        </div>
        <div class="modal-results editor-results" data-state="idle"></div>

        <div class="editor-location-card">
          <div>
            <div class="editor-location-label">当前地点</div>
            <div class="editor-location-name">${escapeHTML(location.name || '')}</div>
            <div class="editor-location-addr">${escapeHTML(location.addr || location.query || '地址未提供')}</div>
          </div>
          <div class="editor-location-coords">
            <span>经度 ${escapeHTML(location.lnglat?.[0] || '')}</span>
            <span>纬度 ${escapeHTML(location.lnglat?.[1] || '')}</span>
          </div>
        </div>

        <div class="modal-actions">
          <button type="button" class="modal-cancel">取消</button>
          <button type="submit" class="modal-submit">保存</button>
        </div>
      </form>
    </div>
  `;

  bindEvents(root);
  return root;
}

function bindEvents(root) {
  const form = root.querySelector('.editor-form');
  const searchInput = root.querySelector('.editor-search-input');
  const resultsEl = root.querySelector('.editor-results');
  const locationCard = root.querySelector('.editor-location-card');
  const iconPicker = bindIconPicker(root, root.querySelector('.icon-picker-btn.active')?.dataset.iconId || 'pin');
  let selectedPlace = null;
  let selectedLocation = readLocationFromCard(locationCard);

  const doSearch = async () => {
    const keyword = searchInput.value.trim();
    if (!keyword || !currentHandlers?.onSearch) return;
    selectedPlace = null;
    setResultsState(resultsEl, 'loading', '<div class="modal-hint">搜索中...</div>');

    try {
      const places = await currentHandlers.onSearch(keyword);
      if (!places || !places.length) {
        setResultsState(resultsEl, 'empty', '<div class="modal-hint">没有找到结果，换个关键词试试</div>');
        return;
      }
      renderResults(resultsEl, places, (place) => {
        selectedPlace = place;
        selectedLocation = {
          name: place.name || '',
          query: place.name || '',
          addr: place.addr || place.city || '',
          lnglat: place.lnglat || []
        };
        iconPicker.setValue(inferIconId(`${place.name || ''} ${place.addr || ''}`));
        renderLocationCard(locationCard, selectedLocation, '已选择地点');
      });
    } catch (err) {
      console.error('搜索地点失败：', err);
      setResultsState(resultsEl, 'error', '<div class="modal-hint">搜索失败，请重试</div>');
    }
  };

  root.querySelector('.editor-search-btn').addEventListener('click', doSearch);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      doSearch();
    }
  });

  root.querySelector('.modal-close').addEventListener('click', closeEventEditorModal);
  root.querySelector('.modal-cancel').addEventListener('click', closeEventEditorModal);
  root.addEventListener('click', (e) => {
    if (e.target === root) closeEventEditorModal();
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeEventEditorModal();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!currentHandlers?.onConfirm) return;

    const lng = Number(selectedLocation.lnglat?.[0]);
    const lat = Number(selectedLocation.lnglat?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;

    currentHandlers.onConfirm({
      event: {
        title: root.querySelector('.editor-title-input').value.trim(),
        icon: iconPicker.getValue()
      },
      location: {
        name: selectedLocation.name,
        query: selectedLocation.query || selectedLocation.name,
        addr: selectedLocation.addr,
        lnglat: [lng, lat]
      },
      selectedPlace
    });
    closeEventEditorModal();
  });
}

function readLocationFromCard(card) {
  return {
    name: card.querySelector('.editor-location-name')?.textContent.trim() || '',
    query: card.querySelector('.editor-location-name')?.textContent.trim() || '',
    addr: card.querySelector('.editor-location-addr')?.textContent.trim() || '',
    lnglat: Array.from(card.querySelectorAll('.editor-location-coords span')).map(item => {
      const match = item.textContent.match(/(-?\d+(?:\.\d+)?)/);
      return match ? Number(match[1]) : '';
    })
  };
}

function renderLocationCard(card, location, label) {
  card.innerHTML = `
    <div>
      <div class="editor-location-label">${escapeHTML(label)}</div>
      <div class="editor-location-name">${escapeHTML(location.name || '')}</div>
      <div class="editor-location-addr">${escapeHTML(location.addr || location.query || '地址未提供')}</div>
    </div>
    <div class="editor-location-coords">
      <span>经度 ${escapeHTML(location.lnglat?.[0] || '')}</span>
      <span>纬度 ${escapeHTML(location.lnglat?.[1] || '')}</span>
    </div>
  `;
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
    item.innerHTML = `
      <div class="modal-result-name">${escapeHTML(place.name)}</div>
      <div class="modal-result-addr">${escapeHTML(place.addr || place.city || '地址未提供')}</div>
    `;
    item.addEventListener('click', () => {
      resultsEl.querySelectorAll('.modal-result-item').forEach(el => el.classList.remove('selected'));
      item.classList.add('selected');
      onPick(place);
    });
    resultsEl.appendChild(item);
  });
}
