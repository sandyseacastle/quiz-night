// Presenter: audience view (full screen slides with media playback) and host view
// (current/next slide, answers & notes). The two windows stay in sync via BroadcastChannel.
import { api, esc } from './api.js';
import { icon } from './icons.js';
import { buildDeck, answerText } from './deck.js';
import { layoutSlide, fontsReady } from './layout.js';
import { renderSlide, fitStage, backgroundImage } from './render.js';

const quizId = decodeURIComponent(location.pathname.split('/').pop());
const params = new URLSearchParams(location.search);
const role = params.get('role') === 'host' ? 'host' : 'audience';
const app = document.getElementById('app');
const chan = 'BroadcastChannel' in window ? new BroadcastChannel(`quiz-${quizId}`) : null;

let quiz, deck, layouts;
let index = 0;

const layoutAt = (i) => (layouts[i] ||= layoutSlide(deck[i], quiz));

async function init() {
  quiz = await api.get(quizId);
  await fontsReady();
  deck = buildDeck(quiz);
  layouts = [];
  document.title = `${quiz.title} · ${role === 'host' ? 'Host view' : 'Presenting'}`;
  const from = params.get('from');
  const fi = from ? deck.findIndex((d) => d.key === from) : -1;
  index = fi >= 0 ? fi : 0;
  // warm the background cache
  [...new Set(deck.map((d) => d.bgKey))].forEach((k) => backgroundImage(k));
  if (!deck.length) { app.innerHTML = '<div class="overlay"><div class="box"><h2>Nothing to show</h2><p>This quiz has no slides yet.</p></div></div>'; return; }
  if (role === 'host') initHost(); else initAudience();
}

// =====================================================================
// AUDIENCE
// =====================================================================
function initAudience() {
  document.body.classList.add('audience');
  app.innerHTML = `<div class="show" id="show"></div><div class="blackout"></div>
    <div class="ctrl" id="ctrl">
      <button data-a="prev" title="Previous (←)">${icon('back')}</button>
      <span class="count" id="count"></span>
      <button data-a="next" title="Next (→ / Space)" style="transform:scaleX(-1)">${icon('back')}</button>
      <span class="sep"></span>
      <button data-a="media" title="Play / pause media (P)">${icon('play')} Media</button>
      <button data-a="full" title="Full screen (F)">Full screen</button>
      <button data-a="host" title="Open host view">${icon('host')} Host</button>
      <button data-a="help" title="Keyboard shortcuts (?)">?</button>
    </div>`;
  const show = document.getElementById('show');
  let current = null; // { slot, media, dispose }
  let started = false;
  let jumpBuf = '';
  let jumpTimer = null;

  function broadcast() {
    chan?.postMessage({ type: 'state', index, playing: !!(current?.media?.playing), from: 'audience' });
    document.getElementById('count').textContent = `${index + 1} / ${deck.length}`;
  }

  function go(i, { auto = true } = {}) {
    i = Math.max(0, Math.min(deck.length - 1, i));
    const prev = current;
    index = i;
    const slot = document.createElement('div');
    slot.className = 'slot';
    const { el, media } = renderSlide(layoutAt(i), { quizId, mode: 'present' });
    slot.appendChild(el);
    show.appendChild(slot);
    const dispose = fitStage(slot, el);
    requestAnimationFrame(() => requestAnimationFrame(() => slot.classList.add('in')));
    current = { slot, media, dispose };
    if (prev) {
      prev.media?.pause();
      setTimeout(() => { prev.dispose(); prev.slot.remove(); }, 400);
    }
    if (media) {
      media.el.addEventListener('play', broadcast);
      media.el.addEventListener('pause', broadcast);
      const d = deck[i];
      if (media.type === 'video') {
        media.onEnded(() => {
          if (index === i && d.q && d.q.autoAdvance !== false && deck[i + 1]) setTimeout(() => { if (index === i) go(i + 1); }, 700);
        });
      }
      if (auto && started && media.autoplay) setTimeout(() => { if (index === i) media.play(); }, 450);
    }
    // preload next slide's media
    const n = layouts[i + 1] || (deck[i + 1] && layoutAt(i + 1));
    n?.elements.forEach((e) => { if (e.t === 'image') new Image().src = `/media/${quizId}/${e.src}`; });
    broadcast();
  }

  const next = () => go(index + 1);
  const prev = () => go(index - 1);
  const mediaToggle = () => current?.media?.toggle();
  const mediaRestart = () => current?.media?.restart();
  const fullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}));

  function start() {
    if (started) return;
    started = true;
    document.querySelector('.overlay.start')?.remove();
    const m = current?.media;
    if (m && m.autoplay) m.play();
  }

  function help() {
    if (document.querySelector('.overlay.help')) { document.querySelector('.overlay.help').remove(); return; }
    const o = document.createElement('div');
    o.className = 'overlay help';
    o.innerHTML = `<div class="box"><h2>Shortcuts</h2><table>
      <tr><td><kbd>→</kbd> <kbd>Space</kbd> <kbd>Click</kbd></td><td>Next slide</td></tr>
      <tr><td><kbd>←</kbd></td><td>Previous slide</td></tr>
      <tr><td><kbd>P</kbd></td><td>Play / pause audio or video</td></tr>
      <tr><td><kbd>R</kbd></td><td>Restart audio or video</td></tr>
      <tr><td><kbd>F</kbd></td><td>Full screen</td></tr>
      <tr><td><kbd>B</kbd></td><td>Black screen</td></tr>
      <tr><td><kbd>Home</kbd> <kbd>End</kbd></td><td>First / last slide</td></tr>
      <tr><td><kbd>7</kbd> <kbd>Enter</kbd></td><td>Jump to question 7</td></tr>
      <tr><td><kbd>H</kbd></td><td>Open host view</td></tr>
      </table><p style="margin-top:14px">Press <kbd>?</kbd> to close.</p></div>`;
    o.onclick = () => o.remove();
    document.body.appendChild(o);
  }
  const openHost = () => window.open(`/present/${quizId}?role=host&from=${encodeURIComponent(deck[index].key)}`, `host-${quizId}`);

  document.getElementById('ctrl').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    e.stopPropagation();
    start();
    ({ prev, next, media: mediaToggle, full: fullscreen, host: openHost, help })[b.dataset.a]();
  });
  show.addEventListener('click', (e) => {
    if (e.target.closest('.audio-btn')) { start(); return; }
    if (!started) { start(); return; }
    next();
  });

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (!started && (k === ' ' || k === 'Enter' || k === 'ArrowRight')) { e.preventDefault(); start(); return; }
    start();
    if (/^[0-9]$/.test(k)) {
      jumpBuf += k;
      showJump(`Go to question ${jumpBuf}…`);
      clearTimeout(jumpTimer);
      jumpTimer = setTimeout(() => { jumpBuf = ''; showJump(); }, 2500);
      return;
    }
    if (k === 'Enter' && jumpBuf) {
      const n = +jumpBuf;
      jumpBuf = ''; showJump();
      const i = deck.findIndex((d) => (d.kind === 'video' || d.kind === 'question') && d.number === n);
      if (i >= 0) go(i);
      return;
    }
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n'].includes(k)) { e.preventDefault(); next(); }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(k)) { e.preventDefault(); prev(); }
    else if (k === 'p' || k === 'P' || k === 'k') mediaToggle();
    else if (k === 'r' || k === 'R') mediaRestart();
    else if (k === 'f' || k === 'F') fullscreen();
    else if (k === 'b' || k === 'B' || k === '.') document.body.classList.toggle('black');
    else if (k === 'Home') go(0);
    else if (k === 'End') go(deck.length - 1);
    else if (k === 'h' || k === 'H') openHost();
    else if (k === '?' || k === '/') help();
    else if (k === 'Escape') document.querySelector('.overlay.help')?.remove();
  });

  function showJump(text) {
    let j = document.querySelector('.jump');
    if (!text) { j?.remove(); return; }
    if (!j) { j = document.createElement('div'); j.className = 'jump'; document.body.appendChild(j); }
    j.textContent = text;
  }

  // hide cursor & controls when idle
  let idleT = null;
  const wake = () => { document.body.classList.remove('idle'); clearTimeout(idleT); idleT = setTimeout(() => document.body.classList.add('idle'), 2200); };
  document.addEventListener('mousemove', wake);
  wake();

  chan?.addEventListener('message', ({ data }) => {
    if (data.from === 'audience') return;
    if (data.type === 'hello') broadcast();
    else if (data.type === 'goto') { start(); go(data.index); }
    else if (data.type === 'media') { start(); data.action === 'restart' ? mediaRestart() : mediaToggle(); }
    else if (data.type === 'black') document.body.classList.toggle('black');
  });

  go(index, { auto: false });
  // the browser only allows sound after a click / key press in this window
  const o = document.createElement('div');
  o.className = 'overlay start';
  o.innerHTML = `<div class="box"><h2>${esc(quiz.title)}</h2><p>Press <kbd>Space</kbd> or click to begin. This also lets audio and video play with sound.</p>
    <p><kbd>F</kbd> full screen · <kbd>H</kbd> host view · <kbd>?</kbd> all shortcuts</p></div>`;
  o.addEventListener('click', (e) => { e.stopPropagation(); start(); });
  document.body.appendChild(o);
}

// =====================================================================
// HOST
// =====================================================================
function initHost() {
  document.body.classList.add('host');
  app.innerHTML = `<div class="host-wrap">
    <div class="host-top">
      <span class="t">${esc(quiz.title)}</span><span class="spacer"></span>
      <span class="status" id="status">No audience window</span>
      <button class="btn small" id="open-aud">${icon('play')} Open audience window</button>
      <span class="elapsed" id="elapsed" title="Click to reset">00:00</span>
      <span class="clock" id="clock"></span>
    </div>
    <div class="host-main">
      <div class="host-col"><div class="host-label">Now showing <span id="cur-label"></span></div><div class="host-frame cur" id="cur"></div></div>
      <div class="host-col">
        <div class="host-label">Up next <span id="next-label"></span></div><div class="host-frame" id="nxt"></div>
        <div class="host-label">Answer &amp; notes</div><div class="notes" id="notes"></div>
      </div>
    </div>
    <div class="host-bottom">
      <button class="btn" id="h-prev">${icon('back')} Prev</button>
      <span class="count" id="h-count"></span>
      <button class="btn primary" id="h-next">Next <span style="transform:scaleX(-1);display:inline-flex">${icon('back')}</span></button>
      <button class="btn" id="h-media">${icon('play')} Play / pause</button>
      <button class="btn" id="h-restart">Restart media</button>
      <button class="btn" id="h-black">Black screen</button>
      <div class="filmstrip" id="strip"></div>
    </div></div>`;
  const $ = (s) => document.getElementById(s);
  let audienceSeen = 0;
  let disposers = [];

  const label = (d) => {
    if (!d) return 'End of quiz';
    if (d.kind === 'video') return `Q${d.number} · clip`;
    if (d.kind === 'question') return `Q${d.number}`;
    if (d.kind === 'answer') return `Answer ${d.number}`;
    if (d.kind === 'answerList') return 'Answers';
    if (d.kind === 'category') return d.cat.title || 'Category';
    return { title: 'Title', break: 'Break', end: 'Final', answersHeader: 'Answers' }[d.kind] || d.kind;
  };

  // filmstrip of all slides
  $('strip').innerHTML = deck.map((d, i) => `<button data-i="${i}">${i + 1}. ${esc(label(d))}</button>`).join('');
  $('strip').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) goto(+b.dataset.i); });

  function frame(el, i) {
    el.innerHTML = '';
    if (i >= deck.length) { el.innerHTML = '<div style="display:grid;place-items:center;height:100%;color:#cbb89d">End of quiz</div>'; return; }
    const { el: st } = renderSlide(layoutAt(i), { quizId, mode: 'thumb' });
    st.querySelectorAll('video').forEach((v) => { v.muted = true; });
    el.appendChild(st);
    disposers.push(fitStage(el, st));
  }

  function draw() {
    disposers.forEach((f) => f());
    disposers = [];
    frame($('cur'), index);
    frame($('nxt'), index + 1);
    $('cur-label').textContent = label(deck[index]);
    $('next-label').textContent = label(deck[index + 1]);
    $('h-count').textContent = `${index + 1} / ${deck.length}`;
    $('strip').querySelectorAll('button').forEach((b, i) => b.classList.toggle('cur', i === index));
    const cb = $('strip').children[index];
    if (cb) $('strip').scrollLeft = cb.offsetLeft - $('strip').clientWidth / 2 + cb.clientWidth / 2;
    const d = deck[index];
    let h = '';
    if (d.q) {
      h += `<div class="q"><b>Q${d.number}.</b> ${esc(d.q.text || '')}</div><div class="host-label">Answer</div><div class="ans">${esc(answerText(d.q) || '(not set)')}</div>`;
      if (d.q.fact) h += `<div class="fact"><b>Fact:</b> ${esc(d.q.fact)}</div>`;
      if (d.q.notes) h += `<div class="hn"><b>Notes:</b> ${esc(d.q.notes)}</div>`;
      if (d.kind === 'video') h += `<div class="hn">Clip plays first${d.q.autoAdvance !== false ? ', then moves to the question by itself' : ''}.</div>`;
    } else if (d.kind === 'answerList') {
      h += d.items.map((it) => `<div class="q"><b>${it.number}.</b> ${esc(answerText(it.q))}</div>`).join('');
    } else if (d.kind === 'category') {
      const n = deck.filter((x) => x.kind === 'question' && x.cat === d.cat).length;
      h += `<div class="q"><b>${esc(d.cat.title)}</b> · ${n} question${n === 1 ? '' : 's'}</div>`;
      if (d.src.notes) h += `<div class="hn">${esc(d.src.notes)}</div>`;
    } else if (d.src && d.src.notes) h += `<div class="hn">${esc(d.src.notes)}</div>`;
    $('notes').innerHTML = h || '<div class="hn">No notes for this slide.</div>';
  }

  function goto(i) {
    index = Math.max(0, Math.min(deck.length - 1, i));
    chan?.postMessage({ type: 'goto', index, from: 'host' });
    draw();
  }
  chan?.addEventListener('message', ({ data }) => {
    if (data.from !== 'audience' || data.type !== 'state') return;
    audienceSeen = Date.now();
    $('status').textContent = data.playing ? 'Audience connected · media playing' : 'Audience connected';
    $('status').classList.add('on');
    if (data.index !== index) { index = data.index; draw(); }
  });
  setInterval(() => {
    if (Date.now() - audienceSeen > 6000) { $('status').textContent = 'No audience window'; $('status').classList.remove('on'); }
    chan?.postMessage({ type: 'hello', from: 'host' });
  }, 3000);
  chan?.postMessage({ type: 'hello', from: 'host' });

  $('h-prev').onclick = () => goto(index - 1);
  $('h-next').onclick = () => goto(index + 1);
  $('h-media').onclick = () => chan?.postMessage({ type: 'media', action: 'toggle', from: 'host' });
  $('h-restart').onclick = () => chan?.postMessage({ type: 'media', action: 'restart', from: 'host' });
  $('h-black').onclick = () => chan?.postMessage({ type: 'black', from: 'host' });
  $('open-aud').onclick = () => window.open(`/present/${quizId}?from=${encodeURIComponent(deck[index].key)}`, `audience-${quizId}`);

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); goto(index + 1); }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); goto(index - 1); }
    else if (e.key === 'p' || e.key === 'P') $('h-media').click();
    else if (e.key === 'r' || e.key === 'R') $('h-restart').click();
    else if (e.key === 'b' || e.key === 'B') $('h-black').click();
  });

  // clock + elapsed timer
  let t0 = Date.now();
  $('elapsed').style.cursor = 'pointer';
  $('elapsed').onclick = () => { t0 = Date.now(); };
  const tick = () => {
    $('clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const s = Math.floor((Date.now() - t0) / 1000);
    $('elapsed').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  tick();
  setInterval(tick, 1000);
  draw();
}

init().catch((e) => { app.innerHTML = `<div class="overlay"><div class="box"><h2>Couldn't load</h2><p>${esc(e.message)}</p></div></div>`; });
