/* SteamTrack: app controller */
import * as api from './api.js';
import { $, $$, esc, fmt, hrs, debounce, store, toast, countUp, parseInput, downloadBlob, statusOf, reduceMotion, flag } from './utils.js';
import * as ui from './ui.js';
import { runLoader } from './loader.js';
import { startBackground } from './bg.js';
import { startFx } from './fx.js';

let token = 0;
const S = {};
const METRICS = {
  minutes: { label: 'Total playtime', fmt: hrs, get: (p) => p.minutes },
  games: { label: 'Games owned', fmt, get: (p) => p.games },
  level: { label: 'Steam level', fmt, get: (p) => p.level },
  recent: { label: 'Last 2 weeks', fmt: hrs, get: (p) => p.recent },
};

function resetState() {
  clearInterval(S.poll);
  Object.assign(S, {
    id: null, player: null, games: null, ownedPrivate: false, ownedErr: null, recent: [], level: null, badges: null, stats: null,
    friendPromise: null, friendStats: null, achPromise: null, ach: null, metric: 'minutes', poll: null, filter: '', inited: {}, tab: 'overview', raw: '',
  });
}
resetState();

/* ───────── views ───────── */
const VIEWS = ['home', 'stats', 'leaderboard', 'compare'];
function showView(name) {
  VIEWS.forEach((v) => { $(`#view-${v}`).hidden = v !== name; });
  $$('.nav-btn[data-nav]').forEach((b) => b.classList.toggle('active', b.dataset.nav === name));
  if (name !== 'stats') clearInterval(S.poll);
  if (name === 'stats') $('#statsLanding').hidden = !!S.raw;
  window.scrollTo({ top: 0 });
}
function goTo(name) {
  if (name === 'home') { token++; history.pushState({}, '', location.pathname); document.title = 'SteamTrack | Steam Stats, Leaderboards & Rankings'; showView('home'); loadHome(); return; }
  if (name === 'stats') { history.pushState({}, '', S.player ? `?user=${encodeURIComponent(vanityOf(S.player) || S.id)}` : location.pathname); showView('stats'); renderChips(); if (!S.raw) $('#miniInput').focus(); return; }
  history.pushState({}, '', `?view=${name}`);
  showView(name);
  if (name === 'leaderboard') loadGlobalBoard();
}
const goHome = () => goTo('home');

/* ───────── home ───────── */
async function loadHome(force) {
  try {
    const d = await api.home({ force });
    S.homeData = d;
    $('#dash').innerHTML = ui.dashboardHTML(d, S.best || null);
    $$('#dash [data-count]').forEach((n) => countUp(n, +n.dataset.count));
    const hn = $('#heroNum'); if (hn) countUp(hn, d.summary.players.total);
    const ht = $('#heroTop'); if (ht && d.summary.players.top) ht.textContent = d.summary.players.top.name;
    const hg = $('#heroGames'); if (hg) hg.textContent = d.summary.players.games;
    $('#catGrid').innerHTML = ui.categoriesHTML(d.categories);
    $('#trendGrid').innerHTML = ui.trendCards(d.trending);
    const tk = $('#tickerIn');
    if (tk && d.trending?.length) { const h = d.trending.map((g) => `<span>${esc(g.name)} <b>${fmt(g.players)}</b> PLAYING</span>`).join(''); tk.innerHTML = h + h; }
    if (!S.best) api.leaderboard('level').then((b) => {
      S.best = b.players[0] || null;
      const c = $('#bestCard');
      if (!c) return;
      if (S.best) c.outerHTML = ui.bestCardHTML(S.best); else c.querySelector('.line').textContent = 'No ranking available yet.';
    }).catch(() => { const c = $('#bestCard'); if (c) c.querySelector('.line').textContent = 'No ranking available yet.'; });
  } catch (e) {
    $('#dash').innerHTML = `<div style="grid-column:1/-1">${ui.errorBox(e, 'trending')}</div>`;
    $('#catGrid').innerHTML = ''; $('#trendGrid').innerHTML = '';
  }
}
function renderChips() {
  const rec = store.get('recent', []), fav = store.get('favs', []);
  $('#recentWrap').hidden = !rec.length;
  $('#recentChips').innerHTML = rec.map(ui.chip).join('');
  $('#favWrap').hidden = !fav.length;
  $('#favChips').innerHTML = fav.map(ui.chip).join('');
}
function remember(p) {
  const rec = store.get('recent', []).filter((x) => x.steamid !== p.steamid);
  rec.unshift({ steamid: p.steamid, name: p.name, avatar: p.avatar });
  store.set('recent', rec.slice(0, 8));
}
const setHeroError = (m) => { const e = $('#heroError'); e.textContent = m || ''; e.hidden = !m; };

/* ───────── profile ───────── */
const vanityOf = (p) => (p.profileurl.match(/\/id\/([^/]+)/) || [])[1];
const isFav = () => store.get('favs', []).some((f) => f.steamid === S.id);

async function openProfile(raw, { push = true } = {}) {
  const parsed = parseInput(raw);
  if (!parsed) { if (!$('#view-stats').hidden) { const e = $('#statsError'); e.textContent = 'Enter a Steam username, a 17-digit SteamID64 or a steamcommunity.com profile URL.'; e.hidden = false; return; } showView('home'); setHeroError('Enter a Steam username, a 17-digit SteamID64 or a steamcommunity.com profile URL.'); return; }
  setHeroError('');
  $('#statsError').hidden = true;
  const my = ++token;
  resetState();
  S.raw = raw;
  showView('stats');
  $('#statsLanding').hidden = true;
  $$('.panel').forEach((p) => { p.innerHTML = ''; });
  $('#profileHead').innerHTML = ui.headSkeleton();
  $('#tab-overview').innerHTML = ui.overviewSkeleton();
  setTab('overview');
  try {
    const id = parsed.type === 'id' ? parsed.value : await api.resolve(parsed.value);
    if (my !== token) return;
    S.id = id;
    const { player } = await api.summary(id);
    if (my !== token) return;
    S.player = player;
    if (push) history.pushState({}, '', `?user=${encodeURIComponent(vanityOf(player) || id)}`);
    document.title = `${player.name} | SteamTrack`;
    remember(player);
    renderHead();
    const [og, rc, lv, bd] = await Promise.allSettled([api.owned(id), api.recent(id), api.level(id), api.badges(id)]);
    if (my !== token) return;
    if (og.status === 'fulfilled') { S.games = og.value.games || []; S.ownedPrivate = !!og.value.private; } else S.ownedErr = og.reason;
    S.recent = rc.status === 'fulfilled' ? rc.value.games || [] : [];
    S.level = lv.status === 'fulfilled' ? lv.value.level : null;
    S.badges = bd.status === 'fulfilled' ? bd.value : null;
    renderHead();
    renderOverview();
    if (S.games?.length) {
      loadFriendStats().then(() => updateVsFriends()).catch(() => updateVsFriends(true));
      loadAchievements().then(updateAchTiles).catch(() => updateAchTiles(true));
    } else updateVsFriends(true);
  } catch (e) {
    if (my !== token) return;
    $('#profileHead').innerHTML = '';
    $('#tab-overview').innerHTML = ui.errorBox(e, 'profile');
    $('#profileTabs').hidden = true;
    return;
  }
  $('#profileTabs').hidden = false;
}

function renderHead() {
  $('#profileTabs').hidden = false;
  $('#profileHead').innerHTML = ui.headHTML(S.player, { level: S.level, fav: isFav() });
}

function renderOverview() {
  const el = $('#tab-overview');
  if (S.ownedErr) { el.innerHTML = ui.errorBox(S.ownedErr, 'profile'); return; }
  if (S.ownedPrivate) { el.innerHTML = ui.privateNotice('game library'); return; }
  const g = S.games;
  if (!g.length) { el.innerHTML = ui.emptyBox('Empty library', 'This account has no games yet.'); return; }
  S.stats = {
    count: g.length,
    total: g.reduce((a, x) => a + (x.playtime_forever || 0), 0),
    twoWeek: g.reduce((a, x) => a + (x.playtime_2weeks || 0), 0),
    played: g.filter((x) => x.playtime_forever > 0).length,
  };
  el.innerHTML = ui.overviewHTML(S);
  $$('[data-count]', el).forEach((n) => countUp(n, +n.dataset.count, { decimals: +n.dataset.dec || 0, suffix: n.dataset.suffix || '' }));
  api.wishlist(S.id).then((d) => {
    const c = $('#wishlistCard');
    if (c && d.available && d.items.length) { c.innerHTML = ui.wishlistHTML(d.items); c.hidden = false; }
  }).catch(() => {});
}

/* ───────── friends data ───────── */
function loadFriendStats(force) {
  if (S.friendPromise && !force) return S.friendPromise;
  S.friendPromise = api.friendsStats(S.id, { force }).then((d) => { S.friendStats = d; return d; });
  S.friendPromise.catch(() => {});
  return S.friendPromise;
}

function updateVsFriends(err) {
  const el = $('#vsFriends');
  if (!el) return;
  if (err || !S.friendStats || !S.stats) { el.innerHTML = '<h3>You vs friends</h3><p class="muted">Friend comparison is unavailable (friends list is private or empty).</p>'; return; }
  const fr = S.friendStats.friends.filter((f) => f.minutes != null);
  if (!fr.length) { el.innerHTML = '<h3>You vs friends</h3><p class="muted">None of your friends share public game details.</p>'; return; }
  const avg = (k) => { const v = fr.map((f) => f[k]).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  el.innerHTML = ui.vsFriendsHTML([
    ['Total playtime', S.stats.total, avg('minutes'), hrs],
    ['Games owned', S.stats.count, avg('games'), fmt],
    ['Last 2 weeks', S.stats.twoWeek, avg('recent'), hrs],
    ['Steam level', S.level, avg('level'), fmt],
  ], fr.length);
}

/* ───────── achievements ───────── */
function loadAchievements() {
  if (S.achPromise) return S.achPromise;
  // Try up to 30 of the most played games and stop once 12 have achievement data (many games have none)
  const top = [...S.games].filter((g) => g.playtime_forever > 0).sort((a, b) => b.playtime_forever - a.playtime_forever).slice(0, 30);
  S.achPromise = (async () => {
    const out = []; let i = 0;
    const worker = async () => {
      while (i < top.length && out.length < 12) {
        const g = top[i++];
        for (let attempt = 0; attempt < 2; attempt++) {
          try { const a = await api.achievements(S.id, g.appid); if (a.available) out.push({ game: g, ...a }); break; }
          catch (e) { if (e.code === 'private' || attempt) break; await new Promise((r) => setTimeout(r, 700)); }
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    out.sort((x, y) => y.game.playtime_forever - x.game.playtime_forever);
    S.ach = out;
    return out;
  })();
  return S.achPromise;
}
function achTotals(list) {
  const total = list.reduce((a, x) => a + x.total, 0), unlocked = list.reduce((a, x) => a + x.unlocked, 0);
  return { total, unlocked, perfect: list.filter((x) => x.unlocked === x.total).length, avg: list.length ? list.reduce((a, x) => a + (x.unlocked / x.total) * 100, 0) / list.length : 0 };
}
function updateAchTiles(err) {
  const a = $('#t-ach'), p = $('#t-perfect'), v = $('#t-avg');
  if (!a) return;
  if (err || !S.ach?.length) { [a, p, v].forEach((n) => { n.textContent = 'n/a'; }); return; }
  const t = achTotals(S.ach);
  countUp(a, t.unlocked); countUp(p, t.perfect); countUp(v, t.avg, { suffix: '%' });
}
async function renderAchievements() {
  const el = $('#tab-achievements');
  if (S.ownedPrivate || !S.games?.length) { el.innerHTML = ui.privateNotice('game library'); return; }
  el.innerHTML = `<p class="muted">Reading achievements for the most played games...</p><div class="skel-col">${ui.skeleton(90)}${ui.skeleton(90)}</div>`;
  try { const list = await loadAchievements(); el.innerHTML = ui.achievementsHTML([...list], achTotals(list)); }
  catch (e) { el.innerHTML = ui.errorBox(e, 'ach'); }
}

/* ───────── friend leaderboard ───────── */
function buildBoard() {
  const m = METRICS[S.metric];
  const meVals = { minutes: S.stats?.total ?? null, games: S.stats?.count ?? null, recent: S.stats?.twoWeek ?? null, level: S.level };
  const me = { steamid: S.id, name: S.player.name, avatar: S.player.avatar, state: S.player.state, game: S.player.game, you: true, ...meVals };
  return [me, ...(S.friendStats?.friends || [])].map((p) => ({ ...p, value: m.get(p) })).filter((p) => p.value != null).sort((a, b) => b.value - a.value);
}

async function renderFriends() {
  const el = $('#tab-friends');
  el.innerHTML = ui.friendsShell();
  $('#metricSel').value = S.metric;
  $('#metricSel').addEventListener('change', (e) => { S.metric = e.target.value; drawBoard(true); });
  $('#lbFilter').addEventListener('input', debounce((e) => { S.filter = e.target.value.trim().toLowerCase(); drawBoard(false); }, 200));
  $('#lbCsv').addEventListener('click', exportCsv);
  $('#lbRefresh').addEventListener('click', async () => {
    $('#lbLoading').hidden = false; $('#lbContent').hidden = true;
    try { await loadFriendStats(true); drawBoard(false); } catch (e) { showBoardError(e); }
  });
  try { await loadFriendStats(); drawBoard(false); } catch (e) { showBoardError(e); }
}
function showBoardError(e) {
  const box = $('#lbLoading');
  if (!box) return;
  box.hidden = false;
  box.innerHTML = e.code === 'private' ? ui.privateNotice('friends list') : ui.errorBox(e, 'friends');
}
function drawBoard(animate) {
  if (!$('#lbList')) return;
  $('#lbLoading').hidden = true; $('#lbContent').hidden = false;
  const m = METRICS[S.metric], ranked = buildBoard();
  const list = $('#lbList');
  const first = animate ? new Map($$('.lb-row', list).map((r) => [r.dataset.id, r.getBoundingClientRect().top])) : null;
  $('#podium').innerHTML = ui.podium(ranked.slice(0, 3), m);
  $('#myPos').innerHTML = ui.myPosition(ranked, m);
  const max = ranked[0]?.value || 1;
  const rows = ranked.map((p, i) => ({ ...p, rank: i + 1 })).filter((p) => !S.filter || p.name.toLowerCase().includes(S.filter));
  list.innerHTML = rows.length ? rows.map((p) => ui.lbRow(p, m, max)).join('') : ui.emptyBox('No matches', 'No friends match your filter.');
  if (first && !reduceMotion()) {
    $$('.lb-row', list).forEach((r) => {
      const prev = first.get(r.dataset.id);
      if (prev == null) return;
      const dy = prev - r.getBoundingClientRect().top;
      if (dy) r.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 550, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
  }
  const fs = S.friendStats;
  const hidden = (fs.privateProfiles || 0) + fs.friends.filter((f) => f.private).length;
  const extra = fs.total > fs.analysed + (fs.privateProfiles || 0) ? ` Showing the first ${fs.analysed} public friends of ${fs.total}.` : '';
  $('#lbNote').textContent = `${hidden ? hidden + ' friends are hidden (private profile or game details). ' : ''}${extra}`;
}
function exportCsv() {
  if (!S.friendStats) return;
  const m = METRICS[S.metric];
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = ['rank,name,steamid,' + q(m.label)].concat(buildBoard().map((p, i) => [i + 1, q(p.name), p.steamid, S.metric === 'minutes' || S.metric === 'recent' ? (p.value / 60).toFixed(1) : p.value].join(',')));
  downloadBlob(new Blob([lines.join('\n')], { type: 'text/csv' }), `steamtrack-${S.player.name}-${S.metric}.csv`);
  toast('Leaderboard exported', 'ok');
}

/* ───────── online friends (polls every 60s) ───────── */
function renderOnline() {
  const el = $('#tab-online');
  el.innerHTML = ui.onlineShell();
  $('#onlineRefresh').addEventListener('click', () => loadOnline(true));
  loadOnline(false);
}
async function loadOnline(force) {
  const body = $('#onlineBody');
  if (!body) return;
  try {
    const d = await api.friends(S.id, { force });
    S.friendsLive = d;
    body.innerHTML = ui.onlineHTML(d.friends);
    $('#onlineUpdated').textContent = `Updated ${new Date().toLocaleTimeString()} · auto-refresh every 60s`;
  } catch (e) { body.innerHTML = e.code === 'private' ? ui.privateNotice('friends list') : ui.errorBox(e, 'online'); }
}
function startPoll() {
  clearInterval(S.poll);
  S.poll = setInterval(() => { if (!document.hidden && S.tab === 'online') loadOnline(true); }, 60000);
}

/* ───────── game board ───────── */
function renderGameBoard() {
  const el = $('#tab-gameboard');
  if (S.ownedPrivate || !S.games?.length) { el.innerHTML = ui.privateNotice('game library'); return; }
  el.innerHTML = ui.gameBoardShell(S.games);
  $('#gbSel').addEventListener('change', (e) => e.target.value && loadGameBoard(e.target.value));
  $('#gbFilter').addEventListener('input', debounce((e) => {
    const q = e.target.value.trim().toLowerCase();
    $$('#gbSel option').forEach((o, i) => { if (i) o.hidden = q && !o.textContent.toLowerCase().includes(q); });
  }, 200));
}
async function loadGameBoard(appid) {
  const out = $('#gbOut');
  out.innerHTML = `<div class="skel-col">${ui.skeleton(80)}${ui.skeleton(260)}</div>`;
  const g = S.games.find((x) => String(x.appid) === String(appid));
  const [pc, fg, lb] = await Promise.allSettled([api.playerCount(appid), api.friendsGame(S.id, appid), api.gameBoards(appid)]);
  if (!$('#gbOut') || $('#gbSel').value !== String(appid)) return;
  out.innerHTML = ui.gameBoardHTML({ appid, title: g?.name || 'Game', pc, fg, lb, me: S.player, myMinutes: g?.playtime_forever || 0 });
}

/* ───────── tabs ───────── */
function setTab(name) {
  S.tab = name;
  $$('.tab').forEach((t) => { const on = t.dataset.tab === name; t.classList.toggle('active', on); t.setAttribute('aria-selected', on); });
  $$('.panel').forEach((p) => { p.hidden = p.id !== `tab-${name}`; });
  if (name !== 'online') clearInterval(S.poll);
}
function switchTab(name) {
  if (!S.player) return;
  setTab(name);
  if (name === 'online') startPoll();
  if (S.inited[name] || name === 'overview') return;
  S.inited[name] = true;
  ({ friends: renderFriends, online: renderOnline, achievements: renderAchievements, gameboard: renderGameBoard })[name]?.();
}

/* ───────── modal ───────── */
let lastFocus;
function openModal(html) {
  lastFocus = document.activeElement;
  $('#modalBody').innerHTML = html;
  $('#modal').hidden = false;
  document.body.style.overflow = 'hidden';
  $('#modalClose').focus();
}
function closeModal() {
  $('#modal').hidden = true;
  document.body.style.overflow = '';
  lastFocus?.focus?.();
}
async function openGame(appid, name) {
  const g = S.games?.find((x) => String(x.appid) === String(appid));
  openModal(ui.gameModalHTML({ appid, title: g?.name || name || `App ${appid}`, g }));
  api.playerCount(appid).then((d) => { const e = $('#gmPlayers'); if (e) e.textContent = d.players != null ? fmt(d.players) : 'n/a'; }).catch(() => { const e = $('#gmPlayers'); if (e) e.textContent = 'n/a'; });
  if (S.id && g) {
    try { const a = await api.achievements(S.id, appid); const e = $('#gmAch'); if (e) e.innerHTML = ui.achListHTML(a); }
    catch (err) { const e = $('#gmAch'); if (e) e.innerHTML = `<p class="muted">${err.code === 'private' ? 'Achievements are private. Set Game details to Public on Steam.' : esc(err.message)}</p>`; }
  }
}

/* ───────── favourites, share, copy ───────── */
function toggleFav() {
  let favs = store.get('favs', []);
  if (isFav()) { favs = favs.filter((f) => f.steamid !== S.id); toast('Removed from tracked players'); }
  else { favs.unshift({ steamid: S.id, name: S.player.name, avatar: S.player.avatar }); toast('Player tracked', 'ok'); }
  store.set('favs', favs.slice(0, 30));
  renderHead();
}
function openFavs() {
  const favs = store.get('favs', []);
  openModal(`<h2 id="modalTitle">Tracked players</h2>${favs.length ? `<div class="grid-3">${favs.map((f) => `<div class="fcard" data-open="${f.steamid}"><div class="avatar-wrap sm"><img src="${esc(f.avatar)}" alt=""></div><div class="f-main"><b>${esc(f.name)}</b></div><button class="btn sm ghost" data-fav-remove="${f.steamid}" type="button">Remove</button></div>`).join('')}</div>` : '<p class="muted">No tracked players yet. Open a profile and press Track.</p>'}`);
}
async function copyLink() {
  const url = `${location.origin}${location.pathname}?user=${encodeURIComponent(vanityOf(S.player) || S.id)}`;
  try { await navigator.clipboard.writeText(url); toast('Link copied', 'ok'); } catch { prompt('Copy this link:', url); }
}
async function shareCard() {
  const p = S.player;
  const cv = document.createElement('canvas'); cv.width = 1200; cv.height = 630;
  const x = cv.getContext('2d');
  const css = getComputedStyle(document.documentElement);
  const c1 = css.getPropertyValue('--c1').trim() || '#ff2a2a';
  try { await document.fonts.load('700 64px "Chakra Petch"'); await document.fonts.load('700 30px Barlow'); } catch { /* fonts optional */ }
  const bg = x.createLinearGradient(0, 0, 1200, 630); bg.addColorStop(0, '#050505'); bg.addColorStop(1, '#1a0000');
  x.fillStyle = bg; x.fillRect(0, 0, 1200, 630);
  x.strokeStyle = 'rgba(255,255,255,.06)'; x.lineWidth = 1;
  for (let i = 0; i < 1200; i += 40) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 630); x.stroke(); }
  for (let i = 0; i < 630; i += 40) { x.beginPath(); x.moveTo(0, i); x.lineTo(1200, i); x.stroke(); }
  x.fillStyle = '#fff'; x.font = '700 44px "Chakra Petch", sans-serif'; x.fillText('STEAMTRACK', 60, 90);
  const img = await new Promise((r) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => r(i); i.onerror = () => r(null); i.src = p.avatar; });
  x.save(); x.beginPath(); x.arc(170, 270, 90, 0, 6.283); x.clip();
  if (img) x.drawImage(img, 80, 180, 180, 180); else { x.fillStyle = '#222'; x.fillRect(80, 180, 180, 180); }
  x.restore();
  x.lineWidth = 6; x.strokeStyle = c1; x.beginPath(); x.arc(170, 270, 93, 0, 6.283); x.stroke();
  x.fillStyle = '#fff'; x.font = '700 56px Barlow, sans-serif'; x.fillText(p.name.slice(0, 22), 300, 255);
  x.fillStyle = '#8d8d8d'; x.font = '600 28px Barlow, sans-serif';
  x.fillText(`${S.level != null ? 'Level ' + S.level + '  ·  ' : ''}${statusOf(p).label}`, 300, 300);
  const stats = [['GAMES', S.stats ? fmt(S.stats.count) : '–'], ['HOURS PLAYED', S.stats ? fmt(S.stats.total / 60) : '–'], ['LAST 2 WEEKS', S.stats ? hrs(S.stats.twoWeek) : '–']];
  stats.forEach(([l, v], i) => {
    const bx = 60 + i * 370;
    x.fillStyle = 'rgba(255,255,255,.05)'; x.strokeStyle = 'rgba(255,42,42,.6)'; x.lineWidth = 2;
    x.beginPath(); x.roundRect(bx, 430, 340, 140, 18); x.fill(); x.stroke();
    x.fillStyle = '#8d8d8d'; x.font = '600 22px Barlow, sans-serif'; x.fillText(l, bx + 28, 475);
    x.fillStyle = c1; x.font = '700 52px "Chakra Petch", sans-serif'; x.fillText(v, bx + 28, 538);
  });
  cv.toBlob((b) => { if (b) { downloadBlob(b, `steamtrack-${p.name}.png`); toast('Share card saved', 'ok'); } else toast('Could not create image', 'error'); }, 'image/png');
}

/* ───────── global leaderboard ───────── */
const GM = { level: { label: 'Steam level', fmt }, minutes: { label: 'Total playtime', fmt: hrs }, games: { label: 'Games owned', fmt }, recent: { label: 'Last 2 weeks', fmt: hrs } };
async function loadGlobalBoard(force) {
  const metric = $('#gMetric').value, body = $('#gbBody');
  body.innerHTML = `<div class="skel-col">${ui.skeleton(120)}${ui.skeleton(64)}${ui.skeleton(64)}${ui.skeleton(64)}</div>`;
  try { const d = await api.leaderboard(metric, { force }); if ($('#gMetric').value === metric) body.innerHTML = ui.globalBoard(d, GM[metric]); }
  catch (e) { body.innerHTML = ui.errorBox(e, 'gboard'); }
}
async function addToBoard() {
  const p = parseInput($('#addInput').value);
  if (!p) { toast('Enter a valid username, SteamID64 or profile URL', 'error'); return; }
  try {
    const id = p.type === 'id' ? p.value : await api.resolve(p.value);
    const { player } = await api.summary(id);
    if (player.visibility !== 3) { toast(`${player.name} has a private profile, so it cannot be ranked`, 'error'); return; }
    $('#addInput').value = '';
    toast(`${player.name} added to the board`, 'ok');
    api.get('leaderboard', { metric: $('#gMetric').value }, { force: true }).catch(() => {});
    loadGlobalBoard(true);
  } catch (e) { toast(e.message || 'Could not add that player', 'error'); }
}

/* ───────── compare ───────── */
async function runCompare() {
  const a = parseInput($('#cmpA').value), b = parseInput($('#cmpB').value);
  const err = $('#cmpError'), out = $('#cmpResult');
  if (!a || !b) { err.textContent = 'Enter a valid username, SteamID64 or profile URL for both players.'; err.hidden = false; return; }
  err.hidden = true;
  out.innerHTML = `<div class="skel-col">${ui.skeleton(120)}${ui.skeleton(300)}</div>`;
  const load = async (p) => {
    const id = p.type === 'id' ? p.value : await api.resolve(p.value);
    const [s, o, l] = await Promise.allSettled([api.summary(id), api.owned(id), api.level(id)]);
    if (s.status !== 'fulfilled') throw s.reason;
    return { id, player: s.value.player, games: o.status === 'fulfilled' && !o.value.private ? o.value.games : null, level: l.status === 'fulfilled' ? l.value.level : null };
  };
  try { const [A, B] = await Promise.all([load(a), load(b)]); out.innerHTML = ui.compareHTML(A, B); }
  catch (e) { out.innerHTML = ui.errorBox(e, 'compare'); }
}

/* ───────── events ───────── */
function bindGlobal() {
  $('#heroForm').addEventListener('submit', (e) => { e.preventDefault(); openProfile($('#heroInput').value); });
  $('#miniForm').addEventListener('submit', (e) => { e.preventDefault(); openProfile($('#miniInput').value); $('#miniInput').value = ''; });
  $('#cmpForm').addEventListener('submit', (e) => { e.preventDefault(); runCompare(); });
  $('#heroInput').addEventListener('input', debounce((e) => {
    const v = e.target.value.trim(), h = $('#detectHint');
    if (!v) { h.innerHTML = ''; return; }
    const p = parseInput(v);
    h.innerHTML = p ? `Detected: <b>${p.label}</b>` : 'Not a valid username, SteamID64 or profile URL yet';
    setHeroError('');
  }, 150));
  $('#gMetric').addEventListener('change', () => loadGlobalBoard());
  $('#addForm').addEventListener('submit', (e) => { e.preventDefault(); addToBoard(); });
  $('#navFav').addEventListener('click', openFavs);
  $('#modalClose').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });
  addEventListener('popstate', routeFromUrl);

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-open],[data-example],[data-game],[data-act],[data-tab],[data-nav],[data-fav-remove],[data-lb],[data-retry]');
    if (!t) return;
    const d = t.dataset;
    if (d.favRemove) {
      store.set('favs', store.get('favs', []).filter((f) => f.steamid !== d.favRemove));
      e.stopPropagation(); openFavs(); renderChips(); if (S.player) renderHead(); return;
    }
    if (d.nav) { e.preventDefault(); goTo(d.nav); return; }
    if (d.tab) { switchTab(d.tab); return; }
    if (d.example) { $('#heroInput').value = d.example; openProfile(d.example); return; }
    if (d.lb) { loadBoardEntries(d.app, d.lb); return; }
    if (d.retry) { retry(d.retry); return; }
    if (d.game) { openGame(d.game, d.gname); return; }
    if (d.act) { action(d.act); return; }
    if (d.open) { if (!$('#modal').hidden) closeModal(); openProfile(d.open); }
  });
}

async function loadBoardEntries(appid, lbid) {
  const el = $('#lbEntries');
  if (!el) return;
  el.innerHTML = ui.skeleton(160);
  try { const d = await api.gameBoards(appid, lbid); el.innerHTML = ui.lbEntriesHTML(d.entries); } catch (e) { el.innerHTML = ui.errorBox(e); }
}
function retry(what) {
  if (what === 'trending') loadHome(true);
  else if (what === 'profile') openProfile(S.raw || $('#heroInput').value, { push: false });
  else if (what === 'friends') { S.inited.friends = false; switchTab('friends'); }
  else if (what === 'online') loadOnline(true);
  else if (what === 'ach') { S.achPromise = null; S.inited.achievements = false; switchTab('achievements'); }
  else if (what === 'compare') runCompare();
  else if (what === 'gboard') loadGlobalBoard(true);
}
function action(a) {
  if (a === 'fav') toggleFav();
  else if (a === 'copy') copyLink();
  else if (a === 'share') shareCard();
  else if (a === 'compare') { $('#cmpA').value = vanityOf(S.player) || S.id; $('#cmpB').value = ''; $('#cmpResult').innerHTML = ''; showView('compare'); $('#cmpB').focus(); }
  else if (a === 'refresh') {
    const id = S.id, raw = S.raw;
    try { Object.keys(localStorage).filter((k) => k.startsWith('st:c:')).forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ }
    api.get('summary', { steamid: id }, { force: true }).catch(() => {});
    openProfile(raw || id, { push: false });
    toast('Refreshing...');
  }
}

function routeFromUrl() {
  const q = new URLSearchParams(location.search), u = q.get('user'), v = q.get('view');
  if (u) openProfile(u, { push: false });
  else if (v === 'leaderboard') { showView('leaderboard'); loadGlobalBoard(); }
  else if (v === 'compare') showView('compare');
  else if (v === 'stats') { showView('stats'); renderChips(); }
  else { showView('home'); loadHome(); }
}

/* Scroll-reveal for dynamically added nodes */
function setupReveal() {
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.08 }) : null;
  const scan = () => $$('.reveal:not(.in)').forEach((n) => { if (io && !reduceMotion()) io.observe(n); else n.classList.add('in'); });
  let q = false;
  new MutationObserver(() => { if (q) return; q = true; requestAnimationFrame(() => { q = false; scan(); }); }).observe(document.body, { childList: true, subtree: true });
  scan();
}

function buildHero() {
  const art = document.querySelector('.hero-art');
  if (!art) return;
  let ticks = '';
  for (let i = 0; i < 60; i++) ticks += `<line x1="200" y1="14" x2="200" y2="${i % 5 ? 22 : 34}" transform="rotate(${i * 6} 200 200)"/>`;
  art.innerHTML = `<div class="reactor" id="scene">
    <svg viewBox="0 0 400 400" class="rx-svg">
      <circle class="rx-track" cx="200" cy="200" r="168"/>
      <circle class="rx-arc" cx="200" cy="200" r="168"/>
      <g class="rx-ticks">${ticks}</g>
      <circle class="rx-dash" cx="200" cy="200" r="138"/>
      <circle class="rx-inner" cx="200" cy="200" r="112"/>
    </svg>
    <div class="rx-core"><span class="rx-lbl">LIVE PLAYERS</span><b id="heroNum">–</b><span class="rx-sub">PLAYING NOW</span></div>
    <div class="rx-chip c1"><small>#1 GAME</small><b id="heroTop">–</b></div>
    <div class="rx-chip c2"><small>GAMES TRACKED</small><b id="heroGames">–</b></div>
  </div>`;
}

async function init() {
  const safe = (f) => { try { f(); } catch (e) { console.error('[SteamTrack init]', e); } };
  // Start the intro first so a failure in anything else can never freeze it at 0%
  const intro = runLoader().catch((e) => console.error('[loader]', e));
  safe(buildHero); safe(startBackground); safe(startFx); safe(setupReveal); safe(bindGlobal); safe(renderChips);
  // Watchdog: never wait longer than 6s for the intro
  await Promise.race([intro, new Promise((r) => setTimeout(r, 6000))]);
  document.getElementById('loader')?.remove();
  routeFromUrl();
  setInterval(() => { if (!$('#view-home').hidden && !document.hidden) loadHome(true); }, 120000);
}
init();
