import { api, toast, esc } from './api.js';
import { icon } from './icons.js';
import { THEMES, THEME_ORDER } from './themes.js';
import { buildDeck, KIND_LABELS, questionFormat, answerText, isOrdering } from './deck.js';
import { layoutSlide, fontsReady } from './layout.js';
import { renderSlide, fitStage, mediaUrl } from './render.js';
import { setupCsv } from './csv.js';
import { exportPowerPoint } from './export.js';

const quizId = decodeURIComponent(location.pathname.split('/').pop());
const $ = (s) => document.querySelector(s);
const listEl = $('#list');
const previewEl = $('#preview');
const inspEl = $('#inspector');

let quiz;
let deck = [];
let selectedId = null;
let selectedStep = null;
let disposePreview = null;
let previewMedia = null;
let lastDeleted = null;

// ---------- helpers ----------
const uid = () => 's' + Math.random().toString(36).slice(2, 10);
const sel = () => quiz.slides.find((s) => s.id === selectedId);
const isTyping = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

const KIND_ICON = { title: 'title', category: 'category', break: 'break', answers: 'answers', end: 'end' };
const MEDIA_ICON = { none: 'text', image: 'image', audio: 'audio', video: 'video' };

export function newSlide(kind, preset) {
  const s = { id: uid(), kind };
  if (kind === 'question') {
    Object.assign(s, { media: 'none', answerType: 'open', text: '', answer: '', options: [], correct: 0, fact: '', notes: '' });
    if (preset === 'choice') Object.assign(s, { answerType: 'choice', options: ['', '', '', ''] });
    if (['image', 'audio', 'video'].includes(preset)) s.media = preset;
    if (preset === 'video') s.autoAdvance = true;
  } else if (kind === 'category') Object.assign(s, { title: 'New category', subtitle: '', theme: 'auto' });
  else if (kind === 'title') Object.assign(s, { kicker: 'Welcome to', title: quiz.title, subtitle: '', theme: '' });
  else if (kind === 'break') Object.assign(s, { kicker: 'Intermission', title: 'Break time', subtitle: 'Back in ten minutes', theme: '' });
  else if (kind === 'answers') Object.assign(s, { kicker: 'Pens down', title: 'The Answers', subtitle: '', theme: '' });
  else if (kind === 'end') Object.assign(s, { kicker: 'And the winner is…', title: 'Final Scores', subtitle: 'Thanks for playing!', theme: '' });
  return s;
}

function themeChip(s) {
  const d = deck.find((x) => x.srcId === s.id);
  const t = THEMES[d ? d.theme : 'checker'];
  return t ? t.badge.fill : '#ccc';
}

function summary(s) {
  if (s.kind === 'question') return s.text || '<i>Untitled question</i>';
  return s.title || '';
}

function warnings(s) {
  if (s.kind !== 'question') return '';
  const w = [];
  if (s.media !== 'none' && !(s.file && s.file.src)) w.push(`no ${s.media}`);
  if ((s.answerType === 'choice' || isOrdering(s)) && (s.options || []).filter((o) => o.trim()).length < 2) w.push('needs options');
  if (s.answerType !== 'choice' && !String(s.answer || '').trim()) w.push('no answer');
  return w.length ? ` · <span class="warn">${w.join(', ')}</span>` : '';
}

// ---------- save ----------
let saveTimer = null;
let saving = false;
const saveState = $('#save-state');
function scheduleSave() {
  saveState.textContent = 'Unsaved…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 600);
}
async function save() {
  if (saving) { scheduleSave(); return; }
  saving = true;
  try {
    await api.save(quiz);
    saveState.textContent = 'Saved';
  } catch (e) {
    saveState.textContent = 'Save failed';
    toast('Could not save: ' + e.message);
  } finally { saving = false; }
}
window.addEventListener('beforeunload', (e) => {
  if (saveTimer && saveState.textContent !== 'Saved') { save(); e.preventDefault(); }
});

// ---------- change pipeline ----------
let thumbTimer = null;
function changed({ inspector = false, list = true, immediateList = false } = {}) {
  deck = buildDeck(quiz);
  renderPreview();
  if (inspector) renderInspector();
  if (immediateList) renderList();
  else if (list) { clearTimeout(thumbTimer); thumbTimer = setTimeout(renderList, 250); }
  scheduleSave();
}

// ---------- slide list ----------
function deckEntryFor(s) {
  return deck.find((d) => d.srcId === s.id && d.kind !== 'answer' && d.kind !== 'video') || deck.find((d) => d.srcId === s.id);
}

function renderList() {
  const scrollTop = listEl.scrollTop;
  listEl.innerHTML = '';
  let qn = 0;
  quiz.slides.forEach((s, i) => {
    const item = document.createElement('div');
    item.className = `slide-item ${s.kind}${s.id === selectedId ? ' selected' : ''}`;
    item.draggable = true;
    item.dataset.id = s.id;
    let kindLabel = KIND_LABELS[s.kind];
    if (s.kind === 'question') { qn++; kindLabel = `Q${qn} · ${questionFormat(s)}`; }
    item.innerHTML = `<div class="idx">${i + 1}</div><div class="thumb"></div>
      <div class="meta"><div class="kind"><span class="chip" style="background:${themeChip(s)}"></span>${esc(kindLabel)}</div>
      <div class="sum">${s.kind === 'question' && !s.text ? '<i>Untitled question</i>' : esc(summary(s))}${warnings(s)}</div></div>`;
    const d = deckEntryFor(s);
    if (d) {
      const { el } = renderSlide(layoutSlide(d, quiz), { quizId, mode: 'thumb' });
      el.querySelectorAll('video').forEach((v) => { v.preload = 'none'; v.removeAttribute('src'); v.load(); });
      item.querySelector('.thumb').appendChild(el);
    } else {
      item.querySelector('.thumb').innerHTML = '<div style="display:grid;place-items:center;height:100%;font-size:11px;color:#86695a">hidden</div>';
    }
    item.addEventListener('click', () => select(s.id));
    // drag & drop reordering
    item.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/slide', s.id); e.dataTransfer.effectAllowed = 'move'; item.classList.add('dragging'); });
    item.addEventListener('dragend', () => item.classList.remove('dragging'));
    item.addEventListener('dragover', (e) => {
      if (!e.dataTransfer.types.includes('text/slide')) return;
      e.preventDefault();
      const r = item.getBoundingClientRect();
      const before = e.clientY < r.top + r.height / 2;
      item.classList.toggle('drop-before', before);
      item.classList.toggle('drop-after', !before);
    });
    item.addEventListener('dragleave', () => item.classList.remove('drop-before', 'drop-after'));
    item.addEventListener('drop', (e) => {
      const id = e.dataTransfer.getData('text/slide');
      const before = item.classList.contains('drop-before');
      item.classList.remove('drop-before', 'drop-after');
      if (!id || id === s.id) return;
      e.preventDefault();
      const from = quiz.slides.findIndex((x) => x.id === id);
      const [moved] = quiz.slides.splice(from, 1);
      let to = quiz.slides.findIndex((x) => x.id === s.id);
      if (!before) to++;
      quiz.slides.splice(to, 0, moved);
      changed({ immediateList: true });
    });
    listEl.appendChild(item);
  });
  listEl.scrollTop = scrollTop;
}

function select(id, { scroll = true } = {}) {
  selectedId = id;
  selectedStep = null;
  listEl.querySelectorAll('.slide-item').forEach((el) => el.classList.toggle('selected', el.dataset.id === id));
  if (scroll) listEl.querySelector(`.slide-item[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' });
  renderPreview();
  renderInspector();
}

// ---------- preview ----------
const STEP_LABEL = { video: 'Clip', question: 'Question', answer: 'Answer', answersHeader: 'Header', answerList: 'Answer list' };
function renderPreview() {
  if (disposePreview) disposePreview();
  if (previewMedia) previewMedia.pause();
  previewEl.innerHTML = '';
  const steps = $('#steps');
  steps.innerHTML = '';
  $('#step-hint').textContent = '';
  const s = sel();
  if (!s) return;
  const entries = deck.filter((d) => d.srcId === s.id);
  if (!entries.length) {
    previewEl.innerHTML = '<div class="empty" style="position:absolute;inset:20%">Answer slides are turned off in quiz settings, so this slide is skipped.</div>';
    return;
  }
  if (!entries.find((d) => d.key === selectedStep)) selectedStep = (entries.find((d) => d.kind === 'question') || entries[0]).key;
  if (entries.length > 1) {
    let li = 0;
    entries.forEach((d) => {
      const b = document.createElement('button');
      b.textContent = d.kind === 'answerList' ? `Answers ${++li}` : STEP_LABEL[d.kind] || d.kind;
      b.setAttribute('aria-pressed', d.key === selectedStep);
      b.onclick = () => { selectedStep = d.key; renderPreview(); };
      steps.appendChild(b);
    });
  }
  if (s.kind === 'question') {
    const ans = deck.find((d) => d.key === `${s.id}:answer`);
    const q = deck.find((d) => d.key === `${s.id}:q`);
    const inAnswers = ans || (quiz.settings.answerStyle === 'list' && deck.some((x) => x.kind === 'answerList' && x.items.some((it) => it.q === s)));
    $('#step-hint').innerHTML = `Question ${q ? q.number : ''}${quiz.settings.answers === 'none' ? '' : inAnswers ? ' · answer appears in the answers section' : ' · <span style="color:var(--danger)">comes after the last Answers slide, so its answer is never shown</span>'}`;
  } else if (s.kind === 'answers') {
    $('#step-hint').textContent = quiz.settings.answerStyle === 'list' ? 'Answer lists for the rounds above follow this slide' : 'Answer slides for every question above follow this slide';
  }
  const d = entries.find((x) => x.key === selectedStep);
  const { el, media } = renderSlide(layoutSlide(d, quiz), { quizId, mode: 'edit' });
  previewMedia = media;
  previewEl.appendChild(el);
  disposePreview = fitStage(previewEl, el);
}

// preview accepts dropped media files
previewEl.addEventListener('dragover', (e) => {
  if (!e.dataTransfer.types.includes('Files')) return;
  const s = sel();
  if (!s || s.kind !== 'question') return;
  e.preventDefault();
  previewEl.classList.add('drop-hover');
});
previewEl.addEventListener('dragleave', () => previewEl.classList.remove('drop-hover'));
previewEl.addEventListener('drop', (e) => {
  previewEl.classList.remove('drop-hover');
  if (!e.dataTransfer.files.length) return;
  e.preventDefault();
  attachFile(e.dataTransfer.files[0]);
});

// ---------- inspector ----------
function themeOptions(value, autoLabel) {
  let h = `<option value="${autoLabel ? 'auto' : ''}">${autoLabel || `Quiz default (${THEMES[quiz.settings.defaultTheme]?.name || 'Arches'})`}</option>`;
  for (const k of THEME_ORDER) h += `<option value="${k}" ${value === k ? 'selected' : ''}>${THEMES[k].name} · ${THEMES[k].hint}</option>`;
  return h;
}
const field = (label, f, val, { area = false, ph = '', rows = 3, hint = '' } = {}) => `
  <label class="field"><span>${label}</span>
  ${area ? `<textarea class="input" data-f="${f}" rows="${rows}" placeholder="${esc(ph)}">${esc(val)}</textarea>` : `<input class="input" data-f="${f}" value="${esc(val)}" placeholder="${esc(ph)}">`}
  ${hint ? `<p class="hint">${hint}</p>` : ''}</label>`;

function renderInspector() {
  const s = sel();
  if (!s) { inspEl.innerHTML = '<p class="hint">Select a slide.</p>'; return; }
  const idx = quiz.slides.indexOf(s);
  let h = '';
  if (s.kind === 'question') h = questionInspector(s);
  else if (s.kind === 'category') {
    h = `<h2>Category</h2><p class="sub">Starts a new round. Questions after this slide use its theme.</p>
      ${field('Category name', 'title', s.title)}
      ${field('Subtitle', 'subtitle', s.subtitle, { area: true, rows: 2, ph: 'Optional tagline' })}
      ${field('Label above the name', 'kicker', s.kicker || '', { ph: 'Optional, e.g. Picture round' })}
      <label class="field"><span>Theme</span><select class="input" data-f="theme">${themeOptions(s.theme, 'Auto (next in the rotation)')}</select></label>
      ${field('Host notes', 'notes', s.notes || '', { area: true, rows: 2 })}`;
  } else {
    const titles = { title: ['Title slide', 'The opening slide for your quiz.'], break: ['Break', 'An intermission slide.'], answers: ['Answers', 'Answer slides for all the questions above are added automatically after this slide.'], end: ['Final slide', 'Wrap up, final scores or thank-yous.'] };
    const [t, sub] = titles[s.kind];
    h = `<h2>${t}</h2><p class="sub">${sub}</p>
      ${field('Small label', 'kicker', s.kicker || '', { ph: 'Optional' })}
      ${field('Title', 'title', s.title || '')}
      ${field('Subtitle', 'subtitle', s.subtitle || '', { area: true, rows: 2 })}
      <label class="field"><span>Theme</span><select class="input" data-f="theme">${themeOptions(s.theme)}</select></label>
      ${field('Host notes', 'notes', s.notes || '', { area: true, rows: 2 })}`;
    if (s.kind === 'answers' && quiz.settings.answers === 'none') h += `<div class="warnbox">Answer slides are turned off in quiz settings.</div>`;
  }
  h += `<div class="section row">
      <button class="btn small" data-act="dup">${icon('copy')} Duplicate</button>
      <button class="btn small danger" data-act="del">${icon('trash')} Delete</button></div>
      <p class="hint">Slide ${idx + 1} of ${quiz.slides.length}</p>`;
  inspEl.innerHTML = h;
  bindInspector(s);
}

function questionInspector(s) {
  const d = deck.find((x) => x.key === `${s.id}:q`);
  const seg = (name, val, items) => `<div class="seg" data-seg="${name}">${items.map(([v, l, ic]) => `<button type="button" data-v="${v}" aria-pressed="${val === v}">${ic ? icon(ic) : ''}${l}</button>`).join('')}</div>`;
  let h = `<h2>Question ${d ? d.number : ''}</h2><p class="sub">${d && d.cat.title ? `Category: ${esc(d.cat.title)}` : 'Add a category slide above to start a round.'}</p>
    <div class="field"><span class="field-label">Media</span>${seg('media', s.media || 'none', [['none', 'None', 'none'], ['image', 'Image', 'image'], ['audio', 'Audio', 'audio'], ['video', 'Video', 'video']])}</div>`;
  if (s.media && s.media !== 'none') h += mediaSection(s);
  h += field('Question', 'text', s.text, { area: true, rows: 3, ph: 'Type your question…' });
  h += `<div class="field"><span class="field-label">Answer type</span>${seg('answerType', s.answerType || 'open', [['open', 'Open answer', 'open'], ['choice', 'Multiple choice', 'choice'], ['order', 'Order', 'table'], ['match', 'Match', 'table']])}</div>`;
  const order = isOrdering(s);
  const itemLabel = (i) => (s.answerType === 'match' ? String(i + 1) : String.fromCharCode(65 + i));
  if (s.answerType === 'choice' || order) {
    h += `<div class="field"><span class="field-label">${s.answerType === 'order' ? 'Items · players write their letters in order' : s.answerType === 'match' ? 'Items · players write a number under each letter in your image' : 'Options · click a letter to mark the correct one'}</span><div id="opts">`;
    (s.options || []).forEach((o, i) => {
      h += `<div class="option-row">${order ? `<span class="letter">${itemLabel(i)}</span>` : `<button type="button" class="letter" data-correct="${i}" aria-pressed="${i === (s.correct || 0)}" title="Mark as correct">${String.fromCharCode(65 + i)}</button>`}
        <input class="input" data-opt="${i}" value="${esc(o)}" placeholder="Option ${String.fromCharCode(65 + i)}">
        <button type="button" class="x" data-rmopt="${i}" title="Remove option" ${s.options.length <= 2 ? 'disabled' : ''}>×</button></div>`;
    });
    h += `</div>${(s.options || []).length < 6 ? `<button class="btn small" data-act="addopt">${icon('plus')} Add option</button>` : ''}</div>`;
  }
  if (order) h += field('Answer', 'answer', s.answer || '', { area: true, rows: 3, ph: s.answerType === 'match' ? 'The pairs, one per line, e.g. A: Frozen 2' : 'The correct order, e.g. D, A, C, B' });
  else if (s.answerType !== 'choice') h += field('Answer', 'answer', s.answer || '', { ph: 'The correct answer' });
  h += answerImageSection(s);
  h += field('Fun fact', 'fact', s.fact || '', { area: true, rows: 2, ph: 'Optional, shown on the answer slide' });
  h += field('Host notes', 'notes', s.notes || '', { area: true, rows: 2, ph: 'Private: shown in host view & PowerPoint notes' });
  return h;
}

// Optional picture for the answer slide, e.g. the unblurred logo or the instrument being played
function answerImageSection(s) {
  const f = s.answerFile && s.answerFile.src ? s.answerFile : null;
  let h = '<div class="field"><span class="field-label">Answer image · optional, shown on the answer slide</span>';
  if (!f) {
    h += `<div class="dropzone" id="ans-dz" tabindex="0" role="button"><strong>Add an answer image</strong>Click to choose, or drop a file here
      <input type="file" id="ans-file-in" accept="image/*" hidden></div>`;
  } else {
    h += `<div class="media-card"><div class="media-prev"><img src="${mediaUrl(quizId, f.src)}" alt=""></div>
      <div class="media-info"><span class="name" title="${esc(f.name)}">${esc(f.name)}</span>
      <button class="btn small" id="ans-replace">Replace</button><button class="btn small ghost danger" id="ans-remove" title="Remove">${icon('x')}</button>
      <input type="file" id="ans-file-in" accept="image/*" hidden></div></div>`;
  }
  return h + '<div class="progress hidden" id="ans-prog"><div></div></div></div>';
}

function mediaSection(s) {
  const kind = s.media;
  const f = s.file && s.file.src ? s.file : null;
  const accept = { image: 'image/*', audio: 'audio/*', video: 'video/*' }[kind];
  let h = '<div class="field" id="media-field">';
  if (!f) {
    h += `<div class="dropzone" id="dz" tabindex="0" role="button"><strong>Add ${kind === 'image' ? 'an image' : kind === 'audio' ? 'an audio clip' : 'a video'}</strong>Click to choose, or drop a file here
      <input type="file" id="file-in" accept="${accept}" hidden></div>
      <div class="progress hidden" id="up-prog"><div></div></div>`;
  } else {
    const url = mediaUrl(quizId, f.src);
    const prev = kind === 'image' ? `<img src="${url}" alt="">` : kind === 'video' ? `<video src="${url}" controls preload="metadata" id="trim-player"></video>` : `<audio src="${url}" controls preload="metadata" id="trim-player"></audio>`;
    h += `<div class="media-card"><div class="media-prev" ${kind === 'audio' ? 'style="background:#fff"' : ''}>${prev}</div>
      <div class="media-info"><span class="name" title="${esc(f.name)}">${esc(f.name)}</span>
      <button class="btn small" id="replace">Replace</button><button class="btn small ghost danger" id="remove-media" title="Remove">${icon('x')}</button>
      <input type="file" id="file-in" accept="${accept}" hidden></div></div>
      <div class="progress hidden" id="up-prog"><div></div></div>`;
    if (kind !== 'image') {
      h += `<div class="trim">
        <label><span class="field-label">Start (sec)</span><input class="input" type="number" min="0" step="0.1" data-f="start" data-num value="${s.start || 0}">
          <button class="btn small" data-mark="start">Set to current</button></label>
        <label><span class="field-label">End (sec)</span><input class="input" type="number" min="0" step="0.1" data-f="end" data-num value="${s.end || ''}" placeholder="${f.duration ? f.duration.toFixed(1) : 'end'}">
          <button class="btn small" data-mark="end">Set to current</button></label></div>
        <p class="hint">Leave End empty to play to the finish. The clip trim applies when presenting here.</p>`;
      if (kind === 'video') h += `<label class="check"><input type="checkbox" data-f="autoAdvance" ${s.autoAdvance !== false ? 'checked' : ''}> <span>Move to the question automatically when the clip ends</span></label>`;
      if (kind === 'audio') h += `<label class="check"><input type="checkbox" data-f="autoplay" ${s.autoplay ? 'checked' : ''}> <span>Play automatically when the slide opens</span></label>`;
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      if (kind === 'video' && !['mp4', 'm4v', 'mov'].includes(ext)) h += `<div class="warnbox">PowerPoint plays <b>.mp4</b> video most reliably. This file may not play in the exported deck.</div>`;
      if (kind === 'audio' && !['mp3', 'm4a', 'wav', 'aac'].includes(ext)) h += `<div class="warnbox">PowerPoint plays <b>.mp3</b>, <b>.m4a</b> or <b>.wav</b> audio most reliably.</div>`;
    }
  }
  return h + '</div>';
}

function bindInspector(s) {
  inspEl.querySelectorAll('[data-f]').forEach((el) => {
    const f = el.dataset.f;
    const evt = el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input';
    el.addEventListener(evt, () => {
      if (el.type === 'checkbox') s[f] = el.checked;
      else if ('num' in el.dataset) s[f] = el.value === '' ? 0 : Math.max(0, parseFloat(el.value) || 0);
      else s[f] = el.value;
      changed({ inspector: f === 'theme' });
    });
  });
  inspEl.querySelectorAll('[data-seg]').forEach((g) => {
    g.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      const key = g.dataset.seg;
      s[key] = b.dataset.v;
      if (key === 'answerType' && s.answerType !== 'open' && (!s.options || s.options.length < 2)) s.options = ['', '', '', ''];
      if (key === 'media' && s.file && s.file.mime && !s.file.mime.startsWith(s.media)) { s.file = null; s.start = 0; s.end = 0; }
      if (key === 'media' && s.media === 'video' && s.autoAdvance === undefined) s.autoAdvance = true;
      changed({ inspector: true });
    }));
  });
  inspEl.querySelectorAll('[data-opt]').forEach((el) => el.addEventListener('input', () => { s.options[+el.dataset.opt] = el.value; changed(); }));
  inspEl.querySelectorAll('[data-correct]').forEach((el) => el.addEventListener('click', () => { s.correct = +el.dataset.correct; changed({ inspector: true }); }));
  inspEl.querySelectorAll('[data-rmopt]').forEach((el) => el.addEventListener('click', () => {
    const i = +el.dataset.rmopt;
    s.options.splice(i, 1);
    if (s.correct >= s.options.length) s.correct = s.options.length - 1;
    else if (s.correct > i) s.correct--;
    changed({ inspector: true });
  }));
  inspEl.querySelector('[data-act=addopt]')?.addEventListener('click', () => {
    s.options.push('');
    changed({ inspector: true });
    const ins = inspEl.querySelectorAll('[data-opt]');
    ins[ins.length - 1]?.focus();
  });
  inspEl.querySelector('[data-act=dup]').addEventListener('click', duplicateSelected);
  inspEl.querySelector('[data-act=del]').addEventListener('click', deleteSelected);

  // media
  const fileIn = inspEl.querySelector('#file-in');
  const dz = inspEl.querySelector('#dz');
  if (dz) {
    dz.addEventListener('click', () => fileIn.click());
    dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileIn.click(); } });
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('over'));
    dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('over'); if (e.dataTransfer.files[0]) attachFile(e.dataTransfer.files[0]); });
  }
  if (fileIn) fileIn.addEventListener('change', () => fileIn.files[0] && attachFile(fileIn.files[0]));
  inspEl.querySelector('#replace')?.addEventListener('click', () => fileIn.click());
  inspEl.querySelector('#remove-media')?.addEventListener('click', () => { s.file = null; s.start = 0; s.end = 0; changed({ inspector: true }); });

  // answer image
  const ansIn = inspEl.querySelector('#ans-file-in');
  const ansDz = inspEl.querySelector('#ans-dz');
  if (ansDz) {
    ansDz.addEventListener('click', () => ansIn.click());
    ansDz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ansIn.click(); } });
    ansDz.addEventListener('dragover', (e) => { e.preventDefault(); ansDz.classList.add('over'); });
    ansDz.addEventListener('dragleave', () => ansDz.classList.remove('over'));
    ansDz.addEventListener('drop', (e) => { e.preventDefault(); ansDz.classList.remove('over'); if (e.dataTransfer.files[0]) attachAnswerImage(e.dataTransfer.files[0]); });
  }
  if (ansIn) ansIn.addEventListener('change', () => ansIn.files[0] && attachAnswerImage(ansIn.files[0]));
  inspEl.querySelector('#ans-replace')?.addEventListener('click', () => ansIn.click());
  inspEl.querySelector('#ans-remove')?.addEventListener('click', () => { s.answerFile = null; changed({ inspector: true }); });
  inspEl.querySelectorAll('[data-mark]').forEach((b) => b.addEventListener('click', (e) => {
    e.preventDefault();
    const p = inspEl.querySelector('#trim-player');
    if (!p) return;
    const k = b.dataset.mark;
    s[k] = Math.round(p.currentTime * 10) / 10;
    inspEl.querySelector(`[data-f="${k}"]`).value = s[k];
    changed();
  }));
}

// ---------- media ----------
export function readMeta(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const done = (m) => { URL.revokeObjectURL(url); resolve(m); };
    const t = file.type || '';
    if (t.startsWith('image/')) {
      const i = new Image();
      i.onload = () => done({ w: i.naturalWidth, h: i.naturalHeight });
      i.onerror = () => done({});
      i.src = url;
    } else if (t.startsWith('video/') || t.startsWith('audio/')) {
      const m = document.createElement(t.startsWith('video/') ? 'video' : 'audio');
      m.preload = 'metadata';
      m.onloadedmetadata = () => done({ w: m.videoWidth || undefined, h: m.videoHeight || undefined, duration: isFinite(m.duration) ? m.duration : undefined });
      m.onerror = () => done({});
      setTimeout(() => done({}), 8000);
      m.src = url;
    } else done({});
  });
}

export function mediaKind(file) {
  const t = file.type || '';
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('audio/')) return 'audio';
  if (t.startsWith('video/')) return 'video';
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
  if (['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'].includes(ext)) return 'audio';
  if (['mp4', 'mov', 'm4v', 'webm', 'mkv'].includes(ext)) return 'video';
  return null;
}

export async function uploadMedia(file, onProgress) {
  const [meta, res] = await Promise.all([readMeta(file), api.upload(quizId, file, onProgress)]);
  return { src: res.src, name: file.name, mime: file.type || res.mime, size: file.size, ...meta };
}

async function attachFile(file) {
  const s = sel();
  if (!s || s.kind !== 'question') return;
  const kind = mediaKind(file);
  if (!kind) { toast('That file type isn’t supported. Use an image, audio or video file.'); return; }
  if (s.media !== kind) { s.media = kind; if (kind === 'video' && s.autoAdvance === undefined) s.autoAdvance = true; renderInspector(); }
  const prog = inspEl.querySelector('#up-prog');
  prog?.classList.remove('hidden');
  try {
    const f = await uploadMedia(file, (p) => { if (prog) prog.firstElementChild.style.width = `${p * 100}%`; });
    s.file = f;
    s.start = 0;
    s.end = 0;
    changed({ inspector: true });
  } catch (e) {
    toast('Upload failed: ' + e.message);
    prog?.classList.add('hidden');
  }
}

async function attachAnswerImage(file) {
  const s = sel();
  if (!s || s.kind !== 'question') return;
  if (mediaKind(file) !== 'image') { toast('The answer image needs to be an image file.'); return; }
  const prog = inspEl.querySelector('#ans-prog');
  prog?.classList.remove('hidden');
  try {
    s.answerFile = await uploadMedia(file, (p) => { if (prog) prog.firstElementChild.style.width = `${p * 100}%`; });
    changed({ inspector: true });
  } catch (e) {
    toast('Upload failed: ' + e.message);
    prog?.classList.add('hidden');
  }
}

// ---------- slide operations ----------
function insertSlide(slide, afterId = selectedId) {
  const i = quiz.slides.findIndex((s) => s.id === afterId);
  quiz.slides.splice(i < 0 ? quiz.slides.length : i + 1, 0, slide);
  selectedId = slide.id;
  selectedStep = null;
  changed({ inspector: true, immediateList: true });
  listEl.querySelector(`.slide-item[data-id="${slide.id}"]`)?.scrollIntoView({ block: 'nearest' });
}
function duplicateSelected() {
  const s = sel();
  if (!s) return;
  insertSlide({ ...structuredClone(s), id: uid() });
}
function deleteSelected() {
  const s = sel();
  if (!s) return;
  const i = quiz.slides.indexOf(s);
  quiz.slides.splice(i, 1);
  lastDeleted = { slide: s, index: i };
  selectedId = (quiz.slides[i] || quiz.slides[i - 1] || {}).id || null;
  changed({ inspector: true, immediateList: true });
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `Slide deleted <button class="btn small" style="margin-left:10px">Undo</button>`;
  t.querySelector('button').onclick = () => {
    if (!lastDeleted) return;
    quiz.slides.splice(lastDeleted.index, 0, lastDeleted.slide);
    selectedId = lastDeleted.slide.id;
    lastDeleted = null;
    t.remove();
    changed({ inspector: true, immediateList: true });
  };
  document.querySelectorAll('.toast').forEach((x) => x.remove());
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 6000);
}

// ---------- add menu ----------
const addMenu = $('#add-menu');
const ADD_ITEMS = [
  ['Questions'],
  ['question', 'text', 'Text question', 'Just the question'],
  ['question', 'choice', 'Multiple choice', 'Question with 2–6 options'],
  ['question', 'image', 'Picture question', 'Question with an image'],
  ['question', 'audio', 'Audio question', 'Listen, then answer'],
  ['question', 'video', 'Video question', 'Clip plays first, then the question'],
  ['Structure'],
  ['category', null, 'Category', 'Starts a new round & theme'],
  ['title', null, 'Title slide'],
  ['break', null, 'Break'],
  ['answers', null, 'Answers', 'Where the answer slides go'],
  ['end', null, 'Final scores'],
];
addMenu.innerHTML = ADD_ITEMS.map((it) => it.length === 1 ? `<h4>${it[0]}</h4>` :
  `<button data-kind="${it[0]}" data-preset="${it[1] || ''}">${icon(it[0] === 'question' ? (it[1] === 'text' ? 'text' : it[1]) : KIND_ICON[it[0]])}<span>${it[2]}${it[3] ? `<small>${it[3]}</small>` : ''}</span></button>`).join('');
$('#btn-add').innerHTML = `${icon('plus')} Add slide`;
$('#btn-add').addEventListener('click', (e) => { e.stopPropagation(); addMenu.classList.toggle('hidden'); if (!addMenu.classList.contains('hidden')) addMenu.querySelector('button').focus(); });
addMenu.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  addMenu.classList.add('hidden');
  insertSlide(newSlide(b.dataset.kind, b.dataset.preset || null));
  setTimeout(() => inspEl.querySelector('textarea, input.input')?.focus(), 30);
});
document.addEventListener('click', (e) => { if (!addMenu.contains(e.target)) addMenu.classList.add('hidden'); });

// ---------- keyboard ----------
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') addMenu.classList.add('hidden');
  if (isTyping(document.activeElement) || document.querySelector('dialog[open]')) return;
  const i = quiz.slides.findIndex((s) => s.id === selectedId);
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const n = quiz.slides[Math.max(0, Math.min(quiz.slides.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
    if (n) select(n.id);
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
    e.preventDefault();
    deleteSelected();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
    e.preventDefault();
    duplicateSelected();
  }
});

// ---------- top bar ----------
function setupTopbar() {
  $('#back').innerHTML = icon('back');
  $('#btn-csv').innerHTML = `${icon('table')} Import CSV`;
  $('#btn-settings').innerHTML = `${icon('settings')} Settings`;
  $('#btn-export').innerHTML = `${icon('download')} PowerPoint`;
  $('#btn-host').innerHTML = `${icon('host')} Host view`;
  $('#btn-present').innerHTML = `${icon('play')} Present`;
  const title = $('#title');
  title.value = quiz.title;
  document.title = `${quiz.title} · Quiz Night Slides`;
  title.addEventListener('input', () => { quiz.title = title.value; document.title = `${quiz.title} · Quiz Night Slides`; scheduleSave(); });
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') title.blur(); });

  const startKey = () => {
    const s = sel();
    if (!s) return '';
    const d = deck.find((x) => x.key === selectedStep) || deck.find((x) => x.srcId === s.id);
    return d ? d.key : '';
  };
  const open = async (role) => {
    clearTimeout(saveTimer);
    await save();
    window.open(`/present/${quizId}?${role ? 'role=host&' : ''}from=${encodeURIComponent(startKey())}`, role ? `host-${quizId}` : `audience-${quizId}`);
  };
  $('#btn-present').addEventListener('click', () => open(null));
  $('#btn-host').addEventListener('click', () => open('host'));
  $('#btn-export').addEventListener('click', async () => {
    clearTimeout(saveTimer);
    await save();
    exportPowerPoint(quiz);
  });

  // settings
  const dlg = $('#dlg-settings');
  $('#set-theme').innerHTML = THEME_ORDER.map((k) => `<option value="${k}">${THEMES[k].name} · ${THEMES[k].hint}</option>`).join('');
  $('#btn-settings').addEventListener('click', () => {
    dlg.querySelectorAll('[data-s]').forEach((el) => {
      const v = quiz.settings[el.dataset.s];
      if (el.type === 'checkbox') el.checked = v !== false;
      else el.value = v || el.options[0].value;
    });
    dlg.showModal();
  });
  dlg.querySelectorAll('[data-s]').forEach((el) => el.addEventListener('change', () => {
    quiz.settings[el.dataset.s] = el.type === 'checkbox' ? el.checked : el.value;
    changed({ inspector: true, immediateList: true });
  }));
  $('#btn-cleanup').addEventListener('click', async () => {
    clearTimeout(saveTimer);
    await save();
    const r = await api.cleanup(quizId);
    toast(r.removed ? `Removed ${r.removed} unused file${r.removed === 1 ? '' : 's'}` : 'No unused media found');
  });

  setupCsv({
    quiz: () => quiz,
    selectedId: () => selectedId,
    uploadMedia, mediaKind, newSlide,
    apply(slides, mode) {
      const isQ = (s) => s.kind === 'question' || s.kind === 'category';
      if (mode === 'replace') quiz.slides = slides;
      else if (mode === 'questions') {
        // swap out questions & categories, keep title/break/answers/final slides
        let at = quiz.slides.findIndex(isQ);
        if (at < 0) at = Math.max(0, quiz.slides.findIndex((s) => s.kind === 'answers' || s.kind === 'end'));
        const before = quiz.slides.slice(0, at).filter((s) => !isQ(s));
        const after = quiz.slides.slice(at).filter((s) => !isQ(s));
        quiz.slides = [...before, ...slides, ...after];
      } else if (mode === 'after' && selectedId) quiz.slides.splice(quiz.slides.findIndex((s) => s.id === selectedId) + 1, 0, ...slides);
      else {
        // after the last question/category, so answers & final slides stay at the end
        let at = -1;
        quiz.slides.forEach((s, i) => { if (isQ(s)) at = i; });
        if (at < 0) { const t = quiz.slides.findIndex((s) => s.kind === 'answers' || s.kind === 'end'); at = (t < 0 ? quiz.slides.length : t) - 1; }
        quiz.slides.splice(at + 1, 0, ...slides);
      }
      selectedId = slides[0]?.id || selectedId;
      changed({ inspector: true, immediateList: true });
    },
  });
}

// ---------- init ----------
async function init() {
  try {
    quiz = await api.get(quizId);
  } catch (e) {
    document.body.innerHTML = `<div class="lib"><div class="empty">Couldn't open this quiz (${esc(e.message)}). <a href="/">Back to your quizzes</a></div></div>`;
    return;
  }
  quiz.settings = { answers: 'end', answerStyle: 'single', showCategoryOnQuestions: true, defaultTheme: 'arches', ...(quiz.settings || {}) };
  await fontsReady();
  deck = buildDeck(quiz);
  selectedId = quiz.slides[0]?.id || null;
  setupTopbar();
  renderList();
  renderPreview();
  renderInspector();
  saveState.textContent = 'Saved';
}
init();
