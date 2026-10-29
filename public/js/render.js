// Renders a computed layout into DOM (editor preview, thumbnails, presenter).
import { backgroundSvg, themeBase, dashArray, roundRectPerimeter, W, H } from './themes.js';
import { fontFamily } from './layout.js';

// ---------- background raster cache ----------
const bgCache = new Map();
export function backgroundImage(bgKey) {
  if (bgCache.has(bgKey)) return bgCache.get(bgKey);
  const [theme, variant, seed] = bgKey.split('|');
  const p = new Promise((resolve, reject) => {
    const svg = backgroundSvg(theme, variant, +seed);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      c.getContext('2d').drawImage(img, 0, 0, W, H);
      c.toBlob((blob) => resolve({ blob, url: URL.createObjectURL(blob) }), 'image/png');
    };
    img.onerror = reject;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
  bgCache.set(bgKey, p);
  return p;
}

export function mediaUrl(quizId, src) {
  return src ? `/media/${encodeURIComponent(quizId)}/${encodeURIComponent(src)}` : '';
}

const px = (n) => `${Math.round(n * 100) / 100}px`;

function box(el, e, grow = 0) {
  el.style.left = px(e.x - grow);
  el.style.top = px(e.y - grow);
  el.style.width = px(e.w + grow * 2);
  el.style.height = px(e.h + grow * 2);
}

// Dashed outline drawn as SVG so the dash length is controlled and meets up evenly
function dashedRectEl(e) {
  const el = document.createElement('div');
  el.className = 'el shape' + (e.cls ? ' ' + e.cls : '');
  box(el, e, e.sw / 2);
  const r = Math.min(e.r || 0, e.w / 2, e.h / 2);
  const [d, g] = dashArray(roundRectPerimeter(e.w, e.h, r));
  el.innerHTML = `<svg width="100%" height="100%" viewBox="${-e.sw / 2} ${-e.sw / 2} ${e.w + e.sw} ${e.h + e.sw}" style="display:block;overflow:visible">
    <rect width="${e.w}" height="${e.h}" rx="${r}" fill="${e.fill === 'none' ? 'none' : e.fill}" stroke="${e.stroke}" stroke-width="${e.sw}" stroke-dasharray="${d} ${g}"/></svg>`;
  if (e.op !== 1) el.style.opacity = e.op;
  return el;
}

function shapeEl(e) {
  if (e.dash && e.stroke && e.t === 'rect') return dashedRectEl(e);
  const el = document.createElement('div');
  el.className = 'el shape' + (e.cls ? ' ' + e.cls : '');
  const sw = e.stroke ? e.sw || 0 : 0;
  box(el, e, sw / 2); // centre the stroke on the edge, like PowerPoint
  el.style.background = e.fill === 'none' ? 'transparent' : e.fill;
  if (sw) el.style.border = `${px(sw)} solid ${e.stroke}`;
  el.style.borderRadius = e.t === 'ellipse' ? '50%' : px((e.r || 0) + sw / 2);
  if (e.op !== 1) el.style.opacity = e.op;
  return el;
}

function textEl(e) {
  const el = document.createElement('div');
  el.className = 'el text';
  box(el, e);
  el.style.fontFamily = fontFamily(e.font);
  el.style.fontWeight = e.weight;
  el.style.fontSize = px(e.size);
  el.style.lineHeight = e.lh;
  el.style.color = e.color;
  el.style.textAlign = e.align;
  el.style.justifyContent = e.valign === 'top' ? 'flex-start' : e.valign === 'bottom' ? 'flex-end' : 'center';
  if (e.ls) el.style.letterSpacing = px(e.ls);
  if (e.op !== 1) el.style.opacity = e.op;
  for (const line of e.lines) {
    const l = document.createElement('div');
    l.textContent = line || ' ';
    el.appendChild(l);
  }
  return el;
}

/**
 * Render a slide layout.
 * mode: 'thumb' (static), 'edit' (preview with media controls) or 'present' (full playback)
 * Returns { el, media } where media is an optional controller for the slide's audio/video.
 */
export function renderSlide(layout, { quizId, mode = 'edit' } = {}) {
  const stage = document.createElement('div');
  stage.className = `stage mode-${mode} kind-${layout.kind}`;
  stage.style.background = themeBase(layout.theme);
  const bg = document.createElement('img');
  bg.className = 'bg';
  bg.alt = '';
  stage.appendChild(bg);
  backgroundImage(layout.bgKey).then((r) => { bg.src = r.url; });

  let media = null;
  for (const e of layout.elements) {
    if (e.t === 'rect' || e.t === 'ellipse') stage.appendChild(shapeEl(e));
    else if (e.t === 'tri') {
      const el = document.createElement('div');
      el.className = 'el tri' + (e.cls ? ' ' + e.cls : '');
      box(el, e);
      el.style.background = e.fill;
      stage.appendChild(el);
    } else if (e.t === 'text') stage.appendChild(textEl(e));
    else if (e.t === 'image') {
      const el = document.createElement('img');
      el.className = 'el image';
      box(el, e);
      el.src = mediaUrl(quizId, e.src);
      el.alt = '';
      el.draggable = false;
      stage.appendChild(el);
    } else if (e.t === 'video') {
      const el = document.createElement('video');
      el.className = 'el video';
      box(el, e);
      el.playsInline = true;
      el.preload = mode === 'present' ? 'auto' : 'metadata';
      el.src = mediaUrl(quizId, e.src) + (e.start ? `#t=${e.start}` : '#t=0.05');
      if (mode === 'thumb') el.muted = true;
      if (mode === 'edit') el.controls = true;
      stage.appendChild(el);
      if (mode !== 'thumb') media = controller(el, e, stage);
    } else if (e.t === 'audio') {
      if (mode === 'thumb' || !e.src) continue;
      const btn = document.createElement('button');
      btn.className = 'el audio-btn';
      btn.title = 'Play / pause (P)';
      box(btn, e);
      const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      ring.setAttribute('viewBox', '0 0 100 100');
      const rc = e.edge || e.ring;
      ring.innerHTML = `<circle cx="50" cy="50" r="46" fill="none" stroke="${rc}" stroke-opacity=".2" stroke-width="3"/><circle class="prog" cx="50" cy="50" r="46" fill="none" stroke="${rc}" stroke-width="3" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100" transform="rotate(-90 50 50)"/>`;
      btn.appendChild(ring);
      const pause = document.createElement('span');
      pause.className = 'pause-icon';
      pause.style.setProperty('--c', e.ring);
      btn.appendChild(pause);
      const audio = document.createElement('audio');
      audio.preload = 'auto';
      audio.src = mediaUrl(quizId, e.src);
      stage.appendChild(audio);
      stage.appendChild(btn);
      media = controller(audio, e, stage, ring.querySelector('.prog'));
      btn.addEventListener('click', (ev) => { ev.stopPropagation(); media.toggle(); });
    }
  }
  return { el: stage, media };
}

function controller(el, e, stage, prog) {
  const start = +e.start || 0;
  const end = +e.end || 0;
  let endedCb = null;
  const sync = () => stage.classList.toggle('playing', !el.paused);
  el.addEventListener('play', sync);
  el.addEventListener('pause', sync);
  el.addEventListener('timeupdate', () => {
    const dur = (end || el.duration || 0) - start;
    if (prog && dur > 0) prog.setAttribute('stroke-dashoffset', String(100 - Math.min(100, ((el.currentTime - start) / dur) * 100)));
    if (end && el.currentTime >= end) { el.pause(); if (endedCb) endedCb(); }
  });
  el.addEventListener('ended', () => { sync(); if (endedCb) endedCb(); });
  const api = {
    el,
    type: e.t,
    play() { if (end && el.currentTime >= end - 0.05) el.currentTime = start; return el.play().catch(() => {}); },
    pause() { el.pause(); },
    toggle() { el.paused ? api.play() : el.pause(); },
    restart() { el.currentTime = start; return el.play().catch(() => {}); },
    reset() { el.pause(); try { el.currentTime = start; } catch (_) {} },
    get playing() { return !el.paused; },
    onEnded(cb) { endedCb = cb; },
    autoplay: e.t === 'video' || !!e.autoplay,
  };
  return api;
}

// Scale a 1920x1080 stage to fit its container.
export function fitStage(container, stage) {
  const apply = () => {
    const r = container.getBoundingClientRect();
    const s = Math.min(r.width / W, r.height / H);
    stage.style.transform = `translate(${(r.width - W * s) / 2}px, ${(r.height - H * s) / 2}px) scale(${s})`;
  };
  apply();
  const ro = new ResizeObserver(apply);
  ro.observe(container);
  return () => ro.disconnect();
}
