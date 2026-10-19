/**
 * Builds the animated SVG bouquet. Every animated node pivots around its own local
 * origin (0,0) and is driven by CSS keyframes in gift.css; timings come from `--d`.
 * Animations stay paused until the root receives the `play` class.
 */
const NS = 'http://www.w3.org/2000/svg';
const W = 400;
const H = 600;
const KNOT = { x: 200, y: 458 };

const PALETTES = {
  ruby: ['#5c0a22', '#a3153f', '#f06a8c'],
  blush: ['#b8476b', '#f290ad', '#ffe4ec'],
  peach: ['#b8502f', '#f59a76', '#ffe6d2'],
  cream: ['#b08850', '#f0d4a4', '#fffaf0'],
  coral: ['#9e2d3b', '#ec6f6a', '#ffc7b6'],
  lilac: ['#4f3482', '#a185d6', '#f1e7ff'],
};

// Start times (seconds) of each act of the bloom sequence.
const T = {
  glow: 0, paperBack: 0.1, stems: 0.5, greenery: 1.1, paperFront: 1.2,
  flowers: 1.6, filler: 3.0, ribbon: 3.3, locket: 3.9, ambient: 4.6,
};

function el(tag, attrs = {}, children = []) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue;
    if (key === 'style') node.style.cssText = value;
    else if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) if (child) node.append(child);
  return node;
}

/** Deterministic PRNG so the bouquet looks identical on every visit. */
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n) => Math.round(n * 10) / 10;
const anim = (cls, delay, extra = '') => ({ class: cls, style: `--d:${f(delay)}s;${extra}` });
const place = (x, y, rotate = 0, scale = 1) => `translate(${f(x)} ${f(y)}) rotate(${f(rotate)}) scale(${scale})`;

// ---------- Shapes (all with their pivot at 0,0) ----------
const petalPath = (L, w) => `M0 0C${f(-w)} ${f(-L * 0.25)} ${f(-w * 0.95)} ${f(-L * 0.92)} 0 ${f(-L)}`
  + `C${f(w * 0.95)} ${f(-L * 0.92)} ${f(w)} ${f(-L * 0.25)} 0 0Z`;
const leafPath = (L, w) => `M0 0C${f(-w)} ${f(-L * 0.3)} ${f(-w * 0.55)} ${f(-L * 0.8)} 0 ${f(-L)}`
  + `C${f(w * 0.55)} ${f(-L * 0.8)} ${f(w)} ${f(-L * 0.3)} 0 0Z`;
const sparklePath = (r) => `M0 ${-r}Q0 0 ${r} 0Q0 0 0 ${r}Q0 0 ${-r} 0Q0 0 0 ${-r}Z`;
const HEART = 'M0 30C-19 16-36 4-36-12C-36-27-22-35-11-33C-4-32 0-27 0-21C0-27 4-32 11-33C22-35 36-27 36-12C36 4 19 16 0 30Z';

function spiralPath(r) {
  const pts = [];
  for (let t = 0; t <= Math.PI * 3.2; t += 0.25) {
    const rad = r * (0.04 + 0.055 * t);
    pts.push(`${f(Math.cos(t) * rad)} ${f(Math.sin(t) * rad)}`);
  }
  return `M${pts.join('L')}`;
}

function defs() {
  const gradients = Object.entries(PALETTES).map(([name, [dark, mid, light]]) =>
    el('linearGradient', { id: `pt-${name}`, x1: 0, y1: 1, x2: 0, y2: 0 }, [
      el('stop', { offset: 0, 'stop-color': dark }),
      el('stop', { offset: 0.55, 'stop-color': mid }),
      el('stop', { offset: 1, 'stop-color': light }),
    ]));
  const linear = (id, stops, attrs = { x1: 0, y1: 0, x2: 0, y2: 1 }) => el('linearGradient', { id, ...attrs },
    stops.map(([offset, color, opacity = 1]) => el('stop', { offset, 'stop-color': color, 'stop-opacity': opacity })));
  const radial = (id, stops, attrs = {}) => el('radialGradient', { id, ...attrs },
    stops.map(([offset, color, opacity = 1]) => el('stop', { offset, 'stop-color': color, 'stop-opacity': opacity })));

  return el('defs', {}, [
    ...gradients,
    linear('daisy-petal', [[0, '#e9dcc4'], [0.4, '#fffdf8'], [1, '#ffffff']], { x1: 0, y1: 1, x2: 0, y2: 0 }),
    radial('daisy-core', [[0, '#ffe27a'], [0.7, '#f2b52e'], [1, '#c98612']]),
    linear('leaf-dark', [[0, '#1f4d36'], [1, '#5c9a6a']], { x1: 0, y1: 1, x2: 0, y2: 0 }),
    radial('leaf-euca', [[0, '#c4ddd2'], [1, '#6f9a8a']], { cx: 0.35, cy: 0.35 }),
    linear('paper-back', [[0, '#fbe9df'], [1, '#c98f80']]),
    linear('paper-left', [[0, '#f6d5ca'], [1, '#c98a7c']], { x1: 0, y1: 0, x2: 1, y2: 1 }),
    linear('paper-right', [[0, '#fff1ea'], [1, '#e2a898']], { x1: 1, y1: 0, x2: 0, y2: 1 }),
    linear('satin', [[0, '#fff1c7'], [0.35, '#e8b65a'], [0.7, '#b9822c'], [1, '#f3cf7d']]),
    linear('gold', [[0, '#fff3cf'], [0.5, '#d9a441'], [1, '#8f5f17']], { x1: 0, y1: 0, x2: 1, y2: 1 }),
    radial('glow', [[0, '#ffc9d6', 0.75], [0.45, '#ff8fb0', 0.25], [1, '#ff8fb0', 0]]),
    radial('locket-fill', [[0, '#ffe3ec'], [1, '#f39ab4']]),
    el('clipPath', { id: 'heart-clip' }, [el('path', { d: HEART, transform: 'scale(0.86)' })]),
    el('filter', { id: 'soft-shadow', x: '-20%', y: '-20%', width: '140%', height: '140%' }, [
      el('feDropShadow', { dx: 0, dy: 3, stdDeviation: 3, 'flood-color': '#2a0715', 'flood-opacity': 0.35 }),
    ]),
  ]);
}

// ---------- Flowers ----------
function rose({ x, y, r, palette, delay }) {
  const [dark, mid] = PALETTES[palette];
  const rings = [
    { n: 7, L: 1, w: 0.5, off: 0 },
    { n: 6, L: 0.8, w: 0.47, off: 26 },
    { n: 5, L: 0.6, w: 0.43, off: 9 },
    { n: 4, L: 0.4, w: 0.38, off: 52 },
  ];
  const petals = rings.flatMap((ring, ri) => Array.from({ length: ring.n }, (_, j) => {
    const angle = ring.off + (360 / ring.n) * j;
    const d = delay + (rings.length - 1 - ri) * 0.16 + j * 0.035;
    return el('g', { transform: `rotate(${f(angle)})` }, [
      el('g', anim('bloom', d), [
        el('path', {
          d: petalPath(r * ring.L, r * ring.w), fill: `url(#pt-${palette})`,
          stroke: dark, 'stroke-opacity': 0.35, 'stroke-width': 0.8,
        }),
      ]),
    ]);
  }));
  const core = el('g', anim('pop', delay - 0.1), [
    el('circle', { r: r * 0.2, fill: dark }),
    el('path', { d: spiralPath(r), fill: 'none', stroke: mid, 'stroke-width': f(r * 0.035), 'stroke-linecap': 'round' }),
  ]);
  return head(x, y, [...petals, core]);
}

function daisy({ x, y, r, delay }) {
  const n = 20;
  const petals = Array.from({ length: n }, (_, j) => el('g', { transform: `rotate(${f((360 / n) * j)})` }, [
    el('g', anim('bloom', delay + 0.2 + j * 0.025), [
      el('path', { d: petalPath(r, r * 0.17), fill: 'url(#daisy-petal)', stroke: '#d8c8ab', 'stroke-width': 0.5 }),
    ]),
  ]));
  const dots = Array.from({ length: 9 }, (_, j) => {
    const a = j * 2.4;
    const rad = r * 0.17 * Math.sqrt(j / 9);
    return el('circle', { cx: f(Math.cos(a) * rad), cy: f(Math.sin(a) * rad), r: f(r * 0.035), fill: '#a8670a', opacity: 0.6 });
  });
  const core = el('g', anim('pop', delay), [el('circle', { r: r * 0.3, fill: 'url(#daisy-core)' }), ...dots]);
  return head(x, y, [...petals, core]);
}

function tulip({ x, y, r, palette, tilt, delay }) {
  const s = (v) => f(v * r);
  const side = (dir) => `M0 0C${s(-0.72 * dir)} ${s(-0.05)} ${s(-0.78 * dir)} ${s(-1)} ${s(-0.32 * dir)} ${s(-1.42)}`
    + `C${s(-0.16 * dir)} ${s(-1)} ${s(0.1 * dir)} ${s(-0.6)} ${s(0.16 * dir)} ${s(-0.04)}Z`;
  const front = `M0 0C${s(-0.48)} 0 ${s(-0.52)} ${s(-0.92)} 0 ${s(-1.32)}C${s(0.52)} ${s(-0.92)} ${s(0.48)} 0 0 0Z`;
  const [dark] = PALETTES[palette];
  return el('g', { transform: place(x, y, tilt) }, [
    el('g', anim('rise', delay), [
      el('path', { d: side(1), fill: `url(#pt-${palette})`, stroke: dark, 'stroke-opacity': 0.3, 'stroke-width': 0.7 }),
      el('path', { d: side(-1), fill: `url(#pt-${palette})`, stroke: dark, 'stroke-opacity': 0.3, 'stroke-width': 0.7 }),
      el('path', { d: front, fill: `url(#pt-${palette})`, stroke: dark, 'stroke-opacity': 0.4, 'stroke-width': 0.7 }),
    ]),
  ]);
}

function bud({ x, y, r, palette, tilt, delay }) {
  const [dark] = PALETTES[palette];
  return el('g', { transform: place(x, y, tilt) }, [
    el('g', anim('rise', delay), [
      el('path', { d: petalPath(r * 1.9, r * 0.75), fill: `url(#pt-${palette})`, stroke: dark, 'stroke-opacity': 0.4, 'stroke-width': 0.7 }),
      el('path', { d: leafPath(r * 1.1, r * 0.35), fill: '#3f7a52', transform: 'rotate(-28)' }),
      el('path', { d: leafPath(r * 1.1, r * 0.35), fill: '#3f7a52', transform: 'rotate(28)' }),
      el('path', { d: leafPath(r * 0.8, r * 0.3), fill: '#4f8f5f' }),
    ]),
  ]);
}

/** A flower head with a gentle idle wobble around its center. */
function head(x, y, children) {
  return el('g', { transform: place(x, y) }, [
    el('g', anim('nod', T.ambient, `--nd:${f(4 + Math.random() * 3)}s`), children),
  ]);
}

function babysBreath({ x, y, spread, delay, random }) {
  const florets = Array.from({ length: 9 }, (_, j) => {
    const a = random() * Math.PI * 2;
    const rad = spread * Math.sqrt(random());
    const fx = x + Math.cos(a) * rad;
    const fy = y + Math.sin(a) * rad;
    return [
      el('path', {
        d: `M${f(x)} ${f(y + spread)}Q${f(x)} ${f(fy + 4)} ${f(fx)} ${f(fy)}`, pathLength: 1, ...anim('twig draw', delay - 0.4),
      }),
      el('g', { transform: place(fx, fy) }, [
        el('g', anim('pop', delay + j * 0.06), [
          el('circle', { r: f(2 + random() * 1.4), fill: '#fffaf3', stroke: '#e6d6c2', 'stroke-width': 0.4 }),
        ]),
      ]),
    ];
  });
  return el('g', {}, florets.flat());
}

// ---------- Greenery ----------
function eucalyptus({ to, ctrl, delay }) {
  const from = { x: KNOT.x, y: KNOT.y - 40 };
  const at = (t) => ({
    x: (1 - t) ** 2 * from.x + 2 * (1 - t) * t * ctrl.x + t ** 2 * to.x,
    y: (1 - t) ** 2 * from.y + 2 * (1 - t) * t * ctrl.y + t ** 2 * to.y,
  });
  const leaves = [];
  for (let i = 0; i < 7; i++) {
    const t = 0.5 + i * 0.075;
    const p = at(t);
    const q = at(t + 0.01);
    const angle = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
    const side = i % 2 ? 1 : -1;
    const size = 1 - i * 0.07;
    leaves.push(el('g', { transform: place(p.x, p.y, angle + side * 90, size) }, [
      el('g', anim('pop', delay + 0.4 + i * 0.08), [
        el('ellipse', { cx: 0, cy: -9, rx: 8, ry: 9.5, fill: 'url(#leaf-euca)', stroke: '#5d8778', 'stroke-width': 0.5 }),
      ]),
    ]));
  }
  return el('g', {}, [
    el('path', {
      d: `M${from.x} ${from.y}Q${ctrl.x} ${ctrl.y} ${to.x} ${to.y}`, pathLength: 1, ...anim('stem stem-thin draw', delay),
    }),
    ...leaves,
  ]);
}

function longLeaf({ x, y, angle, L, delay }) {
  return el('g', { transform: place(x, y, angle) }, [
    el('g', anim('unfurl', delay), [
      el('path', { d: leafPath(L, L * 0.22), fill: 'url(#leaf-dark)' }),
      el('path', { d: `M0 0Q${f(L * 0.04)} ${f(-L * 0.5)} 0 ${f(-L * 0.95)}`, stroke: '#a6d1ae', 'stroke-opacity': 0.5, 'stroke-width': 0.8, fill: 'none' }),
    ]),
  ]);
}

function stem(to, delay, width = 3) {
  const fromX = KNOT.x + (to.x - KNOT.x) * 0.06;
  const ctrlX = KNOT.x + (to.x - KNOT.x) * 0.35;
  const ctrlY = (KNOT.y + to.y) / 2 + 30;
  return el('path', {
    d: `M${f(fromX)} ${KNOT.y + 20}Q${f(ctrlX)} ${f(ctrlY)} ${f(to.x)} ${f(to.y)}`,
    class: 'stem draw', pathLength: 1, 'stroke-width': width, style: `--d:${f(delay)}s`,
  });
}

// ---------- Wrapping, ribbon, locket ----------
function paperBack() {
  return el('g', anim('slide-up', T.paperBack), [
    el('path', {
      d: 'M200 470L18 200C36 168 66 170 80 178C92 128 138 116 160 126C176 90 224 90 240 126C262 116 308 128 320 178C334 170 364 168 382 200Z',
      fill: 'url(#paper-back)', stroke: '#e9c2b4', 'stroke-width': 1,
    }),
    el('path', { d: 'M200 466L104 182M200 466L200 112M200 466L296 182', stroke: '#b97a6b', 'stroke-opacity': 0.25, 'stroke-width': 1.2, fill: 'none' }),
  ]);
}

function paperFront() {
  return el('g', anim('slide-up', T.paperFront, '--from:90px'), [
    el('path', { d: 'M56 330C120 340 196 362 258 398L214 584L186 584Z', fill: 'url(#paper-left)', stroke: '#b97c6e', 'stroke-opacity': 0.5 }),
    el('path', { d: 'M344 330C280 340 204 362 142 398L186 584L214 584Z', fill: 'url(#paper-right)', stroke: '#c98d7f', 'stroke-opacity': 0.5 }),
    el('path', { d: 'M344 330C280 340 204 362 142 398', fill: 'none', stroke: '#fff7f3', 'stroke-width': 2.2, 'stroke-opacity': 0.8 }),
    el('path', { d: 'M300 352L205 560M256 374L200 570', stroke: '#c98d7f', 'stroke-opacity': 0.3, 'stroke-width': 1, fill: 'none' }),
  ]);
}

function ribbon() {
  const loop = (dir) => `M0 0C${-28 * dir} -34 ${-66 * dir} -30 ${-60 * dir} -6C${-56 * dir} 12 ${-24 * dir} 12 0 0Z`;
  const tail = (dir) => `M${-3 * dir} 4C${-10 * dir} 32 ${-22 * dir} 58 ${-36 * dir} 84L${-22 * dir} 80L${-16 * dir} 94C${-6 * dir} 64 ${2 * dir} 36 ${4 * dir} 6Z`;
  return el('g', { transform: place(KNOT.x, KNOT.y) }, [
    el('path', { d: 'M-74 -8Q0 6 74 -8L77 6Q0 20 -77 6Z', fill: 'url(#satin)', ...anim('pop-x', T.ribbon) }),
    el('g', anim('pop', T.ribbon + 0.25), [
      el('path', { d: tail(1), fill: 'url(#satin)', filter: 'url(#soft-shadow)' }),
      el('path', { d: tail(-1), fill: 'url(#satin)', filter: 'url(#soft-shadow)' }),
      el('path', { d: loop(1), fill: 'url(#satin)', filter: 'url(#soft-shadow)' }),
      el('path', { d: loop(-1), fill: 'url(#satin)', filter: 'url(#soft-shadow)' }),
      el('path', { d: 'M-46 -10C-34 -18 -20 -14 -8 -4M46 -10C34 -18 20 -14 8 -4', stroke: '#fff5d6', 'stroke-opacity': 0.7, 'stroke-width': 1.4, fill: 'none' }),
      el('ellipse', { rx: 10, ry: 9, fill: 'url(#gold)' }),
    ]),
  ]);
}

function locket(avatarUrl, initial) {
  const inner = avatarUrl
    ? el('image', {
      href: avatarUrl, x: -31, y: -31, width: 62, height: 62, preserveAspectRatio: 'xMidYMid slice', 'clip-path': 'url(#heart-clip)',
    })
    : el('g', {}, [
      el('path', { d: HEART, fill: 'url(#locket-fill)', transform: 'scale(0.86)' }),
      el('text', {
        y: 2, 'text-anchor': 'middle', 'dominant-baseline': 'middle', class: 'locket-initial', text: initial,
      }),
    ]);
  return el('g', { transform: place(KNOT.x, KNOT.y + 6) }, [
    el('g', anim('swing', T.ambient), [
      el('g', anim('drop', T.locket), [
        el('path', { d: 'M0 0L0 26', stroke: 'url(#gold)', 'stroke-width': 1.6, 'stroke-dasharray': '2.5 1.5' }),
        el('circle', { cy: 28, r: 3.2, fill: 'none', stroke: 'url(#gold)', 'stroke-width': 1.6 }),
        el('g', { transform: 'translate(0 64)', filter: 'url(#soft-shadow)' }, [
          el('path', { d: HEART, fill: 'url(#gold)', transform: 'scale(1.08)' }),
          inner,
          el('path', { d: HEART, fill: 'none', stroke: '#fff3cf', 'stroke-opacity': 0.8, 'stroke-width': 1.2, transform: 'scale(0.86)' }),
          el('path', { d: 'M-24 -22C-20 -27 -14 -28 -9 -27', stroke: '#fff', 'stroke-opacity': 0.75, 'stroke-width': 2.5, 'stroke-linecap': 'round', fill: 'none' }),
        ]),
      ]),
    ]),
  ]);
}

// ---------- Composition ----------
const ROSES = [
  { x: 200, y: 212, r: 48, palette: 'ruby' },
  { x: 136, y: 168, r: 36, palette: 'blush' },
  { x: 266, y: 166, r: 37, palette: 'cream' },
  { x: 118, y: 256, r: 38, palette: 'peach' },
  { x: 284, y: 252, r: 38, palette: 'coral' },
  { x: 202, y: 124, r: 31, palette: 'blush' },
  { x: 196, y: 300, r: 34, palette: 'cream' },
  { x: 68, y: 206, r: 27, palette: 'lilac' },
  { x: 334, y: 200, r: 27, palette: 'lilac' },
];
const DAISIES = [
  { x: 92, y: 314, r: 24 }, { x: 306, y: 318, r: 24 },
  { x: 250, y: 96, r: 21 }, { x: 150, y: 98, r: 19 },
  { x: 268, y: 316, r: 17 }, { x: 132, y: 320, r: 17 },
];
const TULIPS = [
  { x: 96, y: 128, r: 19, palette: 'coral', tilt: -24 },
  { x: 306, y: 120, r: 19, palette: 'blush', tilt: 22 },
  { x: 40, y: 262, r: 15, palette: 'peach', tilt: -58 },
  { x: 362, y: 258, r: 15, palette: 'peach', tilt: 56 },
];
const BUDS = [
  { x: 200, y: 82, r: 11, palette: 'ruby', tilt: 4 },
  { x: 120, y: 106, r: 9, palette: 'lilac', tilt: -30 },
  { x: 288, y: 86, r: 9, palette: 'coral', tilt: 26 },
  { x: 44, y: 182, r: 9, palette: 'blush', tilt: -60 },
  { x: 358, y: 176, r: 9, palette: 'cream', tilt: 58 },
];
const FILLERS = [
  { x: 170, y: 128, spread: 14 }, { x: 236, y: 128, spread: 14 }, { x: 96, y: 208, spread: 16 },
  { x: 302, y: 206, spread: 16 }, { x: 160, y: 250, spread: 13 }, { x: 242, y: 256, spread: 13 },
  { x: 60, y: 158, spread: 13 }, { x: 342, y: 152, spread: 13 }, { x: 156, y: 294, spread: 11 },
  { x: 240, y: 296, spread: 11 },
];
const BRANCHES = [
  { to: { x: 40, y: 112 }, ctrl: { x: 120, y: 260 } },
  { to: { x: 362, y: 104 }, ctrl: { x: 282, y: 260 } },
  { to: { x: 16, y: 300 }, ctrl: { x: 110, y: 360 } },
  { to: { x: 388, y: 292 }, ctrl: { x: 290, y: 360 } },
];
const LEAVES = [
  { x: 92, y: 236, angle: -62, L: 70 }, { x: 308, y: 232, angle: 64, L: 70 },
  { x: 150, y: 132, angle: -24, L: 62 }, { x: 252, y: 128, angle: 26, L: 62 },
  { x: 86, y: 290, angle: -96, L: 58 }, { x: 314, y: 290, angle: 98, L: 58 },
  { x: 200, y: 110, angle: 2, L: 56 },
];

const distanceDelay = ({ x, y }) => Math.hypot(x - 200, y - 212) / 180;

export function createBouquet({ avatarUrl, initial }) {
  const random = rng(2010);
  const svg = el('svg', {
    viewBox: `0 0 ${W} ${H}`, class: 'bq', role: 'img', 'aria-label': 'Bó hoa 20/10 đang nở',
  });
  svg.append(defs());

  const heads = [...ROSES, ...DAISIES, ...TULIPS, ...BUDS];
  const stems = heads.map((h, i) => stem(h, T.stems + i * 0.03, h.r > 30 ? 3.4 : 2.4));
  const greenery = [
    ...BRANCHES.map((b, i) => eucalyptus({ ...b, delay: T.greenery + i * 0.15 })),
    ...LEAVES.map((l, i) => longLeaf({ ...l, delay: T.greenery + 0.3 + i * 0.1 })),
  ];
  const fillers = FILLERS.map((c, i) => babysBreath({ ...c, delay: T.filler + i * 0.08, random }));
  const flowers = [
    ...TULIPS.map((t) => ({ y: t.y, node: tulip({ ...t, delay: T.flowers + 0.2 + distanceDelay(t) }) })),
    ...BUDS.map((b) => ({ y: b.y, node: bud({ ...b, delay: T.flowers + 0.3 + distanceDelay(b) }) })),
    ...DAISIES.map((d) => ({ y: d.y, node: daisy({ ...d, delay: T.flowers + 0.4 + distanceDelay(d) }) })),
    ...ROSES.map((r) => ({ y: r.y, node: rose({ ...r, delay: T.flowers + distanceDelay(r) }) })),
  ].sort((a, b) => a.y - b.y).map((item) => item.node);

  const sparkles = Array.from({ length: 14 }, (_, i) => {
    const a = random() * Math.PI * 2;
    const x = 200 + Math.cos(a) * (120 + random() * 70);
    const y = 205 + Math.sin(a) * (110 + random() * 50);
    return el('g', { transform: place(x, y) }, [
      el('path', { d: sparklePath(4 + random() * 5), fill: '#fff4d6', ...anim('twinkle', T.ambient + i * 0.35) }),
    ]);
  });

  svg.append(
    el('circle', { cx: 200, cy: 210, r: 200, fill: 'url(#glow)', ...anim('glow', T.glow) }),
    el('g', { class: 'sway' }, [
      paperBack(),
      el('g', {}, stems),
      el('g', {}, greenery),
      el('g', {}, fillers),
      el('g', {}, flowers),
      paperFront(),
      ribbon(),
      locket(avatarUrl, initial),
    ]),
    el('g', {}, sparkles),
  );

  return {
    svg,
    play: () => svg.classList.add('play'),
    /** Seconds until the bouquet is fully assembled. */
    duration: T.ambient,
  };
}
