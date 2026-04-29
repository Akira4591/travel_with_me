// js/render/search-modal.js
// 搜索弹窗：先调 PlaceSearch 得到候选 POI，用户选一个 + 填时间标题，最后回调
//
// 这个模块只管"画 UI + 收集表单数据"，不直接读 state、不直接动 trip
// 调用方传 handlers：
//   - onSearch(keyword) → Promise<places[]>
//   - onConfirm({ place, event }) → 调用方负责真正写入 trip
//
// 设计成单例：同时只能开一个弹窗，重复 open 会先关掉旧的

import { escapeHTML } from '../utils.js';

let modalEl = null;
let currentHandlers = null;

export function openSearchModal(handlers) {
  closeSearchModal();
  currentHandlers = handlers;
  modalEl = createModal();
  document.body.appendChild(modalEl);
  // 推迟到下一帧 focus，避免 focus 时 DOM 还没接到事件循环
  requestAnimationFrame(() => {
    modalEl?.querySelector('.modal-search-input')?.focus();
  });
}

export function closeSearchModal() {
  if (!modalEl) return;
  modalEl.remove();
  modalEl = null;
  currentHandlers = null;
}

// ─── 内部 ──────────────────────────────────────────────

function createModal() {
  const root = document.createElement('div');
  root.className = 'modal-overlay';
  root.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="搜索并添加地点">
      <div class="modal-header">
        <h2>搜索并添加地点</h2>
        <button type="button" class="modal-close" aria-label="关闭">×</button>
      </div>
      <div class="modal-body">
        <div class="modal-search-row">
          <input type="text" class="modal-search-input" placeholder="例如：颐和园、王府井小吃街" />
          <button type="button" class="modal-search-btn">搜索</button>
        </div>
        <div class="modal-results" data-state="idle">
          <div class="modal-hint">输入关键词后点击"搜索"，从下方结果中选一个地点</div>
        </div>
        <form class="modal-event-form" hidden>
          <div class="modal-event-summary"></div>
          <div class="modal-form-row">
            <label>时间</label>
            <input type="text" class="modal-event-time" placeholder="早上 / 下午 / 晚上 / 19:30" />
          </div>
          <div class="modal-form-row">
            <label>标题</label>
            <input type="text" class="modal-event-title" placeholder="在这里做什么" required />
          </div>
          <div class="modal-form-row">
            <label>图标</label>
            <input type="text" class="modal-event-icon" placeholder="📍" maxlength="4" />
          </div>
          <div class="modal-actions">
            <button type="button" class="modal-cancel">取消</button>
            <button type="submit" class="modal-submit">添加到行程</button>
          </div>
        </form>
      </div>
    </div>
  `;

  bindEvents(root);
  return root;
}

function bindEvents(root) {
  const input = root.querySelector('.modal-search-input');
  const searchBtn = root.querySelector('.modal-search-btn');
  const resultsEl = root.querySelector('.modal-results');
  const form = root.querySelector('.modal-event-form');
  const summary = root.querySelector('.modal-event-summary');
  const titleInput = form.querySelector('.modal-event-title');

  let selected = null;

  const doSearch = async () => {
    const keyword = input.value.trim();
    if (!keyword) return;
    if (!currentHandlers?.onSearch) return;

    selected = null;
    form.hidden = true;
    setResultsState(resultsEl, 'loading', '<div class="modal-hint">搜索中...</div>');

    try {
      const places = await currentHandlers.onSearch(keyword);
      if (!places || !places.length) {
        setResultsState(resultsEl, 'empty', '<div class="modal-hint">没有找到结果，换个关键词试试</div>');
        return;
      }
      renderResults(resultsEl, places, (place) => {
        selected = place;
        summary.innerHTML = `
          <div class="modal-summary-name">已选：${escapeHTML(place.name)}</div>
          <div class="modal-summary-addr">${escapeHTML(place.addr || place.city)}</div>
        `;
        form.hidden = false;
        titleInput.focus();
      });
    } catch (err) {
      console.error('搜索地点失败：', err);
      setResultsState(resultsEl, 'error', '<div class="modal-hint">搜索失败，请重试</div>');
    }
  };

  searchBtn.addEventListener('click', doSearch);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      doSearch();
    }
  });

  root.querySelector('.modal-close').addEventListener('click', closeSearchModal);
  root.querySelector('.modal-cancel').addEventListener('click', closeSearchModal);
  root.addEventListener('click', (e) => {
    if (e.target === root) closeSearchModal();
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSearchModal();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!selected || !currentHandlers?.onConfirm) return;
    const time = form.querySelector('.modal-event-time').value.trim();
    const title = form.querySelector('.modal-event-title').value.trim();
    const iconRaw = form.querySelector('.modal-event-icon').value.trim();
    if (!title) return;

    currentHandlers.onConfirm({
      place: selected,
      event: {
        time,
        title,
        icon: iconRaw || '📍'
      }
    });
    closeSearchModal();
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
