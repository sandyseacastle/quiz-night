// Retro theme definitions + procedural SVG backgrounds.
// Every background is drawn on a 1920x1080 canvas. Two variants:
//   'full'  – pattern edge to edge (title, category, break, end slides)
//   'panel' – pattern with a readable content panel baked in (question / answer slides)

export const W = 1920;
export const H = 1080;
export const PANEL = { x: 80, y: 72, w: 1760, h: 936, r: 46 };
// Dashed border around the content panel and the title/category cards (instead of a drop shadow).
// Each theme's panel is filled with its most dominant background colour and outlined in panel.dash.
// The outline sits OUTSIDE the shape, `offset` px away, so there's a strip of pattern between them.
export const DASH = { w: 16, dash: 56, gap: 42, offset: 24 }; // ~4:3, like PowerPoint's 'dash' line used for cards
export function dashArray(perimeter) {
  // whole number of dashes so the pattern meets up evenly at the start
  const n = Math.max(1, Math.round(perimeter / (DASH.dash + DASH.gap)));
  const k = perimeter / (n * (DASH.dash + DASH.gap));
  return [DASH.dash * k, DASH.gap * k];
}
export function roundRectPerimeter(w, h, r) { return 2 * (w + h - 4 * r) + 2 * Math.PI * r; }

// ---------- helpers ----------
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const f = (n) => Math.round(n * 10) / 10;
const pts = (arr) => arr.map((p) => `${f(p[0])},${f(p[1])}`).join(' ');

// Smooth closed blob through points (Catmull-Rom -> cubic bezier)
function smoothClosed(points) {
  const n = points.length;
  let d = `M${f(points[0][0])},${f(points[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n], p1 = points[i], p2 = points[(i + 1) % n], p3 = points[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
  }
  return d + 'Z';
}
function smoothOpen(points) {
  const n = points.length;
  let d = `M${f(points[0][0])},${f(points[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(i + 2, n - 1)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
  }
  return d;
}
function blob(cx, cy, r, R, n = 7, wobble = 0.28) {
  const p = [];
  const off = R() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = off + (i / n) * Math.PI * 2;
    const rr = r * (1 - wobble / 2 + R() * wobble);
    p.push([cx + Math.cos(a) * rr * 1.15, cy + Math.sin(a) * rr]);
  }
  return smoothClosed(p);
}
function sparkle(cx, cy, r, fill, c = 0.16) {
  const k = r * c;
  return `<path fill="${fill}" d="M${f(cx)},${f(cy - r)} Q${f(cx + k)},${f(cy - k)} ${f(cx + r)},${f(cy)} Q${f(cx + k)},${f(cy + k)} ${f(cx)},${f(cy + r)} Q${f(cx - k)},${f(cy + k)} ${f(cx - r)},${f(cy)} Q${f(cx - k)},${f(cy - k)} ${f(cx)},${f(cy - r)}Z"/>`;
}
function spikyStar(cx, cy, r, fill, R, rot = 0) {
  const lens = [1, 0.55, 0.85, 0.5, 0.95, 0.6, 0.8, 0.52];
  const p = [];
  for (let i = 0; i < 16; i++) {
    const a = rot + (i / 16) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r * lens[i / 2] * (0.9 + R() * 0.2) : r * 0.24;
    p.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return `<polygon fill="${fill}" points="${pts(p)}"/>`;
}

// Risograph style speckle / paper grain
function grainDefs(id, { freq = 0.9, color = '#ffffff', alpha = 0.5, sparse = 0.55 } = {}) {
  const c = hexToRgb(color);
  // turn noise into sparse specks of a single colour
  return `<filter id="${id}" x="0" y="0" width="100%" height="100%" filterUnits="userSpaceOnUse">
    <feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="2" seed="7" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 ${c[0] / 255}  0 0 0 0 ${c[1] / 255}  0 0 0 0 ${c[2] / 255}  0 0 0 ${9 * alpha} ${-9 * alpha * sparse}"/>
  </filter>`;
}
// Film grain laid over every background (all themes, full and panel slides) so the
// slides share one finish. Tune the strength here.
const FILM_GRAIN = { opacity: 0.075, freq: 0.85 };
function filmGrainDefs(id) {
  // monochrome noise, contrast-boosted around mid grey, fully opaque; laid on at low opacity so
  // it lightens and darkens equally on light and dark colours
  return `<filter id="${id}" x="0" y="0" width="100%" height="100%" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="${FILM_GRAIN.freq}" numOctaves="3" seed="23" stitchTiles="stitch"/>
    <feColorMatrix type="matrix" values="0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 0 1"/>
    <feComponentTransfer><feFuncR type="linear" slope="2.4" intercept="-0.7"/><feFuncG type="linear" slope="2.4" intercept="-0.7"/><feFuncB type="linear" slope="2.4" intercept="-0.7"/></feComponentTransfer>
  </filter>`;
}

function grainRect(id, opacity = 1) {
  return `<rect x="0" y="0" width="${W}" height="${H}" filter="url(#${id})" opacity="${opacity}"/>`;
}
export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function panelSvg(t) {
  const p = PANEL;
  const pc = t.panel;
  const o = DASH.offset;
  const [d, g] = dashArray(roundRectPerimeter(p.w + 2 * o, p.h + 2 * o, p.r + o));
  // speckle grain in the panel's edge colour, clipped to the panel so it reads like the pattern around it
  return `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${p.r}" fill="${pc.fill}"/>
  <g clip-path="url(#panel-clip)">${grainRect('pg')}</g>
  <rect x="${p.x - o}" y="${p.y - o}" width="${p.w + 2 * o}" height="${p.h + 2 * o}" rx="${p.r + o}" fill="none" stroke="${pc.dash}" stroke-width="${DASH.w}" stroke-dasharray="${f(d)} ${f(g)}" stroke-linecap="butt"/>`;
}
function panelDefs(t) {
  const p = PANEL;
  return `<clipPath id="panel-clip"><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${p.r}"/></clipPath>`
    + grainDefs('pg', { color: t.panel.edge, alpha: 0.22, sparse: 0.55, freq: (t.grain && t.grain.freq) || 0.9 });
}

// ---------- pattern generators ----------

function patChecker(t, R) {
  const c = t.c;
  const cell = 232;
  const cols = Math.ceil(W / cell) + 3;
  const rows = Math.ceil(H / cell) + 3;
  const p1 = R() * 6, p2 = R() * 6, tilt = (R() - 0.5) * 0.12;
  const A = 26, B = 22;
  const warp = (x, y) => {
    const xr = x + y * tilt;
    return [xr + A * Math.sin(y / 120 + p1), y + B * Math.sin(xr / 140 + p2)];
  };
  const colors = [c.orange, c.mustard, c.olive, c.brown, c.peach, c.orange];
  let out = `<rect width="${W}" height="${H}" fill="${c.cream}"/>`;
  const steps = 10;
  let last = -1;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      if ((i + j) % 2) continue;
      const x0 = (i - 1.5) * cell, y0 = (j - 1.5) * cell;
      const poly = [];
      for (let s = 0; s < steps; s++) poly.push(warp(x0 + (cell * s) / steps, y0));
      for (let s = 0; s < steps; s++) poly.push(warp(x0 + cell, y0 + (cell * s) / steps));
      for (let s = 0; s < steps; s++) poly.push(warp(x0 + cell - (cell * s) / steps, y0 + cell));
      for (let s = 0; s < steps; s++) poly.push(warp(x0, y0 + cell - (cell * s) / steps));
      let k;
      do { k = Math.floor(R() * colors.length); } while (k === last);
      last = k;
      out += `<polygon fill="${colors[k]}" points="${pts(poly)}"/>`;
    }
  }
  return out;
}

function patGroovy(t, R) {
  const c = t.c;
  const order = [c.brown, c.orange, c.mustard, c.cream, c.sage];
  const band = 205, A = 44, lambda = 250;
  const phase = R() * Math.PI * 2;
  const slope = 0.22 + R() * 0.12;
  const start = Math.floor(R() * order.length);
  const boundary = (k) => {
    const res = [];
    for (let y = -60; y <= H + 60; y += 18) {
      res.push([k * band - 300 + slope * y + A * Math.sin((y / lambda) * Math.PI * 2 + phase), y]);
    }
    return res;
  };
  let out = `<rect width="${W}" height="${H}" fill="${order[start]}"/>`;
  const n = Math.ceil((W + 600) / band) + 2;
  for (let k = 0; k < n; k++) {
    const a = boundary(k), b = boundary(k + 1).reverse();
    out += `<polygon fill="${order[(start + k) % order.length]}" points="${pts(a.concat(b))}"/>`;
  }
  return out;
}

function patSwoosh(t, R) {
  const c = t.c;
  const flip = R() > 0.5;
  const tr = flip ? `transform="translate(${W},0) scale(-1,1)"` : '';
  const j = () => (R() - 0.5) * 80;
  const curve = (dy) => smoothOpen([
    [-200, 120 + dy + j()], [300, 160 + dy], [760, 420 + dy + j()], [1180, 560 + dy], [1600, 640 + dy + j()], [2140, 980 + dy],
  ]);
  let out = `<rect width="${W}" height="${H}" fill="${c.mustard}"/>`;
  out += `<g ${tr}>`;
  // top-right cream & sage blobs
  out += `<path fill="${c.cream}" d="${blob(1560, 120, 400, R, 7, 0.3)}"/>`;
  out += `<path fill="${c.sage}" d="${blob(1720, 40, 190, R, 6, 0.3)}"/>`;
  // bottom-left sage & cream blobs
  out += `<path fill="${c.sage}" d="${blob(260, 1000, 470, R, 7, 0.3)}"/>`;
  out += `<path fill="${c.cream}" d="${blob(330, 1060, 260, R, 6, 0.35)}"/>`;
  // swoosh bands
  out += `<path d="${curve(150)}" fill="none" stroke="${c.rust}" stroke-width="230" stroke-linecap="round"/>`;
  out += `<path d="${curve(-60)}" fill="none" stroke="${c.orange}" stroke-width="240" stroke-linecap="round"/>`;
  out += `<path d="${curve(-215)}" fill="none" stroke="${c.cream}" stroke-width="8"/>`;
  out += `</g>`;
  return out;
}

function patCosmic(t, R) {
  const c = t.c;
  let out = `<rect width="${W}" height="${H}" fill="${c.bg}"/>`;
  // flowing stripes bottom-left -> top-right
  const base = [[-100, 1180], [380, 900], [760, 720], [1080, 520], [1380, 330], [1700, 170], [2050, 60]];
  const jit = base.map(([x, y]) => [x + (R() - 0.5) * 60, y + (R() - 0.5) * 60]);
  const d = smoothOpen(jit);
  const widths = [300, 250, 200, 150, 100, 50];
  const cols = [c.gold, c.bg, c.pale, c.bg, c.gold, c.bg];
  widths.forEach((w, i) => { out += `<path d="${d}" fill="none" stroke="${cols[i]}" stroke-width="${w}" stroke-linecap="round"/>`; });
  // concentric arcs bottom-right
  const ax = 1640 + R() * 120, ay = 1020;
  [300, 240, 180, 120, 60].forEach((r, i) => {
    out += `<circle cx="${ax}" cy="${ay}" r="${r}" fill="${i % 2 ? c.bg : (i % 4 ? c.gold : c.pale)}"/>`;
  });
  // planets
  const planets = [[300, 860, 70], [1500, 300, 46], [920, 140, 34], [200, 230, 30], [1780, 760, 52]];
  planets.forEach(([x, y, r]) => {
    out += `<circle cx="${x + (R() - 0.5) * 60}" cy="${y + (R() - 0.5) * 60}" r="${r}" fill="${c.dark}"/>`;
  });
  // ringed planet
  out += `<g transform="translate(${1180 + R() * 80},${860 + R() * 40}) rotate(-14)"><ellipse rx="120" ry="26" fill="${c.pale}" opacity="0.9"/><circle r="52" fill="${c.mint}"/><path d="M-120,0 A120,26 0 0 0 120,0" fill="none" stroke="${c.pale}" stroke-width="16"/></g>`;
  // big spiky stars (corners + edges, mostly outside the panel centre)
  const big = [[150, 120, 120], [1790, 140, 100], [90, 640, 110], [1840, 520, 90], [700, 1010, 95], [1300, 60, 70]];
  big.forEach(([x, y, r], i) => {
    const fill = i % 3 === 2 ? c.dark : c.gold;
    out += spikyStar(x + (R() - 0.5) * 40, y + (R() - 0.5) * 40, r, fill, R, R() * 0.4);
    out += sparkle(x, y, r * 0.3, i % 3 === 2 ? c.pale : c.cream, 0.22);
  });
  // small sparkles
  for (let i = 0; i < 46; i++) {
    const x = R() * W, y = R() * H;
    const col = R() < 0.6 ? c.cream : (R() < 0.5 ? c.dark : c.gold);
    out += sparkle(x, y, 10 + R() * 24, col);
  }
  return out;
}

function patGeo(t, R) {
  const c = t.c;
  let out = `<rect width="${W}" height="${H}" fill="${c.peri}"/>`;
  const ang = -58 + (R() - 0.5) * 10;
  // cream corner wedges
  out += `<polygon fill="${c.cream}" points="${pts([[980, -20], [1960, -20], [1960, 520]])}"/>`;
  out += `<polygon fill="${c.cream}" points="${pts([[-20, 760], [260, 1100], [-20, 1100]])}"/>`;
  // navy and orange diagonal bands
  out += `<g transform="translate(${760 + R() * 120},540) rotate(${ang})">
    <rect x="-1400" y="-150" width="2800" height="300" fill="${c.navy}"/>
    <rect x="-1400" y="-110" width="2800" height="170" fill="${c.orange}"/>
    ${Array.from({ length: 16 }, (_, i) => `<circle cx="${-900 + i * 120}" cy="112" r="20" fill="${c.lilac}"/>`).join('')}
  </g>`;
  out += `<g transform="translate(${1500 + R() * 80},700) rotate(${ang + 90})">
    <rect x="-1300" y="-90" width="2600" height="180" fill="${c.navy}"/>
  </g>`;
  // big orange triangle
  out += `<polygon fill="${c.orange}" points="${pts([[1420, 180], [1960, 470], [1500, 820]])}"/>`;
  // outlined triangles
  out += `<polygon fill="none" stroke="${c.cream}" stroke-width="9" points="${pts([[1560, 330], [1840, 470], [1610, 680]])}"/>`;
  out += `<polygon fill="none" stroke="${c.cream}" stroke-width="9" points="${pts([[60, 1100], [260, 820], [460, 1100]])}"/>`;
  out += `<polygon fill="none" stroke="${c.cream}" stroke-width="9" points="${pts([[150, 1100], [260, 940], [370, 1100]])}"/>`;
  // concentric target
  const tx = 560 + R() * 200, ty = 70;
  [150, 112, 86, 60, 36].forEach((r, i) => {
    out += i % 2 ? `<circle cx="${tx}" cy="${ty}" r="${r}" fill="none" stroke="${c.cream}" stroke-width="9"/>` : (i === 0 ? `<circle cx="${tx}" cy="${ty}" r="${r}" fill="${c.navy}"/>` : '');
  });
  // squiggles
  const squig = (x, y, len) => {
    const p = [];
    for (let i = 0; i <= 14; i++) p.push([x + Math.sin(i * 1.3) * 16, y + (i / 14) * len]);
    return `<path d="${smoothOpen(p)}" fill="none" stroke="${c.cream}" stroke-width="8" stroke-linecap="round"/>`;
  };
  out += squig(90 + R() * 40, 80, 300) + squig(1830, 760, 260);
  // translucent ring
  out += `<circle cx="${380 + R() * 60}" cy="${560}" r="120" fill="none" stroke="${c.gold}" stroke-width="60" opacity="0.55"/>`;
  return out;
}

function patArches(t, R) {
  const c = t.c;
  let out = `<rect width="${W}" height="${H}" fill="${c.mustard}"/>`;
  const arch = (x, y, w, h, fill, op = 1) => {
    const r = w / 2;
    return `<path fill="${fill}" opacity="${op}" d="M${x},${y + h} L${x},${y + r} A${r},${r} 0 0 1 ${x + w},${y + r} L${x + w},${y + h} Z"/>`;
  };
  const off = (R() - 0.5) * 120;
  out += `<rect x="${1270 + off}" y="0" width="${W}" height="${H}" fill="${c.rust}"/>`;
  out += arch(70 + off * 0.3, 70, 560, 1200, c.cream);
  out += `<path fill="${c.mustard}" d="M${360 + off * 0.3},1100 L${360 + off * 0.3},640 A240,240 0 0 1 ${600 + off * 0.3},420 L${900 + off * 0.3},420 L${900 + off * 0.3},1100Z"/>`;
  out += arch(1530 + off, 240, 520, 1100, c.maroon);
  out += arch(1700 + off, 660, 460, 900, c.olive);
  out += arch(780 + off * 0.5, 560, 620, 800, c.forest);
  // overlap tint: forest arch over rust column = maroon-ish
  out += `<clipPath id="ac"><rect x="${1270 + off}" y="0" width="${W}" height="${H}"/></clipPath>`;
  out += `<g clip-path="url(#ac)">${arch(780 + off * 0.5, 560, 620, 800, c.maroon, 0.92)}</g>`;
  return out;
}

// ---------- theme table ----------

const groovyC = { brown: '#a0401a', orange: '#d95a0b', mustard: '#f2a52b', cream: '#fde4b5', sage: '#a6ad78', rust: '#a0401a' };

export const THEMES = {
  checker: {
    name: 'Funky Fall', hint: 'Wavy checkerboard',
    c: { cream: '#f3e6cc', orange: '#d4652a', mustard: '#e2a930', olive: '#7b7f3e', brown: '#7d3f22', peach: '#e89668' },
    pattern: patChecker,
    panel: { fill: '#f3e6cc', dash: '#d4652a', edge: '#4b2a1a', shadow: '#4b2a1a' },
    ink: '#3d2216', muted: '#8a5a3c',
    badge: { fill: '#d4652a', ink: '#fbf2df' },
    pill: { fill: '#7b7f3e', ink: '#fbf2df' },
    accents: [
      { fill: '#d4652a', ink: '#fff6e6' }, { fill: '#e2a930', ink: '#3d2216' },
      { fill: '#7b7f3e', ink: '#fff6e6' }, { fill: '#7d3f22', ink: '#fff6e6' },
      { fill: '#e89668', ink: '#3d2216' }, { fill: '#4b2a1a', ink: '#fff6e6' },
    ],
    grain: { color: '#ffffff', alpha: 0.25, sparse: 0.6 },
  },
  groovy: {
    name: 'Groovy Waves', hint: 'Wavy stripes',
    c: groovyC,
    pattern: patGroovy,
    panel: { fill: '#fde4b5', dash: '#d95a0b', edge: '#5a2410', shadow: '#5a2410' },
    ink: '#4a1f0e', muted: '#a0401a',
    badge: { fill: '#d95a0b', ink: '#fdedcf' },
    pill: { fill: '#a6ad78', ink: '#3b2a10' },
    accents: [
      { fill: '#d95a0b', ink: '#fff3dc' }, { fill: '#f2a52b', ink: '#4a1f0e' },
      { fill: '#a6ad78', ink: '#2f2a12' }, { fill: '#a0401a', ink: '#fff3dc' },
      { fill: '#5a2410', ink: '#fdedcf' }, { fill: '#e8c27a', ink: '#4a1f0e' },
    ],
  },
  swoosh: {
    name: 'Seventies Swoosh', hint: 'Flowing bands',
    c: groovyC,
    pattern: patSwoosh,
    panel: { fill: '#f2a52b', dash: '#a0401a', edge: '#5a200b', shadow: '#5a200b' },
    ink: '#4a1f0e', muted: '#8f3515',
    badge: { fill: '#a0401a', ink: '#fde4b5' },
    pill: { fill: '#a0401a', ink: '#fde4b5' },
    accents: [
      { fill: '#d95a0b', ink: '#fff3dc' }, { fill: '#fde4b5', ink: '#5a200b' },
      { fill: '#a6ad78', ink: '#2f2a12' }, { fill: '#a0401a', ink: '#fff3dc' },
      { fill: '#c97a3a', ink: '#fff3dc' }, { fill: '#5a200b', ink: '#fde4b5' },
    ],
  },
  cosmic: {
    name: 'Cosmic Riso', hint: 'Stars & planets',
    c: { bg: '#8fbba0', gold: '#f6b31e', pale: '#efcf72', dark: '#13291f', cream: '#f5eed6', mint: '#b6d8bf' },
    pattern: patCosmic,
    panel: { fill: '#8fbba0', dash: '#f6b31e', edge: '#13291f', shadow: '#0d1d16' },
    ink: '#13291f', muted: '#2c5440',
    badge: { fill: '#f6b31e', ink: '#13291f' },
    pill: { fill: '#13291f', ink: '#f5eed6' },
    accents: [
      { fill: '#f6b31e', ink: '#13291f' }, { fill: '#13291f', ink: '#f5eed6' },
      { fill: '#efcf72', ink: '#13291f' }, { fill: '#f5eed6', ink: '#13291f' },
      { fill: '#3f6b53', ink: '#f5eed6' }, { fill: '#d98f1a', ink: '#13291f' },
    ],
    grain: { color: '#f8f1d8', alpha: 0.55, sparse: 0.62 },
  },
  geo: {
    name: 'Geo Riso', hint: 'Bold shapes',
    c: { peri: '#6476c4', navy: '#1f2f78', orange: '#ff9e1f', cream: '#efe2cc', lilac: '#9d97d2', gold: '#f5c542' },
    pattern: patGeo,
    panel: { fill: '#6476c4', dash: '#ff9e1f', edge: '#1d2c70', shadow: '#111a47' },
    ink: '#f8efe0', muted: '#1d2c70',
    badge: { fill: '#ff9e1f', ink: '#1d2c70' },
    pill: { fill: '#1d2c70', ink: '#f3e8d4' },
    accents: [
      { fill: '#ff9e1f', ink: '#1d2c70' }, { fill: '#1d2c70', ink: '#f8efe0' },
      { fill: '#efe2cc', ink: '#1d2c70' }, { fill: '#9d97d2', ink: '#1d2c70' },
      { fill: '#f5c542', ink: '#1d2c70' }, { fill: '#3a4fae', ink: '#f8efe0' },
    ],
    grain: { color: '#f4ead8', alpha: 0.55, sparse: 0.6 },
  },
  arches: {
    name: 'Mid-Century Arches', hint: 'Arches & columns',
    c: { mustard: '#e0a73a', cream: '#f5e4b0', rust: '#bc5329', maroon: '#7b2b1f', forest: '#3e5537', olive: '#667338' },
    pattern: patArches,
    panel: { fill: '#e0a73a', dash: '#3e5537', edge: '#7b2b1f', shadow: '#7b2b1f' },
    ink: '#3a1d14', muted: '#7b2b1f',
    badge: { fill: '#3e5537', ink: '#f7eac4' },
    pill: { fill: '#bc5329', ink: '#f7eac4' },
    accents: [
      { fill: '#bc5329', ink: '#fff4dc' }, { fill: '#f5e4b0', ink: '#3a1d14' },
      { fill: '#3e5537', ink: '#f7eac4' }, { fill: '#7b2b1f', ink: '#f7eac4' },
      { fill: '#667338', ink: '#f7eac4' }, { fill: '#d88a5a', ink: '#3a1d14' },
    ],
    grain: { color: '#6b4a1a', alpha: 0.18, sparse: 0.5, freq: 1.4 },
  },
};

export const THEME_ORDER = ['checker', 'groovy', 'cosmic', 'swoosh', 'geo', 'arches'];

export function themeBase(key) {
  const t = THEMES[key] || THEMES.checker;
  return t.panel.shadow;
}

export function backgroundSvg(themeKey, variant, seed) {
  const t = THEMES[themeKey] || THEMES.checker;
  const R = rng(seed + hashStr(themeKey));
  let body = t.pattern(t, R);
  let defs = '';
  if (t.grain) {
    defs += grainDefs('g1', t.grain);
    body += grainRect('g1');
  }
  if (variant === 'panel') {
    defs += panelDefs(t);
    body += panelSvg(t);
  }
  defs += filmGrainDefs('fg');
  body += `<rect x="0" y="0" width="${W}" height="${H}" filter="url(#fg)" opacity="${FILM_GRAIN.opacity}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}</defs>${body}</svg>`;
}
