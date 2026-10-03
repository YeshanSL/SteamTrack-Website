/* SteamTrack: animated particle network background */
export function startBackground() {
  const c = document.getElementById('bg');
  if (!c) return;
  const ctx = c.getContext('2d');
  const rm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let w, h, d, pts = [], mx = 0.5, my = 0.5, rgb = '0,229,255', frame = 0, raf;

  const fit = () => {
    d = Math.min(devicePixelRatio || 1, 2);
    w = c.width = innerWidth * d;
    h = c.height = innerHeight * d;
    c.style.width = innerWidth + 'px';
    c.style.height = innerHeight + 'px';
    const n = Math.min(70, Math.floor(innerWidth / 22));
    pts = Array.from({ length: n }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.28 * d, vy: (Math.random() - 0.5) * 0.28 * d,
      r: (Math.random() * 1.5 + 0.6) * d,
    }));
  };

  const draw = () => {
    if (frame++ % 60 === 0) rgb = getComputedStyle(document.documentElement).getPropertyValue('--c1-rgb').trim() || rgb;
    ctx.clearRect(0, 0, w, h);
    const px = (mx - 0.5) * 24 * d, py = (my - 0.5) * 24 * d;
    const max = 140 * d;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (!rm) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
      }
      ctx.fillStyle = `rgba(${rgb},.55)`;
      ctx.beginPath(); ctx.arc(p.x + px * p.r * 0.2, p.y + py * p.r * 0.2, p.r, 0, 6.283); ctx.fill();
      for (let j = i + 1; j < pts.length; j++) {
        const q = pts[j], dx = p.x - q.x, dy = p.y - q.y, dist = Math.hypot(dx, dy);
        if (dist < max) {
          ctx.strokeStyle = `rgba(${rgb},${(1 - dist / max) * 0.18})`;
          ctx.lineWidth = d;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        }
      }
    }
    if (!rm) raf = requestAnimationFrame(draw);
  };

  fit();
  draw();
  addEventListener('resize', () => { fit(); if (rm) draw(); });
  addEventListener('pointermove', (e) => { mx = e.clientX / innerWidth; my = e.clientY / innerHeight; }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (rm) return;
    if (document.hidden) cancelAnimationFrame(raf); else draw();
  });
}
