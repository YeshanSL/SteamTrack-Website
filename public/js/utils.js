/* SteamTrack: shared helpers */
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

/* Formatting */
export const fmt = (n) => (n == null || isNaN(n) ? '–' : Math.round(n).toLocaleString());
export const hrs = (min) => {
  if (min == null || isNaN(min)) return '–';
  const h = min / 60;
  return h.toLocaleString(undefined, { maximumFractionDigits: h >= 100 ? 0 : 1 }) + 'h';
};
export function ago(ts) {
  if (!ts) return 'unknown';
  const s = Math.max(1, Date.now() / 1000 - ts);
  const u = [[31557600, 'year'], [2629800, 'month'], [86400, 'day'], [3600, 'hour'], [60, 'minute']];
  for (const [n, l] of u) if (s >= n) { const v = Math.floor(s / n); return `${v} ${l}${v > 1 ? 's' : ''} ago`; }
  return 'just now';
}
export function accountAge(ts) {
  if (!ts) return null;
  const y = (Date.now() / 1000 - ts) / 31557600;
  if (y >= 1) return `${y.toFixed(1)} years on Steam`;
  const m = Math.max(1, Math.floor(y * 12));
  return `${m} month${m > 1 ? 's' : ''} on Steam`;
}
export const flag = (cc) => (cc && /^[A-Za-z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 127397 + c.charCodeAt(0))) : '');
export function countryName(cc) {
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(cc.toUpperCase()); } catch { return cc; }
}
export const steamImg = (appid) => `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg`;

/* Presence status from a slim player object */
export function statusOf(p) {
  if (p.game) return { key: 'ingame', label: 'In-game' };
  switch (p.state) {
    case 0: return { key: 'offline', label: 'Offline' };
    case 1: case 5: case 6: return { key: 'online', label: 'Online' };
    case 2: return { key: 'busy', label: 'Busy' };
    case null: case undefined: return { key: 'offline', label: 'Unknown' };
    default: return { key: 'away', label: 'Away' };
  }
}

/* Input detection: username, SteamID64 or profile URL */
export function parseInput(raw) {
  const v = String(raw || '').trim();
  if (!v) return null;
  if (/^7656119\d{10}$/.test(v)) return { type: 'id', value: v, label: 'SteamID64' };
  let m = v.match(/steamcommunity\.com\/profiles\/(7656119\d{10})/i);
  if (m) return { type: 'id', value: m[1], label: 'profile URL (SteamID64)' };
  m = v.match(/steamcommunity\.com\/id\/([A-Za-z0-9_-]{2,32})/i);
  if (m) return { type: 'vanity', value: m[1], label: 'profile URL (custom name)' };
  if (/^[A-Za-z0-9_-]{2,32}$/.test(v)) return { type: 'vanity', value: v, label: 'custom URL name' };
  return null;
}

/* localStorage helpers */
export const store = {
  get(k, d) { try { const v = localStorage.getItem('st:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('st:' + k, JSON.stringify(v)); } catch { /* storage full or blocked */ } },
};

/* Toasts */
export function toast(msg, type = 'info') {
  const box = $('#toasts');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3200);
}

/* Animated number counter */
export function countUp(el, to, { decimals = 0, duration = 1200, suffix = '' } = {}) {
  const show = (v) => { el.textContent = v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix; };
  if (reduceMotion() || !isFinite(to)) return show(to || 0);
  const t0 = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - t0) / duration);
    show(to * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
