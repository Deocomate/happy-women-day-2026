/**
 * Full-screen canvas with drifting bokeh lights, falling petals that flip in 3D,
 * and on-demand petal bursts.
 */
const PETAL_COLORS = ['#ffb3c7', '#ff8fab', '#ffd6e0', '#f9c5b4', '#ffe9f0', '#f7a1b5', '#e7c6ff'];
const BOKEH_COLORS = ['255,190,210', '255,214,170', '230,190,255', '255,160,190'];

const rand = (min, max) => min + Math.random() * (max - min);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export function createPetalSky(canvas, { reducedMotion = false } = {}) {
  const ctx = canvas.getContext('2d');
  let width = 0;
  let height = 0;
  let dpr = 1;
  let rafId = 0;
  let lastTime = 0;
  let targetPetals = 0;
  const petals = [];
  const bursts = [];
  const bokeh = [];

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bokehCount = Math.round(Math.min(26, Math.max(12, (width * height) / 45000)));
    bokeh.length = 0;
    for (let i = 0; i < bokehCount; i++) {
      bokeh.push({
        x: rand(0, width), y: rand(0, height), r: rand(18, 70), color: pick(BOKEH_COLORS),
        alpha: rand(0.04, 0.14), vx: rand(-6, 6), vy: rand(-8, -2), phase: rand(0, Math.PI * 2),
      });
    }
  }

  function makePetal(fromTop = true) {
    return {
      x: rand(-20, width + 20), y: fromTop ? rand(-60, -10) : rand(0, height),
      size: rand(6, 13), vy: rand(28, 70), drift: rand(14, 40), phase: rand(0, Math.PI * 2),
      rot: rand(0, Math.PI * 2), vr: rand(-1.4, 1.4), flip: rand(0, Math.PI * 2), vflip: rand(1.5, 3.5),
      color: pick(PETAL_COLORS), alpha: rand(0.65, 0.95),
    };
  }

  function drawPetal(p, alpha) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.scale(1, Math.max(0.15, Math.abs(Math.cos(p.flip))));
    ctx.globalAlpha = alpha;
    const s = p.size;
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.bezierCurveTo(s * 0.95, -s * 0.55, s * 0.7, s * 0.75, 0, s);
    ctx.bezierCurveTo(-s * 0.7, s * 0.75, -s * 0.95, -s * 0.55, 0, -s);
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.globalAlpha = alpha * 0.45;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.6);
    ctx.quadraticCurveTo(s * 0.12, 0, 0, s * 0.7);
    ctx.stroke();
    ctx.restore();
  }

  function frame(time) {
    const dt = Math.min(0.05, (time - (lastTime || time)) / 1000);
    lastTime = time;
    const t = time / 1000;
    ctx.clearRect(0, 0, width, height);

    for (const b of bokeh) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.y < -b.r) b.y = height + b.r;
      if (b.x < -b.r) b.x = width + b.r;
      if (b.x > width + b.r) b.x = -b.r;
      const a = b.alpha * (0.7 + 0.3 * Math.sin(t * 0.8 + b.phase));
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      g.addColorStop(0, `rgba(${b.color},${a})`);
      g.addColorStop(1, `rgba(${b.color},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (!reducedMotion) {
      while (petals.length < targetPetals) petals.push(makePetal(petals.length > targetPetals / 2));
      for (let i = petals.length - 1; i >= 0; i--) {
        const p = petals[i];
        p.y += p.vy * dt;
        p.x += Math.sin(t * 0.9 + p.phase) * p.drift * dt;
        p.rot += p.vr * dt;
        p.flip += p.vflip * dt;
        if (p.y > height + 30) {
          if (petals.length > targetPetals) petals.splice(i, 1);
          else Object.assign(p, makePetal(true));
        }
        drawPetal(p, p.alpha);
      }

      for (let i = bursts.length - 1; i >= 0; i--) {
        const p = bursts[i];
        p.life -= dt;
        if (p.life <= 0) {
          bursts.splice(i, 1);
          continue;
        }
        p.vy += 160 * dt;
        p.vx *= 0.985;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        p.flip += p.vflip * dt;
        drawPetal(p, Math.min(1, p.life / 0.6) * p.alpha);
      }
    }

    rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (!rafId) {
      lastTime = 0;
      rafId = requestAnimationFrame(frame);
    }
  }

  function stop() {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  resize();
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  start();

  return {
    /** Sets how many petals should be falling, scaled to the screen size. */
    setDensity(level) {
      targetPetals = Math.round(Math.min(48, Math.max(10, (width * height) / 26000)) * level);
    },
    burst(x, y, count = 28, power = 1) {
      if (reducedMotion) return;
      for (let i = 0; i < count; i++) {
        const angle = rand(0, Math.PI * 2);
        const speed = rand(90, 300) * power;
        bursts.push({
          ...makePetal(false), x, y,
          vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 120 * power,
          vr: rand(-6, 6), life: rand(1.2, 2.2), size: rand(6, 12),
        });
      }
    },
  };
}
