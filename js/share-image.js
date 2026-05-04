// js/share-image.js
// 生成分享长图（PNG）。版式按 mockup v4：420 逻辑宽，按 SCALE 上采样到高分辨率。
//
// 整体思路：
//   1) 测量阶段：根据每个 event 的标题/地点文本换行，算出每段高度，得到画布总高
//   2) 绘制阶段：按 y 游标自顶向下分块绘制（品牌条 → 标题 → 统计 → 地图 → 各日 → 结尾 → 页脚）
//   3) 图标走 icons.js：把 SVG 路径包成 svg 数据 URL → Image → drawImage 进 canvas
//   4) 地图走真实瓦片（/_AMapTile 同源代理避免 canvas 跨域污染），叠暖色滤镜与降饱和

import { AppConfig } from './config.js';
import { formatDateCN, isISODate } from './utils.js';
import { getIconPaths } from './render/icons.js';

// ─── 度量常数 ─────────────────────────────────────────
// 所有数字以 mockup 的 "logical px" 为基准，最后乘 SCALE 得到画布像素。
const SCALE = 2.5;
const L = (px) => px * SCALE;

const W = L(420);

// 卡片外侧（页边距，给阴影留空间）
const PAGE_PAD_X = L(24);
const PAGE_PAD_TOP = L(36);
const PAGE_PAD_BOTTOM = L(36);

// 卡片内侧
const CARD_RADIUS = L(24);
const CARD_PAD_X = L(22);
const CARD_PAD_TOP = L(28);
const CARD_PAD_BOTTOM = L(22);

const CARD_X = PAGE_PAD_X;
const CARD_W = W - PAGE_PAD_X * 2;
const CONTENT_X = CARD_X + CARD_PAD_X;
const CONTENT_W = CARD_W - CARD_PAD_X * 2;

const MAP_H = L(200);

const COLORS = {
  pageBg: '#E8E2D5',
  cardBg: '#F2EDE4',
  bg2: '#EFE9DE',
  paper: '#FFFFFF',
  paperWarm: '#FBF7EF',
  paperWarm2: '#F6EFE0',
  ink: '#1B1B1B',
  ink2: '#3A3A3A',
  ink3: '#6E6A63',
  ink4: '#9A958C',
  line: '#E6E0D3',
  dash: '#D9D2C2',
  accent: '#E25C3D'
};

const FONT_SC = '"Noto Sans SC", "Microsoft YaHei", sans-serif';
const FONT_LATIN = 'Inter, "Noto Sans SC", sans-serif';
const FONT_MONO = '"JetBrains Mono", Consolas, monospace';

// 品牌 logo（折叠地图样式）— 仅本文件用，不放进 icons.js（那是行程图标语义集合）
const TRAVELER_LOGO_PATHS =
  '<path d="M9 4 3 6v14l6-2"/>' +
  '<path d="M15 6 9 4v14l6 2"/>' +
  '<path d="M21 4l-6 2v14l6-2V4z"/>';

// ─── 入口 ─────────────────────────────────────────────

export async function buildTripShareImage(trip) {
  const orderedDays = [...(trip.days || [])].sort(compareDays);
  const locations = collectTripLocations(trip);
  const totalStops = orderedDays.reduce((sum, day) => sum + (day.events?.length || 0), 0);
  const viewport = getMapViewport(locations, CONTENT_W, MAP_H);

  // 测量
  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d');
  const layout = measureLayout(mctx, trip, orderedDays);

  const totalH = PAGE_PAD_TOP + layout.cardHeight + PAGE_PAD_BOTTOM;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = totalH;
  const ctx = canvas.getContext('2d');

  drawPageBg(ctx, totalH);
  drawCard(ctx, layout.cardHeight);

  let y = PAGE_PAD_TOP + CARD_PAD_TOP;
  y = await drawBrandBar(ctx, y);
  y = drawTitleBlock(ctx, trip, orderedDays, y);
  y = drawStats(ctx, locations.length, orderedDays.length, totalStops, y);
  y = await drawMap(ctx, locations, viewport, y);
  y = drawMapStrip(ctx, locations.length, y);
  y = await drawDays(ctx, trip, orderedDays, y, layout);
  y = drawSummary(ctx, y);
  drawFooter(ctx, y);

  return {
    dataURL: canvas.toDataURL('image/png'),
    filename: `${sanitizeFilename(trip.title || 'trip')}-share.png`
  };
}

export function dataURLToBlob(dataURL) {
  const [meta, data] = dataURL.split(',');
  const mime = meta.match(/data:(.*?);/)?.[1] || 'image/png';
  const binary = atob(data);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}

// ─── 度量 ─────────────────────────────────────────────

function measureLayout(ctx, trip, days) {
  // 卡片内的固定高度（按各 section 分别累加）
  const brand = L(18) + L(14);                          // logo 高 18 + mb 14
  const title = L(26 * 1.2) + L(6) + L(12 * 1.2) + L(14); // h1 + gap + sub + mb 14
  const stats = L(54) + L(16);                          // 统计条 + mb 16
  const map = MAP_H + L(8);                             // 地图 + mb 8
  const mapStrip = L(20) + L(12);                       // strip 高度 + mb 12（再到日块）

  let daysHeight = 0;
  const dayHeights = days.map((day, idx) => {
    const headH = L(24) + L(10);    // badge 高 + mb 10
    const itemHeights = (day.events || []).map(event => measureItemHeight(ctx, trip, event));
    const itemsTotal = itemHeights.reduce((s, h) => s + h, 0) + Math.max(0, itemHeights.length - 1) * L(8);
    const dayH = headH + itemsTotal;
    daysHeight += dayH + (idx > 0 ? L(22) : 0); // 第二天起 mt 22
    return { headH, itemHeights, total: dayH };
  });

  const summary = L(26) + L(110); // mt 26 + 高度
  const footer = L(14) + L(14);   // mt 14 + 行高

  const inner = brand + title + stats + map + mapStrip + daysHeight + summary + footer;
  const cardHeight = CARD_PAD_TOP + inner + CARD_PAD_BOTTOM;

  return { cardHeight, dayHeights };
}

function measureItemHeight(ctx, trip, event) {
  const loc = trip.locations?.[event.locationId] || {};
  const padV = L(10);
  const innerW = CONTENT_W - L(26)        // 时间轴左缩进
                - L(12) * 2               // item 卡左右内边距
                - L(30) - L(10);          // icon 30 + 与文本间隙 10

  const titleLines = wrapText(ctx, event.title || loc.name || '未命名地点', innerW, `600 ${L(13.5)}px ${FONT_SC}`);
  const locText = loc.name || loc.addr || '地点待定';
  const locLines = wrapText(ctx, locText, innerW, `400 ${L(11.5)}px ${FONT_SC}`).slice(0, 2);

  const titleH = titleLines.length * L(13.5 * 1.3);
  const gap = L(4);
  const locH = locLines.length * L(11.5 * 1.4);
  const contentH = titleH + gap + locH;

  // icon-row 是 flex align-items: center，卡高 = max(content, icon=30) + 上下 padding
  return Math.max(contentH, L(30)) + padV * 2;
}

// ─── 背景与卡片 ───────────────────────────────────────

function drawPageBg(ctx, h) {
  ctx.fillStyle = COLORS.pageBg;
  ctx.fillRect(0, 0, W, h);
}

function drawCard(ctx, cardH) {
  ctx.save();
  ctx.shadowColor = 'rgba(60, 40, 15, 0.22)';
  ctx.shadowBlur = L(30);
  ctx.shadowOffsetY = L(20);
  roundRect(ctx, CARD_X, PAGE_PAD_TOP, CARD_W, cardH, CARD_RADIUS);
  ctx.fillStyle = COLORS.cardBg;
  ctx.fill();
  ctx.restore();

  // 顶部高光线（mockup 里 inset 1px white shadow 的效果）
  ctx.save();
  ctx.beginPath();
  ctx.arc(CARD_X + CARD_RADIUS, PAGE_PAD_TOP + CARD_RADIUS, CARD_RADIUS, Math.PI, Math.PI * 1.5);
  ctx.lineTo(CARD_X + CARD_W - CARD_RADIUS, PAGE_PAD_TOP);
  ctx.arc(CARD_X + CARD_W - CARD_RADIUS, PAGE_PAD_TOP + CARD_RADIUS, CARD_RADIUS, Math.PI * 1.5, 0);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = L(1);
  ctx.stroke();
  ctx.restore();
}

// ─── 品牌条 ───────────────────────────────────────────

async function drawBrandBar(ctx, startY) {
  const logoSize = L(18);

  const logo = await loadSvgImage(TRAVELER_LOGO_PATHS, { size: logoSize, color: COLORS.accent });
  if (logo) ctx.drawImage(logo, CONTENT_X, startY, logoSize, logoSize);

  ctx.fillStyle = COLORS.ink3;
  ctx.font = `500 ${L(11)}px ${FONT_SC}`;
  ctx.textBaseline = 'middle';
  ctx.fillText('行迹 · 旅行手账', CONTENT_X + logoSize + L(7), startY + logoSize / 2);

  ctx.fillStyle = COLORS.ink4;
  ctx.font = `500 ${L(10)}px ${FONT_MONO}`;
  ctx.textAlign = 'right';
  ctx.fillText(`SHARED · ${formatDateStamp(new Date())}`, CONTENT_X + CONTENT_W, startY + logoSize / 2);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  return startY + logoSize + L(14);
}

// ─── 标题区 ───────────────────────────────────────────

function drawTitleBlock(ctx, trip, days, y) {
  ctx.fillStyle = COLORS.ink;
  ctx.font = `700 ${L(26)}px ${FONT_SC}`;
  ctx.textBaseline = 'top';
  ctx.fillText(cleanTitle(trip.title || '旅行行程'), CONTENT_X, y);
  const titleH = L(26 * 1.2);

  const subY = y + titleH + L(6);
  const dateRange = buildDateRange(days);
  const dayNight = days.length > 1 ? `${days.length} 天 ${days.length - 1} 夜` : `${days.length} 天`;

  ctx.fillStyle = COLORS.ink3;
  ctx.font = `400 ${L(12)}px ${FONT_SC}`;

  let xCursor = CONTENT_X;
  ctx.fillText(dateRange, xCursor, subY);
  xCursor += ctx.measureText(dateRange).width + L(8);

  // 圆点分隔符
  ctx.beginPath();
  ctx.arc(xCursor + L(1.5), subY + L(7), L(1.5), 0, Math.PI * 2);
  ctx.fillStyle = COLORS.ink4;
  ctx.fill();
  xCursor += L(3) + L(8);

  ctx.fillStyle = COLORS.ink3;
  ctx.fillText(dayNight, xCursor, subY);

  ctx.textBaseline = 'alphabetic';
  return subY + L(12 * 1.2) + L(14);
}

// ─── 总览统计 ─────────────────────────────────────────

function drawStats(ctx, locCount, dayCount, stopCount, y) {
  const h = L(54);
  const r = L(14);

  // 外框 + 整体底色（warm paper）
  roundRect(ctx, CONTENT_X, y, CONTENT_W, h, r);
  ctx.fillStyle = COLORS.paperWarm;
  ctx.fill();

  // 1px 描边
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = L(1);
  ctx.stroke();

  // 两条竖向分隔线
  const colW = CONTENT_W / 3;
  ctx.beginPath();
  ctx.moveTo(CONTENT_X + colW, y);
  ctx.lineTo(CONTENT_X + colW, y + h);
  ctx.moveTo(CONTENT_X + colW * 2, y);
  ctx.lineTo(CONTENT_X + colW * 2, y + h);
  ctx.stroke();

  drawStatCell(ctx, CONTENT_X + colW * 0, y, colW, h, locCount, '个', '地点');
  drawStatCell(ctx, CONTENT_X + colW * 1, y, colW, h, dayCount, '天', '行程');
  drawStatCell(ctx, CONTENT_X + colW * 2, y, colW, h, stopCount, '处', '停留');

  return y + h + L(16);
}

function drawStatCell(ctx, x, y, w, h, value, unit, label) {
  const cx = x + w / 2;

  // 数字 + 单位（右下小字附在数字右边）
  const numberFont = `600 ${L(20)}px ${FONT_LATIN}`;
  const unitFont = `500 ${L(11)}px ${FONT_SC}`;

  ctx.font = numberFont;
  const numberWidth = ctx.measureText(String(value)).width;
  ctx.font = unitFont;
  const unitWidth = ctx.measureText(unit).width;
  const groupWidth = numberWidth + L(2) + unitWidth;

  const numberX = cx - groupWidth / 2;
  const numberBaseline = y + L(10) + L(20); // top padding 10 + font ascent ~20

  ctx.fillStyle = COLORS.ink;
  ctx.font = numberFont;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillText(String(value), numberX, numberBaseline);

  ctx.fillStyle = COLORS.ink3;
  ctx.font = unitFont;
  ctx.fillText(unit, numberX + numberWidth + L(2), numberBaseline);

  // 标签
  ctx.fillStyle = COLORS.ink3;
  ctx.font = `400 ${L(10)}px ${FONT_SC}`;
  ctx.textAlign = 'center';
  ctx.fillText(label, cx, numberBaseline + L(15));

  ctx.textAlign = 'left';
}

// ─── 地图 ─────────────────────────────────────────────

async function drawMap(ctx, locations, viewport, y) {
  const x = CONTENT_X;
  const r = L(14);

  // 描底色（在瓦片加载失败时也有可看的兜底）
  roundRect(ctx, x, y, CONTENT_W, MAP_H, r);
  ctx.fillStyle = '#E8EDE3';
  ctx.fill();

  // 裁剪到圆角矩形
  ctx.save();
  roundRect(ctx, x, y, CONTENT_W, MAP_H, r);
  ctx.clip();

  drawMapFallbackGrid(ctx, x, y);
  await drawMapTiles(ctx, viewport, x, y);

  // 暖色滤镜（叠半透明 paperWarm）+ 轻微降饱和效果（叠灰白）
  ctx.fillStyle = 'rgba(242, 237, 228, 0.32)';
  ctx.fillRect(x, y, CONTENT_W, MAP_H);
  ctx.fillStyle = 'rgba(180, 165, 140, 0.10)'; // 略偏暖灰，进一步降饱和
  ctx.fillRect(x, y, CONTENT_W, MAP_H);

  // 编号标记
  locations.forEach((loc, index) => {
    const point = projectToMap(loc.lnglat, viewport, x, y);
    drawMapMarker(ctx, point.x, point.y, index + 1);
  });

  ctx.restore();

  // 描边
  roundRect(ctx, x, y, CONTENT_W, MAP_H, r);
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = L(1);
  ctx.stroke();

  return y + MAP_H + L(8);
}

function drawMapFallbackGrid(ctx, x, y) {
  ctx.fillStyle = '#EFEDE2';
  ctx.fillRect(x, y, CONTENT_W, MAP_H);
  ctx.strokeStyle = '#E5DEC8';
  ctx.lineWidth = L(1);
  for (let i = 0; i <= 8; i += 1) {
    const xx = x + (CONTENT_W / 8) * i;
    ctx.beginPath();
    ctx.moveTo(xx, y);
    ctx.lineTo(xx, y + MAP_H);
    ctx.stroke();
  }
  for (let i = 0; i <= 5; i += 1) {
    const yy = y + (MAP_H / 5) * i;
    ctx.beginPath();
    ctx.moveTo(x, yy);
    ctx.lineTo(x + CONTENT_W, yy);
    ctx.stroke();
  }
}

function drawMapMarker(ctx, x, y, index) {
  const r = L(7.5);
  ctx.save();
  ctx.shadowColor = 'rgba(38, 31, 24, 0.22)';
  ctx.shadowBlur = L(4);
  ctx.shadowOffsetY = L(2);

  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.accent;
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.lineWidth = L(1.5);
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${L(index >= 10 ? 8 : 9)}px ${FONT_LATIN}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(index), x, y + L(0.4));
  ctx.restore();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function drawMapStrip(ctx, count, y) {
  ctx.fillStyle = COLORS.ink3;
  ctx.font = `500 ${L(10)}px ${FONT_MONO}`;
  ctx.textAlign = 'center';
  ctx.fillText(`· 共 ${count} 个地点 ·`, CONTENT_X + CONTENT_W / 2, y + L(12));
  ctx.textAlign = 'left';
  return y + L(20) + L(12);
}

// ─── 各日时间轴 ───────────────────────────────────────

async function drawDays(ctx, trip, days, startY, layout) {
  // 预加载所有 event 图标（按 iconId 缓存，避免重复编码）
  const iconCache = new Map();
  const allIconIds = new Set();
  days.forEach(day => (day.events || []).forEach(event => {
    allIconIds.add(normalizeForCanvas(event.icon, event, trip));
  }));
  await Promise.all([...allIconIds].map(async id => {
    iconCache.set(id, await loadSvgImage(getIconPaths(id), { size: L(18), color: COLORS.ink2 }));
  }));

  let y = startY;
  let globalIndex = 1;

  days.forEach((day, dayIdx) => {
    if (dayIdx > 0) y += L(22);
    y = drawDayHead(ctx, day, y);

    if (!day.events?.length) {
      y = drawEmptyDay(ctx, y);
      return;
    }

    const itemHeights = layout.dayHeights[dayIdx].itemHeights;
    const timelineX = CONTENT_X + L(8); // 虚线/节点中心

    // 算虚线起止：第一个 item 节点中心到最后一个 item 节点中心
    const firstNodeY = y + itemHeights[0] / 2;
    const lastNodeY = y + sumWithGaps(itemHeights, L(8)) - itemHeights[itemHeights.length - 1] / 2;
    if (day.events.length > 1) drawDashedLine(ctx, timelineX, firstNodeY, lastNodeY);

    day.events.forEach((event, eventIdx) => {
      const itemH = itemHeights[eventIdx];
      drawTimelineNode(ctx, timelineX, y + itemH / 2, globalIndex);
      drawEventCard(ctx, trip, event, CONTENT_X + L(26), y, itemH, iconCache);
      y += itemH;
      if (eventIdx < day.events.length - 1) y += L(8);
      globalIndex += 1;
    });
  });

  return y;
}

function drawDayHead(ctx, day, y) {
  // 左：badge "日期 · 周X"  ｜  中：theme  ｜  右：N STOPS
  const badgeText = `${formatDateCN(day.date)} · ${getWeekdayCN(day.date)}`;

  ctx.font = `700 ${L(13)}px ${FONT_SC}`;
  const badgeTextW = ctx.measureText(badgeText).width;
  const badgePadX = L(8);
  const badgePadY = L(4);
  const badgeH = L(13) + badgePadY * 2;
  const badgeW = badgeTextW + badgePadX * 2;
  const badgeX = CONTENT_X + L(2);
  const badgeY = y;

  // badge 背景（白底 1px 描边）
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, L(8));
  ctx.fillStyle = COLORS.paper;
  ctx.fill();
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = L(1);
  ctx.stroke();

  // badge 文字：日期部分 accent 色，分隔与周 X 用 ink
  // 简化：整段一次画，不在中间换色（视觉差别小，节省复杂度）
  // 但根据 mockup 强调日期是 accent，所以分两段画
  const dateText = formatDateCN(day.date);
  const restText = ` · ${getWeekdayCN(day.date)}`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLORS.accent;
  ctx.fillText(dateText, badgeX + badgePadX, badgeY + badgeH / 2);
  const dateW = ctx.measureText(dateText).width;
  ctx.fillStyle = COLORS.ink;
  ctx.fillText(restText, badgeX + badgePadX + dateW, badgeY + badgeH / 2);

  // theme（在 badge 右侧，垂直居中对齐）
  if (day.title) {
    ctx.fillStyle = COLORS.ink2;
    ctx.font = `500 ${L(13)}px ${FONT_SC}`;
    ctx.fillText(day.title, badgeX + badgeW + L(10), badgeY + badgeH / 2);
  }

  // N STOPS（右对齐）
  const stops = day.events?.length || 0;
  ctx.fillStyle = COLORS.ink4;
  ctx.font = `500 ${L(10)}px ${FONT_MONO}`;
  ctx.textAlign = 'right';
  ctx.fillText(`${stops} STOPS`, CONTENT_X + CONTENT_W, badgeY + badgeH / 2);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  return y + badgeH + L(10);
}

function drawDashedLine(ctx, x, y1, y2) {
  ctx.save();
  ctx.strokeStyle = COLORS.dash;
  ctx.lineWidth = L(1.5);
  ctx.setLineDash([L(3), L(7)]);
  ctx.beginPath();
  ctx.moveTo(x, y1);
  ctx.lineTo(x, y2);
  ctx.stroke();
  ctx.restore();
}

function drawTimelineNode(ctx, x, y, index) {
  const r = L(9);

  // 外圈（卡片色，营造 box-shadow: 0 0 0 3px var(--bg) 的效果）
  ctx.beginPath();
  ctx.arc(x, y, r + L(3), 0, Math.PI * 2);
  ctx.fillStyle = COLORS.cardBg;
  ctx.fill();

  // 节点白底 + 描边
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.paper;
  ctx.fill();
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = L(1.5);
  ctx.stroke();

  ctx.fillStyle = COLORS.ink3;
  ctx.font = `600 ${L(index >= 10 ? 8 : 9)}px ${FONT_LATIN}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(index), x, y + L(0.3));

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function drawEventCard(ctx, trip, event, x, y, h, iconCache) {
  const cardW = (CONTENT_X + CONTENT_W) - x;
  const cardR = L(10);

  roundRect(ctx, x, y, cardW, h, cardR);
  ctx.fillStyle = COLORS.paper;
  ctx.fill();
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = L(1);
  ctx.stroke();

  // icon 徽章
  const padX = L(12);
  const iconBoxSize = L(30);
  const iconBoxX = x + padX;
  const iconBoxY = y + (h - iconBoxSize) / 2;

  roundRect(ctx, iconBoxX, iconBoxY, iconBoxSize, iconBoxSize, L(8));
  ctx.fillStyle = COLORS.bg2;
  ctx.fill();

  const iconId = normalizeForCanvas(event.icon, event, trip);
  const iconImg = iconCache.get(iconId);
  if (iconImg) {
    const iconSize = L(18);
    ctx.drawImage(
      iconImg,
      iconBoxX + (iconBoxSize - iconSize) / 2,
      iconBoxY + (iconBoxSize - iconSize) / 2,
      iconSize,
      iconSize
    );
  }

  // 文字区
  const loc = trip.locations?.[event.locationId] || {};
  const textX = iconBoxX + iconBoxSize + L(10);
  const textRight = x + cardW - padX;
  const textW = textRight - textX;
  const padV = L(10);

  const titleLines = wrapText(ctx, event.title || loc.name || '未命名地点', textW, `600 ${L(13.5)}px ${FONT_SC}`);
  const locText = loc.name || loc.addr || '地点待定';
  const locLines = wrapText(ctx, locText, textW, `400 ${L(11.5)}px ${FONT_SC}`).slice(0, 2);

  const titleLineH = L(13.5 * 1.3);
  const locLineH = L(11.5 * 1.4);
  const contentH = titleLines.length * titleLineH + L(4) + locLines.length * locLineH;
  let textY = y + (h - contentH) / 2;

  ctx.fillStyle = COLORS.ink;
  ctx.font = `600 ${L(13.5)}px ${FONT_SC}`;
  ctx.textBaseline = 'top';
  titleLines.forEach(line => {
    ctx.fillText(line, textX, textY);
    textY += titleLineH;
  });

  textY += L(4);
  ctx.fillStyle = COLORS.ink3;
  ctx.font = `400 ${L(11.5)}px ${FONT_SC}`;
  locLines.forEach(line => {
    ctx.fillText(line, textX, textY);
    textY += locLineH;
  });

  ctx.textBaseline = 'alphabetic';
}

function drawEmptyDay(ctx, y) {
  const h = L(58);
  roundRect(ctx, CONTENT_X, y, CONTENT_W, h, L(10));
  ctx.fillStyle = COLORS.paper;
  ctx.fill();
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = L(1);
  ctx.stroke();

  ctx.fillStyle = COLORS.ink3;
  ctx.font = `400 ${L(13)}px ${FONT_SC}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('这一天还没有地点', CONTENT_X + CONTENT_W / 2, y + h / 2);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  return y + h;
}

// ─── 结尾小结 ─────────────────────────────────────────

function drawSummary(ctx, startY) {
  const y = startY + L(26);
  const h = L(110);
  const r = L(14);

  // 渐变底色（米黄过渡），不再叠装饰光斑
  const grad = ctx.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, COLORS.paperWarm);
  grad.addColorStop(1, COLORS.paperWarm2);

  ctx.save();
  roundRect(ctx, CONTENT_X, y, CONTENT_W, h, r);
  ctx.clip();
  ctx.fillStyle = grad;
  ctx.fillRect(CONTENT_X, y, CONTENT_W, h);
  ctx.restore();

  // 描边
  roundRect(ctx, CONTENT_X, y, CONTENT_W, h, r);
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = L(1);
  ctx.stroke();

  // 文案
  const cx = CONTENT_X + CONTENT_W / 2;
  ctx.textAlign = 'center';

  ctx.fillStyle = COLORS.accent;
  ctx.font = `600 ${L(10)}px ${FONT_LATIN}`;
  ctx.textBaseline = 'top';
  ctx.fillText('END  OF  TRIP', cx, y + L(22));

  ctx.fillStyle = COLORS.ink;
  ctx.font = `600 ${L(22)}px ${FONT_LATIN}`;
  ctx.fillText('Have a nice trip!', cx, y + L(38));

  ctx.fillStyle = COLORS.ink3;
  ctx.font = `400 ${L(12)}px ${FONT_SC}`;
  ctx.fillText('愿下一次再聚，又有新城市可以一起逛 ✦', cx, y + L(74));

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  return y + h;
}

// ─── 页脚 ─────────────────────────────────────────────

function drawFooter(ctx, startY) {
  const y = startY + L(14);
  ctx.fillStyle = COLORS.ink4;
  ctx.font = `400 ${L(10)}px ${FONT_SC}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('由「行迹」生成', CONTENT_X + CONTENT_W / 2, y);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

// ─── 数据处理工具 ─────────────────────────────────────

function buildDateRange(days) {
  const dates = days.map(day => day.date).filter(isISODate).sort();
  if (!dates.length) return '日期待定';
  return `${formatDateCN(dates[0])} — ${formatDateCN(dates[dates.length - 1])}`;
}

function collectTripLocations(trip) {
  const ids = [];
  (trip.days || []).forEach(day => {
    (day.events || []).forEach(event => {
      if (event.locationId && !ids.includes(event.locationId)) ids.push(event.locationId);
    });
  });
  return ids
    .map(id => ({ id, ...(trip.locations?.[id] || {}) }))
    .filter(loc => Array.isArray(loc.lnglat) && Number.isFinite(Number(loc.lnglat[0])) && Number.isFinite(Number(loc.lnglat[1])));
}

function normalizeForCanvas(iconId, event, trip) {
  const id = String(iconId || '').trim();
  if (id) return id;
  const loc = trip.locations?.[event?.locationId];
  return inferIconFallback(event?.title, loc?.name);
}

function inferIconFallback(title, locName) {
  const text = `${title || ''} ${locName || ''}`;
  if (/餐|饭|吃|寿司|咖啡/.test(text)) return 'food';
  if (/酒店|住宿|民宿/.test(text)) return 'hotel';
  if (/站|车|铁|地铁|机场/.test(text)) return 'train';
  if (/学|校园|大学/.test(text)) return 'school';
  if (/公园|河|湖|水岸|森林/.test(text)) return 'park';
  if (/商场|书店|逛/.test(text)) return 'shop';
  return 'pin';
}

// ─── 地图投影 ─────────────────────────────────────────

function getMapViewport(locations, width, height) {
  if (!locations.length) return { center: AppConfig.defaultCenter, zoom: AppConfig.defaultZoom, width, height };
  const points = locations.map(loc => loc.lnglat.map(Number));
  const lngs = points.map(p => p[0]);
  const lats = points.map(p => p[1]);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const center = [(minLng + maxLng) / 2, (minLat + maxLat) / 2];

  let zoom = 16;
  for (; zoom >= 4; zoom -= 1) {
    const nw = lngLatToPixel([minLng, maxLat], zoom);
    const se = lngLatToPixel([maxLng, minLat], zoom);
    if (Math.abs(se.x - nw.x) <= width - L(60) && Math.abs(se.y - nw.y) <= height - L(60)) break;
  }
  return { center, zoom, width, height };
}

async function drawMapTiles(ctx, viewport, x, y) {
  const tileSize = 256;
  const centerPixel = lngLatToPixel(viewport.center, viewport.zoom);
  const topLeft = {
    x: centerPixel.x - viewport.width / 2 / SCALE,
    y: centerPixel.y - viewport.height / 2 / SCALE
  };
  const startTileX = Math.floor(topLeft.x / tileSize);
  const startTileY = Math.floor(topLeft.y / tileSize);
  const endTileX = Math.floor((topLeft.x + viewport.width / SCALE) / tileSize);
  const endTileY = Math.floor((topLeft.y + viewport.height / SCALE) / tileSize);
  const maxTile = 2 ** viewport.zoom;
  const tasks = [];

  for (let tx = startTileX; tx <= endTileX; tx += 1) {
    for (let ty = startTileY; ty <= endTileY; ty += 1) {
      if (ty < 0 || ty >= maxTile) continue;
      const wrappedX = ((tx % maxTile) + maxTile) % maxTile;
      tasks.push(loadImage(buildTileURL(wrappedX, ty, viewport.zoom)).then(img => ({ img, tx, ty })));
    }
  }

  const tiles = await Promise.all(tasks);
  tiles.forEach(({ img, tx, ty }) => {
    if (!img) return;
    ctx.drawImage(
      img,
      x + Math.round((tx * tileSize - topLeft.x) * SCALE),
      y + Math.round((ty * tileSize - topLeft.y) * SCALE),
      tileSize * SCALE,
      tileSize * SCALE
    );
  });
}

function buildTileURL(x, y, z) {
  const url = new URL('/_AMapTile', window.location.origin);
  url.searchParams.set('x', String(x));
  url.searchParams.set('y', String(y));
  url.searchParams.set('z', String(z));
  return url.toString();
}

function projectToMap(lnglat, viewport, x, y) {
  const center = lngLatToPixel(viewport.center, viewport.zoom);
  const point = lngLatToPixel(lnglat.map(Number), viewport.zoom);
  return {
    x: x + viewport.width / 2 + (point.x - center.x) * SCALE,
    y: y + viewport.height / 2 + (point.y - center.y) * SCALE
  };
}

function lngLatToPixel([lng, lat], zoom) {
  const sin = Math.sin((lat * Math.PI) / 180);
  const scale = 256 * (2 ** zoom);
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale
  };
}

// ─── 通用绘制工具 ─────────────────────────────────────

function loadImage(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function loadSvgImage(svgInner, { size, color, strokeWidth = 1.9 }) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}">` +
      `<g fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">` +
        svgInner +
      `</g>` +
    `</svg>`;
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return loadImage(url);
}

function wrapText(ctx, text, maxWidth, font) {
  ctx.font = font;
  const chars = Array.from(String(text || ''));
  const lines = [];
  let line = '';
  chars.forEach(char => {
    const next = line + char;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = char;
    } else {
      line = next;
    }
  });
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function sumWithGaps(values, gap) {
  return values.reduce((sum, v) => sum + v, 0) + Math.max(0, values.length - 1) * gap;
}

function compareDays(a, b) {
  if (isISODate(a.date) && isISODate(b.date)) return a.date.localeCompare(b.date);
  return String(a.date || '').localeCompare(String(b.date || ''));
}

function getWeekdayCN(iso) {
  if (!isISODate(iso)) return '日期待定';
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(`${iso}T00:00:00`).getDay()];
}

function formatDateStamp(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}.${m}.${d}`;
}

function cleanTitle(value) {
  return String(value || '').replace(/^(🎒|背包)\s*/u, '');
}

function sanitizeFilename(value) {
  return String(value || 'trip').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '-').slice(0, 40);
}
