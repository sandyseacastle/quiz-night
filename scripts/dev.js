// Dev runner for the desktop app: `npm run dev`.
// Runs Electron from the source folder and restarts it when server.js, lib/ or electron/ change.
// Changes in public/ are handled inside the app (electron/main.js reloads the windows).
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const electron = require('electron'); // path to the Electron binary

const ROOT = path.join(__dirname, '..');
const PAGE_FILE = path.join(os.tmpdir(), `quiz-night-dev-page-${process.pid}`);
const extraArgs = process.argv.slice(2);
// The chrome-sandbox helper npm downloads isn't root-owned, so Electron refuses to start on Linux.
// Dev mode only loads the app's own local pages; the installed app (.deb) keeps the sandbox.
if (process.platform === 'linux' && !extraArgs.includes('--no-sandbox')) extraArgs.push('--no-sandbox');

let child, restarting = false, timer;

function run() {
  child = spawn(electron, ['.', '--dev', ...extraArgs], {
    cwd: ROOT, stdio: 'inherit', env: { ...process.env, QUIZ_DEV_PAGE_FILE: PAGE_FILE },
  });
  child.on('exit', (code) => {
    if (restarting) { restarting = false; return run(); }
    cleanup();
    process.exit(code ?? 0); // the app window was closed
  });
}

function restart() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    console.log('  Code changed, restarting…');
    restarting = true;
    child.kill();
  }, 300);
}

function cleanup() { try { fs.rmSync(PAGE_FILE); } catch {} }

for (const p of ['server.js', 'lib', 'electron']) fs.watch(path.join(ROOT, p), { recursive: true }, restart);
process.on('SIGINT', () => { restarting = false; child.kill(); });
process.on('SIGTERM', () => { restarting = false; child.kill(); });

console.log('\n  Dev mode: public/ changes reload the windows; server.js, lib/ and electron/ changes restart the app.\n');
run();
