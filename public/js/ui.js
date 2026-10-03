/* SteamTrack: HTML builders (pure functions that return markup strings) */
import { esc, fmt, hrs, ago, accountAge, flag, countryName, steamImg, statusOf } from './utils.js';
import { barList, donut, ring } from './charts.js';

export const gameImg = (appid) => `<img class="gimg" loading="lazy" src="${steamImg(appid)}" alt="" onerror="this.style.visibility='hidden'">`;
export const skeleton = (h = 80) => `<div class="skel" style="height:${h}px"></div>`;

/* ───────── generic states ───────── */
export function errorBox(err, retry = '') {
  const map = {
    not_found: ['&#128269;', 'Player not found', 'No Steam user matches that name. Search uses the custom URL name (steamcommunity.com/id/NAME), not the display name. A 17-digit SteamID64 always works.'],
    rate_limited: ['&#9201;', 'Slow down a little', 'Too many requests right now. Wait a few seconds and retry.'],
    network: ['&#128268;', 'Connection problem', 'Could not reach the server or Steam. Check your connection and retry.'],
    config: ['&#9881;', 'Server not configured', 'The server is missing its Steam API key. See the README.'],
    bad_request: ['&#9888;', 'Invalid input', 'That does not look like a valid Steam username, SteamID64 or profile URL.'],
  };
  if (err?.code === 'private') return privateNotice('profile data');
  const [ico, title, text] = map[err?.code] || ['&#9888;', 'Something went wrong', err?.message || 'Unexpected error. Please try again.'];
  return `<div class="card notice reveal"><div class="notice-ico">${ico}</div><h3>${title}</h3><p class="muted">${text}</p>
    ${retry ? `<button class="btn primary" data-retry="${retry}" type="button">Retry</button>` : ''}</div>`;
}
export function privateNotice(what) {
  return `<div class="card notice reveal"><div class="notice-ico">&#128274;</div><h3>This ${what} is private</h3>
    <p class="muted">Steam only shares data from public profiles. If this is your profile, you can make it public:</p>
    <ol><li>On Steam open <b>Edit Profile</b> &rarr; <b>Privacy Settings</b></li>
    <li>Set <b>My profile</b>, <b>Game details</b> and <b>Friends list</b> to <b>Public</b></li>
    <li>Come back and refresh (Steam can take a few minutes to update)</li></ol></div>`;
}
export const emptyBox = (title, text = '') => `<div class="empty reveal"><h3>${esc(title)}</h3><p>${esc(text)}</p></div>`;

/* ───────── profile header ───────── */
export function headSkeleton() {
  return `<div class="card head"><div class="skel circle" style="width:104px;height:104px"></div>
    <div class="grow skel-col"><div class="skel" style="height:30px;width:55%"></div><div class="skel" style="height:16px;width:38%"></div></div></div>`;
}
const lvlColor = (l) => (l >= 100 ? '#ff2a2a' : l >= 50 ? '#ffffff' : l >= 30 ? '#cfcfcf' : l >= 10 ? '#8d8d8d' : '#555555');
export function headHTML(p, { level, fav }) {
  const st = statusOf(p);
  const age = accountAge(p.created);
  return `<div class="card head reveal">
    <div class="avatar-wrap st-${st.key}"><img src="${esc(p.avatar)}" alt="${esc(p.name)} avatar"><span class="st-dot" title="${st.label}"></span></div>
    <div class="head-main">
      <h2 class="pname">${esc(p.name)}</h2>
      <div class="meta">
        ${p.realname ? `<span>${esc(p.realname)}</span>` : ''}
        ${p.country ? `<span>${flag(p.country)} ${esc(countryName(p.country))}</span>` : ''}
        ${age ? `<span>${age}</span>` : ''}
        <span class="status-text st-${st.key}">&#9679; ${st.label}</span>
      </div>
      ${p.game ? `<div class="playing">&#9654; Playing <b>${esc(p.game)}</b></div>` : (st.key === 'offline' && p.lastlogoff ? `<div class="muted small">Last seen ${ago(p.lastlogoff)}</div>` : '')}
    </div>
    ${level != null ? `<div class="head-level"><div class="lvl" style="--lc:${lvlColor(level)}">${level}</div><small>LEVEL</small></div>` : ''}
    <div class="head-actions">
      <button class="btn sm" data-act="fav" type="button">${fav ? '&#9733; Tracked' : '&#9734; Track'}</button>
      <button class="btn sm" data-act="compare" type="button">&#9876; Compare</button>
      <button class="btn sm" data-act="share" type="button">&#8689; Share card</button>
      <button class="btn sm" data-act="copy" type="button">&#128279; Copy link</button>
      <button class="btn sm" data-act="refresh" type="button">&#8635; Refresh</button>
      <a class="btn sm ghost" href="${esc(p.profileurl)}" target="_blank" rel="noopener">Steam profile &#8599;</a>
    </div></div>`;
}

/* ───────── overview ───────── */
export const overviewSkeleton = () =>
  `<div class="tiles">${Array.from({ length: 6 }, () => skeleton(100)).join('')}</div><div class="grid-2">${skeleton(300)}${skeleton(300)}</div>`;

const tile = (label, val, { id = '', dec = 0, suffix = '', sub = '' } = {}) =>
  `<div class="tile reveal"><span class="tile-label">${label}</span>
   <span class="tile-val" ${id ? `id="${id}"` : ''} ${val == null ? '' : `data-count="${val}" data-dec="${dec}" data-suffix="${suffix}"`}>${val == null ? '…' : '0'}</span>
   <span class="tile-sub">${sub}</span></div>`;

export function gameCard(g) {
  return `<button class="gcard" data-game="${g.appid}" data-gname="${esc(g.name)}" type="button">${gameImg(g.appid)}
    <div class="gcard-body"><b>${esc(g.name)}</b><span>${hrs(g.playtime_2weeks)} last 2 weeks &middot; ${hrs(g.playtime_forever)} total</span></div></button>`;
}

export function overviewHTML(S) {
  const st = S.stats;
  const top = [...S.games].filter((g) => g.playtime_forever > 0).sort((a, b) => b.playtime_forever - a.playtime_forever).slice(0, 10);
  const recent = (S.recent.length ? S.recent : S.games.filter((g) => g.playtime_2weeks > 0).sort((a, b) => b.playtime_2weeks - a.playtime_2weeks)).slice(0, 6);
  const unplayed = st.count - st.played;
  const pct = st.count ? Math.round((st.played / st.count) * 100) : 0;

  const b = S.badges;
  let lvlCard = `<p class="muted">Level data is not available.</p>`;
  if (S.level != null) {
    let bar = '', meta = '';
    if (b && b.xp != null && b.xpToNext != null && b.xpCurrentLevel != null) {
      const span = b.xp - b.xpCurrentLevel + b.xpToNext;
      const p = span > 0 ? Math.max(2, Math.min(100, ((b.xp - b.xpCurrentLevel) / span) * 100)) : 0;
      bar = `<div class="xp" aria-label="XP progress"><i style="--w:${p.toFixed(1)}%"></i></div>`;
      meta = `<div class="muted small">${fmt(b.xp)} XP &middot; ${fmt(b.xpToNext)} XP to level ${S.level + 1}${b.badgeCount ? ` &middot; ${fmt(b.badgeCount)} badges` : ''}</div>`;
    }
    lvlCard = `<div class="lvl-row"><div class="lvl" style="--lc:${lvlColor(S.level)}">${S.level}</div><div class="grow"><b>Steam level ${S.level}</b>${bar}${meta}</div></div>`;
  }

  return `
  <div class="tiles">
    ${tile('Games owned', st.count)}
    ${tile('Total playtime', st.total / 60, { suffix: 'h', sub: `${Math.round(st.total / 60 / 24)} days of gaming` })}
    ${tile('Last 2 weeks', st.twoWeek / 60, { dec: 1, suffix: 'h' })}
    ${tile('Achievements', null, { id: 't-ach', sub: 'across top games' })}
    ${tile('Perfect games', null, { id: 't-perfect', sub: '100% unlocked' })}
    ${tile('Avg completion', null, { id: 't-avg', suffix: '%', sub: 'across top games' })}
  </div>
  <div class="grid-2">
    <div class="card reveal"><h3>Recently played</h3><div class="stack">${recent.length ? recent.map(gameCard).join('') : '<p class="muted">No recent activity.</p>'}</div></div>
    <div class="card reveal"><h3>Most played</h3>${top.length ? barList(top.map((g) => ({ label: g.name, value: g.playtime_forever, appid: g.appid }))) : '<p class="muted">No playtime recorded.</p>'}</div>
    <div class="card reveal"><h3>Library breakdown</h3>
      <div class="donut-wrap">${donut([{ label: 'Played', value: st.played, color: 'var(--c1)' }, { label: 'Never played', value: unplayed, color: '#ffffff' }], `${pct}%`, 'played')}
        <div class="legend"><div><i style="background:var(--c1)"></i>${fmt(st.played)} played</div>
        <div><i style="background:#fff"></i>${fmt(unplayed)} never played</div>
        <div class="muted small">${unplayed > 0 ? 'Pile of shame: ' + fmt(unplayed) + ' games waiting' : 'Nothing left unplayed.'}</div></div></div></div>
    <div class="card reveal"><h3>Level &amp; badges</h3>${lvlCard}</div>
    <div class="card reveal" id="vsFriends"><h3>You vs friends</h3>${skeleton(150)}</div>
    <div class="card reveal" id="wishlistCard" hidden></div>
  </div>`;
}

export function vsFriendsHTML(rows, n) {
  return `<h3>You vs friends average</h3><p class="muted small">Based on ${n} friends with public game details.</p>` + rows.map(([label, you, avg, f]) => {
    if (you == null || avg == null) return '';
    const max = Math.max(you, avg, 1);
    const d = avg ? Math.round(((you - avg) / avg) * 100) : 0;
    return `<div class="vs-row"><div class="vs-top"><span>${label}</span><span class="delta ${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : ''}${d}% vs avg</span></div>
      <div class="bar-track"><div class="bar-fill" style="--w:${Math.max(2, you / max * 100).toFixed(1)}%"></div></div>
      <div class="bar-track"><div class="bar-fill alt" style="--w:${Math.max(2, avg / max * 100).toFixed(1)}%"></div></div>
      <div class="muted small">You ${f(you)} &middot; Friends ${f(avg)}</div></div>`;
  }).join('');
}

export function wishlistHTML(items) {
  return `<h3>Wishlist</h3><div class="stack">${items.slice(0, 8).map((i) => `<a class="gcard" href="https://store.steampowered.com/app/${i.appid}" target="_blank" rel="noopener">${gameImg(i.appid)}<div class="gcard-body"><b>${esc(i.name)}</b><span>${i.added ? 'Added ' + ago(i.added) : 'On wishlist'}</span></div></a>`).join('')}</div>`;
}

/* ───────── friend leaderboard ───────── */
export const friendsShell = () => `
  <div class="toolbar">
    <label>Rank by <select id="metricSel" aria-label="Ranking metric">
      <option value="minutes">Total playtime</option><option value="games">Games owned</option>
      <option value="level">Steam level</option><option value="recent">Last 2 weeks</option></select></label>
    <input id="lbFilter" type="search" placeholder="Filter friends..." aria-label="Filter friends">
    <div class="push"><button class="btn sm" id="lbCsv" type="button">&#11015; CSV</button><button class="btn sm ghost" id="lbRefresh" type="button">&#8635; Refresh</button></div>
  </div>
  <div id="lbLoading"><p class="muted" id="lbLoadMsg">Crunching your friends' stats. Large friend lists can take a few seconds...</p><div class="skel-col">${skeleton(70)}${skeleton(70)}${skeleton(70)}</div></div>
  <div id="lbContent" hidden><div id="podium"></div><div id="myPos"></div><div id="lbList" class="lb"></div><p id="lbNote" class="muted small"></p></div>`;

export function podium(top, m) {
  if (!top.length) return '';
  const order = [top[1], top[0], top[2]], cls = ['silver', 'gold', 'bronze'], rk = [2, 1, 3];
  return `<div class="podium">${order.map((p, i) => p ? `<div class="pod ${cls[i]} reveal" ${p.you ? '' : `data-open="${p.steamid}"`}>
    <div class="pod-av"><img src="${esc(p.avatar)}" alt=""><span class="pod-rank">${rk[i]}</span></div>
    <b class="pod-name">${esc(p.name)}${p.you ? ' <em>(you)</em>' : ''}</b><span class="pod-val">${m.fmt(p.value)}</span><div class="pod-step"></div></div>` : '<div></div>').join('')}</div>`;
}

export function myPosition(ranked, m) {
  const idx = ranked.findIndex((p) => p.you);
  if (idx < 0) return `<div class="card mypos"><div>No data for you on this metric (private game details).</div></div>`;
  const n = ranked.length, rank = idx + 1, me = ranked[idx];
  const top = Math.max(1, Math.ceil((rank / n) * 100));
  const beat = n > 1 ? Math.round(((n - rank) / (n - 1)) * 100) : 100;
  let gap;
  if (n === 1) gap = 'No friends to compare with yet.';
  else if (idx === 0) gap = `You lead by <b class="lead">${m.fmt(me.value - ranked[1].value)}</b> over #2 ${esc(ranked[1].name)}.`;
  else gap = `<b>${m.fmt(ranked[idx - 1].value - me.value)}</b> behind #${idx} ${esc(ranked[idx - 1].name)}.`;
  return `<div class="card mypos reveal"><div><div class="muted small">YOUR POSITION</div><div class="big">#${rank} <small>of ${n}</small></div></div>
    ${ring(beat, 'beat')}<div class="grow"><div><b>Top ${top}%</b> &middot; better than ${beat}% of friends</div><div class="gap">${gap}</div><div class="muted small">${m.label}: ${m.fmt(me.value)}</div></div></div>`;
}

export function lbRow(p, m, max) {
  const st = statusOf(p);
  const w = max > 0 ? Math.max(2, (p.value / max) * 100) : 2;
  return `<div class="lb-row ${p.you ? 'you' : ''} reveal in" data-id="${p.steamid}" ${p.you ? '' : `data-open="${p.steamid}"`}>
    <span class="lb-rank r${p.rank}">${p.rank}</span><img class="lb-av st-${st.key}" loading="lazy" src="${esc(p.avatar)}" alt="">
    <div class="lb-main"><b>${esc(p.name)}${p.you ? '<em>YOU</em>' : ''}</b><div class="lb-bar"><i style="--w:${w.toFixed(1)}%"></i></div></div>
    <span class="lb-val">${m.fmt(p.value)}</span></div>`;
}

/* ───────── online friends ───────── */
export const onlineShell = () => `<div class="live-bar"><span class="live-pill"><i></i> LIVE</span><span class="muted small" id="onlineUpdated">Loading...</span>
  <button class="btn sm ghost" id="onlineRefresh" type="button">&#8635; Refresh now</button></div><div id="onlineBody"><div class="grid-3">${Array.from({ length: 6 }, () => skeleton(76)).join('')}</div></div>`;

export function onlineHTML(friends) {
  const g = { ingame: [], online: [], away: [] };
  let off = 0;
  friends.forEach((f) => { const k = statusOf(f).key; if (k === 'ingame') g.ingame.push(f); else if (k === 'online') g.online.push(f); else if (k === 'offline') off++; else g.away.push(f); });
  const card = (f) => { const st = statusOf(f); return `<div class="fcard reveal in" data-open="${f.steamid}">
    <div class="avatar-wrap sm st-${st.key}"><img loading="lazy" src="${esc(f.avatar)}" alt=""></div>
    <div class="f-main"><b>${esc(f.name)}</b><div class="f-sub status-text st-${st.key}">${f.game ? 'Playing ' + esc(f.game) : st.label}</div></div>${f.gameid ? gameImg(f.gameid) : ''}</div>`; };
  const sec = (t, a) => a.length ? `<h3 class="group-title">${t} (${a.length})</h3><div class="grid-3">${a.map(card).join('')}</div>` : '';
  const active = g.ingame.length + g.online.length + g.away.length;
  if (!active) return emptyBox('Nobody is online right now', `${off} friends offline. This panel refreshes every 60 seconds.`);
  return `<div class="tiles"><div class="tile"><span class="tile-label">In game</span><span class="tile-val">${g.ingame.length}</span></div>
    <div class="tile"><span class="tile-label">Online</span><span class="tile-val">${g.online.length}</span></div>
    <div class="tile"><span class="tile-label">Away / busy</span><span class="tile-val">${g.away.length}</span></div>
    <div class="tile"><span class="tile-label">Offline</span><span class="tile-val">${off}</span></div></div>
    ${sec('In game', g.ingame)}${sec('Online', g.online)}${sec('Away / busy', g.away)}`;
}

/* ───────── achievements ───────── */
const rarClass = (r) => (r == null ? '' : r < 2 ? 'rar-legend' : r < 10 ? 'rar-epic' : r < 30 ? 'rar-rare' : 'rar-common');
export const rarityTag = (r) => (r == null ? '' : `<span class="rarity ${rarClass(r)}">${r < 10 ? r.toFixed(1) : Math.round(r)}%</span>`);

export function achievementsHTML(list, totals) {
  if (!list.length) return emptyBox('No achievement data', 'Achievements are not public for this profile, or the top games have no achievements. Set Game details to Public on Steam.');
  const rare = list.flatMap((a) => a.achievements.filter((x) => x.achieved && x.rarity != null).map((x) => ({ ...x, game: a.game.name })))
    .sort((a, b) => a.rarity - b.rarity).slice(0, 10);
  return `<div class="tiles">
    <div class="tile reveal"><span class="tile-label">Unlocked</span><span class="tile-val">${fmt(totals.unlocked)}</span><span class="tile-sub">of ${fmt(totals.total)}</span></div>
    <div class="tile reveal"><span class="tile-label">Perfect games</span><span class="tile-val">${totals.perfect}</span></div>
    <div class="tile reveal"><span class="tile-label">Avg completion</span><span class="tile-val">${totals.avg.toFixed(0)}%</span></div></div>
  <div class="grid-2">
    <div class="card reveal"><h3>Completion by game</h3><div class="stack">${list.sort((a, b) => b.unlocked / b.total - a.unlocked / a.total).map((a) => {
      const p = (a.unlocked / a.total) * 100;
      return `<div class="ach-row" data-game="${a.game.appid}" data-gname="${esc(a.game.name)}">${gameImg(a.game.appid)}
        <div><b>${esc(a.game.name)}</b><div class="bar-track"><div class="bar-fill" style="--w:${Math.max(2, p).toFixed(1)}%"></div></div><span class="muted small">${a.unlocked} / ${a.total}</span></div><span class="pct">${p.toFixed(0)}%</span></div>`;
    }).join('')}</div></div>
    <div class="card reveal"><h3>Rarest unlocked</h3>${rare.length ? `<div class="stack">${rare.map((x) => `<div class="ach-item"><b>${esc(x.name)}</b>${rarityTag(x.rarity)}<small>${esc(x.game)}${x.desc ? ' &middot; ' + esc(x.desc) : ''}</small></div>`).join('')}</div>` : '<p class="muted">No rarity data available.</p>'}</div>
  </div>`;
}

export function achListHTML(a) {
  if (!a.available) return '<p class="muted">This game has no achievements, or achievement data is private.</p>';
  const sorted = [...a.achievements].sort((x, y) => (y.achieved - x.achieved) || ((x.rarity ?? 100) - (y.rarity ?? 100)));
  return `<div class="muted small" style="margin-bottom:8px">${a.unlocked} of ${a.total} unlocked (${((a.unlocked / a.total) * 100).toFixed(0)}%)</div>
    <div class="scroll-list">${sorted.slice(0, 60).map((x) => `<div class="ach-item ${x.achieved ? '' : 'locked'}"><b>${x.achieved ? '&#10003; ' : ''}${esc(x.name)}</b>${rarityTag(x.rarity)}<small>${esc(x.desc)}</small></div>`).join('')}</div>`;
}

/* ───────── game modal ───────── */
export function gameModalHTML({ appid, title, g }) {
  return `${gameImg(appid).replace('class="gimg"', 'class="gimg hero-img"')}<h2 id="modalTitle">${esc(title)}</h2>
    <div class="modal-stats">
      <div class="tile"><span class="tile-label">Players now</span><span class="tile-val" id="gmPlayers">…</span></div>
      ${g ? `<div class="tile"><span class="tile-label">Your playtime</span><span class="tile-val">${hrs(g.playtime_forever)}</span></div>
      <div class="tile"><span class="tile-label">Last 2 weeks</span><span class="tile-val">${hrs(g.playtime_2weeks)}</span></div>
      <div class="tile"><span class="tile-label">Last played</span><span class="tile-val" style="font-size:.95rem">${g.rtime_last_played ? ago(g.rtime_last_played) : '–'}</span></div>` : ''}
    </div>
    <a class="btn sm ghost" href="https://store.steampowered.com/app/${appid}" target="_blank" rel="noopener">Store page &#8599;</a>
    ${g ? `<h3 style="margin-top:20px">Achievements &amp; rarity</h3><div id="gmAch">${skeleton(120)}</div>` : ''}`;
}

/* ───────── game board ───────── */
export function gameBoardShell(games) {
  const opts = [...games].sort((a, b) => b.playtime_forever - a.playtime_forever).slice(0, 200)
    .map((g) => `<option value="${g.appid}">${esc(g.name)} (${hrs(g.playtime_forever)})</option>`).join('');
  return `<div class="toolbar"><label>Game <select id="gbSel" aria-label="Choose a game"><option value="">Choose a game...</option>${opts}</select></label>
    <input id="gbFilter" type="search" placeholder="Filter game list..." aria-label="Filter game list"></div><div id="gbOut">${emptyBox('Pick a game', 'See how your friends rank in it, who is playing now, and any official leaderboards.')}</div>`;
}

export function gameBoardHTML({ appid, title, pc, fg, lb, me, myMinutes }) {
  const players = pc.status === 'fulfilled' && pc.value.players != null ? fmt(pc.value.players) : '–';
  let friendsBlock;
  if (fg.status === 'fulfilled') {
    const rows = [...fg.value.friends.map((f) => ({ ...f })), { steamid: me.steamid, name: me.name, avatar: me.avatar, state: me.state, game: me.game, minutes: myMinutes, you: true }]
      .filter((r) => r.minutes > 0).sort((a, b) => b.minutes - a.minutes).map((r, i) => ({ ...r, rank: i + 1, value: r.minutes }));
    const max = rows[0]?.value || 1;
    friendsBlock = rows.length ? `<div class="lb">${rows.map((r) => lbRow(r, { fmt: hrs }, max)).join('')}</div>` : emptyBox('No playtime found', 'None of your friends (with public game details) have played this.');
  } else friendsBlock = fg.reason?.code === 'private' ? privateNotice('friends list') : errorBox(fg.reason);
  let official;
  if (lb.status === 'fulfilled' && lb.value.available && lb.value.boards?.length) {
    official = `<div class="chips">${lb.value.boards.map((b) => `<button class="chip" data-lb="${b.id}" data-app="${appid}" type="button">${esc(b.name || 'Board ' + b.id)}${b.entries ? ` (${fmt(b.entries)})` : ''}</button>`).join('')}</div><div id="lbEntries" style="margin-top:14px"></div>`;
  } else official = '<p class="muted">This game does not expose public leaderboards. The friend ranking above is based on playtime.</p>';
  return `<div class="tiles"><div class="tile"><span class="tile-label">Players now</span><span class="tile-val">${players}</span></div>
    <div class="tile"><span class="tile-label">Your playtime</span><span class="tile-val">${hrs(myMinutes)}</span></div></div>
    <div class="grid-2"><div class="card"><h3>${esc(title)}: friends ranking</h3>${friendsBlock}</div>
    <div class="card"><h3>Official leaderboards</h3>${official}</div></div>`;
}

export function lbEntriesHTML(entries) {
  if (!entries?.length) return '<p class="muted">No entries available for this board.</p>';
  const max = Math.max(...entries.map((e) => e.score), 1);
  return `<div class="lb">${entries.map((e) => lbRow({ steamid: e.steamid, name: e.name, avatar: e.avatar || '', rank: e.rank, value: e.score, state: null }, { fmt }, max)).join('')}</div>`;
}

/* ───────── compare ───────── */
export function compareHTML(A, B) {
  const gA = A.games, gB = B.games;
  const tot = (g) => (g ? g.reduce((a, x) => a + x.playtime_forever, 0) : null);
  const two = (g) => (g ? g.reduce((a, x) => a + x.playtime_2weeks, 0) : null);
  const rows = [
    ['Games owned', gA?.length ?? null, gB?.length ?? null, fmt, 1],
    ['Total playtime', tot(gA), tot(gB), hrs, 1],
    ['Last 2 weeks', two(gA), two(gB), hrs, 1],
    ['Steam level', A.level, B.level, (v) => v, 1],
    ['Account age', A.player.created, B.player.created, (v) => accountAge(v)?.replace(' on Steam', '') ?? '–', -1],
  ];
  let a = 0, b = 0;
  const body = rows.map(([lbl, x, y, f, dir]) => {
    let wa = false, wb = false;
    if (x != null && y != null && x !== y) { if ((x - y) * dir > 0) { wa = true; a++; } else { wb = true; b++; } }
    return `<div class="cmp-row"><div class="v ${wa ? 'win' : ''}">${x == null ? '–' : f(x)}</div><div class="lbl">${lbl}</div><div class="v ${wb ? 'win' : ''}">${y == null ? '–' : f(y)}</div></div>`;
  }).join('');
  const head = (P) => { const st = statusOf(P.player); return `<div class="cmp-player card reveal"><div class="avatar-wrap st-${st.key}"><img src="${esc(P.player.avatar)}" alt=""></div>
    <b>${esc(P.player.name)}</b><div class="muted small">${P.player.country ? flag(P.player.country) + ' ' : ''}${st.label}</div></div>`; };
  let common = '';
  if (gA && gB) {
    const mb = new Map(gB.map((g) => [g.appid, g]));
    const both = gA.filter((g) => mb.has(g.appid)).map((g) => ({ name: g.name, a: g.playtime_forever, b: mb.get(g.appid).playtime_forever }))
      .sort((x, y) => (y.a + y.b) - (x.a + x.b));
    common = `<div class="card reveal" style="margin-top:18px"><h3>${both.length} games in common</h3>${both.length ? both.slice(0, 10).map((g) => `<div class="common-row"><span>${esc(g.name)}</span><span class="${g.a > g.b ? 'delta up' : ''}">${hrs(g.a)}</span><span class="${g.b > g.a ? 'delta up' : ''}">${hrs(g.b)}</span></div>`).join('') : '<p class="muted">No shared games.</p>'}</div>`;
  }
  const note = (!gA || !gB) ? '<p class="muted small" style="text-align:center">Some game stats are hidden because that profile or its game details are private.</p>' : '';
  return `<div class="cmp-heads">${head(A)}<div class="cmp-vs">VS</div>${head(B)}</div>
    <div class="cmp-score">${a === b ? 'Dead heat' : (a > b ? esc(A.player.name) : esc(B.player.name)) + ' leads'} &middot; ${a} - ${b}</div>
    <div class="card reveal">${body}</div>${note}${common}`;
}

/* ───────── home bits ───────── */
export const chip = (p) => `<button class="chip" data-open="${p.steamid}" type="button">${p.avatar ? `<img src="${esc(p.avatar)}" alt="" loading="lazy">` : ''}${esc(p.name)}</button>`;

const bigImg = (appid) => `<img class="bgimg" src="https://cdn.akamai.steamstatic.com/steam/apps/${appid}/library_hero.jpg" alt="" onerror="this.onerror=null;this.src='${steamImg(appid)}'">`;
const fmtCompact = (n) => (n == null ? '–' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'K' : fmt(n));
const dateShort = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export function bestCardHTML(best) {
  return best
    ? `<div class="dash-card reveal in" id="bestCard" data-open="${best.steamid}"><span class="tag">Best player on Steam</span><div class="pl"><img src="${esc(best.avatar)}" alt=""><div class="figure" style="font-size:1.5rem;margin:0">${esc(best.name)}</div></div>
        <div class="line">Level <b>${fmt(best.level)}</b>${best.games != null ? ` &middot; <b>${fmt(best.games)}</b> games` : ''}<br>#1 on the SteamTrack board</div></div>`
    : `<div class="dash-card reveal" id="bestCard"><span class="tag">Best player on Steam</span><div class="figure">…</div><div class="line">Calculating from the global board</div></div>`;
}

export function dashboardHTML(h, best) {
  const g = h.summary.golden, pl = h.summary.players, sl = h.summary.sale;
  const golden = g
    ? `<div class="dash-card golden reveal" data-game="${g.appid}" data-gname="${esc(g.name)}">${bigImg(g.appid)}<span class="tag">Best golden game</span>
        <div class="inner"><span class="score">${g.pct}% POSITIVE</span><div class="figure">${esc(g.name)}</div>
        <div class="line"><b>${esc(g.desc || 'Top rated')}</b> &middot; ${fmt(g.total)} reviews &middot; ${fmt(g.players)} playing now</div></div></div>`
    : `<div class="dash-card golden reveal"><span class="tag">Best golden game</span><div class="inner"><div class="figure">–</div><div class="line">Ratings are not available right now.</div></div></div>`;
  const players = `<div class="dash-card reveal"><span class="tag">Active players</span>
      <div class="figure red" data-count="${pl.total}">0</div>
      <div class="line">across ${pl.games} top games${pl.top ? `<br>Most played: <b>${esc(pl.top.name)}</b> (${fmtCompact(pl.top.players)})` : ''}</div></div>`;
  let saleBody;
  if (sl.active) saleBody = `<div class="figure"><span class="sale-on"><i></i>ON NOW</span></div><div class="line"><b>${esc(sl.active.name)}</b><br>Ends about ${dateShort(sl.active.ends)}${sl.maxDiscount ? ` &middot; up to -${sl.maxDiscount}%` : ''}</div>`;
  else saleBody = `<div class="figure">${sl.next ? sl.next.days + ' DAYS' : 'NO SALE'}</div><div class="line">${sl.next ? `Next: <b>${esc(sl.next.name)}</b><br>Starts about ${dateShort(sl.next.starts)}` : 'No seasonal sale is active.'}${sl.specials ? `<br>${sl.specials} weekly deals live${sl.maxDiscount ? ` (up to -${sl.maxDiscount}%)` : ''}` : ''}</div>`;
  const sale = `<div class="dash-card reveal"><span class="tag">Sale season</span>${saleBody}</div>`;
  const bestCard = bestCardHTML(best);
  return golden + players + sale + bestCard;
}

export const pickRow = (g, i) => `<button class="pick" data-game="${g.appid}" data-gname="${esc(g.name)}" type="button"><span class="no">${i + 1}</span>${gameImg(g.appid)}
  <div><b>${esc(g.name)}</b><div class="meta2"><span><span class="pl-n">${fmt(g.players)}</span> playing</span>${g.sellerRank ? `<span class="seller">Best seller #${g.sellerRank}</span>` : ''}</div></div></button>`;
export const categoriesHTML = (cats) => cats.map((c) => `<div class="cat-card reveal"><h4>${esc(c.name)}<small>TOP 3</small></h4>${c.games.map(pickRow).join('')}</div>`).join('');
export const trendCards = (games) => games.map((g, i) => `<button class="tcard reveal" data-game="${g.appid}" data-gname="${esc(g.name)}" type="button">
  <span class="tc-rank">#${i + 1}</span>${gameImg(g.appid)}<div class="tc-body"><b>${esc(g.name)}</b><span class="players">${fmt(g.players)} playing</span></div></button>`).join('');

/* ───────── global leaderboard ───────── */
export function globalBoard(d, m) {
  if (!d.players.length) return emptyBox('Nobody on the board yet', 'Search a public profile or add a player above to start the ranking.');
  const max = d.players[0].value || 1;
  const rows = d.players.map((p) => lbRow({ ...p, rank: p.rank }, m, max)).join('');
  return `<div id="gPodium">${podium(d.players.slice(0, 3).map((p) => ({ ...p })), m)}</div><div class="lb">${rows}</div>
    <p class="muted small" style="margin-top:12px">${d.members} players tracked &middot; top ${d.players.length} shown &middot; updated ${new Date(d.updated).toLocaleTimeString()}</p>`;
}
