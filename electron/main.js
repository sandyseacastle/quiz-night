// Quiz Night Slides – desktop app (Electron). Runs the Express server in-process
// and shows it in app windows instead of a browser.
const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const ICON = path.join(ROOT, 'build/icon.png');
const DEV = process.argv.includes('--dev');

// Dev mode gets its own profile, so it can run next to the installed app
if (DEV) app.setPath('userData', app.getPath('userData') + ' (dev)');
if (!app.requestSingleInstanceLock()) app.quit();

// Quizzes live in ~/.config/Quiz Night Slides/quizzes; the demo is copied in on first run.
// Dev mode uses the project's quizzes folder, like `npm start`.
function prepareDataDir() {
  if (DEV) return (process.env.QUIZ_DATA_DIR = path.join(ROOT, 'quizzes'));
  const dir = path.join(app.getPath('userData'), 'quizzes');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    const demo = path.join(ROOT, 'quizzes/demo');
    if (fs.existsSync(demo)) fs.cpSync(demo, path.join(dir, 'demo'), { recursive: true });
  }
  process.env.QUIZ_DATA_DIR = dir;
  return dir;
}
const userFonts = () => path.join(app.getPath('userData'), 'fonts');

// Copy a Salina font file where the server looks for it (the bundled fonts folder is read-only once installed)
async function addTitleFont(win) {
  const r = await dialog.showOpenDialog(win, {
    title: 'Choose a Salina font file', properties: ['openFile'],
    filters: [{ name: 'Fonts', extensions: ['otf', 'ttf', 'woff', 'woff2'] }],
  });
  if (r.canceled || !r.filePaths[0]) return;
  const src = r.filePaths[0];
  let name = path.basename(src);
  if (!/^salina/i.test(name)) name = 'Salina-' + name; // the server picks files named Salina*
  fs.mkdirSync(userFonts(), { recursive: true });
  for (const f of fs.readdirSync(userFonts())) if (/^salina/i.test(f)) fs.rmSync(path.join(userFonts(), f)); // one at a time
  fs.copyFileSync(src, path.join(userFonts(), name));
  BrowserWindow.getAllWindows().forEach((w) => w.webContents.reloadIgnoringCache());
}

let origin, mainWin;

function windowOptions(extra = {}) {
  return { width: 1400, height: 900, icon: ICON, autoHideMenuBar: true, backgroundColor: '#f4e9d4', ...extra };
}

function attachHandlers(win) {
  // Present / host view open as app windows; anything external goes to the browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(origin)) return { action: 'allow', overrideBrowserWindowOptions: windowOptions() };
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function buildMenu(dataDir) {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [
      { label: 'Open Quizzes Folder', click: () => shell.openPath(dataDir) },
      { label: 'Open Fonts Folder', click: () => shell.openPath(path.join(ROOT, 'fonts')) },
      { label: 'Add Title Font (Salina)…', click: (_, w) => addTitleFont(w || mainWin) },
      { type: 'separator' },
      { role: 'quit' },
    ] },
    { role: 'editMenu' },
    { label: 'View', submenu: [
      { label: 'Library', accelerator: 'CmdOrCtrl+L', click: (_, w) => (w || mainWin)?.loadURL(origin + '/') },
      { role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' },
      { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' },
      { role: 'togglefullscreen' },
    ] },
    { role: 'windowMenu' },
  ]));
}

// Dev mode (see scripts/dev.js): reload windows when public/ changes, and remember the
// main window's page so the runner can reopen it after restarting for a server change
function watchForChanges() {
  let t;
  fs.watch(path.join(ROOT, 'public'), { recursive: true }, () => {
    clearTimeout(t);
    t = setTimeout(() => {
      console.log('  Files changed, reloading windows');
      BrowserWindow.getAllWindows().forEach((w) => w.webContents.reloadIgnoringCache());
    }, 150);
  });
  const pageFile = process.env.QUIZ_DEV_PAGE_FILE;
  if (pageFile) mainWin.webContents.on('did-navigate', (_, url) => {
    const u = new URL(url);
    fs.writeFileSync(pageFile, u.pathname + u.search);
  });
}

app.on('browser-window-created', (_, win) => attachHandlers(win));

app.on('second-instance', () => {
  if (mainWin) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.focus(); }
});

app.whenReady().then(async () => {
  const dataDir = prepareDataDir();
  process.env.QUIZ_FONTS_DIR = userFonts();
  const { start } = require(path.join(ROOT, 'server.js'));
  let server;
  try {
    server = await start(0, '127.0.0.1'); // any free port, local only
  } catch (e) {
    dialog.showErrorBox('Quiz Night Slides', `Could not start: ${e.message}`);
    return app.quit();
  }
  origin = `http://127.0.0.1:${server.address().port}`;
  buildMenu(dataDir);
  mainWin = new BrowserWindow(windowOptions({ title: DEV ? 'Quiz Night Slides (dev)' : 'Quiz Night Slides' }));
  let page = '/';
  if (DEV && process.env.QUIZ_DEV_PAGE_FILE) try { page = fs.readFileSync(process.env.QUIZ_DEV_PAGE_FILE, 'utf8'); } catch {}
  if (DEV) watchForChanges();
  mainWin.loadURL(origin + page);
});

app.on('window-all-closed', () => app.quit());
