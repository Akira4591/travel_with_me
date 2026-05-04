// js/render/sidebar.js
// 侧边栏渲染：tabs + 行程卡 + 路线卡
//
// 这个模块只做"把数据画出来"和"暴露交互回调"两件事：
//   - 渲染：从 state 读 trip 数据，输出 DOM
//   - 回调：用户点了 tab / event / route，会调 main.js 传进来的 handler
// 这样 sidebar 不直接依赖 main.js，main.js 决定点击后做什么

import { AppConfig } from '../config.js';
import {
  getTrip, getLocation, getAppState, getRouteCard
} from '../state.js';
import {
  escapeHTML, formatDistance, formatDuration,
  getTransportLabel
} from '../utils.js';
import { getIconIdForEvent, renderIconSVG } from './icons.js';

// ─── 静态部分（标题副标题） ─────────────────────────────

export function renderHeader() {
  const trip = getTrip();
  document.getElementById('trip-title').textContent = cleanHeaderText(trip.title);
  document.getElementById('trip-subtitle').textContent = cleanHeaderText(trip.subtitle);
}

function cleanHeaderText(value) {
  return String(value || '')
    .replace(/^(🎒|馃帓)\s*/u, '')
    .replace(/\s*(📍|馃搷)\s*$/u, '');
}

// ─── Tabs ─────────────────────────────────────────────

// handlers: { onSelectDay: (dayId) => void }
export function renderTabs(handlers) {
  const tabs = document.getElementById('tabs-container');
  const trip = getTrip();
  tabs.innerHTML = '';

  tabs.appendChild(createTabButton('all', '全部', handlers));
  trip.days.forEach(day => {
    tabs.appendChild(createTabButton(day.id, day.date, handlers));
  });

  const addDayBtn = document.createElement('button');
  addDayBtn.type = 'button';
  addDayBtn.className = 'tab-btn tab-add-day-btn';
  addDayBtn.textContent = '+ 新建一天';
  addDayBtn.addEventListener('click', () => handlers.onAddDay?.());
  tabs.appendChild(addDayBtn);
}

function createTabButton(dayId, label, handlers) {
  const btn = document.createElement('button');
  btn.className = 'tab-btn';
  btn.dataset.dayId = dayId;
  btn.textContent = label;
  btn.addEventListener('click', () => handlers.onSelectDay?.(dayId));
  return btn;
}

export function updateActiveTab(dayId) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.dayId === dayId);
  });
}

export function updateVisibleDayGroups(dayId) {
  const container = document.getElementById('itinerary-container');
  if (container) container.scrollTop = 0;

  document.querySelectorAll('.day-group').forEach(group => {
    group.style.display =
      dayId === 'all' || group.dataset.dayId === dayId ? 'block' : 'none';
  });
  document.querySelectorAll('.route-card').forEach(card => {
    card.hidden = dayId === 'all';
  });
  document.querySelectorAll('.day-add-btn').forEach(btn => {
    btn.hidden = dayId === 'all';
  });
}

// ─── 行程主体 ────────────────────────────────────────────

// handlers: { onEventClick, onRouteClick }
export function renderItinerary(handlers) {
  const container = document.getElementById('itinerary-container');
  const state = getAppState();
  const trip = getTrip();
  container.innerHTML = '';
  state.routeCards.clear();

  trip.days.forEach(day => {
    const dayGroup = document.createElement('section');
    dayGroup.className = 'day-group';
    dayGroup.dataset.dayId = day.id;
    dayGroup.innerHTML = `
      <div class="day-title">
        <span>${escapeHTML(day.date)} · ${escapeHTML(day.title)}</span>
        <div class="day-title-actions">
          <button type="button" class="day-edit-btn" title="编辑日期">···</button>
          <button type="button" class="day-add-btn">+ 添加地点</button>
        </div>
      </div>
      <div class="event-container"></div>
    `;

    dayGroup.querySelector('.day-edit-btn').addEventListener('click', () => {
      handlers.onEditDay?.(day.id);
    });

    dayGroup.querySelector('.day-add-btn').addEventListener('click', () => {
      handlers.onAddLocation?.(day.id);
    });

    const eventsContainer = dayGroup.querySelector('.event-container');
    let routeOrder = 0;

    day.events.forEach((event, eventIndex) => {
      eventsContainer.appendChild(createEventCard(day, event, eventIndex, handlers));

      const nextEvent = day.events[eventIndex + 1];
      if (shouldCreateRouteCard(event, nextEvent)) {
        const segment = buildRouteSegment(day, event, nextEvent, eventIndex, routeOrder);
        eventsContainer.appendChild(createRouteCard(segment, handlers));
        routeOrder += 1;
      }
    });

    container.appendChild(dayGroup);
  });
}

// ─── Event 卡 ──────────────────────────────────────────

function createEventCard(day, event, eventIndex, handlers) {
  const loc = getLocation(event.locationId);
  const card = document.createElement('article');
  card.className = 'card';
  card.dataset.locationId = event.locationId;
  card.dataset.eventId = event.id;
  card.dataset.dayId = day.id;
  const iconHTML = renderIconSVG(getIconIdForEvent(event, loc));
  card.innerHTML = `
    <button type="button" class="drag-handle" draggable="true" aria-label="拖动排序" title="拖动排序">⋮⋮</button>
    <div class="card-icon" aria-hidden="true">${iconHTML}</div>
    <div class="card-content">
      <div class="card-header">
        <span class="event-desc">${escapeHTML(event.title || '')}</span>
      </div>
      <div class="location-info">
        <svg class="location-icon" width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
        </svg>
        <span>${escapeHTML(loc.name)}</span>
      </div>
      <div class="card-actions">
        <button type="button" class="event-action-btn" data-action="edit" title="编辑">···</button>
        <button type="button" class="event-action-btn" data-action="add-after" title="后面添加">+</button>
        <button type="button" class="event-action-btn" data-action="move-up" title="上移" ${eventIndex === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" class="event-action-btn" data-action="move-down" title="下移" ${eventIndex === day.events.length - 1 ? 'disabled' : ''}>↓</button>
        <button type="button" class="event-action-btn danger" data-action="delete" title="删除">−</button>
      </div>
    </div>
  `;

  card.addEventListener('click', () => {
    document.querySelectorAll('.card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    handlers.onEventClick?.(event);
  });

  bindDragEvents(card, day, event, handlers);

  card.querySelector('.card-actions').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn || btn.disabled) return;
    e.stopPropagation();

    const action = btn.dataset.action;
    if (action === 'edit') handlers.onEditEvent?.(day.id, event);
    if (action === 'add-after') handlers.onAddAfterEvent?.(day.id, event.id);
    if (action === 'move-up') handlers.onMoveEvent?.(day.id, event.id, 'up');
    if (action === 'move-down') handlers.onMoveEvent?.(day.id, event.id, 'down');
    if (action === 'delete') handlers.onDeleteEvent?.(day.id, event);
  });

  return card;
}

function bindDragEvents(card, day, event, handlers) {
  const handle = card.querySelector('.drag-handle');

  handle.addEventListener('click', (e) => e.stopPropagation());
  handle.addEventListener('dragstart', (e) => {
    e.stopPropagation();
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({
      dayId: day.id,
      eventId: event.id
    }));
  });

  handle.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    document.querySelectorAll('.card.drag-over').forEach(el => el.classList.remove('drag-over'));
  });

  card.addEventListener('dragover', (e) => {
    e.preventDefault();
    card.classList.add('drag-over');
    e.dataTransfer.dropEffect = 'move';
  });

  card.addEventListener('dragleave', () => {
    card.classList.remove('drag-over');
  });

  card.addEventListener('drop', (e) => {
    const payload = readDragPayload(e);
    if (!payload || payload.dayId !== day.id || payload.eventId === event.id) return;
    e.preventDefault();
    e.stopPropagation();
    card.classList.remove('drag-over');
    handlers.onReorderEvent?.(day.id, payload.eventId, event.id);
  });
}

function readDragPayload(e) {
  try {
    const raw = e.dataTransfer.getData('text/plain');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ─── Route 卡 ──────────────────────────────────────────

function createRouteCard(segment, handlers) {
  const state = getAppState();
  const card = document.createElement('article');
  card.className = 'route-card idle';
  card.dataset.routeId = segment.id;
  card.style.setProperty('--route-color', segment.color);
  card.innerHTML = renderRouteIdleHTML(segment);
  card.addEventListener('click', () => handlers.onRouteClick?.(segment));
  state.routeCards.set(segment.id, card);
  return card;
}

function renderRouteIdleHTML(segment) {
  return `
    <div class="route-card-main">
      <div class="route-body">
        <div class="route-title">
          <span class="route-mode">${escapeHTML(getTransportLabel(segment.mode))}</span>
        </div>
        <div class="route-placeholder">选择当天后加载距离、用时和路线。</div>
      </div>
    </div>
  `;
}

// ─── Route 卡的状态切换 ─────────────────────────────────

export function setRouteCardLoading(segment) {
  const card = getRouteCard(segment.id);
  if (!card) return;
  card.className = 'route-card loading';
  card.style.setProperty('--route-color', segment.color);
  card.innerHTML = `
    <div class="route-card-main">
      <div class="route-body">
        <div class="route-title">
          <span class="route-mode">${escapeHTML(getTransportLabel(segment.mode))}</span>
        </div>
        <div class="route-placeholder">正在规划路线...</div>
      </div>
    </div>
  `;
}

export function updateRouteCardOk(segment, detail) {
  renderRouteCardResult(segment, detail, 'ok');
}

export function updateRouteCardEstimated(segment, detail) {
  renderRouteCardResult(segment, detail, 'estimated');
}

export function updateRouteCardError(segment, message) {
  const card = getRouteCard(segment.id);
  if (!card) return;
  card.className = 'route-card error';
  card.style.setProperty('--route-color', segment.color);
  card.innerHTML = `
    <div class="route-card-main">
      <div class="route-body">
        <div class="route-title">
          <span class="route-mode">${escapeHTML(getTransportLabel(segment.mode))}</span>
        </div>
        <div class="route-placeholder">${escapeHTML(message)}</div>
      </div>
    </div>
  `;
}

function renderRouteCardResult(segment, detail, statusClass) {
  const card = getRouteCard(segment.id);
  if (!card) return;
  card.className = `route-card ${statusClass}`;
  card.style.setProperty('--route-color', segment.color);

  const meta = `约 ${formatDistance(detail.distance)} · 预计 ${formatDuration(detail.duration)}`;
  const steps = detail.mode === 'transit' ? detail.steps : [];

  card.innerHTML = `
    <div class="route-card-main">
      <div class="route-body">
        <div class="route-title">
          <span class="route-mode">${escapeHTML(detail.label)}</span>
        </div>
        <div class="route-meta">${meta}</div>
        ${steps.length ? `<ol class="route-steps">${steps.map((step, i) => `
          <li class="route-step"><span class="route-step-index">${i + 1}</span><span>${escapeHTML(step)}</span></li>
        `).join('')}</ol>` : ''}
      </div>
    </div>
  `;
}

export function resetRouteCards() {
  const trip = getTrip();
  trip.days.forEach(day => {
    buildRouteSegments(day).forEach(segment => {
      const card = getRouteCard(segment.id);
      if (!card) return;
      card.className = 'route-card idle';
      card.style.setProperty('--route-color', segment.color);
      card.innerHTML = renderRouteIdleHTML(segment);
    });
  });
}

// ─── Status panel ──────────────────────────────────────

export function setStatus(html) {
  const el = document.getElementById('status-panel');
  if (el) el.innerHTML = html;
}

// ─── Segment 构造（被 sidebar 和 main 都用到） ────────────

export function shouldCreateRouteCard(event, nextEvent) {
  return Boolean(
    event && nextEvent &&
    event.routeToNext &&
    event.locationId && nextEvent.locationId &&
    event.locationId !== nextEvent.locationId
  );
}

export function buildRouteSegments(day) {
  const segments = [];
  let routeOrder = 0;
  day.events.forEach((event, eventIndex) => {
    const next = day.events[eventIndex + 1];
    if (!shouldCreateRouteCard(event, next)) return;
    segments.push(buildRouteSegment(day, event, next, eventIndex, routeOrder));
    routeOrder += 1;
  });
  return segments;
}

function buildRouteSegment(day, event, nextEvent, eventIndex, routeOrder) {
  const fromLoc = getLocation(event.locationId);
  const toLoc = getLocation(nextEvent.locationId);
  const mode = event.routeToNext?.mode || 'driving';
  return {
    id: `${day.id}-route-${eventIndex}`,
    dayId: day.id,
    fromId: event.locationId,
    toId: nextEvent.locationId,
    fromName: fromLoc.name,
    toName: toLoc.name,
    fromLngLat: fromLoc.lnglat,
    toLngLat: toLoc.lnglat,
    mode,
    color: AppConfig.routeColors[routeOrder % AppConfig.routeColors.length]
  };
}
