/* SteamTrack: 3D tilt cards, mouse parallax for the hero scene, cursor glow, scroll parallax */
import { reduceMotion } from './utils.js';
const SEL = '.card,.dash-card,.cat-card,.tcard,.gcard,.fcard,.tile';
export function startFx() {
  if (reduceMotion()) return;
  const root = document.documentElement;
  let cur = null;
  const reset = (el) => { el.classList.remove('tilting'); ['--rx', '--ry'].forEach((v) => el.style.removeProperty(v)); };
  addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    root.style.setProperty('--cx', e.clientX + 'px'); root.style.setProperty('--cy', e.clientY + 'px');
    const sc = document.getElementById('scene');
    if (sc) { sc.style.setProperty('--sx', ((e.clientX / innerWidth - .5) * 34) + 'deg'); sc.style.setProperty('--sy', (-(e.clientY / innerHeight - .5) * 26) + 'deg'); }
    const el = e.target.closest ? e.target.closest(SEL) : null;
    if (cur && cur !== el) reset(cur);
    cur = el;
    if (!el) return;
    const r = el.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    el.classList.add('tilting');
    el.style.setProperty('--ry', ((px - .5) * 12) + 'deg'); el.style.setProperty('--rx', ((.5 - py) * 12) + 'deg');
    el.style.setProperty('--mx', (px * 100) + '%'); el.style.setProperty('--my', (py * 100) + '%');
  }, { passive: true });
  document.addEventListener('pointerleave', () => { if (cur) reset(cur); cur = null; });
  addEventListener('scroll', () => root.style.setProperty('--sc', scrollY), { passive: true });
}
