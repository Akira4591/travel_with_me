// js/render/date-picker.js
// 自绘日期选择器：内部值保持 ISO，展示层避免使用浏览器原生 date 控件。

import { escapeHTML, isISODate, todayISO } from '../utils.js';

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

export function createDatePickerHTML(value = todayISO(), options = {}) {
  const safeValue = normalizeISO(value);
  const disabledDates = normalizeDisabledDates(options.disabledDates, safeValue);
  return `
    <div class="date-picker" data-date-picker data-disabled-dates="${escapeHTML(disabledDates.join(','))}">
      <input type="hidden" class="day-date-input" required value="${escapeHTML(safeValue)}" />
      <button type="button" class="date-picker-trigger" aria-haspopup="dialog" aria-expanded="false">
        <span class="date-picker-value">${escapeHTML(formatDateFull(safeValue))}</span>
        <span class="date-picker-caret" aria-hidden="true">⌄</span>
      </button>
      <div class="date-picker-popover" role="dialog" aria-label="选择日期" hidden></div>
    </div>
  `;
}

export function bindDatePicker(root) {
  const picker = root.querySelector('[data-date-picker]');
  if (!picker) return;

  const input = picker.querySelector('.day-date-input');
  const trigger = picker.querySelector('.date-picker-trigger');
  const valueEl = picker.querySelector('.date-picker-value');
  const popover = picker.querySelector('.date-picker-popover');
  const modal = picker.closest('.day-editor-modal');
  const disabledDates = new Set(
    String(picker.dataset.disabledDates || '').split(',').filter(isISODate)
  );

  let selectedISO = normalizeISO(input.value);
  let viewDate = parseISO(selectedISO);

  syncValue();
  renderCalendar();

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    popover.hidden ? open() : close();
  });

  popover.addEventListener('click', (e) => {
    e.stopPropagation();
    const actionBtn = e.target.closest('[data-picker-action]');
    if (actionBtn) {
      if (actionBtn.dataset.pickerAction === 'prev') viewDate = addMonths(viewDate, -1);
      if (actionBtn.dataset.pickerAction === 'next') viewDate = addMonths(viewDate, 1);
      if (actionBtn.dataset.pickerAction === 'today' && !disabledDates.has(todayISO())) {
        viewDate = parseISO(todayISO());
        selectedISO = todayISO();
      }
      syncValue();
      renderCalendar();
      return;
    }

    const dayBtn = e.target.closest('[data-date]');
    if (!dayBtn || dayBtn.disabled) return;
    selectedISO = dayBtn.dataset.date;
    viewDate = parseISO(selectedISO);
    syncValue();
    renderCalendar();
    close();
  });

  root.addEventListener('click', (e) => {
    if (!picker.contains(e.target)) close();
  });

  function open() {
    popover.hidden = false;
    modal?.classList.add('date-picker-expanded');
    trigger.setAttribute('aria-expanded', 'true');
  }

  function close() {
    popover.hidden = true;
    modal?.classList.remove('date-picker-expanded');
    trigger.setAttribute('aria-expanded', 'false');
  }

  function syncValue() {
    input.value = selectedISO;
    valueEl.textContent = formatDateFull(selectedISO);
  }

  function renderCalendar() {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const days = buildCalendarDays(year, month);
    popover.innerHTML = `
      <div class="date-picker-head">
        <button type="button" class="date-picker-nav" data-picker-action="prev" aria-label="上个月">‹</button>
        <div class="date-picker-month">${year}年${month + 1}月</div>
        <button type="button" class="date-picker-nav" data-picker-action="next" aria-label="下个月">›</button>
      </div>
      <div class="date-picker-weekdays">
        ${WEEKDAYS.map(day => `<span>${day}</span>`).join('')}
      </div>
      <div class="date-picker-grid">
        ${days.map(day => renderDayButton(day, month, selectedISO, disabledDates)).join('')}
      </div>
      <div class="date-picker-footer">
        <button type="button" class="date-picker-today" data-picker-action="today" ${disabledDates.has(todayISO()) ? 'disabled' : ''}>今天</button>
      </div>
    `;
  }
}

function renderDayButton(day, viewMonth, selectedISO, disabledDates) {
  const iso = toISO(day);
  const disabled = disabledDates.has(iso);
  const classes = [
    'date-picker-day',
    day.getMonth() !== viewMonth ? 'muted' : '',
    iso === selectedISO ? 'selected' : '',
    iso === todayISO() ? 'today' : '',
    disabled ? 'disabled' : ''
  ].filter(Boolean).join(' ');

  return `
    <button type="button" class="${classes}" data-date="${iso}" aria-label="${formatDateFull(iso)}${disabled ? '，已有行程' : ''}" ${disabled ? 'disabled title="这一天已经有行程"' : ''}>
      ${day.getDate()}
    </button>
  `;
}

function buildCalendarDays(year, month) {
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - startOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function normalizeISO(value) {
  return isISODate(value) ? value : todayISO();
}

function normalizeDisabledDates(values, selectedISO) {
  return Array.from(new Set(
    (values || []).filter(date => isISODate(date) && date !== selectedISO)
  ));
}

function parseISO(iso) {
  const [year, month, day] = normalizeISO(iso).split('-').map(Number);
  return new Date(year, month - 1, day);
}

function addMonths(date, diff) {
  return new Date(date.getFullYear(), date.getMonth() + diff, 1);
}

function toISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateFull(iso) {
  const [year, month, day] = normalizeISO(iso).split('-').map(Number);
  return `${year}年${month}月${day}日`;
}
