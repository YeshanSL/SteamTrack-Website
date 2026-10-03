/* SteamTrack: cinematic loading screen (plays once per session) */
import { $, reduceMotion } from './utils.js';

const CH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&@!?<>/';
const WORD = 'STEAMTRACK';
const MSGS = [
  [0, 'Connecting to Steam...'],
  [22, 'Syncing player data...'],
  [46, 'Loading leaderboards...'],
  [70, 'Calibrating stat engine...'],
  [92, 'Ready player one.'],
];

export function runLoader() {
  const el = $('#loader');
  if (!el) return Promise.resolve();
  try { if (sessionStorage.getItem('st_intro')) { el.remove(); return Promise.resolve(); } } catch { /* ignore */ }

  return new Promise((resolve) => {
    const rm = reduceMotion();
    const total = rm ? 500 : 3800;
    const logo = $('#loaderLogo');
    logo.innerHTML = [...WORD].map((c) => `<span class="ch">${c}</span>`).join('');
    const spans = [...logo.children];
    const lockAt = spans.map((_, i) => 500 + i * 210 + Math.random() * 140);
    const fill = $('#barFill'), pct = $('#loaderPct'), msg = $('#loaderMsg');
    const stopGrid = drawGrid($('#loaderCanvas'), rm);
    let done = false, raf;
    const t0 = performance.now();

    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      stopGrid();
      try { sessionStorage.setItem('st_intro', '1'); } catch { /* ignore */ }
      spans.forEach((s, i) => { s.textContent = WORD[i]; s.classList.add('locked'); });
      fill.style.width = '100%';
      pct.textContent = '100%';
      el.classList.add('exit');
      setTimeout(() => { el.remove(); resolve(); }, rm ? 50 : 900);
    };
    $('#skipLoader').addEventListener('click', finish);

    const frame = (now) => {
      const t = now - t0;
      const p = Math.min(1, t / total);
      const eased = 1 - Math.pow(1 - p, 2.4);
      const n = Math.floor(eased * 100);
      fill.style.width = `${eased * 100}%`;
      pct.textContent = `${n}%`;
      for (let i = MSGS.length - 1; i >= 0; i--) if (n >= MSGS[i][0]) { if (msg.textContent !== MSGS[i][1]) msg.textContent = MSGS[i][1]; break; }
      spans.forEach((s, i) => {
        if (t >= lockAt[i]) { if (!s.classList.contains('locked')) { s.textContent = WORD[i]; s.classList.add('locked'); } }
        else s.textContent = CH[(Math.random() * CH.length) | 0];
      });
      if (p >= 1) { setTimeout(finish, 350); return; }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  });
}

/* Perspective neon grid + drifting particles */
function drawGrid(c, still) {
  const ctx = c.getContext('2d');
  let w, h, raf, run = true, off = 0;
  const parts = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), v: 0.0004 + Math.random() * 0.001, s: Math.random() * 1.8 + 0.5 }));
  const fit = () => { const d = Math.min(devicePixelRatio || 1, 2); w = c.width = innerWidth * d; h = c.height = innerHeight * d; };
  fit();
  addEventListener('resize', fit);
  const loop = () => {
    if (!run) return;
    ctx.clearRect(0, 0, w, h);
    const hy = h * 0.58, vx = w / 2;
    const g = ctx.createLinearGradient(0, hy, 0, h);
    g.addColorStop(0, 'rgba(139,92,246,0)');
    g.addColorStop(1, 'rgba(0,229,255,.55)');
    ctx.strokeStyle = g;
    ctx.lineWidth = Math.max(1, w / 1400);
    for (let i = -24; i <= 24; i++) { ctx.beginPath(); ctx.moveTo(vx + i * w * 0.012, hy); ctx.lineTo(vx + i * w * 0.14, h); ctx.stroke(); }
    off = (off + 0.012) % 1;
    for (let i = 0; i < 14; i++) { const t = (i + off) / 14; const y = hy + (h - hy) * t * t; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    parts.forEach((p) => { p.y -= p.v; if (p.y < 0) { p.y = 1; p.x = Math.random(); } ctx.fillRect(p.x * w, p.y * h * 0.6, p.s, p.s); });
    if (!still) raf = requestAnimationFrame(loop);
  };
  loop();
  return () => { run = false; cancelAnimationFrame(raf); removeEventListener('resize', fit); };
}
