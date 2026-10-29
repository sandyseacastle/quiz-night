import { api, esc, toast } from './api.js';
import { icon } from './icons.js';
import { buildDeck } from './deck.js';
import { layoutSlide, fontsReady } from './layout.js';
import { renderSlide } from './render.js';

const cards = document.getElementById('cards');

async function load() {
  const list = await api.list();
  await fontsReady();
  cards.innerHTML = '';
  if (!list.length) {
    cards.innerHTML = '<div class="empty">No quizzes yet. Click <b>New quiz</b> to start one.</div>';
    return;
  }
  for (const q of list) {
    const card = document.createElement('div');
    card.className = 'card';
    const when = q.updatedAt ? new Date(q.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';
    card.innerHTML = `
      <a class="cover" href="/editor/${q.id}" aria-label="Open ${esc(q.title)}"></a>
      <div class="body"><h3>${esc(q.title)}</h3>
        <div class="stats">${q.rounds} round${q.rounds === 1 ? '' : 's'} · ${q.questions} question${q.questions === 1 ? '' : 's'} · ${when ? 'edited ' + esc(when) : ''}</div></div>
      <div class="actions">
        <a class="btn small primary" href="/editor/${q.id}">Edit</a>
        <a class="btn small" href="/present/${q.id}" target="_blank">${icon('play')} Present</a>
        <span class="spacer"></span>
        <button class="btn small ghost" data-act="dup" title="Duplicate">${icon('copy')}</button>
        <button class="btn small ghost danger" data-act="del" title="Delete">${icon('trash')}</button>
      </div>`;
    cards.appendChild(card);
    card.querySelector('[data-act=dup]').onclick = async () => { await api.duplicate(q.id); toast('Quiz duplicated'); load(); };
    card.querySelector('[data-act=del]').onclick = async () => {
      if (!confirm(`Delete “${q.title}” and all its media? This can't be undone.`)) return;
      await api.remove(q.id); load();
    };
    // cover = first slide
    api.get(q.id).then((full) => {
      const deck = buildDeck(full);
      if (!deck.length) return;
      const cover = card.querySelector('.cover');
      const { el } = renderSlide(layoutSlide(deck[0], full), { quizId: q.id, mode: 'thumb' });
      cover.appendChild(el);
      const fit = () => { el.style.transform = `scale(${cover.clientWidth / 1920})`; };
      fit(); new ResizeObserver(fit).observe(cover);
    });
  }
}

document.getElementById('new').onclick = async () => {
  const title = prompt('Name your quiz', 'Quiz Night');
  if (title === null) return;
  const q = await api.create({ title: title.trim() || 'Quiz Night' });
  location.href = `/editor/${q.id}`;
};
load().catch((e) => toast(e.message));
