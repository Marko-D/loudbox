// Loudbox desktop app (Electron). Serves the app folder on 127.0.0.1 because
// YouTube's embedded player refuses to play from file:// pages.
const { app, BrowserWindow, shell, Menu, ipcMain, screen, dialog } = require('electron');
const { Downloader, safeName } = require('./downloader');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { handleApi } = require('./search');

const ROOT = path.join(__dirname, 'app');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json',
};

// Keep one running copy; a second launch focuses the first window.
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
    minWidth: 340, minHeight: 200,
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

/* ---- downloads ---- */
const SETTINGS_FILE = () => path.join(app.getPath('userData'), 'settings.json');
function readSettings() { try { return JSON.parse(fs.readFileSync(SETTINGS_FILE(), 'utf8')); } catch { return {}; } }
function writeSettings(s) { try { fs.writeFileSync(SETTINGS_FILE(), JSON.stringify(s, null, 2)); } catch {} }
const downloadFolder = () => readSettings().downloadFolder || path.join(app.getPath('music'), 'Loudbox');

let downloader;
app.whenReady().then(() => {
  downloader = new Downloader({
    dataDir: app.getPath('userData'),
    getFolder: downloadFolder,
    emit: (jobs) => { if (win && !win.isDestroyed()) win.webContents.send('dl:jobs', jobs); },
  });
});
const cleanSongs = (songs) => (Array.isArray(songs) ? songs : [])
  .filter((s) => s && /^[\w-]{11}$/.test(s.id))
  .map((s) => ({ id: s.id, title: String(s.title || '').slice(0, 300), author: String(s.author || '').slice(0, 200) }));

ipcMain.handle('dl:add', (_e, songs, playlistName) => downloader.add(cleanSongs(songs), playlistName ? String(playlistName) : ''));
ipcMain.handle('dl:list', () => downloader.list());
ipcMain.handle('dl:cancel', (_e, key) => downloader.cancel(String(key)));
ipcMain.handle('dl:retry', (_e, key) => downloader.retry(String(key)));
ipcMain.handle('dl:clear', () => downloader.clearFinished());
ipcMain.handle('dl:update-tool', () => downloader.update());
ipcMain.handle('dl:folder', () => downloadFolder());
ipcMain.handle('dl:choose-folder', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Choose where Loudbox saves downloads', defaultPath: downloadFolder(), properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return downloadFolder();
  writeSettings({ ...readSettings(), downloadFolder: r.filePaths[0] });
  return r.filePaths[0];
});
ipcMain.handle('dl:open-folder', async (_e, sub) => {
  const base = downloadFolder();
  const target = sub ? path.join(base, safeName(String(sub), 'Playlist')) : base;
  fs.mkdirSync(fs.existsSync(target) ? target : base, { recursive: true });
  return shell.openPath(fs.existsSync(target) ? target : base);
});
ipcMain.handle('dl:show-file', (_e, file) => {
  // only reveal files inside the download folder
  const f = path.normalize(String(file));
  if (f.startsWith(path.normalize(downloadFolder())) && fs.existsSync(f)) shell.showItemInFolder(f);
});

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
