// Turns the editable quiz (source slides) into the flat list of presented slides.
// - questions are numbered across the whole quiz
// - a category slide starts a new (implied) round and switches the theme
// - a video question becomes two slides: the clip, then the question
// - an "answers" marker expands into answer slides for every question since the previous marker
//   (if there is no marker, answers are appended at the end)
import { THEME_ORDER, THEMES } from './themes.js';

// One fixed pattern per theme (the theme name still varies it), so a theme's background looks
// identical on every slide that uses it: title, category, question, answer…
const SEED = 7;

export const KIND_LABELS = {
  title: 'Title', category: 'Category', question: 'Question', break: 'Break', answers: 'Answers', end: 'Final',
};

export function questionFormat(q) {
  const m = q.media || 'none';
  const mc = q.answerType === 'choice';
  const order = { order: 'Order', match: 'Match' }[q.answerType];
  if (m === 'none') return mc ? 'Multiple choice' : order || 'Text';
  const base = { image: 'Image', audio: 'Audio', video: 'Video' }[m];
  return mc ? `${base} · choice` : order ? `${base} · ${order.toLowerCase()}` : base;
}

// Order and match questions show their options like multiple choice, but the answer is free text
export const isOrdering = (q) => q.answerType === 'order' || q.answerType === 'match';
export const showsOptions = (q) => (q.answerType === 'choice' || isOrdering(q)) && (q.options || []).length > 0;

export function answerText(q) {
  if (q.answerType === 'choice' && q.options && q.options.length) {
    const i = Math.max(0, Math.min(q.correct || 0, q.options.length - 1));
    return `${String.fromCharCode(65 + i)}. ${q.options[i] || ''}`;
  }
  return q.answer || '';
}

export function buildDeck(quiz) {
  const settings = quiz.settings || {};
  const defTheme = THEMES[settings.defaultTheme] ? settings.defaultTheme : 'arches';
  const out = [];
  let round = 0;
  let qNum = 0;
  let cat = { title: '', theme: defTheme, seed: SEED, round: 0 };
  let pending = []; // questions awaiting an answers section
  let hadMarker = false;

  const pickTheme = (s, fallback) => (s.theme && THEMES[s.theme] ? s.theme : fallback);

  const pushAnswers = (marker) => {
    if (settings.answers === 'none') return;
    const theme = marker ? pickTheme(marker, defTheme) : defTheme;
    const seed = SEED;
    out.push({
      key: `${marker ? marker.id : 'auto-answers'}:header`, srcId: marker ? marker.id : null, kind: 'answersHeader',
      theme, seed, variant: 'full',
      kicker: marker ? marker.kicker : 'Pens down', title: marker ? marker.title : 'The Answers', subtitle: marker ? marker.subtitle : '',
    });
    if (settings.answerStyle === 'list') {
      // group by round, max 10 per slide
      const groups = [];
      for (const p of pending) {
        const g = groups[groups.length - 1];
        if (g && g.cat === p.cat && g.items.length < 10) g.items.push(p); else groups.push({ cat: p.cat, items: [p] });
      }
      groups.forEach((g, gi) => out.push({
        key: `${marker ? marker.id : 'auto'}:list${gi}`, srcId: marker ? marker.id : null, kind: 'answerList',
        theme: g.cat.theme, seed: g.cat.seed, variant: 'panel', cat: g.cat, items: g.items,
      }));
    } else {
      for (const p of pending) {
        out.push({
          key: `${p.q.id}:answer`, srcId: p.q.id, kind: 'answer', theme: p.cat.theme, seed: p.cat.seed, variant: 'panel',
          number: p.number, cat: p.cat, q: p.q,
        });
      }
    }
    pending = [];
  };

  for (const s of quiz.slides || []) {
    switch (s.kind) {
      case 'category': {
        round++;
        const theme = s.theme && THEMES[s.theme] ? s.theme : THEME_ORDER[(round - 1) % THEME_ORDER.length];
        cat = { title: s.title || '', theme, seed: SEED, round, id: s.id };
        out.push({ key: `${s.id}:intro`, srcId: s.id, kind: 'category', theme, seed: cat.seed, variant: 'full', round, src: s, cat });
        break;
      }
      case 'question': {
        qNum++;
        const entry = { q: s, number: qNum, cat };
        if (s.media === 'video' && s.file && s.file.src) {
          out.push({ key: `${s.id}:clip`, srcId: s.id, kind: 'video', theme: cat.theme, seed: cat.seed, variant: 'full', number: qNum, cat, q: s });
        }
        out.push({ key: `${s.id}:q`, srcId: s.id, kind: 'question', theme: cat.theme, seed: cat.seed, variant: 'panel', number: qNum, cat, q: s });
        pending.push(entry);
        break;
      }
      case 'answers':
        hadMarker = true;
        pushAnswers(s);
        break;
      case 'title': case 'break': case 'end': {
        const theme = pickTheme(s, defTheme);
        out.push({ key: `${s.id}:main`, srcId: s.id, kind: s.kind, theme, seed: SEED, variant: 'full', src: s });
        break;
      }
      default: break;
    }
  }
  if (pending.length && !hadMarker) pushAnswers(null);
  out.forEach((d, i) => { d.index = i; d.bgKey = `${d.theme}|${d.variant}|${d.seed}`; });
  return out;
}
