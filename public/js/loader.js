/* SteamTrack: boot-sequence loading screen (plays once per session) */
import { $, reduceMotion } from './utils.js';

const CH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&@!?<>/';
const WORD = 'STEAMTRACK';
const MSGS = [[0, 'Connecting to Steam'], [24, 'Syncing player data'], [48, 'Loading leaderboards'], [72, 'Reading the charts'], [94, 'Ready']];
const TIPS = ['TIP: search by custom URL name', 'TIP: public profiles only', 'TIP: compare any two players', 'TIP: top 3 in every category'];

export function runLoader() {
  const el = $('#loader');
  if (!el) return Promise.resolve();
  try { if (sessionStorage.getItem('st_intro')) { el.remove(); return Promise.resolve(); } } catch { /* ignore */ }

  return new Promise((resolve) => {
    const rm = reduceMotion();
    const total = rm ? 500 : 3600;
    const logo = $('#loaderLogo');
    logo.innerHTML = [...WORD].map((c) => `<span class="ch">${c}</span>`).join('');
    const spans = [...logo.children];
    const lockAt = spans.map((_, i) => 450 + i * 200 + Math.random() * 120);
    const segBox = $('#ldSegs');
    const N = 40;
    segBox.innerHTML = '<i></i>'.repeat(N);
    const segs = [...segBox.children];
    const pct = $('#loaderPct'), msg = $('#loaderMsg'), tip = $('#ldTip'), clock = $('#ldClock');
    tip.textContent = TIPS[(Math.random() * TIPS.length) | 0];
    const stopFx = drawFx($('#loaderCanvas'), rm);
    let done = false, raf, lit = 0;
    const t0 = performance.now();

    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      try { sessionStorage.setItem('st_intro', '1'); } catch { /* ignore */ }
      spans.forEach((s, i) => { s.textContent = WORD[i]; s.classList.add('locked'); });
      segs.forEach((s) => s.classList.add('on'));
      pct.textContent = '100';
      el.classList.add('exit');
      setTimeout(() => { stopFx(); el.remove(); resolve(); }, rm ? 50 : 900);
    };
    $('#skipLoader').addEventListener('click', finish);

    const frame = (now) => {
      const t = now - t0;
      const p = Math.min(1, t / total);
      const eased = 1 - Math.pow(1 - p, 2.2);
      const n = Math.floor(eased * 100);
      pct.textContent = String(n);
      const want = Math.floor(eased * N);
      while (lit < want) { segs[lit].classList.add('on'); if (lit > 0) segs[lit - 1].classList.remove('hot'); segs[lit].classList.add('hot'); lit++; }
      for (let i = MSGS.length - 1; i >= 0; i--) if (n >= MSGS[i][0]) { if (msg.textContent !== MSGS[i][1]) msg.textContent = MSGS[i][1]; break; }
      const d = new Date();
      clock.textContent = d.toTimeString().slice(0, 8);
      spans.forEach((s, i) => {
        if (t >= lockAt[i]) { if (!s.classList.contains('locked')) { s.textContent = WORD[i]; s.classList.add('locked'); } }
        else s.textContent = CH[(Math.random() * CH.length) | 0];
      });
      if (p >= 1) { setTimeout(finish, 300); return; }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  });
}

/* Red speed lines + sparks flying across a black screen */
function drawFx(c, still) {
  const ctx = c.getContext('2d');
  let w, h, raf, run = true;
  const lines = Array.from({ length: 46 }, () => ({ x: Math.random(), y: Math.random(), l: 0.06 + Math.random() * 0.25, v: 0.004 + Math.random() * 0.012, a: 0.08 + Math.random() * 0.35, red: Math.random() < 0.6 }));
  const fit = () => { const d = Math.min(devicePixelRatio || 1, 2); w = c.width = innerWidth * d; h = c.height = innerHeight * d; };
  fit();
  addEventListener('resize', fit);
  const loop = () => {
    if (!run) return;
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = Math.max(1, w / 900);
    for (const s of lines) {
      s.x -= s.v; s.y += s.v * 0.32;
      if (s.x + s.l < 0 || s.y > 1) { s.x = 1 + Math.random() * 0.3; s.y = Math.random() * 0.8 - 0.1; }
      ctx.strokeStyle = s.red ? `rgba(255,42,42,${s.a})` : `rgba(255,255,255,${s.a * 0.6})`;
      ctx.beginPath(); ctx.moveTo(s.x * w, s.y * h); ctx.lineTo((s.x + s.l) * w, (s.y - s.l * 0.32 * w / h) * h); ctx.stroke();
    }
    if (!still) raf = requestAnimationFrame(loop);
  };
  loop();
  return () => { run = false; cancelAnimationFrame(raf); removeEventListener('resize', fit); };
}
