// js/render/workspace-tabs.js
// 顶部活页本行程标签：只负责渲染 workspace 切换 UI 和收集交互。

import { getWorkspace, MAX_TRIPS } from '../state.js';
import { escapeHTML } from '../utils.js';

let menuEl = null;

export function renderWorkspaceTabs(handlers = {}) {
  const root = document.getElementById('workspace-tabs');
  if (!root) return;

  const workspace = getWorkspace();
  root.innerHTML = `
    <div class="workspace-tabs-track" role="tablist" aria-label="旅行路线">
      ${workspace.trips.map((trip, index) => renderTripTab(trip, index, trip.id === workspace.activeTripId)).join('')}
      ${workspace.trips.length < MAX_TRIPS ? renderCreateTab(workspace.trips.length) : ''}
    </div>
  `;

  root.querySelectorAll('[data-trip-id]').forEach(button => {
    button.addEventListener('click', () => handlers.onSelectTrip?.(button.dataset.tripId));
  });

  root.querySelector('[data-create-trip]')?.addEventListener('click', () => {
    handlers.onCreateTrip?.();
  });

  root.querySelector('[data-trip-menu]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const button = e.currentTarget;
    const tripId = button.dataset.tripMenu;
    menuEl?.remove();
    menuEl = createMenu(button, tripId, handlers);
    document.body.appendChild(menuEl);
  });
}

export function closeWorkspaceMenu() {
  menuEl?.remove();
  menuEl = null;
}

function renderTripTab(trip, index, active) {
  const slot = index + 1;
  return `
    <div class="workspace-tab-wrap ${active ? 'active' : ''}" style="--slot: ${slot};">
      <div class="workspace-tab ${active ? 'active' : ''}" role="tab" aria-selected="${active}" title="${escapeHTML(trip.title)}">
        <button type="button" class="workspace-tab-title-btn" data-trip-id="${escapeHTML(trip.id)}">
          <span class="workspace-tab-title">${escapeHTML(trip.title || '未命名行程')}</span>
        </button>
        ${active ? `
        <button type="button" class="workspace-tab-menu-btn" data-trip-menu="${escapeHTML(trip.id)}" aria-label="行程菜单" title="行程菜单">⋯</button>
        ` : ''}
      </div>
    </div>
  `;
}

function renderCreateTab(index) {
  return `
    <button type="button" class="workspace-tab workspace-tab-add" style="--slot: ${index + 1};" data-create-trip aria-label="新建行程" title="新建行程">+</button>
  `;
}

function createMenu(anchor, tripId, handlers) {
  const rect = anchor.getBoundingClientRect();
  const menu = document.createElement('div');
  menu.className = 'workspace-tab-menu';
  menu.style.top = `${rect.bottom + 6}px`;
  menu.style.left = `${Math.max(8, rect.right - 150)}px`;
  menu.innerHTML = `
    <button type="button" data-action="rename">修改名称</button>
    <button type="button" class="danger" data-action="delete">删除行程</button>
  `;

  menu.addEventListener('click', (e) => {
    const action = e.target.closest('button')?.dataset.action;
    if (!action) return;
    closeWorkspaceMenu();
    if (action === 'rename') handlers.onRenameTrip?.(tripId);
    if (action === 'delete') handlers.onDeleteTrip?.(tripId);
  });

  setTimeout(() => {
    const close = (e) => {
      if (!menu.contains(e.target) && e.target !== anchor) {
        closeWorkspaceMenu();
        document.removeEventListener('click', close);
      }
    };
    document.addEventListener('click', close);
  }, 0);

  return menu;
}
