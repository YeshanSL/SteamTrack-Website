/* SteamTrack: drifting red embers background */
export function startBackground() {
  const c = document.getElementById('bg');
  if (!c) return;
  const ctx = c.getContext('2d');
  const rm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let w, h, d, pts = [], raf;
  const fit = () => {
    d = Math.min(devicePixelRatio || 1, 2);
    w = c.width = innerWidth * d; h = c.height = innerHeight * d;
    c.style.width = innerWidth + 'px'; c.style.height = innerHeight + 'px';
    const n = Math.min(46, Math.floor(innerWidth / 30));
    pts = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, v: (0.15 + Math.random() * 0.5) * d, r: (Math.random() * 1.6 + 0.5) * d, red: Math.random() < 0.7, a: 0.2 + Math.random() * 0.5, s: Math.random() * 6 }));
  };
  const draw = (t = 0) => {
    ctx.clearRect(0, 0, w, h);
    for (const p of pts) {
      if (!rm) { p.y -= p.v; p.x += Math.sin(t / 1800 + p.s) * 0.25 * d; if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; } }
      ctx.fillStyle = p.red ? `rgba(255,42,42,${p.a})` : `rgba(255,255,255,${p.a * 0.5})`;
      ctx.fillRect(p.x, p.y, p.r * 1.6, p.r * 1.6);
    }
    if (!rm) raf = requestAnimationFrame(draw);
  };
  fit(); draw();
  addEventListener('resize', () => { fit(); if (rm) draw(); });
  document.addEventListener('visibilitychange', () => { if (rm) return; if (document.hidden) cancelAnimationFrame(raf); else raf = requestAnimationFrame(draw); });
}
