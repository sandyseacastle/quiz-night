// Quiz Night Slides – local editor server
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { exportPptx } = require('./lib/export-pptx');

const PORT = process.env.PORT || 3123;
const ROOT = __dirname;
// The desktop app stores quizzes in the user's config folder (the install dir is read-only)
const DATA = process.env.QUIZ_DATA_DIR || path.join(ROOT, 'quizzes');
fs.mkdirSync(DATA, { recursive: true });

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(ROOT, 'public')));
app.use('/fonts', express.static(path.join(ROOT, 'fonts')));
// Title font: the first Salina file dropped into fonts/ (the family is commercial, so it isn't bundled).
// Prefers a heavy weight, since titles are big display text.
// The desktop app also looks in QUIZ_FONTS_DIR (File > Add Title Font…), since the installed fonts/ is read-only.
app.get('/title-font', (req, res) => {
  const dirs = [process.env.QUIZ_FONTS_DIR, path.join(ROOT, 'fonts')].filter((d) => d && fs.existsSync(d));
  const files = dirs.flatMap((d) => fs.readdirSync(d).map((f) => path.join(d, f)))
    .filter((f) => /^salina.*\.(otf|ttf|woff2?)$/i.test(path.basename(f)) && !/swash|italic/i.test(path.basename(f)));
  const weight = (f) => path.basename(f).toLowerCase().replace(/\.\w+$/, '').replace(/[^a-z]/g, '');
  const rank = (f) => { const i = ['bold', 'extrabold', 'black', 'semibold', 'medium', 'regular'].findIndex((w) => weight(f).endsWith(w) && !weight(f).endsWith('semi' + w) && !weight(f).endsWith('extra' + w)); return i < 0 ? 99 : i; };
  const pick = files.sort((a, b) => rank(a) - rank(b))[0];
  if (!pick) return res.status(404).end();
  res.set('Cache-Control', 'no-cache').sendFile(pick);
});
app.use('/vendor/papaparse.min.js', (req, res) =>
  res.sendFile(path.join(ROOT, 'node_modules/papaparse/papaparse.min.js')));
app.use('/vendor/fflate.js', (req, res) =>
  res.sendFile(path.join(ROOT, 'node_modules/fflate/umd/index.js')));

const newId = (p = '') => p + crypto.randomBytes(5).toString('hex');
const safeId = (id) => /^[a-z0-9_-]+$/i.test(id || '');
const quizDir = (id) => path.join(DATA, id);
const quizFile = (id) => path.join(quizDir(id), 'quiz.json');

function readQuiz(id) {
  if (!safeId(id) || !fs.existsSync(quizFile(id))) return null;
  return JSON.parse(fs.readFileSync(quizFile(id), 'utf8'));
}
function writeQuiz(q) {
  fs.mkdirSync(path.join(quizDir(q.id), 'media'), { recursive: true });
  q.updatedAt = new Date().toISOString();
  const tmp = quizFile(q.id) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(q, null, 2));
  fs.renameSync(tmp, quizFile(q.id));
  return q;
}

function starterQuiz(title) {
  const s = (o) => ({ id: newId('s'), ...o });
  return {
    id: newId('q'),
    title: title || 'Quiz Night',
    createdAt: new Date().toISOString(),
    settings: {
      answers: 'end', answerStyle: 'single',
      showCategoryOnQuestions: true, defaultTheme: 'arches',
    },
    slides: [
      s({ kind: 'title', kicker: 'Welcome to', title: title || 'Quiz Night', subtitle: 'Grab a pen, pick a team name, and settle in.', theme: '' }),
      s({ kind: 'category', title: 'General Knowledge', subtitle: 'A gentle warm-up', theme: 'auto' }),
      s({ kind: 'question', media: 'none', answerType: 'open', text: 'What is the only planet in our solar system that rotates on its side?', answer: 'Uranus', options: [], correct: 0 }),
      s({ kind: 'question', media: 'none', answerType: 'choice', text: 'Which of these is the largest ocean?', answer: '', options: ['Atlantic', 'Indian', 'Pacific', 'Arctic'], correct: 2 }),
      s({ kind: 'break', kicker: 'Intermission', title: 'Top up time', subtitle: 'Back in ten minutes. Hand in your answer sheets!', theme: '' }),
      s({ kind: 'answers', kicker: 'Swap sheets', title: 'The Answers', subtitle: 'Mark your neighbour honestly…', theme: '' }),
      s({ kind: 'end', kicker: 'And the winner is…', title: 'Final Scores', subtitle: 'Thanks for playing!', theme: '' }),
    ],
  };
}

// ---------- API ----------
app.get('/api/quizzes', (req, res) => {
  const list = fs.readdirSync(DATA).filter((d) => fs.existsSync(quizFile(d))).map((d) => {
    const q = readQuiz(d);
    return {
      id: q.id, title: q.title, updatedAt: q.updatedAt, slides: q.slides.length,
      questions: q.slides.filter((s) => s.kind === 'question').length,
      rounds: q.slides.filter((s) => s.kind === 'category').length,
    };
  }).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  res.json(list);
});

app.post('/api/quizzes', (req, res) => {
  const q = req.body && req.body.slides ? { ...req.body, id: newId('q') } : starterQuiz(req.body && req.body.title);
  res.json(writeQuiz(q));
});

app.get('/api/quizzes/:id', (req, res) => {
  const q = readQuiz(req.params.id);
  if (!q) return res.status(404).json({ error: 'Quiz not found' });
  res.json(q);
});

app.put('/api/quizzes/:id', (req, res) => {
  if (!readQuiz(req.params.id)) return res.status(404).json({ error: 'Quiz not found' });
  const q = { ...req.body, id: req.params.id };
  res.json({ ok: true, updatedAt: writeQuiz(q).updatedAt });
});

app.delete('/api/quizzes/:id', (req, res) => {
  if (!readQuiz(req.params.id)) return res.status(404).json({ error: 'Quiz not found' });
  fs.rmSync(quizDir(req.params.id), { recursive: true, force: true });
  res.json({ ok: true });
});

app.post('/api/quizzes/:id/duplicate', (req, res) => {
  const q = readQuiz(req.params.id);
  if (!q) return res.status(404).json({ error: 'Quiz not found' });
  const copy = { ...q, id: newId('q'), title: q.title + ' (copy)', createdAt: new Date().toISOString() };
  fs.cpSync(path.join(quizDir(q.id), 'media'), path.join(quizDir(copy.id), 'media'), { recursive: true });
  res.json(writeQuiz(copy));
});

// media upload
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(quizDir(req.params.id), 'media');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname) || '').toLowerCase().replace(/[^a-z0-9.]/g, '');
      cb(null, newId('m') + ext);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
});
app.post('/api/quizzes/:id/media', (req, res, next) => {
  if (!readQuiz(req.params.id)) return res.status(404).json({ error: 'Quiz not found' });
  next();
}, upload.single('file'), (req, res) => {
  res.json({ src: req.file.filename, name: req.file.originalname, mime: req.file.mimetype, size: req.file.size });
});

// remove media files no longer referenced
app.post('/api/quizzes/:id/cleanup', (req, res) => {
  const q = readQuiz(req.params.id);
  if (!q) return res.status(404).json({ error: 'Quiz not found' });
  const used = new Set(q.slides.flatMap((s) => [s.file && s.file.src, s.answerFile && s.answerFile.src]).filter(Boolean));
  const dir = path.join(quizDir(q.id), 'media');
  let removed = 0;
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (!used.has(f)) { fs.rmSync(path.join(dir, f)); removed++; }
  res.json({ removed });
});

app.get('/media/:id/:file', (req, res) => {
  if (!safeId(req.params.id) || !/^[a-z0-9_.-]+$/i.test(req.params.file)) return res.sendStatus(404);
  res.sendFile(path.join(quizDir(req.params.id), 'media', req.params.file));
});

// PowerPoint export: client sends the computed layouts + rasterised backgrounds/covers
const exportUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
app.post('/api/quizzes/:id/export', exportUpload.any(), async (req, res) => {
  try {
    const q = readQuiz(req.params.id);
    if (!q) return res.status(404).json({ error: 'Quiz not found' });
    const deck = JSON.parse(req.body.deck);
    const images = {};
    for (const f of req.files || []) images[f.fieldname] = f.buffer;
    const buf = await exportPptx({ quiz: q, deck, images, mediaDir: path.join(quizDir(q.id), 'media'), fontsDir: path.join(ROOT, 'fonts') });
    const name = (q.title || 'quiz').replace(/[^a-z0-9 _-]/gi, '').trim() || 'quiz';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.pptx"`);
    res.send(buf);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/editor/:id', (req, res) => res.sendFile(path.join(ROOT, 'public/editor.html')));
app.get('/present/:id', (req, res) => res.sendFile(path.join(ROOT, 'public/present.html')));

function start(port = PORT, host) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => resolve(server)).on('error', reject);
  });
}
module.exports = { start };

if (require.main === module) {
  start().then(() => {
    console.log(`\n  Quiz Night Slides is running → http://localhost:${PORT}\n`);
    if (process.argv.includes('--open')) {
      const cmd = process.platform === 'win32' ? 'start ""' : process.platform === 'darwin' ? 'open' : 'xdg-open';
      require('child_process').exec(`${cmd} http://localhost:${PORT}`);
    }
  });
}
