/**
 * SteamTrack backend proxy
 * - Keeps the Steam Web API key private (env var, never sent to the browser)
 * - Validates input, caches responses, rate limits per IP, adds CORS
 * - Serves the static frontend from /public
 */
import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEY = process.env.STEAM_API_KEY;
const PORT = Number(process.env.PORT) || 3000;
const MAX_FRIENDS = Number(process.env.MAX_FRIENDS) || 60;
const RATE_LIMIT = Number(process.env.RATE_LIMIT_PER_MIN) || 120;
const API = 'https://api.steampowered.com';

if (!KEY || KEY.startsWith('PASTE_')) {
  console.warn('! STEAM_API_KEY is missing. Copy .env.example to .env and add your key.');
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

/* ───────── CORS ───────── */
app.use('/api', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

/* ───────── Rate limiting (per IP, in memory) ───────── */
const hits = new Map();
app.use('/api', (req, res, next) => {
  const now = Date.now();
  let h = hits.get(req.ip);
  if (!h || now > h.reset) { h = { count: 0, reset: now + 60_000 }; hits.set(req.ip, h); }
  if (++h.count > RATE_LIMIT) {
    res.setHeader('Retry-After', Math.ceil((h.reset - now) / 1000));
    return res.status(429).json({ error: 'rate_limited', message: 'Too many requests. Please slow down.' });
  }
  next();
});

/* ───────── Cache (stores promises so concurrent requests are shared) ───────── */
const cache = new Map();
function cached(key, ttl, fn) {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.val;
  const val = fn();
  cache.set(key, { val, exp: Date.now() + ttl });
  val.catch(() => cache.delete(key));
  return val;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of cache) if (v.exp < now) cache.delete(k);
  for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  if (cache.size > 4000) [...cache.keys()].slice(0, 1000).forEach((k) => cache.delete(k));
}, 5 * 60_000).unref();

/* ───────── Steam helpers ───────── */
class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

async function steam(url) {
  let r;
  try { r = await fetch(url, { signal: AbortSignal.timeout(12_000), headers: { Accept: 'application/json' } }); }
  catch { throw new ApiError(502, 'network', 'Could not reach Steam. Try again in a moment.'); }
  if (r.status === 429) throw new ApiError(429, 'rate_limited', 'Steam is rate limiting requests. Try again shortly.');
  if (r.status === 401 || r.status === 403) throw new ApiError(403, 'private', 'This data is private.');
  if (r.status === 400) throw new ApiError(404, 'no_data', 'No data available for this request.');
  if (r.status === 404) throw new ApiError(404, 'not_found', 'Not found.');
  if (!r.ok) throw new ApiError(502, 'steam_error', `Steam returned an error (${r.status}).`);
  const text = await r.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { throw new ApiError(502, 'steam_error', 'Steam returned an unreadable response.'); }
}

function call(iface, method, version, params = {}, { key = true } = {}) {
  if (key && (!KEY || KEY.startsWith('PASTE_'))) throw new ApiError(500, 'config', 'Server is missing STEAM_API_KEY.');
  const q = new URLSearchParams({ ...(key ? { key: KEY } : {}), format: 'json', ...params });
  return steam(`${API}/${iface}/${method}/v${version}/?${q}`);
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const n = i++; out[n] = await fn(items[n], n); }
  }));
  return out;
}

const isId = (v) => /^\d{17}$/.test(v || '');
const isApp = (v) => /^\d{1,9}$/.test(v || '');
const isVanity = (v) => /^[A-Za-z0-9_-]{2,32}$/.test(v || '');
const badReq = (m) => new ApiError(400, 'bad_request', m);

const slimPlayer = (p) => ({
  steamid: p.steamid,
  name: p.personaname,
  realname: p.realname || null,
  avatar: p.avatarfull || p.avatarmedium || p.avatar,
  profileurl: p.profileurl,
  state: p.personastate ?? 0,
  visibility: p.communityvisibilitystate ?? 1,
  game: p.gameextrainfo || null,
  gameid: p.gameid || null,
  country: p.loccountrycode || null,
  created: p.timecreated || null,
  lastlogoff: p.lastlogoff || null,
});

async function summaries(ids) {
  const batches = [];
  for (let i = 0; i < ids.length; i += 100) batches.push(ids.slice(i, i + 100));
  const res = await Promise.all(batches.map((b) =>
    call('ISteamUser', 'GetPlayerSummaries', 2, { steamids: b.join(',') }).then((d) => d.response?.players || [])));
  return res.flat().map(slimPlayer);
}

/* Owned games (cached). Empty body from Steam = private game details. */
function ownedFor(id) {
  return cached(`og:${id}`, 10 * 60_000, async () => {
    const d = await call('IPlayerService', 'GetOwnedGames', 1, {
      steamid: id, include_appinfo: 1, include_played_free_games: 1,
    });
    const r = d.response || {};
    if (r.game_count === undefined && !r.games) return { private: true, games: [] };
    return {
      private: false,
      games: (r.games || []).map((g) => ({
        appid: g.appid, name: g.name || `App ${g.appid}`,
        playtime_forever: g.playtime_forever || 0,
        playtime_2weeks: g.playtime_2weeks || 0,
        rtime_last_played: g.rtime_last_played || 0,
      })),
    };
  });
}

function levelFor(id) {
  return cached(`lv:${id}`, 30 * 60_000, async () => {
    const d = await call('IPlayerService', 'GetSteamLevel', 1, { steamid: id });
    return d.response?.player_level ?? null;
  });
}

function friendSummaries(id) {
  return cached(`fs:${id}`, 45_000, async () => {
    const d = await call('ISteamUser', 'GetFriendList', 1, { steamid: id, relationship: 'friend' });
    const list = d.friendslist?.friends || [];
    const since = new Map(list.map((f) => [f.steamid, f.friend_since]));
    const players = await summaries(list.slice(0, 300).map((f) => f.steamid));
    return { total: list.length, friends: players.map((p) => ({ ...p, friend_since: since.get(p.steamid) || null })) };
  });
}

/* ───────── Route wrapper ───────── */
const route = (fn) => async (req, res) => {
  try {
    const data = await fn(req);
    res.setHeader('Cache-Control', 'public, max-age=20');
    res.json(data);
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500 && !(e instanceof ApiError)) console.error(e);
    res.status(status).json({ error: e.code || 'server_error', message: e instanceof ApiError ? e.message : 'Unexpected server error.' });
  }
};

const needId = (req) => { if (!isId(req.query.steamid)) throw badReq('Invalid steamid.'); return req.query.steamid; };
const needApp = (req) => { if (!isApp(req.query.appid)) throw badReq('Invalid appid.'); return req.query.appid; };

/* ───────── Endpoints ───────── */

// /api/resolve?vanity=NAME
app.get('/api/resolve', route(async (req) => {
  const v = req.query.vanity;
  if (!isVanity(v)) throw badReq('Invalid username.');
  return cached(`rv:${v.toLowerCase()}`, 60 * 60_000, async () => {
    const d = await call('ISteamUser', 'ResolveVanityURL', 1, { vanityurl: v });
    if (d.response?.success !== 1) throw new ApiError(404, 'not_found', 'No Steam user found with that custom URL.');
    return { steamid: d.response.steamid };
  });
}));

// /api/summary?steamid=ID
app.get('/api/summary', route(async (req) => {
  const id = needId(req);
  return cached(`sm:${id}`, 60_000, async () => {
    const [p] = await summaries([id]);
    if (!p) throw new ApiError(404, 'not_found', 'No Steam user found with that ID.');
    return { player: p };
  });
}));

// /api/owned-games?steamid=ID
app.get('/api/owned-games', route(async (req) => ownedFor(needId(req))));

// /api/recent?steamid=ID
app.get('/api/recent', route(async (req) => {
  const id = needId(req);
  return cached(`rc:${id}`, 5 * 60_000, async () => {
    const d = await call('IPlayerService', 'GetRecentlyPlayedGames', 1, { steamid: id, count: 12 });
    return { games: (d.response?.games || []).map((g) => ({
      appid: g.appid, name: g.name, playtime_forever: g.playtime_forever || 0, playtime_2weeks: g.playtime_2weeks || 0,
    })) };
  });
}));

// /api/level?steamid=ID
app.get('/api/level', route(async (req) => ({ level: await levelFor(needId(req)) })));

// /api/badges?steamid=ID
app.get('/api/badges', route(async (req) => {
  const id = needId(req);
  return cached(`bd:${id}`, 30 * 60_000, async () => {
    const r = (await call('IPlayerService', 'GetBadges', 1, { steamid: id })).response || {};
    return {
      level: r.player_level ?? null, xp: r.player_xp ?? null,
      xpToNext: r.player_xp_needed_to_level_up ?? null,
      xpCurrentLevel: r.player_xp_needed_current_level ?? null,
      badgeCount: (r.badges || []).length,
    };
  });
}));

// /api/friends?steamid=ID  (summaries only; fast, used for the live online panel)
app.get('/api/friends', route(async (req) => friendSummaries(needId(req))));

// /api/friends-stats?steamid=ID  (playtime, games, level for each friend)
app.get('/api/friends-stats', route(async (req) => {
  const id = needId(req);
  return cached(`fst:${id}`, 10 * 60_000, async () => {
    const { friends, total } = await friendSummaries(id);
    const pub = friends.filter((f) => f.visibility === 3);
    const pool = pub.slice(0, MAX_FRIENDS);
    const rows = await mapLimit(pool, 6, async (f) => {
      const [og, lv] = await Promise.allSettled([ownedFor(f.steamid), levelFor(f.steamid)]);
      const o = og.status === 'fulfilled' && !og.value.private ? og.value.games : null;
      return {
        ...f,
        games: o ? o.length : null,
        minutes: o ? o.reduce((a, g) => a + g.playtime_forever, 0) : null,
        recent: o ? o.reduce((a, g) => a + g.playtime_2weeks, 0) : null,
        level: lv.status === 'fulfilled' ? lv.value : null,
        private: !o,
      };
    });
    return { friends: rows, total, analysed: rows.length, privateProfiles: friends.length - pub.length };
  });
}));

// /api/friends-game?steamid=ID&appid=APPID  (friends ranked by playtime in one game)
app.get('/api/friends-game', route(async (req) => {
  const id = needId(req); const appid = Number(needApp(req));
  const { friends } = await friendSummaries(id);
  const pool = friends.filter((f) => f.visibility === 3).slice(0, MAX_FRIENDS);
  const rows = await mapLimit(pool, 6, async (f) => {
    try {
      const og = await ownedFor(f.steamid);
      const g = og.games.find((x) => x.appid === appid);
      return { steamid: f.steamid, name: f.name, avatar: f.avatar, state: f.state, game: f.game, minutes: og.private ? null : (g?.playtime_forever ?? 0) };
    } catch { return { steamid: f.steamid, name: f.name, avatar: f.avatar, state: f.state, game: f.game, minutes: null }; }
  });
  return { friends: rows.filter((r) => r.minutes > 0).sort((a, b) => b.minutes - a.minutes) };
}));

// /api/achievements?steamid=ID&appid=APPID
app.get('/api/achievements', route(async (req) => {
  const id = needId(req); const appid = needApp(req);
  return cached(`ac:${id}:${appid}`, 15 * 60_000, async () => {
    let player;
    try {
      player = (await call('ISteamUserStats', 'GetPlayerAchievements', 1, { steamid: id, appid, l: 'english' })).playerstats;
    } catch (e) {
      if (e.code === 'no_data') return { available: false, reason: 'no_stats' };
      throw e;
    }
    if (!player || player.success === false || !player.achievements?.length) return { available: false, reason: 'no_achievements' };
    let rarity = new Map();
    try {
      const g = await call('ISteamUserStats', 'GetGlobalAchievementPercentagesForApp', 2, { gameid: appid }, { key: false });
      rarity = new Map((g.achievementpercentages?.achievements || []).map((a) => [a.name, Number(a.percent)]));
    } catch { /* rarity is optional */ }
    const list = player.achievements.map((a) => ({
      id: a.apiname, name: a.name || a.apiname, desc: a.description || '',
      achieved: !!a.achieved, unlocktime: a.unlocktime || 0, rarity: rarity.has(a.apiname) ? rarity.get(a.apiname) : null,
    }));
    return { available: true, game: player.gameName || null, total: list.length, unlocked: list.filter((a) => a.achieved).length, achievements: list };
  });
}));

// /api/player-count?appid=APPID
app.get('/api/player-count', route(async (req) => {
  const appid = needApp(req);
  return cached(`pc:${appid}`, 60_000, async () => {
    const d = await call('ISteamUserStats', 'GetNumberOfCurrentPlayers', 1, { appid }, { key: false });
    return { appid: Number(appid), players: d.response?.result === 1 ? d.response.player_count : null };
  });
}));

// /api/trending  (live player counts for popular games)
const POPULAR = [
  [730, 'Counter-Strike 2'], [570, 'Dota 2'], [578080, 'PUBG: BATTLEGROUNDS'], [1172470, 'Apex Legends'],
  [271590, 'Grand Theft Auto V'], [252490, 'Rust'], [440, 'Team Fortress 2'], [1091500, 'Cyberpunk 2077'],
  [1245620, 'ELDEN RING'], [105600, 'Terraria'], [359550, "Tom Clancy's Rainbow Six Siege"], [1086940, "Baldur's Gate 3"],
];
app.get('/api/trending', route(async () => cached('trending', 60_000, async () => {
  const rows = await Promise.all(POPULAR.map(async ([appid, name]) => {
    try {
      const d = await call('ISteamUserStats', 'GetNumberOfCurrentPlayers', 1, { appid }, { key: false });
      return { appid, name, players: d.response?.player_count ?? 0 };
    } catch { return { appid, name, players: 0 }; }
  }));
  rows.sort((a, b) => b.players - a.players);
  return { games: rows, total: rows.reduce((a, g) => a + g.players, 0), updated: Date.now() };
})));

// /api/wishlist?steamid=ID  (best effort: Steam may hide or change this)
app.get('/api/wishlist', route(async (req) => {
  const id = needId(req);
  return cached(`wl:${id}`, 30 * 60_000, async () => {
    try {
      const d = await call('IWishlistService', 'GetWishlist', 1, { steamid: id }, { key: false });
      const items = (d.response?.items || []).sort((a, b) => (b.date_added || 0) - (a.date_added || 0)).slice(0, 12);
      if (!items.length) return { available: false, items: [] };
      const named = await Promise.all(items.map(async (it) => {
        try {
          const r = await fetch(`https://store.steampowered.com/api/appdetails?appids=${it.appid}&filters=basic`, { signal: AbortSignal.timeout(8000) });
          const j = await r.json();
          return { appid: it.appid, name: j[it.appid]?.data?.name || `App ${it.appid}`, added: it.date_added || null };
        } catch { return { appid: it.appid, name: `App ${it.appid}`, added: it.date_added || null }; }
      }));
      return { available: true, items: named };
    } catch { return { available: false, items: [] }; }
  });
}));

// /api/game-leaderboards?appid=APPID[&lbid=ID]  (community leaderboards, only for games that expose them)
app.get('/api/game-leaderboards', route(async (req) => {
  const appid = needApp(req);
  const lbid = req.query.lbid;
  if (lbid !== undefined && !/^\d{1,10}$/.test(lbid)) throw badReq('Invalid lbid.');
  return cached(`lb:${appid}:${lbid || 'list'}`, 10 * 60_000, async () => {
    const get = async (u) => {
      const r = await fetch(u, { signal: AbortSignal.timeout(10_000) });
      if (!r.ok) throw new Error('x');
      return r.text();
    };
    const pick = (s, tag) => (s.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`)) || [])[1]?.trim();
    try {
      if (!lbid) {
        const xml = await get(`https://steamcommunity.com/stats/${appid}/leaderboards/?xml=1`);
        const boards = [...xml.matchAll(/<leaderboard>([\s\S]*?)<\/leaderboard>/g)].map((m) => ({
          id: pick(m[1], 'lbid'), name: pick(m[1], 'display_name') || pick(m[1], 'name'), entries: Number(pick(m[1], 'entries')) || 0,
        })).filter((b) => b.id).slice(0, 25);
        return { available: boards.length > 0, boards };
      }
      const xml = await get(`https://steamcommunity.com/stats/${appid}/leaderboards/${lbid}/?xml=1&start=1&end=25`);
      const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => ({
        steamid: pick(m[1], 'steamid'), score: Number(pick(m[1], 'score')), rank: Number(pick(m[1], 'rank')),
      })).filter((e) => isId(e.steamid));
      const players = entries.length ? await summaries(entries.map((e) => e.steamid)) : [];
      const byId = new Map(players.map((p) => [p.steamid, p]));
      return { available: entries.length > 0, entries: entries.map((e) => ({ ...e, name: byId.get(e.steamid)?.name || e.steamid, avatar: byId.get(e.steamid)?.avatar || null })) };
    } catch { return { available: false, boards: [], entries: [] }; }
  });
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'not_found', message: 'Unknown endpoint.' }));

/* ───────── Static frontend ───────── */
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], maxAge: '1h' }));

app.listen(PORT, () => console.log(`SteamTrack running on http://localhost:${PORT}`));
