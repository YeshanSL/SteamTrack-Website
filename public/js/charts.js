/* SteamTrack: SVG chart helpers (no dependencies) */
import { esc, hrs } from './utils.js';

/* Horizontal bar list; bars animate via CSS */
export function barList(items, { format = hrs, alt = false } = {}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return `<div class="bars">${items.map((i, n) => `
    <div class="bar-row" ${i.appid ? `data-game="${i.appid}" data-gname="${esc(i.label)}"` : ''} title="${esc(i.label)}">
      <span class="bar-label">${esc(i.label)}</span>
      <div class="bar-track"><div class="bar-fill ${alt ? 'alt' : ''}" style="--w:${Math.max(2, (i.value / max) * 100).toFixed(1)}%;--d:${n * 70}ms"></div></div>
      <span class="bar-val">${format(i.value)}</span>
    </div>`).join('')}</div>`;
}

/* Donut: segments = [{label, value, color}] */
export function donut(segments, centerBig, centerSmall) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  let offset = 0;
  const arcs = segments.map((s) => {
    const p = (s.value / total) * 100;
    const el = `<circle class="seg" cx="21" cy="21" r="15.9155" stroke="${s.color}" style="stroke-dasharray:${p} ${100 - p};stroke-dashoffset:${25 - offset}"/>`;
    offset += p;
    return el;
  }).join('');
  return `<div class="donut"><svg viewBox="0 0 42 42" role="img" aria-label="${esc(centerBig)} ${esc(centerSmall || '')}">
    <circle class="track" cx="21" cy="21" r="15.9155"/>${arcs}</svg>
    <div class="donut-center"><b>${esc(centerBig)}</b><span>${esc(centerSmall || '')}</span></div></div>`;
}

/* Progress ring: pct 0-100 */
export function ring(pct, label = '') {
  const p = Math.max(0, Math.min(100, pct || 0));
  return `<div class="ring"><svg viewBox="0 0 42 42" aria-hidden="true">
    <circle class="track" cx="21" cy="21" r="15.9155"/>
    <circle class="seg" cx="21" cy="21" r="15.9155" stroke="var(--c1)" style="stroke-dasharray:${p} ${100 - p};stroke-dashoffset:25"/></svg>
    <div class="ring-center"><b>${Math.round(p)}%</b><span>${esc(label)}</span></div></div>`;
}
