// js/render/event-editor-modal.js
// 编辑行程事件：标题 + 手动校准地点，或通过 POI 搜索替换为新地点
//
// 这个模块只负责 UI 和表单收集，不直接读写 state。

import { escapeHTML } from '../utils.js';
import {
  bindIconPicker, getIconIdForEvent, inferIconId, renderIconPickerHTML
} from './icons.js';
import { TIME_SLOT_OPTIONS, normalizeTimeSlot } from '../time-slots.js';

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
        <div class="modal-form-row time-form-row">
          <label>时间</label>
          ${renderTimeSlotPickerHTML(event.timeSlot)}
        </div>

        <div class="editor-section-title">更新地点信息</div>
        <div class="editor-location-card">
          ${renderLocationCardHTML(location, '当前地点')}
        </div>

        <div class="editor-search-panel" hidden>
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

        <div class="modal-form-row note-form-row">
          <label>备注</label>
          <textarea class="editor-note-input" placeholder="请输入备注信息，例如预约时间、注意事项、同行人安排">${escapeHTML(event.note || '')}</textarea>
        </div>

        <div class="modal-actions">
          <button type="button" class="modal-cancel">取消</button>
          <button type="submit" class="modal-submit">保存</button>
        </div>
      </form>
    </div>
  `;

  bindEvents(root, location);
  return root;
}

function bindEvents(root, initialLocation) {
  const form = root.querySelector('.editor-form');
  const searchInput = root.querySelector('.editor-search-input');
  const resultsEl = root.querySelector('.editor-results');
  const locationCard = root.querySelector('.editor-location-card');
  const iconPicker = bindIconPicker(root, root.querySelector('.icon-picker-btn.active')?.dataset.iconId || 'pin');
  const timeSlotPicker = bindTimeSlotPicker(root);
  let selectedPlace = null;
  let selectedLocation = {
    name: initialLocation.name || '',
    query: initialLocation.query || initialLocation.name || '',
    addr: initialLocation.addr || '',
    lnglat: initialLocation.lnglat || []
  };
  let cardLabel = '当前地点';

  const renderCard = (status = 'static') => {
    locationCard.innerHTML = renderLocationCardHTML(selectedLocation, cardLabel, status);
  };

  // 已有地点常常只存了名称（addr === name），这里按需异步逆地理回填详细地址。
  // 注意 modal 关闭后 resultsEl 已不在 DOM 树里，所有异步回调要先确认 modal 还活着。
  const ensureAddressForCurrent = async () => {
    if (!hasPoorAddress(selectedLocation) || !currentHandlers?.onResolveAddress) return;
    if (!Array.isArray(selectedLocation.lnglat) || selectedLocation.lnglat.length < 2) return;

    renderCard('loading');
    let info;
    try {
      info = await currentHandlers.onResolveAddress(selectedLocation.lnglat);
    } catch (err) {
      console.warn('逆地理编码失败：', err);
    }
    if (!modalEl) return; // 弹窗已关闭

    const composed = composeAddress(info, selectedLocation.name);
    if (composed) selectedLocation.addr = composed;
    renderCard('static');
  };

  const doSearch = async () => {
    const keyword = searchInput.value.trim();
    if (!keyword || !currentHandlers?.onSearch) return;
    selectedPlace = null;
    setResultsState(resultsEl, 'loading', '<div class="modal-hint">搜索中...</div>');

    try {
      const places = await currentHandlers.onSearch(keyword);
      if (!modalEl) return;
      if (!places || !places.length) {
        setResultsState(resultsEl, 'empty', '<div class="modal-hint">未找到相关地点</div>');
        return;
      }
      renderResults(resultsEl, places, (place) => {
        selectedPlace = place;
        const fallbackAddr = composeAddress(
          { formatted: place.addr, province: place.province, city: place.city, district: place.district },
          place.name
        );
        selectedLocation = {
          name: place.name || '',
          query: place.name || '',
          addr: fallbackAddr,
          lnglat: place.lnglat || []
        };
        iconPicker.setValue(inferIconId(`${place.name || ''} ${fallbackAddr}`));
        cardLabel = '已选择地点';
        renderCard('static');
        // 选完后收起结果，避免遮挡备注栏
        setResultsState(resultsEl, 'idle', '');
      });
    } catch (err) {
      console.error('搜索地点失败：', err);
      setResultsState(resultsEl, 'error', '<div class="modal-hint">搜索失败，请重试</div>');
    }
  };

  ensureAddressForCurrent();

  root.addEventListener('click', (e) => {
    if (!e.target.closest('.editor-location-change-btn')) return;
    const panel = root.querySelector('.editor-search-panel');
    panel.hidden = false;
    searchInput.focus();
  });

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
        icon: iconPicker.getValue(),
        timeSlot: timeSlotPicker.getValue(),
        note: root.querySelector('.editor-note-input').value.trim()
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

function renderLocationCardHTML(location, label, status = 'static') {
  return `
    <div>
      <div class="editor-location-label">${escapeHTML(label)}</div>
      <div class="editor-location-name">${escapeHTML(location.name || '')}</div>
      <div class="editor-location-addr">${escapeHTML(getLocationAddressText(location, status))}</div>
    </div>
    <button type="button" class="editor-location-change-btn">更换地点</button>
  `;
}

function getLocationAddressText(location, status) {
  if (status === 'loading') return '正在获取详细地址...';
  const addr = String(location.addr || '').trim();
  const name = String(location.name || '').trim();
  if (addr && addr !== name) return addr;
  return '暂无详细地址';
}

function hasPoorAddress(location) {
  const addr = String(location.addr || '').trim();
  const name = String(location.name || '').trim();
  return !addr || addr === name;
}

// 把 POI 或逆地理结果合成一个用于显示的"详细地址"。
// 若 formatted 已包含 name（例如"北京市丰台区北京南站(公交站)"），保留 formatted；
// 否则用 省+市+区 兜底。和 name 完全相等的情况会被 getLocationAddressText 兜成"暂无"。
function composeAddress(info, name) {
  if (!info) return '';
  const formatted = String(info.formatted || '').trim();
  if (formatted) return formatted;
  const composed = [info.province, info.city, info.district]
    .map(part => String(part || '').trim())
    .filter(Boolean)
    .join('');
  if (composed && composed !== String(name || '').trim()) return composed;
  return '';
}

function renderTimeSlotPickerHTML(value) {
  const selected = normalizeTimeSlot(value);
  return `
    <div class="time-slot-picker" role="radiogroup" aria-label="选择时间">
      ${TIME_SLOT_OPTIONS.map(option => `
        <button type="button" class="time-slot-btn ${option.id === selected ? 'active' : ''}" data-time-slot="${option.id}" role="radio" aria-checked="${option.id === selected}">
          ${escapeHTML(option.label)}
        </button>
      `).join('')}
    </div>
  `;
}

function bindTimeSlotPicker(root) {
  let value = normalizeTimeSlot(root.querySelector('.time-slot-btn.active')?.dataset.timeSlot || '');
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
    const addrText = composeAddress(
      { formatted: place.addr, province: place.province, city: place.city, district: place.district },
      place.name
    ) || '地址未提供';
    item.innerHTML = `
      <div class="modal-result-name">${escapeHTML(place.name)}</div>
      <div class="modal-result-addr">${escapeHTML(addrText)}</div>
    `;
    item.addEventListener('click', () => {
      resultsEl.querySelectorAll('.modal-result-item').forEach(el => el.classList.remove('selected'));
      item.classList.add('selected');
      onPick(place);
    });
    resultsEl.appendChild(item);
  });
}
