// Confete na conclusão do lote. Canvas próprio, sem bibliotecas. Respeita prefers-reduced-motion.
import { prefersReducedMotion } from '../platform';

const COLORS = ['#2350E8', '#7393FF', '#E8A400', '#F2B83A', '#1C8C5A', '#4CC38A', '#FF4B3E', '#FFFFFF'];

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  rot: number;
  vr: number;
  tilt: number;
  vt: number;
  color: string;
  shape: 0 | 1;
}

export function confetti(origin?: DOMRect) {
  if (prefersReducedMotion()) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  canvas.setAttribute('aria-hidden', 'true');
  const W = window.innerWidth;
  const H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  document.body.append(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas.remove();
  ctx.scale(dpr, dpr);

  const cx = origin ? origin.left + origin.width / 2 : W / 2;
  const cy = origin ? origin.top + origin.height * 0.45 : H * 0.35;
  const pieces: Piece[] = [];
  const burst = (n: number, x: number, y: number, spread: number, power: number, angle: number) => {
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const v = power * (0.55 + Math.random() * 0.6);
      pieces.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        w: 7 + Math.random() * 6,
        h: 4 + Math.random() * 5,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        tilt: Math.random() * Math.PI,
        vt: 0.08 + Math.random() * 0.12,
        color: COLORS[(Math.random() * COLORS.length) | 0],
        shape: Math.random() < 0.8 ? 0 : 1,
      });
    }
  };
  // Explosão do centro do visor e dois canhões nas laterais
  burst(110, cx, cy, Math.PI * 1.6, 15, -Math.PI / 2);
  burst(70, 0, H * 0.75, 0.7, 22, -Math.PI / 3.2);
  burst(70, W, H * 0.75, 0.7, 22, -Math.PI + Math.PI / 3.2);

  const start = performance.now();
  const DURATION = 4200;
  let last = start;
  const frame = (now: number) => {
    const dt = Math.min(2, (now - last) / 16.67);
    last = now;
    const t = now - start;
    ctx.clearRect(0, 0, W, H);
    const fade = t > DURATION - 900 ? Math.max(0, (DURATION - t) / 900) : 1;
    for (const p of pieces) {
      p.vx *= Math.pow(0.985, dt);
      p.vy = p.vy * Math.pow(0.985, dt) + 0.32 * dt;
      p.x += p.vx * dt + Math.sin(p.tilt) * 0.6;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.tilt += p.vt * dt;
      if (p.y > H + 20) continue;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(1, Math.cos(p.tilt));
      ctx.fillStyle = p.color;
      if (p.shape === 0) ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      else {
        ctx.beginPath();
        ctx.arc(0, 0, p.h / 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    if (t < DURATION) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
