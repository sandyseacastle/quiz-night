// PowerPoint export: lays out every slide in the browser (real font metrics), rasterises the
// backgrounds and video posters, and sends it all to the local server which writes the .pptx.
import { buildDeck } from './deck.js';
import { layoutSlide, fontsReady } from './layout.js';
import { backgroundImage, mediaUrl } from './render.js';
import { toast } from './api.js';

function busy(msg) {
  let el = document.querySelector('.busy');
  if (!el) {
    el = document.createElement('div');
    el.className = 'busy';
    el.innerHTML = '<div><div class="msg"></div><div class="progress"><div></div></div></div>';
    document.body.appendChild(el);
  }
  el.querySelector('.msg').textContent = msg;
  return {
    progress: (p) => { el.querySelector('.progress > div').style.width = `${Math.round(p * 100)}%`; },
    msg: (m) => { el.querySelector('.msg').textContent = m; },
    done: () => el.remove(),
  };
}

function loadImg(url) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
}

async function toJpeg(url, w = 1920, h = 1080, q = 0.9) {
  const img = await loadImg(url);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(img, 0, 0, w, h);
  return new Promise((r) => c.toBlob(r, 'image/jpeg', q));
}

// PNG of the round play button, used as the visible face of audio objects in PowerPoint
function discCover(e) {
  const S = 400, sw = (e.edgeW || 8) * (S / e.w);
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  // paint the panel colour + drop shadow so the square face blends in wherever it is shown
  if (e.bgc) { g.fillStyle = e.bgc; g.fillRect(0, 0, S, S); }
  if (e.shadow) { const o = 14 * (S / e.w); g.beginPath(); g.arc(S / 2 + o, S / 2 + o, S / 2, 0, Math.PI * 2); g.fillStyle = e.shadow; g.fill(); }
  g.beginPath(); g.arc(S / 2, S / 2, S / 2 - sw / 2, 0, Math.PI * 2);
  g.fillStyle = e.fill; g.fill();
  g.lineWidth = sw; g.strokeStyle = e.edge; g.stroke();
  g.beginPath(); g.moveTo(S * 0.38, S * 0.29); g.lineTo(S * 0.72, S * 0.5); g.lineTo(S * 0.38, S * 0.71); g.closePath();
  g.fillStyle = e.ring; g.fill();
  return new Promise((r) => c.toBlob(r, 'image/png'));
}

function captureFrame(url, t) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.muted = true; v.preload = 'auto'; v.playsInline = true;
    let finished = false;
    const finish = (b) => { if (!finished) { finished = true; v.removeAttribute('src'); v.load(); resolve(b); } };
    setTimeout(() => finish(null), 8000);
    v.onloadeddata = () => { v.currentTime = Math.max(0.05, t || 0.05); };
    v.onseeked = () => {
      const scale = Math.min(1, 1280 / (v.videoWidth || 1280));
      const c = document.createElement('canvas');
      c.width = Math.round((v.videoWidth || 1280) * scale);
      c.height = Math.round((v.videoHeight || 720) * scale);
      try {
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        c.toBlob((b) => finish(b), 'image/png');
      } catch (_) { finish(null); }
    };
    v.onerror = () => finish(null);
    v.src = url;
  });
}

export async function exportPowerPoint(quiz) {
  const ui = busy('Laying out slides…');
  try {
    await fontsReady();
    const deck = buildDeck(quiz);
    const layouts = deck.map((d) => layoutSlide(d, quiz));
    const fd = new FormData();
    const bgKeys = [...new Set(layouts.map((l) => l.bgKey))];
    const bgName = new Map();
    for (let i = 0; i < bgKeys.length; i++) {
      ui.msg(`Painting backgrounds ${i + 1}/${bgKeys.length}…`);
      ui.progress(i / (bgKeys.length + 2));
      const { url } = await backgroundImage(bgKeys[i]);
      const blob = await toJpeg(url);
      bgName.set(bgKeys[i], `bg${i}`);
      fd.append(`bg${i}`, blob, `bg${i}.jpg`);
    }
    // poster frames for videos
    const covers = new Map();
    for (const l of layouts) {
      for (const e of l.elements) {
        if (e.t !== 'video' || !e.src) continue;
        const k = `${e.src}@${e.start || 0}`;
        if (!covers.has(k)) {
          ui.msg('Grabbing video poster frames…');
          const b = await captureFrame(mediaUrl(quiz.id, e.src), e.start || 0);
          const name = b ? `cover${covers.size}` : null;
          if (b) fd.append(name, b, `${name}.jpg`);
          covers.set(k, name);
        }
        e.cover = covers.get(k);
      }
    }
    // faces for audio buttons
    const discs = new Map();
    for (const l of layouts) {
      for (const e of l.elements) {
        if (e.t !== 'audio' || !e.src) continue;
        const k = `${e.fill}${e.edge}${e.ring}${e.bgc}${e.w}`;
        if (!discs.has(k)) {
          const name = `disc${discs.size}`;
          fd.append(name, await discCover(e), `${name}.png`);
          discs.set(k, name);
        }
        e.cover = discs.get(k);
      }
    }
    const slides = layouts.map((l) => ({ bg: bgName.get(l.bgKey), bgMime: 'image/jpeg', elements: l.elements, notes: l.notes }));
    fd.append('deck', JSON.stringify({ slides }));
    ui.msg('Building the PowerPoint file (big videos can take a moment)…');
    ui.progress(0.9);
    const r = await fetch(`/api/quizzes/${quiz.id}/export`, { method: 'POST', body: fd });
    if (!r.ok) {
      let m = r.statusText;
      try { m = (await r.json()).error; } catch (_) {}
      throw new Error(m);
    }
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(quiz.title || 'quiz').replace(/[\\/:*?"<>|]/g, '').trim() || 'quiz'}.pptx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    ui.done();
    toast(`Exported ${slides.length} slides. For the exact look, install the fonts from the app's “fonts” folder.`, 6000);
  } catch (e) {
    ui.done();
    toast('Export failed: ' + e.message, 6000);
    console.error(e);
  }
}
