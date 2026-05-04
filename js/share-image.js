// js/share-image.js
// 生成用于分享的长图。输入 trip，输出 PNG data URL。

import { AppConfig } from './config.js';
import { formatDateCN, isISODate } from './utils.js';

const POSTER_WIDTH = 900;
const OUTER_PAD = 48;
const INNER_PAD = 44;
const CONTENT_X = OUTER_PAD + INNER_PAD;
const CONTENT_WIDTH = POSTER_WIDTH - (OUTER_PAD + INNER_PAD) * 2;
const MAP_WIDTH = CONTENT_WIDTH;
const MAP_HEIGHT = 360;
const ACCENT = '#E25C3D';
const TEXT = '#171411';
const MUTED = '#746d64';
const FAINT = '#aaa196';
const LINE = '#e1d8cc';
const PAPER = '#fbf7ef';
const PANEL = '#fffdf8';

export async function buildTripShareImage(trip) {
  const locations = collectTripLocations(trip);
  const orderedDays = [...trip.days].sort(compareDays);
  const routeDistance = estimateRouteDistance(trip, orderedDays);
  const map = getMapViewport(locations, MAP_WIDTH, MAP_HEIGHT);
  const bodyHeight = measureItineraryHeight(trip, orderedDays);
  const height = 112 + 190 + MAP_HEIGHT + 86 + bodyHeight + 270;

  const canvas = document.createElement('canvas');
  canvas.width = POSTER_WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  drawBackground(ctx, height);
  let y = 80;
  y = drawBrandBar(ctx, y);
  y = drawTitleBlock(ctx, trip, orderedDays, locations, routeDistance, y);
  await drawMapBlock(ctx, locations, map, y);
  y += MAP_HEIGHT + 86;
  y = drawItinerary(ctx, trip, orderedDays, y);
  drawFooter(ctx, y + 58);

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

function drawBackground(ctx, height) {
  ctx.fillStyle = '#e8e1d6';
  ctx.fillRect(0, 0, POSTER_WIDTH, height);
  ctx.save();
  ctx.shadowColor = 'rgba(55, 42, 28, 0.10)';
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 10;
  roundRect(ctx, OUTER_PAD, 40, POSTER_WIDTH - OUTER_PAD * 2, height - 80, 28);
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.restore();
}

function drawBrandBar(ctx, y) {
  drawBrandMark(ctx, CONTENT_X, y - 13);
  ctx.fillStyle = TEXT;
  ctx.font = '700 16px "Noto Sans SC", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('行迹 · 旅行手账', CONTENT_X + 28, y - 3);

  ctx.textAlign = 'right';
  ctx.fillStyle = MUTED;
  ctx.font = '500 13px "Noto Sans SC", monospace';
  ctx.fillText(`SHARED · ${formatDateStamp(new Date())}`, CONTENT_X + CONTENT_WIDTH, y - 3);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  return y + 64;
}

function drawBrandMark(ctx, x, y) {
  roundRect(ctx, x, y, 20, 20, 6);
  ctx.fillStyle = ACCENT;
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 12px "Noto Sans SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('行', x + 10, y + 10.5);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function drawTitleBlock(ctx, trip, days, locations, routeDistance, y) {
  ctx.fillStyle = TEXT;
  ctx.font = '900 40px "Noto Sans SC", sans-serif';
  ctx.fillText(cleanTitle(trip.title || '旅行行程'), CONTENT_X, y);

  ctx.fillStyle = MUTED;
  ctx.font = '500 17px "Noto Sans SC", sans-serif';
  ctx.fillText(buildSubtitle(days, trip.city || AppConfig.cityName), CONTENT_X, y + 40);

  const statsY = y + 86;
  const statWidth = CONTENT_WIDTH / 3;
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(CONTENT_X, statsY);
  ctx.lineTo(CONTENT_X + CONTENT_WIDTH, statsY);
  ctx.moveTo(CONTENT_X, statsY + 66);
  ctx.lineTo(CONTENT_X + CONTENT_WIDTH, statsY + 66);
  ctx.stroke();
  for (let i = 1; i < 3; i += 1) {
    ctx.beginPath();
    ctx.moveTo(CONTENT_X + statWidth * i, statsY + 10);
    ctx.lineTo(CONTENT_X + statWidth * i, statsY + 56);
    ctx.stroke();
  }

  drawStat(ctx, CONTENT_X, statsY + 48, `${locations.length}`, '地点');
  drawStat(ctx, CONTENT_X + statWidth, statsY + 48, `${days.length}`, '天行程');
  drawStat(ctx, CONTENT_X + statWidth * 2, statsY + 48, routeDistance ? `${routeDistance}` : '--', '公里路程');
  return statsY + 96;
}

function drawStat(ctx, x, baseline, value, label) {
  ctx.textAlign = 'center';
  ctx.fillStyle = TEXT;
  ctx.font = '900 28px "Noto Sans SC", sans-serif';
  ctx.fillText(value, x + CONTENT_WIDTH / 6, baseline - 12);
  ctx.fillStyle = MUTED;
  ctx.font = '500 13px "Noto Sans SC", sans-serif';
  ctx.fillText(label, x + CONTENT_WIDTH / 6, baseline + 13);
  ctx.textAlign = 'left';
}

async function drawMapBlock(ctx, locations, viewport, y) {
  const x = CONTENT_X;
  roundRect(ctx, x, y, MAP_WIDTH, MAP_HEIGHT, 18);
  ctx.fillStyle = '#f1eadf';
  ctx.fill();
  ctx.save();
  roundRect(ctx, x, y, MAP_WIDTH, MAP_HEIGHT, 18);
  ctx.clip();
  drawMapFallback(ctx, x, y);
  await drawMapTiles(ctx, viewport, x, y);
  tintMap(ctx, x, y);
  locations.forEach((loc, index) => {
    const point = projectToMap(loc.lnglat, viewport, x, y);
    drawMapMarker(ctx, point.x, point.y, index + 1);
  });
  drawMapScale(ctx, x + MAP_WIDTH - 88, y + MAP_HEIGHT - 34);
  ctx.restore();
  roundRect(ctx, x, y, MAP_WIDTH, MAP_HEIGHT, 18);
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.font = '500 15px "Noto Sans SC", monospace';
  ctx.fillText(`· 共 ${locations.length} 个地点 ·`, x + MAP_WIDTH / 2, y + MAP_HEIGHT + 42);
  ctx.textAlign = 'left';
}

function drawMapFallback(ctx, x, y) {
  ctx.fillStyle = '#eee8dc';
  ctx.fillRect(x, y, MAP_WIDTH, MAP_HEIGHT);
  ctx.strokeStyle = '#ddd3c4';
  ctx.lineWidth = 1;
  for (let i = 0; i < 9; i += 1) {
    const xx = x + (MAP_WIDTH / 8) * i;
    ctx.beginPath();
    ctx.moveTo(xx, y);
    ctx.lineTo(xx, y + MAP_HEIGHT);
    ctx.stroke();
  }
  for (let i = 0; i < 6; i += 1) {
    const yy = y + (MAP_HEIGHT / 5) * i;
    ctx.beginPath();
    ctx.moveTo(x, yy);
    ctx.lineTo(x + MAP_WIDTH, yy);
    ctx.stroke();
  }
}

function tintMap(ctx, x, y) {
  ctx.fillStyle = 'rgba(251, 247, 239, 0.24)';
  ctx.fillRect(x, y, MAP_WIDTH, MAP_HEIGHT);
}

function drawMapMarker(ctx, x, y, index) {
  ctx.save();
  ctx.shadowColor = 'rgba(38,31,24,0.18)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  ctx.beginPath();
  ctx.arc(x, y, 15, 0, Math.PI * 2);
  ctx.fillStyle = PANEL;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = TEXT;
  ctx.stroke();
  ctx.fillStyle = TEXT;
  ctx.font = '900 13px "Noto Sans SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(index), x, y + 0.5);
  ctx.restore();
}

function drawMapScale(ctx, x, y) {
  ctx.strokeStyle = TEXT;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + 55, y);
  ctx.moveTo(x, y - 6);
  ctx.lineTo(x, y + 6);
  ctx.moveTo(x + 55, y - 6);
  ctx.lineTo(x + 55, y + 6);
  ctx.stroke();
  ctx.fillStyle = MUTED;
  ctx.font = '500 11px "Noto Sans SC", monospace';
  ctx.fillText('5 km', x + 11, y - 10);
}

function drawItinerary(ctx, trip, days, y) {
  let cursor = y;
  let globalIndex = 1;
  days.forEach((day, dayIndex) => {
    if (dayIndex > 0) cursor += 26;
    drawDayHeader(ctx, day, cursor, countUniqueEventLocations(day));
    cursor += 30;

    const axisX = CONTENT_X + 22;
    const sectionTop = cursor - 2;
    const sectionHeight = day.events.reduce((sum, event) => sum + getEventCardHeight(ctx, trip, event) + 16, 0) - 16;
    drawDashedLine(ctx, axisX, sectionTop, sectionTop + sectionHeight);

    day.events.forEach((event, eventIndex) => {
      const cardHeight = getEventCardHeight(ctx, trip, event);
      const nodeY = cursor + 30;
      drawTimelineNode(ctx, axisX, nodeY, globalIndex);
      drawEventCard(ctx, trip, event, CONTENT_X + 52, cursor, cardHeight);
      cursor += cardHeight + 16;
      globalIndex += 1;
    });
  });
  return cursor;
}

function drawDayHeader(ctx, day, y, stops) {
  ctx.fillStyle = TEXT;
  ctx.font = '900 20px "Noto Sans SC", sans-serif';
  const weekday = getWeekdayCN(day.date);
  ctx.fillText(`${formatDateCN(day.date)} · ${weekday} · ${day.title || '未命名'}`, CONTENT_X, y);
  ctx.textAlign = 'right';
  ctx.fillStyle = MUTED;
  ctx.font = '500 14px "Noto Sans SC", monospace';
  ctx.fillText(`${stops} STOPS`, CONTENT_X + CONTENT_WIDTH, y);
  ctx.textAlign = 'left';
}

function drawDashedLine(ctx, x, y1, y2) {
  ctx.save();
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 6]);
  ctx.beginPath();
  ctx.moveTo(x, y1);
  ctx.lineTo(x, y2);
  ctx.stroke();
  ctx.restore();
}

function drawTimelineNode(ctx, x, y, index) {
  ctx.beginPath();
  ctx.arc(x, y, 14, 0, Math.PI * 2);
  ctx.fillStyle = PANEL;
  ctx.fill();
  ctx.strokeStyle = TEXT;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = TEXT;
  ctx.font = '800 11px "Noto Sans SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(index), x, y + 0.5);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function drawEventCard(ctx, trip, event, x, y, height) {
  const loc = trip.locations[event.locationId] || {};
  roundRect(ctx, x, y, CONTENT_WIDTH - 52, height, 12);
  ctx.fillStyle = PANEL;
  ctx.fill();
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.stroke();

  const iconX = x + 26;
  const iconY = y + 31;
  roundRect(ctx, iconX - 14, iconY - 14, 28, 28, 8);
  ctx.fillStyle = '#f6f3ee';
  ctx.fill();
  drawIOSIcon(ctx, iconX, iconY, event.icon || 'pin');

  const titleX = x + 54;
  const lines = wrapText(ctx, event.title || loc.name || '未命名地点', CONTENT_WIDTH - 142, '900 18px "Noto Sans SC", sans-serif');
  ctx.fillStyle = TEXT;
  ctx.font = '900 18px "Noto Sans SC", sans-serif';
  let textY = y + 28;
  lines.forEach(line => {
    ctx.fillText(line, titleX, textY);
    textY += 23;
  });

  ctx.fillStyle = MUTED;
  ctx.font = '500 14px "Noto Sans SC", sans-serif';
  ctx.fillText(loc.name || '地点待定', titleX, textY + 4);
}

function drawIOSIcon(ctx, x, y, icon) {
  ctx.strokeStyle = '#6f6a63';
  ctx.fillStyle = '#6f6a63';
  ctx.lineWidth = 1.85;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (icon === 'food') {
    ctx.moveTo(x - 6, y - 7); ctx.lineTo(x - 6, y + 8);
    ctx.moveTo(x - 9, y - 4); ctx.lineTo(x - 3, y - 4);
    ctx.moveTo(x + 5, y - 7); ctx.quadraticCurveTo(x + 9, y - 2, x + 5, y + 2); ctx.lineTo(x + 5, y + 8);
  } else if (icon === 'hotel') {
    ctx.rect(x - 9, y - 2, 18, 8);
    ctx.rect(x - 8, y - 8, 7, 6);
    ctx.moveTo(x - 9, y + 6); ctx.lineTo(x - 9, y + 9);
    ctx.moveTo(x + 9, y + 6); ctx.lineTo(x + 9, y + 9);
  } else if (icon === 'train') {
    roundRect(ctx, x - 8, y - 10, 16, 17, 4);
    ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y - 4);
    ctx.moveTo(x - 4, y + 10); ctx.lineTo(x, y + 6); ctx.lineTo(x + 4, y + 10);
  } else if (icon === 'book') {
    ctx.rect(x - 9, y - 8, 18, 15);
    ctx.moveTo(x, y - 8); ctx.lineTo(x, y + 7);
  } else if (icon === 'school') {
    ctx.moveTo(x - 10, y - 3); ctx.lineTo(x, y - 9); ctx.lineTo(x + 10, y - 3); ctx.lineTo(x, y + 3); ctx.closePath();
    ctx.moveTo(x - 6, y + 1); ctx.lineTo(x - 6, y + 7); ctx.lineTo(x + 6, y + 7); ctx.lineTo(x + 6, y + 1);
  } else if (icon === 'park') {
    ctx.moveTo(x, y + 9); ctx.lineTo(x, y + 1);
    ctx.moveTo(x, y + 1); ctx.quadraticCurveTo(x - 9, y - 1, x - 6, y - 9); ctx.quadraticCurveTo(x, y - 6, x, y + 1);
    ctx.moveTo(x, y + 1); ctx.quadraticCurveTo(x + 9, y - 1, x + 6, y - 9); ctx.quadraticCurveTo(x, y - 6, x, y + 1);
  } else {
    ctx.arc(x, y - 2, 6, 0, Math.PI * 2);
    ctx.moveTo(x, y + 4); ctx.lineTo(x, y + 10);
  }
  ctx.stroke();
}

function drawFooter(ctx, y) {
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(CONTENT_X, y);
  ctx.lineTo(CONTENT_X + CONTENT_WIDTH, y);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = FAINT;
  ctx.font = '600 15px "Noto Sans SC", monospace';
  ctx.letterSpacing = '0px';
  ctx.fillText('E N D   O F   T R I P', POSTER_WIDTH / 2, y + 42);
  ctx.fillStyle = TEXT;
  ctx.font = '500 38px "Noto Sans SC", sans-serif';
  ctx.fillText('Have a nice trip', POSTER_WIDTH / 2, y + 88);
  ctx.fillStyle = MUTED;
  ctx.font = '500 18px "Noto Sans SC", sans-serif';
  ctx.fillText('愿下一次再聚，又有新城市可以一起逛', POSTER_WIDTH / 2, y + 126);
  ctx.strokeStyle = LINE;
  ctx.beginPath();
  ctx.moveTo(CONTENT_X, y + 160);
  ctx.lineTo(CONTENT_X + CONTENT_WIDTH, y + 160);
  ctx.stroke();
  ctx.textAlign = 'left';
}

function measureItineraryHeight(trip, days) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  return days.reduce((sum, day, dayIndex) => {
    const eventsHeight = day.events.reduce((eventSum, event) => eventSum + getEventCardHeight(ctx, trip, event) + 16, 0);
    return sum + (dayIndex > 0 ? 26 : 0) + 30 + eventsHeight;
  }, 0);
}

function getEventCardHeight(ctx, trip, event) {
  const loc = trip.locations[event.locationId] || {};
  const lines = wrapText(ctx, event.title || loc.name || '未命名地点', CONTENT_WIDTH - 142, '900 18px "Noto Sans SC", sans-serif');
  return Math.max(74, 48 + lines.length * 23);
}

function collectTripLocations(trip) {
  const ids = [];
  trip.days.forEach(day => {
    day.events.forEach(event => {
      if (event.locationId && !ids.includes(event.locationId)) ids.push(event.locationId);
    });
  });
  return ids
    .map(id => ({ id, ...(trip.locations[id] || {}) }))
    .filter(loc => Array.isArray(loc.lnglat) && Number.isFinite(Number(loc.lnglat[0])) && Number.isFinite(Number(loc.lnglat[1])));
}

function buildSubtitle(days, city) {
  const dates = days.map(day => day.date).filter(isISODate).sort();
  const dateText = dates.length
    ? `${formatDateCN(dates[0])} - ${formatDateCN(dates[dates.length - 1])}`
    : '日期待定';
  const cityText = String(city || '').replace(/市$/, '') || '目的地';
  return `${dateText} · ${days.length} 天 · ${cityText} · 通州`;
}

function countUniqueEventLocations(day) {
  return new Set(day.events.map(event => event.locationId).filter(Boolean)).size;
}

function estimateRouteDistance(trip, days) {
  let meters = 0;
  days.forEach(day => {
    day.events.forEach((event, index) => {
      const next = day.events[index + 1];
      const a = trip.locations[event.locationId]?.lnglat;
      const b = trip.locations[next?.locationId]?.lnglat;
      if (a && b) meters += haversine(a, b) * 1.25;
    });
  });
  return meters ? Math.round(meters / 1000) : 0;
}

function haversine(a, b) {
  const toRad = deg => deg * Math.PI / 180;
  const r = 6371000;
  const lat1 = toRad(Number(a[1]));
  const lat2 = toRad(Number(b[1]));
  const dLat = toRad(Number(b[1]) - Number(a[1]));
  const dLng = toRad(Number(b[0]) - Number(a[0]));
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

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
    if (Math.abs(se.x - nw.x) <= width - 110 && Math.abs(se.y - nw.y) <= height - 90) break;
  }
  return { center, zoom, width, height };
}

async function drawMapTiles(ctx, viewport, x, y) {
  const tileSize = 256;
  const centerPixel = lngLatToPixel(viewport.center, viewport.zoom);
  const topLeft = { x: centerPixel.x - viewport.width / 2, y: centerPixel.y - viewport.height / 2 };
  const startTileX = Math.floor(topLeft.x / tileSize);
  const startTileY = Math.floor(topLeft.y / tileSize);
  const endTileX = Math.floor((topLeft.x + viewport.width) / tileSize);
  const endTileY = Math.floor((topLeft.y + viewport.height) / tileSize);
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
    ctx.drawImage(img, x + Math.round(tx * tileSize - topLeft.x), y + Math.round(ty * tileSize - topLeft.y), tileSize, tileSize);
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
  return { x: x + viewport.width / 2 + point.x - center.x, y: y + viewport.height / 2 + point.y - center.y };
}

function lngLatToPixel([lng, lat], zoom) {
  const sin = Math.sin((lat * Math.PI) / 180);
  const scale = 256 * (2 ** zoom);
  return { x: ((lng + 180) / 360) * scale, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale };
}

function loadImage(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
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
  return String(value || '').replace(/^(🎒|馃帓)\s*/u, '');
}

function sanitizeFilename(value) {
  return String(value || 'trip').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '-').slice(0, 40);
}
