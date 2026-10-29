// Builds a .pptx from layouts computed in the browser.
// Units: layouts use a 1920x1080 px stage -> 13.333in x 7.5in (144 px per inch, 0.5 pt per px).
const PptxGenJS = require('pptxgenjs');
const path = require('path');
const fs = require('fs');

const IN = (px) => +(px / 144).toFixed(4);
const PT = (px) => +(px * 0.5).toFixed(2);
const HEX = (c) => String(c || '000000').replace('#', '').toUpperCase();
const TRANSPARENT_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const FONT = { display: 'Shrikhand', body: 'Bricolage Grotesque', title: 'Salina' };

function transparency(op) {
  return op == null || op >= 1 ? 0 : Math.round((1 - op) * 100);
}

async function exportPptx({ quiz, deck, images, mediaDir }) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = quiz.title || 'Quiz';
  pptx.subject = 'Quiz night';
  pptx.company = 'Quiz Night Slides';

  // One slide master per background so each background image is stored once.
  const masters = new Map();
  for (const s of deck.slides) {
    if (masters.has(s.bg)) continue;
    const buf = images[s.bg];
    const name = `BG_${masters.size + 1}`;
    const mime = s.bgMime || 'image/jpeg';
    pptx.defineSlideMaster({
      title: name,
      // `path` only sets the file extension inside the pptx so it matches the JPEG data
      background: buf ? { data: `${mime};base64,${buf.toString('base64')}`, path: mime === 'image/png' ? 'bg.png' : 'bg.jpg' } : { color: '222222' },
    });
    masters.set(s.bg, name);
  }

  const mediaPath = (src) => {
    const p = path.join(mediaDir, path.basename(src || ''));
    return src && fs.existsSync(p) ? p : null;
  };

  for (const s of deck.slides) {
    const slide = pptx.addSlide({ masterName: masters.get(s.bg) });
    for (const e of s.elements) {
      const pos = { x: IN(e.x), y: IN(e.y), w: IN(e.w), h: IN(e.h) };
      if (e.t === 'rect' || e.t === 'ellipse') {
        const opts = {
          ...pos,
          fill: e.fill === 'none' ? { type: 'none' } : { color: HEX(e.fill), transparency: transparency(e.op) },
          line: e.stroke ? { color: HEX(e.stroke), width: PT(e.sw || 1), transparency: transparency(e.op), ...(e.dash ? { dashType: 'dash' } : {}) } : { type: 'none' },
        };
        let shape = e.t === 'ellipse' ? 'ellipse' : 'rect';
        if (e.t === 'rect' && e.r) { shape = 'roundRect'; opts.rectRadius = IN(Math.min(e.r, e.w / 2, e.h / 2)); }
        slide.addShape(shape, opts);
      } else if (e.t === 'tri') {
        // PowerPoint's triangle points up; rotate 90° around the centre so it points right.
        const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
        slide.addShape('triangle', {
          x: IN(cx - e.h / 2), y: IN(cy - e.w / 2), w: IN(e.h), h: IN(e.w), rotate: 90,
          fill: { color: HEX(e.fill) }, line: { type: 'none' },
        });
      } else if (e.t === 'text') {
        const runs = e.lines.map((l, i) => ({ text: l || ' ', options: { breakLine: i < e.lines.length - 1 } }));
        slide.addText(runs, {
          ...pos,
          fontFace: FONT[e.font] || FONT.body,
          fontSize: PT(e.size),
          bold: e.font !== 'display' && e.weight >= 700,
          color: HEX(e.color),
          transparency: transparency(e.op),
          align: e.align || 'center',
          valign: e.valign || 'middle',
          margin: 0,
          lineSpacing: PT(e.size * (e.lh || 1.2)),
          charSpacing: e.ls ? PT(e.ls) : undefined,
          paraSpaceBefore: 0,
          paraSpaceAfter: 0,
          wrap: false,
          fit: 'none',
        });
      } else if (e.t === 'image') {
        const p = mediaPath(e.src);
        if (p) slide.addImage({ path: p, ...pos });
      } else if (e.t === 'video') {
        const p = mediaPath(e.src);
        if (!p) continue;
        const cover = e.cover && images[e.cover] ? `data:image/png;base64,${images[e.cover].toString('base64')}` : undefined;
        slide.addMedia({ type: 'video', path: p, ...pos, ...(cover ? { cover } : {}) });
      } else if (e.t === 'audio') {
        const p = mediaPath(e.src);
        if (!p) continue;
        // media object whose face is the drawn play button: click it to play in PowerPoint
        const cover = e.cover && images[e.cover] ? `data:image/png;base64,${images[e.cover].toString('base64')}` : TRANSPARENT_PNG;
        slide.addMedia({ type: 'audio', path: p, ...pos, cover });
      }
    }
    if (s.notes) slide.addNotes(s.notes);
  }
  return pptx.write({ outputType: 'nodebuffer' });
}

module.exports = { exportPptx };
