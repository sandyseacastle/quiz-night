// Slide layout engine. Produces a list of absolutely positioned elements on a 1920x1080 stage.
// The SAME layout feeds the browser renderer and the PowerPoint exporter, so text is wrapped
// here (with real font metrics) and both outputs use identical line breaks and sizes.
import { THEMES, PANEL, DASH, hexToRgb } from './themes.js';
import { answerText, showsOptions } from './deck.js';

export const FONTS = { display: 'Shrikhand', body: 'Bricolage Grotesque', title: 'Salina' };
// Used while a font is missing (Salina isn't bundled), so layout and screen match what is drawn.
// Upright on purpose: Shrikhand is a slanted script, which read as italics in titles.
const FONT_FALLBACK = { title: FONTS.body };
export const fontFamily = (key) => [FONTS[key] || FONTS.body, FONT_FALLBACK[key]].filter(Boolean).map((n) => `"${n}"`).join(', ');

const ctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;

export async function fontsReady() {
  await Promise.all([
    document.fonts.load(`400 40px "${FONTS.display}"`),
    document.fonts.load(`700 40px "${FONTS.body}"`),
    document.fonts.load(`400 40px "${FONTS.body}"`),
    document.fonts.load(`700 40px "${FONTS.title}"`).catch(() => []), // fine if Salina isn't installed
  ]);
}

function textWidth(s, font, weight, size, ls = 0) {
  ctx.font = `${weight} ${size}px ${fontFamily(font)}`;
  return ctx.measureText(s).width + ls * s.length;
}

export function wrap(text, font, weight, size, maxW, ls = 0) {
  const lines = [];
  lines.broke = false;
  for (const para of String(text).split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(''); continue; }
    let cur = '';
    for (let w of words) {
      // hard-break words that are wider than the box
      while (textWidth(w, font, weight, size, ls) > maxW && w.length > 1) {
        let i = w.length - 1;
        while (i > 1 && textWidth(w.slice(0, i), font, weight, size, ls) > maxW) i--;
        if (cur) { lines.push(cur); cur = ''; }
        lines.broke = true;
        lines.push(w.slice(0, i));
        w = w.slice(i);
      }
      const test = cur ? cur + ' ' + w : w;
      if (!cur || textWidth(test, font, weight, size, ls) <= maxW) cur = test;
      else { lines.push(cur); cur = w; }
    }
    lines.push(cur);
  }
  return lines;
}

// Largest size between max..min where the wrapped text fits the box.
export function fitText(text, { font = 'body', weight = 700, w, h, max = 96, min = 24, lh = 1.18, ls = 0, maxLines = 99 }) {
  const slack = 0.95; // leave room for renderer metric differences (PowerPoint)
  let size = max, lines;
  while (size >= min) {
    lines = wrap(text, font, weight, size, w * slack, ls * size);
    if (lines.length * size * lh <= h && lines.length <= maxLines && !lines.broke) break;
    size -= size > 60 ? 4 : 2;
  }
  if (size < min) { size = min; lines = wrap(text, font, weight, size, w * slack, ls * size); }
  return { size, lines, height: lines.length * size * lh };
}

function T(text, box, o = {}) {
  const fit = fitText(text, { ...o, w: box.w, h: box.h });
  return {
    t: 'text', x: box.x, y: box.y, w: box.w, h: box.h, lines: fit.lines, size: fit.size,
    font: o.font || 'body', weight: o.weight ?? 700, lh: o.lh || 1.18, color: o.color, align: o.align || 'center',
    valign: o.valign || 'middle', ls: (o.ls || 0) * fit.size, op: o.op ?? 1, _height: fit.height,
  };
}
// Question text: the first line is the question; any further lines are the detail, set in regular
// weight with a clear gap below the question. One detail line (a quote) sits centred under it;
// several (a list of clues) become a left-aligned list with space between the items.
const DETAIL_GAP = 0.6; // × font size, question → detail
const LIST_GAP = 0.9; // × font size, question → list
const ITEM_GAP = 0.45; // × font size, between list items
function qFit(text, { w, h, max, min, lh = 1.18 }) {
  const [head, ...rest] = String(text).split(/\r?\n/);
  const items = rest.map((l) => l.trim()).filter(Boolean);
  const list = items.length > 1;
  const slack = 0.95;
  let size = max, hl, il, height;
  for (;;) {
    hl = wrap(head, 'body', 700, size, w * slack);
    il = items.map((it) => wrap(it, 'body', 400, size, w * slack));
    const n = il.reduce((a, l) => a + l.length, 0);
    height = (hl.length + n) * size * lh + (items.length ? (list ? LIST_GAP : DETAIL_GAP) * size : 0) + (list ? (items.length - 1) * ITEM_GAP * size : 0);
    if (size <= min || (height <= h && !hl.broke && !il.some((l) => l.broke))) break;
    size -= size > 60 ? 4 : 2;
  }
  const lineW = list ? Math.max(...il.flat().map((l) => textWidth(l, 'body', 400, size))) : 0;
  return { head, items, list, size, lh, headH: hl.length * size * lh, itemH: il.map((l) => l.length * size * lh), lineW, height };
}
function qText(text, box, o = {}) {
  const fit = qFit(text, { w: box.w, h: box.h, max: o.max, min: o.min, lh: o.lh });
  if (!fit.items.length) return [T(text, box, o)];
  const valign = o.valign || 'middle';
  const top = valign === 'top' ? box.y : valign === 'bottom' ? box.y + box.h - fit.height : box.y + (box.h - fit.height) / 2;
  const fixed = { ...o, max: fit.size, min: fit.size, valign: 'top' };
  const els = [T(fit.head, { x: box.x, y: top, w: box.w, h: fit.headH }, fixed)];
  if (!fit.list) {
    els.push(T(fit.items[0], { x: box.x, y: top + fit.headH + DETAIL_GAP * fit.size, w: box.w, h: fit.itemH[0] }, { ...fixed, weight: 400 }));
    return els;
  }
  // the list block is as wide as its longest line, centred under a centred question
  const bw = Math.min(box.w, fit.lineW / 0.95 + 8);
  const bx = (o.align || 'center') === 'center' ? box.x + (box.w - bw) / 2 : box.x;
  let y = top + fit.headH + LIST_GAP * fit.size;
  fit.items.forEach((it, i) => {
    els.push(T(it, { x: bx, y, w: bw, h: fit.itemH[i] }, { ...fixed, weight: 400, align: 'left' }));
    y += fit.itemH[i] + ITEM_GAP * fit.size;
  });
  return els;
}

// Option tiles and answer boxes: a light tint of the panel with dark text, the same in every theme
function mix(a, b, k) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join('');
}
const tileFill = (t) => mix(t.panel.fill, '#ffffff', 0.62);
const tileInk = (t) => t.panel.edge;
// accents dark enough for a light letter, so every letter circle is dark-with-light-text
const darkAccents = (t) => t.accents.filter((a) => hexToRgb(a.ink).reduce((x, y) => x + y) > 600);

const rect = (x, y, w, h, fill, o = {}) => ({ t: 'rect', x, y, w, h, fill, r: o.r || 0, stroke: o.stroke, sw: o.sw, dash: o.dash, op: o.op ?? 1, cls: o.cls });
const ellipse = (x, y, w, h, fill, o = {}) => ({ t: 'ellipse', x, y, w, h, fill, stroke: o.stroke, sw: o.sw, op: o.op ?? 1 });

function contain(aw, ah, box) {
  const a = aw && ah ? aw / ah : 16 / 9;
  let w = box.w, h = w / a;
  if (h > box.h) { h = box.h; w = h * a; }
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

// Content area inside the baked-in panel (the footer row below it holds the number and category)
const C = { x: 270, y: 116, w: 1380, h: 810 };
const CB = C.y + C.h;
const FOOT = { y: 942, h: 54, l: PANEL.x + 76, r: PANEL.x + PANEL.w - 76 };

// ---------- shared chrome ----------
// Bottom-right: category (small caps) then the question number, kept low-key.
// chip: draw a panel-coloured backing so it can sit on the pattern (video slides)
function footer(t, text, number, { y = FOOT.y, chip = false } = {}) {
  const cs = 26, ns = 46, gap = 26;
  const cap = (text || '').toUpperCase();
  const num = number == null ? '' : String(number);
  const nw = num ? textWidth(num, 'title', 700, ns) : 0;
  const maxCap = 900;
  const cw = cap ? Math.min(textWidth(cap, 'body', 700, cs, cs * 0.12), maxCap) : 0;
  const total = cw + nw + (cap && num ? gap : 0);
  if (!total) return [];
  const els = [];
  if (chip) els.push(rect(FOOT.r - total - 36, y - 2, total + 72, FOOT.h + 4, t.panel.fill, { r: (FOOT.h + 4) / 2 }));
  if (num) els.push(T(num, { x: FOOT.r - nw - 40, y: y + 2, w: nw + 40, h: FOOT.h }, { font: 'title', weight: 700, max: ns, min: ns, lh: 1, color: t.ink, align: 'right', op: 0.85 }));
  if (cap) els.push(T(cap, { x: FOOT.r - total - 40, y, w: cw + 40, h: FOOT.h }, { max: cs, min: 18, ls: 0.12, color: t.muted, align: 'right', maxLines: 1 }));
  return els;
}
// Question number, large, in the panel's top-left corner (C is inset to clear it)
const BADGE = { d: 150, x: PANEL.x + 28, y: PANEL.y + 22 };
function numberBadge(t, number) {
  if (number == null) return [];
  const { d, x, y } = BADGE;
  return [T(String(number), { x, y, w: d, h: d }, { font: 'title', weight: 700, max: 110, min: 50, lh: 1, color: t.panel.dash, maxLines: 1 })];
}
// A question set along the top of the slide: its first line is centred on the question number,
// so the two read as one row. Returns the elements and where the text ends.
const NUM_CY = BADGE.y + BADGE.d / 2;
function topQuestion(t, text, { x = C.x, w = C.w, maxH, max, min, align = 'center', op = 1 }) {
  const fit = qFit(text, { w, h: maxH, max, min });
  const y = Math.max(PANEL.y + 30, NUM_CY - (fit.size * fit.lh) / 2);
  const els = qText(text, { x, y, w, h: fit.height }, { max: fit.size, min: fit.size, color: t.ink, align, valign: 'top', op });
  return { els, bottom: y + fit.height };
}
// Bottom-left tag (WATCH CLOSELY, LISTEN…)
function pill(t, text, y = FOOT.y) {
  const size = 24;
  const w = textWidth(text, 'body', 700, size, size * 0.14) + 60;
  return [
    rect(FOOT.l, y, w, FOOT.h, t.pill.fill, { r: FOOT.h / 2 }),
    T(text, { x: FOOT.l, y, w, h: FOOT.h }, { max: size, min: size, ls: 0.14, color: t.pill.ink, lh: 1 }),
  ];
}
function frame(t, r) {
  return [
    rect(r.x - 14, r.y - 14, r.w + 28, r.h + 28, t.panel.edge, { r: 18 }),
  ];
}
function imageEl(t, q, box, f = q.file || {}) {
  const r = contain(f.w, f.h, box);
  return [...frame(t, r), { t: 'image', ...r, src: f.src }];
}
function eqBars(t, cx, cy, count, gap = 16, bw = 20, maxH = 150, seed = 1) {
  const out = [];
  const total = count * bw + (count - 1) * gap;
  for (let i = 0; i < count; i++) {
    const hgt = maxH * (0.3 + 0.7 * Math.abs(Math.sin((i + 1) * 1.7 + seed)));
    const acc = t.accents[i % 3];
    out.push(rect(cx - total / 2 + i * (bw + gap), cy - hgt / 2, bw, hgt, acc.fill, { r: bw / 2, cls: 'eq' }));
  }
  return out;
}
function audioDisc(t, q, cx, cy, d) {
  const x = cx - d / 2, y = cy - d / 2;
  return [
    ellipse(x, y, d, d, t.badge.fill, { stroke: t.panel.edge, sw: 8 }),
    { t: 'tri', x: x + d * 0.38, y: y + d * 0.29, w: d * 0.34, h: d * 0.42, fill: t.badge.ink, cls: 'play-icon' },
    { t: 'audio', x, y, w: d, h: d, src: q.file && q.file.src, start: +q.start || 0, end: +q.end || 0, autoplay: !!q.autoplay, ring: t.badge.ink, fill: t.badge.fill, edge: t.panel.edge, bgc: t.panel.fill, shadow: t.panel.shadow },
  ];
}

const letter = (i) => String.fromCharCode(65 + i);
// Pill-shaped tiles: the letter circle is concentric with the rounded left end, so the padding above,
// below and left of it is the same, and the same gap again separates it from the text.
function optionTiles(t, q, box, { cols, answer = false, maxSize = 60, label = letter, maxH = 200 }) {
  const opts = (q.options || []).slice(0, 6);
  const n = Math.max(opts.length, 1);
  cols = cols || (n <= 3 ? n : n === 4 ? 2 : 3);
  const rows = Math.ceil(n / cols);
  const gap = 28;
  const tw = (box.w - gap * (cols - 1)) / cols;
  const th = Math.min((box.h - gap * (rows - 1)) / rows, maxH);
  const circles = darkAccents(t);
  const top = box.y + (box.h - (th * rows + gap * (rows - 1))) / 2;
  const els = [];
  opts.forEach((o, i) => {
    const acc = circles[i % circles.length];
    const x = box.x + (i % cols) * (tw + gap), y = top + Math.floor(i / cols) * (th + gap);
    const correct = i === (q.correct || 0);
    const op = answer && !correct ? 0.3 : 1;
    const r = th / 2;
    const pad = Math.max(Math.min(24, Math.max(12, th * 0.14)), (th - 100) / 2);
    const d = th - 2 * pad;
    if (answer && correct) els.push(rect(x - 12, y - 12, tw + 24, th + 24, 'none', { r: r + 12, stroke: t.ink, sw: 7 }));
    els.push(rect(x, y, tw, th, tileFill(t), { r, op }));
    els.push(ellipse(x + pad, y + pad, d, d, acc.fill, { op }));
    els.push(T(label(i), { x: x + pad, y: y + pad + d * 0.02, w: d, h: d }, { font: 'title', weight: 700, max: Math.round(d * 0.56), min: 20, lh: 1, color: acc.ink, op }));
    // text starts one padding after the circle (capped, so tall tiles keep room for long options)
    // and stops just inside the right-hand rounded end
    const tx = x + pad + d + Math.min(pad, 26);
    els.push(T(o || '…', { x: tx, y: y + pad / 2, w: x + tw - r * 0.3 - tx, h: th - pad }, { max: Math.min(maxSize, Math.round(th * 0.4)), min: 20, color: tileInk(t), align: 'left', op }));
  });
  return els;
}

// Order: items lettered A, B… (players write the letters in order).
// Match: items numbered 1, 2…, to pair with the letters in the image.
const ORDER = {
  order: { item: letter },
  match: { item: (i) => String(i + 1) },
};
function layoutOrder(t, q, text, hasImage) {
  const kind = ORDER[q.answerType];
  const els = [];
  const n = q.options.length;
  const head = topQuestion(t, text, { maxH: 150, max: 66, min: 30 });
  els.push(...head.els);
  const bodyY = head.bottom + 36;
  if (!hasImage) {
    els.push(...optionTiles(t, q, { x: C.x, y: bodyY, w: C.w, h: CB - bodyY }, { label: kind.item }));
    return els;
  }
  const f = q.file;
  if ((f.w || 4) / (f.h || 3) >= 1.3) {
    // wide image (e.g. the palettes): big image on the left, items in a column on the right
    const iw = Math.round(C.w * 0.68);
    const imgBox = { x: C.x, y: bodyY, w: iw, h: CB - bodyY };
    els.push(...imageEl(t, q, imgBox));
    const rx = C.x + iw + 50;
    els.push(...optionTiles(t, q, { x: rx, y: imgBox.y, w: C.x + C.w - rx, h: imgBox.h }, { cols: 1, label: kind.item, maxSize: 36, maxH: 130 }));
    return els;
  }
  // square / tall image: items in a column on the left, image on the right
  const side = Math.min(CB - bodyY, C.w * 0.5);
  els.push(...imageEl(t, q, { x: C.x + C.w - side, y: bodyY, w: side, h: CB - bodyY }));
  const lw = C.w - side - 60;
  els.push(...optionTiles(t, q, { x: C.x, y: bodyY, w: lw, h: CB - bodyY }, { cols: 1, label: kind.item, maxSize: 40, maxH: 130 }));
  return els;
}

// ---------- slide kinds ----------
function layoutQuestion(d, quiz, t) {
  const q = d.q;
  const st = quiz.settings || {};
  const els = [];
  const catLabel = st.showCategoryOnQuestions === false ? '' : d.cat.title;
  const media = q.media || 'none';
  const hasFile = q.file && q.file.src;
  const mc = showsOptions(q);
  const text = q.text || 'Type your question…';

  if (d.kind === 'video') {
    // full-pattern slide: the clip gets nearly the whole screen, centred on the slide, with just the
    // question number top-left on a panel-coloured chip so it reads against the pattern
    const f = q.file || {};
    const r = contain(f.w || 16, f.h || 9, { x: 60, y: 170, w: 1800, h: 880 });
    r.y = Math.max(170, (1080 - r.h) / 2);
    els.push(...frame(t, r), { t: 'video', ...r, src: f.src, start: +q.start || 0, end: +q.end || 0, poster: true });
    const num = String(d.number);
    const nw = textWidth(num, 'title', 700, 96) + 64;
    els.push(rect(46, 22, nw, 128, t.panel.fill, { r: 32 }));
    els.push(T(num, { x: 46, y: 22, w: nw, h: 128 }, { font: 'title', weight: 700, max: 96, min: 60, lh: 1, color: t.panel.dash, maxLines: 1 }));
    return els;
  }
  els.push(...footer(t, catLabel, null), ...numberBadge(t, d.number));

  if (ORDER[q.answerType] && mc && media !== 'audio') return [...els, ...layoutOrder(t, q, text, media === 'image' && hasFile)];

  if (media === 'image' && hasFile) {
    const f = q.file;
    const wide = (f.w || 4) / (f.h || 3) >= 1.3;
    if (mc) {
      const col = { x: C.x + C.w - 560, y: C.y, w: 560, h: C.h };
      els.push(...imageEl(t, q, col));
      const rx = C.x, rw = C.w - 620;
      els.push(...qText(text, { x: rx, y: C.y, w: rw, h: 230 }, { max: 66, min: 30, color: t.ink, align: 'left' }));
      // one option per row: next to the image a 2×2 grid is too narrow for longer answers (film titles)
      els.push(...optionTiles(t, q, { x: rx, y: C.y + 260, w: rw, h: C.h - 260 }, { cols: 1, maxSize: 48, maxH: 140 }));
    } else if (wide) {
      // question on top, the wide image underneath
      // a one-line question (if it fits at a decent size) leaves the most height for the picture
      const one = topQuestion(t, text, { maxH: 90, max: 64, min: 46 });
      const head = one.bottom <= NUM_CY + 64 * 1.18 / 2 + 1 ? one : topQuestion(t, text, { maxH: 190, max: 70, min: 32 });
      els.push(...head.els);
      els.push(...imageEl(t, q, { x: C.x, y: head.bottom + 40, w: C.w, h: CB - head.bottom - 40 }));
    } else {
      els.push(...imageEl(t, q, { x: C.x + C.w - 780, y: C.y, w: 780, h: C.h }));
      els.push(...qText(text, { x: C.x, y: C.y, w: C.w - 860, h: C.h }, { max: 84, min: 32, color: t.ink, align: 'left' }));
    }
    return els;
  }

  if (media === 'audio') {
    if (mc) {
      const cx = C.x + 280, cy = C.y + C.h / 2 - 60;
      els.push(...audioDisc(t, q, cx, cy, 320));
      els.push(...eqBars(t, cx, cy + 260, 9, 14, 20, 110, 2));
      const rx = C.x + 620, rw = C.w - 620;
      els.push(...qText(text, { x: rx, y: C.y, w: rw, h: 230 }, { max: 68, min: 30, color: t.ink, align: 'left' }));
      els.push(...optionTiles(t, q, { x: rx, y: C.y + 260, w: rw, h: C.h - 260 }, { cols: q.options.length >= 4 ? 2 : 1, maxSize: 48 }));
    } else {
      // play button and question as one group, centred on the slide
      const disc = 290, gap = 70;
      const qf = qFit(text, { w: C.w, h: C.h - disc - gap, max: 84, min: 32 });
      const top = 540 - (disc + gap + qf.height) / 2;
      const cy = top + disc / 2;
      els.push(...eqBars(t, 960 - 420, cy, 9, 18, 24, 170, 1));
      els.push(...eqBars(t, 960 + 420, cy, 9, 18, 24, 170, 4));
      els.push(...audioDisc(t, q, 960, cy, disc));
      els.push(...qText(text, { x: C.x, y: top + disc + gap, w: C.w, h: qf.height }, { max: qf.size, min: qf.size, color: t.ink }));
    }
    return els;
  }

  // text / video-follow-up question
  if (mc) {
    const head = topQuestion(t, text, { maxH: q.options.length <= 3 ? 300 : 230, max: 80, min: 34 });
    els.push(...head.els);
    const top = head.bottom + 40;
    els.push(...optionTiles(t, q, { x: C.x, y: top, w: C.w, h: CB - top }, {}));
  } else {
    els.push(...qText(text, C, { max: 110, min: 40, color: t.ink }));
  }
  return els;
}

function answerLines(t, q, box) {
  const ans = answerText(q) || '—';
  const lh = 1.5;
  const fit = fitText(ans, { font: 'title', weight: 700, w: box.w - 40, h: box.h, max: 110, min: 28, lh });
  const lineH = fit.size * lh;
  const top = box.y + (box.h - fit.lines.length * lineH) / 2;
  const els = [T(ans, { x: box.x + 20, y: top, w: box.w - 40, h: fit.lines.length * lineH }, { font: 'title', weight: 700, max: fit.size, min: fit.size, lh, color: t.ink })];
  // a dotted rule under every line, drawn as dots so screen and PowerPoint match
  const dot = Math.max(6, Math.round(fit.size * 0.1)), step = dot * 2.6;
  const n = Math.floor((box.w - dot) / step) + 1;
  const x0 = box.x + (box.w - ((n - 1) * step + dot)) / 2;
  fit.lines.forEach((_, i) => {
    const y = top + (i + 1) * lineH - fit.size * 0.12;
    for (let k = 0; k < n; k++) els.push(ellipse(x0 + k * step, y, dot, dot, t.ink, { op: 0.45 }));
  });
  return els;
}

function layoutAnswer(d, quiz, t) {
  const q = d.q;
  const els = [...footer(t, `Answer${d.cat.title ? ' · ' + d.cat.title : ''}`, null), ...numberBadge(t, d.number)];
  const mc = q.answerType === 'choice' && (q.options || []).length;
  // long multi-line questions (e.g. a list of clues) would shrink to unreadable here, so keep just the first line
  const full = q.text || '';
  const firstLine = full.split(/\r?\n/)[0];
  const text = firstLine !== full && fitText(full, { w: C.w, h: 170, max: 48, min: 24 }).size < 30 ? firstLine : full;
  const fact = (q.fact || '').trim();
  const factH = fact ? 110 : 0;
  const factEl = (x, w) => fact ? [T(fact, { x, y: CB - 96, w, h: 96 }, { weight: 400, max: 38, min: 22, color: t.ink, op: 0.85 })] : [];
  // the answer image (e.g. the unblurred logo) takes the place of the question's image
  const img = q.answerFile && q.answerFile.src ? q.answerFile : q.media === 'image' && q.file && q.file.src ? q.file : null;

  const head = topQuestion(t, text, { maxH: 170, max: 48, min: 24, align: 'left', op: 0.8 });
  els.push(...head.els);
  const body = { x: C.x, y: head.bottom + 40, w: C.w, h: CB - factH - head.bottom - 40 };

  if (img) {
    // image on the right; the answer is centred in the same band, so the two line up
    const iw = 620, lw = C.w - iw - 70;
    els.push(...imageEl(t, q, { x: C.x + C.w - iw, y: body.y, w: iw, h: body.h }, img));
    const left = { x: C.x, y: body.y, w: lw, h: body.h };
    if (mc) els.push(...optionTiles(t, q, left, { cols: 1, answer: true, maxSize: 44 }));
    else els.push(...answerLines(t, q, left));
    els.push(...factEl(C.x, lw));
    return els;
  }
  if (mc) els.push(...optionTiles(t, q, body, { answer: true }));
  else els.push(...answerLines(t, q, { x: C.x + 120, y: body.y, w: C.w - 240, h: body.h }));
  els.push(...factEl(C.x, C.w));
  return els;
}

function layoutAnswerList(d, quiz, t) {
  const els = [...footer(t, `Answers${d.cat.title ? ' · ' + d.cat.title : ''}`)];
  const items = d.items;
  const cols = items.length > 5 ? 2 : 1;
  const perCol = Math.ceil(items.length / cols);
  const gap = 50;
  const cw = (C.w - gap * (cols - 1)) / cols;
  const rh = Math.min(C.h / Math.max(perCol, 1), 170);
  const top = C.y + (C.h - rh * perCol) / 2;
  items.forEach((it, i) => {
    const col = Math.floor(i / perCol), row = i % perCol;
    const x = C.x + col * (cw + gap), y = top + row * rh;
    const dd = Math.min(rh - 30, 104);
    const acc = t.accents[i % 4];
    els.push(ellipse(x, y + (rh - dd) / 2, dd, dd, acc.fill));
    els.push(T(String(it.number), { x, y: y + (rh - dd) / 2 + 3, w: dd, h: dd }, { font: 'display', weight: 400, max: Math.round(dd * 0.5), min: 18, lh: 1, color: acc.ink }));
    els.push(T(answerText(it.q) || '—', { x: x + dd + 26, y: y + 6, w: cw - dd - 26, h: rh - 12 }, { max: Math.min(68, Math.round(rh * 0.42)), min: 22, color: t.ink, align: 'left' }));
  });
  return els;
}

function layoutCard(d, quiz, t) {
  const s = d.src || {};
  let kicker = s.kicker || d.kicker || '';
  let title = s.title || d.title || '';
  let subtitle = s.subtitle ?? d.subtitle ?? '';
  if (d.kind === 'category') {
    kicker = s.kicker || '';
    title = title || 'New category';
  }
  if (d.kind === 'answersHeader') { title = d.title || 'The Answers'; kicker = d.kicker || ''; subtitle = d.subtitle || ''; }
  const cw = 1380, cx = (1920 - cw) / 2;
  const titleFit = fitText(title || ' ', { font: 'title', weight: 700, w: cw - 160, h: 360, max: 190, min: 64, lh: 1.08 });
  const subFit = subtitle ? fitText(subtitle, { weight: 400, w: cw - 200, h: 170, max: 50, min: 26, lh: 1.25 }) : null;
  const padTop = kicker ? 96 : 70, padBot = 76;
  const ch = padTop + titleFit.height + (subFit ? 34 + subFit.height : 0) + padBot;
  const cy = Math.max(60, (1080 - ch) / 2 + 10);
  const o = DASH.offset;
  const els = [
    rect(cx, cy, cw, ch, t.panel.fill, { r: 64 }),
    rect(cx - o, cy - o, cw + 2 * o, ch + 2 * o, 'none', { r: 64 + o, stroke: t.panel.dash, sw: DASH.w, dash: true }),
  ];
  if (kicker) {
    const ks = 34;
    const kw = textWidth(kicker.toUpperCase(), 'body', 700, ks, ks * 0.16) + 96;
    els.push(rect(960 - kw / 2, cy - 44, kw, 88, t.badge.fill, { r: 44, stroke: t.panel.edge, sw: 6 }));
    els.push(T(kicker.toUpperCase(), { x: 960 - kw / 2, y: cy - 44, w: kw, h: 88 }, { max: ks, min: ks, ls: 0.16, color: t.badge.ink, lh: 1, maxLines: 1 }));
  }
  els.push(T(title || ' ', { x: cx + 80, y: cy + padTop, w: cw - 160, h: titleFit.height }, { font: 'title', weight: 700, max: titleFit.size, min: titleFit.size, lh: 1.08, color: t.ink }));
  if (subFit) els.push(T(subtitle, { x: cx + 100, y: cy + padTop + titleFit.height + 34, w: cw - 200, h: subFit.height }, { weight: 400, max: subFit.size, min: subFit.size, lh: 1.25, color: t.ink, op: 0.9 }));
  return els;
}

export function notesFor(d) {
  const parts = [];
  if (d.q) {
    if (d.kind === 'video') parts.push('Play the clip, then advance to the question.');
    parts.push(`Q${d.number}: ${d.q.text || ''}`);
    parts.push(`Answer: ${answerText(d.q) || '(not set)'}`);
    if (d.q.fact) parts.push(`Fact: ${d.q.fact}`);
    if (d.q.notes) parts.push(`Notes: ${d.q.notes}`);
  } else if (d.src && d.src.notes) parts.push(d.src.notes);
  if (d.kind === 'answerList') parts.push(d.items.map((it) => `${it.number}. ${answerText(it.q)}`).join('\n'));
  return parts.join('\n');
}

export function layoutSlide(d, quiz) {
  const t = THEMES[d.theme] || THEMES.checker;
  let elements;
  switch (d.kind) {
    case 'question': case 'video': elements = layoutQuestion(d, quiz, t); break;
    case 'answer': elements = layoutAnswer(d, quiz, t); break;
    case 'answerList': elements = layoutAnswerList(d, quiz, t); break;
    default: elements = layoutCard(d, quiz, t);
  }
  return { key: d.key, kind: d.kind, theme: d.theme, bgKey: d.bgKey, elements, notes: notesFor(d) };
}
