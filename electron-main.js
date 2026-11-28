// Loudbox desktop app (Electron). Serves the app folder on 127.0.0.1 because
// YouTube's embedded player refuses to play from file:// pages.
const { app, BrowserWindow, shell, Menu, ipcMain, screen } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { handleApi } = require('./youtube');

const ROOT = path.join(__dirname, 'app');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json',
};

// Keep one running copy; a second launch focuses the first window.
// Same id as the installer's shortcuts, so a pinned taskbar icon and the open window group together
// and show Loudbox's icon.
app.setAppUserModelId('app.loudbox.player');

if (!app.requestSingleInstanceLock()) { app.quit(); }

function startServer(port, triesLeft = 10) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      if (await handleApi(req, res)) return;
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p === '/') p = '/index.html';
      const file = path.normalize(path.join(ROOT, p));
      if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); return res.end('Not found'); }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
        res.end(data);
      });
    });
    server.once('error', (e) => {
      if (e.code === 'EADDRINUSE' && triesLeft > 0) resolve(startServer(port + 1, triesLeft - 1));
      else reject(e);
    });
    // A fixed port keeps the same origin, so your library (saved in the app's storage) persists between launches.
    server.listen(port, '127.0.0.1', () => resolve(port));
  });
}

/* ---- remembered window size, position and pin ---- */
const STATE_FILE = () => path.join(app.getPath('userData'), 'window-state.json');
function loadWinState() {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE(), 'utf8'));
    // only reuse the position if it is still on a connected screen
    const visible = screen.getAllDisplays().some((d) => {
      const a = d.workArea;
      return s.x < a.x + a.width - 80 && s.x + s.width > a.x + 80 && s.y >= a.y - 10 && s.y < a.y + a.height - 40;
    });
    if (!visible) { delete s.x; delete s.y; }
    return s;
  } catch { return {}; }
}
let saveTimer;
function saveWinState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!win || win.isDestroyed()) return;
    const b = win.getNormalBounds();
    try { fs.writeFileSync(STATE_FILE(), JSON.stringify({ ...b, maximized: win.isMaximized(), pinned: win.isAlwaysOnTop() })); } catch {}
  }, 300);
}

let win;
const winState = () => ({ maximized: win.isMaximized(), pinned: win.isAlwaysOnTop(), focused: win.isFocused() });
const sendState = () => { if (win && !win.isDestroyed()) win.webContents.send('win:state', winState()); };

async function createWindow() {
  const port = await startServer(47170);
  const saved = loadWinState();
  win = new BrowserWindow({
    width: saved.width || 1320, height: saved.height || 840,
    x: saved.x, y: saved.y,
    minWidth: 380, minHeight: 250, // room for the 200x200 minimum player
    frame: false,
    resizable: true,
    backgroundColor: '#100e1a',
    title: 'Loudbox',
    icon: path.join(__dirname, 'app', 'icon-512.png'),
    webPreferences: {
      contextIsolation: true, sandbox: true, backgroundThrottling: false,
      preload: path.join(__dirname, 'electron-preload.js'),
    },
  });
  Menu.setApplicationMenu(null);
  if (saved.maximized) win.maximize();
  if (saved.pinned) win.setAlwaysOnTop(true, 'floating');

  // "Open on YouTube" and search links go to the default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(`http://localhost:${port}`)) { e.preventDefault(); shell.openExternal(url); }
  });

  ['maximize', 'unmaximize', 'focus', 'blur', 'always-on-top-changed', 'enter-full-screen', 'leave-full-screen'].forEach((ev) => win.on(ev, sendState));
  ['resize', 'move', 'maximize', 'unmaximize', 'always-on-top-changed'].forEach((ev) => win.on(ev, saveWinState));

  win.loadURL(`http://localhost:${port}/`);
}

ipcMain.on('win:minimize', () => win?.minimize());
ipcMain.on('win:toggle-maximize', () => { if (!win) return; win.isMaximized() ? win.unmaximize() : win.maximize(); });
ipcMain.on('win:close', () => win?.close());
ipcMain.handle('win:toggle-pin', () => {
  const on = !win.isAlwaysOnTop();
  win.setAlwaysOnTop(on, 'floating');
  sendState();
  return winState();
});
ipcMain.handle('win:state', () => winState());

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
