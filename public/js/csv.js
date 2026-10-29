// CSV import: questions from a spreadsheet, with optional media files selected alongside,
// or a .zip holding the CSV plus folders of media referenced by relative path.
import { esc, toast } from './api.js';

const norm = (h) => String(h || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
const TYPE_MAP = {
  text: ['none', 'open'], open: ['none', 'open'], question: ['none', 'open'],
  choice: ['none', 'choice'], mc: ['none', 'choice'], multiple: ['none', 'choice'], multiple_choice: ['none', 'choice'], multi: ['none', 'choice'],
  image: ['image'], picture: ['image'], photo: ['image'],
  audio: ['audio'], music: ['audio'], sound: ['audio'],
  video: ['video'], clip: ['video'], film: ['video'],
  order: ['none', 'order'], ordering: ['none', 'order'], sort: ['none', 'order'], rank: ['none', 'order'],
  match: ['none', 'match'], matching: ['none', 'match'],
};
const BREAK_TYPES = ['break', 'intermission', 'interval'];
// A " | " inside a cell starts a new line (multi-line answers, numbered clues, notes)
const lines = (v) => String(v || '').split(/\s*\|\s*/).filter(Boolean).join('\n');
const firstRef = (v) => String(v || '').split('|')[0].trim();

export function parseRows(rows, mediaKind, newSlide) {
  const slides = [];
  const refs = []; // { slide, name, field: "file" | "answerFile" }
  let lastCat = null;
  let skipped = 0;
  for (const raw of rows) {
    const r = {};
    for (const k of Object.keys(raw)) r[norm(k)] = String(raw[k] ?? '').trim();
    const cat = r.category || r.round || '';
    if (BREAK_TYPES.includes(norm(r.type))) {
      const b = newSlide('break');
      if (r.question || cat) b.title = r.question || cat;
      if (r.question_detail || r.detail) b.subtitle = r.question_detail || r.detail;
      slides.push(b);
      continue;
    }
    const detail = lines(r.question_detail || r.detail || '');
    const text = [r.question || r.text || '', detail].filter(Boolean).join('\n');
    if (cat && cat !== lastCat) {
      const c = newSlide('category');
      c.title = cat;
      c.subtitle = r.category_subtitle || r.subtitle || '';
      slides.push(c);
      lastCat = cat;
    }
    if (!text) { skipped++; continue; }
    const q = newSlide('question');
    q.text = text;
    let options = r.options ? r.options.split('|').map((s) => s.trim()).filter(Boolean) : [];
    if (!options.length) options = ['a', 'b', 'c', 'd', 'e', 'f'].map((l) => r[`option_${l}`] || r[l] || '').filter(Boolean);
    const t = TYPE_MAP[norm(r.type)] || null;
    const mediaName = firstRef(r.media || r.question_assets || r.question_asset || r.question_media || r.file || r.image || r.audio || r.video || '');
    const answerMediaName = firstRef(r.answer_assets || r.answer_asset || r.answer_media || r.answer_image || '');
    q.media = t ? t[0] : 'none';
    if (q.media === 'none' && mediaName) q.media = mediaKind({ name: mediaName, type: '' }) || 'none';
    q.answerType = t && (t[1] === 'order' || t[1] === 'match') ? t[1] : (t && t[1] === 'choice') || options.length >= 2 ? 'choice' : 'open';
    const correct = r.correct || r.correct_option || r.correct_answer || '';
    if (q.answerType === 'order' || q.answerType === 'match') {
      // the options are shown on the question; an order's answer is e.g. "D, A, C, B" plus the names,
      // a match's answer is its pairs, one per line
      if (options.length < 2) options = options.concat(['', '', '', '']).slice(0, 4);
      q.options = options.slice(0, 6);
      q.correct = 0;
      q.answer = [q.answerType === 'order' ? correct : '', lines(r.answer)].filter(Boolean).join('\n');
    } else if (q.answerType === 'choice') {
      if (options.length < 2) options = options.concat(['', '', '', '']).slice(0, 4);
      q.options = options.slice(0, 6);
      let ci = -1;
      const c = correct.toUpperCase();
      if (/^[A-F]$/.test(c)) ci = c.charCodeAt(0) - 65;
      else if (/^[1-6]$/.test(c)) ci = +c - 1;
      else if (c) ci = q.options.findIndex((o) => o.toLowerCase() === c.toLowerCase());
      if (ci < 0 && r.answer) {
        const a = r.answer.toLowerCase();
        ci = /^[a-f]$/.test(a) ? a.charCodeAt(0) - 97 : q.options.findIndex((o) => o.toLowerCase() === a);
      }
      q.correct = Math.max(0, Math.min(ci, q.options.length - 1));
      q.answer = r.answer || '';
    } else q.answer = lines(r.answer);
    q.fact = lines(r.fact || r.info || r.fun_fact || '');
    q.notes = [
      lines(r.notes || r.presenter_notes || r.host_notes || ''),
      r.rules ? `Rules: ${r.rules}` : '',
      r.source ? `Source: ${r.source}` : '',
    ].filter(Boolean).join('\n');
    if (r.start) q.start = parseFloat(r.start) || 0;
    if (r.end) q.end = parseFloat(r.end) || 0;
    if (q.media === 'video') q.autoAdvance = true;
    if (mediaName && q.media !== 'none') refs.push({ slide: q, name: mediaName, field: 'file' });
    if (answerMediaName) refs.push({ slide: q, name: answerMediaName, field: 'answerFile' });
    slides.push(q);
  }
  return { slides, refs, skipped };
}

const MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', ogv: 'video/ogg',
};
const isCsv = (name) => /\.(csv|tsv|txt)$/i.test(name);
const baseName = (p) => p.split('/').pop();

// Normalise a path from the CSV or the zip: forward slashes, no leading ./ or /, resolve . and ..
export function normPath(p) {
  const out = [];
  for (const part of String(p || '').trim().replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop(); else out.push(part);
  }
  return out.join('/').toLowerCase();
}

// Unzip in the browser; returns [{ path, file }] for every real file (skips folders and macOS junk)
async function readZip(zipFile) {
  const buf = new Uint8Array(await zipFile.arrayBuffer());
  const entries = await new Promise((res, rej) => window.fflate.unzip(buf, (err, data) => (err ? rej(err) : res(data))));
  return Object.entries(entries)
    .filter(([p]) => !p.endsWith('/') && !/(^|\/)(__MACOSX|\.[^/]*)(\/|$)/.test(p) && baseName(p) !== 'Thumbs.db')
    .map(([p, bytes]) => {
      const ext = (p.split('.').pop() || '').toLowerCase();
      return { path: p.replace(/\\/g, '/'), file: new File([bytes], baseName(p), { type: MIME[ext] || '' }) };
    });
}

// Media files found so far, looked up by path relative to the CSV, or by file name if that's unambiguous
function mediaIndex() {
  const byPath = new Map();
  const byName = new Map(); // name -> Set of paths
  return {
    get size() { return byPath.size; },
    add(path, file) {
      const p = normPath(path);
      byPath.set(p, file);
      const n = baseName(p);
      if (!byName.has(n)) byName.set(n, new Set());
      byName.get(n).add(p);
    },
    // returns { key, file } or { ambiguous: [paths] } or null
    find(ref) {
      const p = normPath(ref);
      if (byPath.has(p)) return { key: p, file: byPath.get(p) };
      const hits = byName.get(baseName(p));
      if (!hits) return null;
      if (hits.size === 1) { const k = [...hits][0]; return { key: k, file: byPath.get(k) }; }
      return { ambiguous: [...hits] };
    },
  };
}

export function setupCsv(ctx) {
  const dlg = document.getElementById('dlg-csv');
  const drop = document.getElementById('csv-drop');
  const input = document.getElementById('csv-file');
  const summary = document.getElementById('csv-summary');
  const go = document.getElementById('csv-go');
  const mode = document.getElementById('csv-mode');
  let parsed = null;
  let files = mediaIndex();

  document.getElementById('btn-csv').addEventListener('click', () => {
    parsed = null; files = mediaIndex(); summary.innerHTML = ''; go.disabled = true; input.value = '';
    const qs = ctx.quiz().slides.filter((s) => s.kind === 'question');
    mode.value = qs.length <= 2 && !qs.some((s) => s.file) ? 'questions' : 'append';
    dlg.showModal();
  });
  drop.addEventListener('click', () => input.click());
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); handle([...e.dataTransfer.files]); });
  input.addEventListener('change', () => handle([...input.files]));

  async function handle(list) {
    let csv = list.find((f) => isCsv(f.name) || f.type === 'text/csv');
    for (const f of list) if (f !== csv && !/\.zip$/i.test(f.name)) files.add(f.name, f);
    for (const zip of list.filter((f) => /\.zip$/i.test(f.name))) {
      summary.innerHTML = `<p>Unpacking ${esc(zip.name)}…</p>`;
      let entries;
      try { entries = await readZip(zip); } catch (e) {
        summary.innerHTML = `<div class="warnbox">Couldn't open ${esc(zip.name)}: ${esc(e.message || String(e))}</div>`;
        return;
      }
      // the CSV nearest the top of the zip; media paths in it are relative to its folder
      const zcsv = entries.filter((e) => isCsv(e.path)).sort((a, b) => a.path.split('/').length - b.path.split('/').length)[0];
      const dir = zcsv ? zcsv.path.split('/').slice(0, -1).join('/') : '';
      for (const e of entries) {
        if (e === zcsv) continue;
        files.add(dir && e.path.startsWith(dir + '/') ? e.path.slice(dir.length + 1) : e.path, e.file);
      }
      if (zcsv && !csv) csv = zcsv.file;
    }
    if (!csv && !parsed) { summary.innerHTML = '<div class="warnbox">Please include a .csv file, or a .zip with a .csv inside.</div>'; return; }
    if (!csv) return render();
    window.Papa.parse(csv, {
      header: true, skipEmptyLines: 'greedy',
      complete: (res) => {
        parsed = parseRows(res.data, ctx.mediaKind, ctx.newSlide);
        parsed.fileName = csv.name;
        render();
      },
      error: (err) => { summary.innerHTML = `<div class="warnbox">Couldn't read the CSV: ${esc(err.message)}</div>`; },
    });
  }

  function render() {
    if (!parsed) return;
    const qs = parsed.slides.filter((s) => s.kind === 'question');
    const cats = parsed.slides.filter((s) => s.kind === 'category');
    const missing = [], ambiguous = [], found = new Set();
    for (const r of parsed.refs) {
      const hit = files.find(r.name);
      if (hit && hit.file) found.add(hit.key);
      else if (hit) ambiguous.push(r.name);
      else missing.push(r.name);
    }
    const uniqList = (a) => [...new Set(a)].map(esc).join(', ');
    const fmt = (s) => s.media === 'none' ? (s.answerType === 'choice' ? 'Choice' : 'Text') : s.media[0].toUpperCase() + s.media.slice(1) + (s.answerType === 'choice' ? ' + choice' : '');
    summary.innerHTML = `<p style="margin:0 0 8px"><b>${esc(parsed.fileName)}</b>: ${qs.length} question${qs.length === 1 ? '' : 's'} in ${cats.length} categor${cats.length === 1 ? 'y' : 'ies'}${found.size ? `, ${found.size} media file${found.size === 1 ? '' : 's'} matched` : ''}.${parsed.skipped ? ` ${parsed.skipped} row(s) without a question were skipped.` : ''}</p>
      ${missing.length ? `<div class="warnbox"><b>Missing media:</b> ${uniqList(missing)}.<br>Add these files too (drop them here), or attach them in the editor later.</div>` : ''}
      ${ambiguous.length ? `<div class="warnbox"><b>More than one file has this name:</b> ${uniqList(ambiguous)}.<br>Use the path from the CSV's folder in the <code>media</code> column, e.g. <code>round-1/images/flag.png</code>.</div>` : ''}
      <table style="margin-top:10px"><tr><th>#</th><th>Type</th><th>Question</th><th>Answer</th></tr>
      ${qs.slice(0, 8).map((q, i) => `<tr><td>${i + 1}</td><td>${fmt(q)}</td><td>${esc(q.text)}</td><td>${esc(q.answerType === 'choice' ? (q.options[q.correct] || '') : q.answer)}</td></tr>`).join('')}
      ${qs.length > 8 ? `<tr><td colspan="4" class="hint">…and ${qs.length - 8} more</td></tr>` : ''}</table>`;
    go.disabled = !parsed.slides.length;
  }

  go.addEventListener('click', async () => {
    if (!parsed) return;
    go.disabled = true;
    const hits = new Map(); // key -> File, each file uploaded once even if several rows use it
    for (const r of parsed.refs) { const h = files.find(r.name); if (h && h.file) hits.set(h.key, h.file); }
    const uniq = [...hits.keys()];
    const uploaded = new Map();
    try {
      for (let i = 0; i < uniq.length; i++) {
        summary.innerHTML = `<p>Uploading media ${i + 1} of ${uniq.length}: ${esc(uniq[i])}</p><div class="progress"><div style="width:${(i / uniq.length) * 100}%"></div></div>`;
        uploaded.set(uniq[i], await ctx.uploadMedia(hits.get(uniq[i])));
      }
    } catch (e) {
      toast('Upload failed: ' + e.message);
      go.disabled = false;
      return;
    }
    for (const r of parsed.refs) {
      const h = files.find(r.name);
      const f = h && h.file && uploaded.get(h.key);
      if (!f) continue;
      const kind = ctx.mediaKind({ name: f.name, type: f.mime || '' });
      if (r.field === 'answerFile') {
        if (kind === 'image') r.slide.answerFile = f;
        continue;
      }
      r.slide.file = f;
      if (kind) r.slide.media = kind;
    }
    ctx.apply(parsed.slides, mode.value);
    dlg.close();
    toast(`Imported ${parsed.slides.filter((s) => s.kind === 'question').length} questions`);
  });
}
