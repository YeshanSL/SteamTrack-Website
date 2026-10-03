/* SteamTrack: API client with memory + localStorage caching */
const BASE = window.STEAMTRACK_API || '/api';
const LS = 'st:c:';
const mem = new Map();
const inflight = new Map();

export class ApiError extends Error {
  constructor(code, message, status = 0) { super(message); this.code = code; this.status = status; }
}

function lsGet(k) {
  try { const v = JSON.parse(localStorage.getItem(LS + k)); if (v && v.exp > Date.now()) return v.val; } catch { /* ignore */ }
  return undefined;
}
function lsSet(k, val, ttl) {
  try {
    const s = JSON.stringify({ val, exp: Date.now() + ttl });
    if (s.length < 150000) localStorage.setItem(LS + k, s);
  } catch {
    try { Object.keys(localStorage).filter((x) => x.startsWith(LS)).forEach((x) => localStorage.removeItem(x)); } catch { /* ignore */ }
  }
}

export async function get(path, params = {}, { ttl = 300000, force = false } = {}) {
  const qs = new URLSearchParams(params).toString();
  const key = `${path}?${qs}`;
  if (!force) {
    const m = mem.get(key);
    if (m && m.exp > Date.now()) return m.val;
    const l = lsGet(key);
    if (l !== undefined) { mem.set(key, { val: l, exp: Date.now() + ttl }); return l; }
    if (inflight.has(key)) return inflight.get(key);
  }
  const p = (async () => {
    let res;
    try { res = await fetch(`${BASE}/${path}?${qs}`); }
    catch { throw new ApiError('network', 'Cannot reach the SteamTrack server. Check your connection and try again.'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(data.error || 'error', data.message || 'Request failed.', res.status);
    mem.set(key, { val: data, exp: Date.now() + ttl });
    lsSet(key, data, ttl);
    return data;
  })();
  inflight.set(key, p);
  try { return await p; } finally { inflight.delete(key); }
}

export const resolve = (vanity) => get('resolve', { vanity }, { ttl: 3600000 }).then((d) => d.steamid);
export const summary = (steamid, o) => get('summary', { steamid }, { ttl: 120000, ...o });
export const owned = (steamid, o) => get('owned-games', { steamid }, { ttl: 600000, ...o });
export const recent = (steamid, o) => get('recent', { steamid }, { ttl: 300000, ...o });
export const level = (steamid, o) => get('level', { steamid }, { ttl: 1800000, ...o });
export const badges = (steamid, o) => get('badges', { steamid }, { ttl: 1800000, ...o });
export const friends = (steamid, o) => get('friends', { steamid }, { ttl: 45000, ...o });
export const friendsStats = (steamid, o) => get('friends-stats', { steamid }, { ttl: 600000, ...o });
export const friendsGame = (steamid, appid, o) => get('friends-game', { steamid, appid }, { ttl: 600000, ...o });
export const achievements = (steamid, appid, o) => get('achievements', { steamid, appid }, { ttl: 900000, ...o });
export const playerCount = (appid, o) => get('player-count', { appid }, { ttl: 60000, ...o });
export const trending = (o) => get('trending', {}, { ttl: 60000, ...o });
export const wishlist = (steamid, o) => get('wishlist', { steamid }, { ttl: 1800000, ...o });
export const gameBoards = (appid, lbid, o) => get('game-leaderboards', lbid ? { appid, lbid } : { appid }, { ttl: 600000, ...o });
export const home = (o) => get('home', {}, { ttl: 60000, ...o });
export const leaderboard = (metric, o) => get('leaderboard', { metric }, { ttl: 120000, ...o });
