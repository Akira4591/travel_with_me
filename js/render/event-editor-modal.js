// js/render/event-editor-modal.js
// 编辑行程事件：时间/标题/图标 + 手动校准地点，或通过 POI 搜索替换为新地点
//
// 这个模块只负责 UI 和表单收集，不直接读写 state。

import { escapeHTML } from '../utils.js';

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
          <label>时间</label>
          <input type="text" class="editor-time-input" placeholder="早上 / 下午 / 19:30" value="${escapeHTML(event.time || '')}" />
        </div>
        <div class="modal-form-row">
          <label>标题</label>
          <input type="text" class="editor-title-input" placeholder="在这里做什么" required value="${escapeHTML(event.title || '')}" />
        </div>
        <div class="modal-form-row">
          <label>图标</label>
          <input type="text" class="editor-icon-input" placeholder="📍" maxlength="4" value="${escapeHTML(event.icon || '📍')}" />
        </div>

        <div class="editor-section-title">地点</div>
        <div class="modal-search-row">
          <input type="text" class="editor-search-input" placeholder="搜索新地点" />
          <button type="button" class="editor-search-btn">搜索</button>
        </div>
        <div class="modal-results editor-results" data-state="idle"></div>

        <div class="modal-form-row">
          <label>名称</label>
          <input type="text" class="editor-location-name" required value="${escapeHTML(location.name || '')}" />
        </div>
        <div class="modal-form-row">
          <label>地址</label>
          <input type="text" class="editor-location-addr" value="${escapeHTML(location.addr || location.query || '')}" />
        </div>
        <div class="editor-coords-row">
          <div class="modal-form-row">
            <label>经度</label>
            <input type="number" step="0.000001" class="editor-location-lng" required value="${escapeHTML(location.lnglat?.[0] || '')}" />
          </div>
          <div class="modal-form-row">
            <label>纬度</label>
            <input type="number" step="0.000001" class="editor-location-lat" required value="${escapeHTML(location.lnglat?.[1] || '')}" />
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
  const nameInput = root.querySelector('.editor-location-name');
  const addrInput = root.querySelector('.editor-location-addr');
  const lngInput = root.querySelector('.editor-location-lng');
  const latInput = root.querySelector('.editor-location-lat');
  let selectedPlace = null;

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
        nameInput.value = place.name || '';
        addrInput.value = place.addr || place.city || '';
        lngInput.value = place.lnglat?.[0] || '';
        latInput.value = place.lnglat?.[1] || '';
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

  [nameInput, addrInput, lngInput, latInput].forEach(input => {
    input.addEventListener('input', () => { selectedPlace = null; });
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

    const lng = Number(lngInput.value);
    const lat = Number(latInput.value);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;

    currentHandlers.onConfirm({
      event: {
        time: root.querySelector('.editor-time-input').value.trim(),
        title: root.querySelector('.editor-title-input').value.trim(),
        icon: root.querySelector('.editor-icon-input').value.trim() || '📍'
      },
      location: {
        name: nameInput.value.trim(),
        query: nameInput.value.trim(),
        addr: addrInput.value.trim(),
        lnglat: [lng, lat]
      },
      selectedPlace
    });
    closeEventEditorModal();
  });
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
