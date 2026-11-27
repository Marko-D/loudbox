// Download manager for the desktop app. Saves YouTube audio as .m4a files using yt-dlp,
// which is fetched once from its official GitHub release into the app's data folder.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const YTDLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
const MAX_PARALLEL = 2;

function safeName(s, fallback = 'Untitled') {
  const clean = String(s || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 120);
  return /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(clean) || !clean ? fallback : clean;
}

class Downloader {
  constructor({ dataDir, getFolder, emit }) {
    this.bin = path.join(dataDir, 'bin', 'yt-dlp.exe');
    this.getFolder = getFolder; // () => base download folder
    this.emit = emit;           // (jobs) => send to the page
    this.jobs = [];             // { key, id, title, author, folder, status, percent, file, error }
    this.running = 0;
    this.binReady = null;
  }

  list() { return this.jobs.map(({ proc, ...j }) => j); }
  notify() { this.emit(this.list()); }

  ensureBinary() {
    if (fs.existsSync(this.bin)) return Promise.resolve();
    if (this.binReady) return this.binReady;
    this.binReady = (async () => {
      fs.mkdirSync(path.dirname(this.bin), { recursive: true });
      const res = await fetch(YTDLP_URL, { redirect: 'follow' });
      if (!res.ok) throw new Error('Could not download yt-dlp (' + res.status + ')');
      const tmp = this.bin + '.part';
      fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
      fs.renameSync(tmp, this.bin);
    })().finally(() => { this.binReady = null; });
    return this.binReady;
  }

  // songs: [{ id, title, author }], subfolder: playlist name or ''
  add(songs, subfolder = '') {
    const base = this.getFolder();
    const folder = subfolder ? path.join(base, safeName(subfolder, 'Playlist')) : base;
    let added = 0;
    for (const s of songs) {
      const key = folder + '|' + s.id;
      const existing = this.jobs.find((j) => j.key === key && j.status !== 'failed');
      if (existing) continue;
      this.jobs = this.jobs.filter((j) => j.key !== key); // drop an old failed attempt
      this.jobs.push({ key, id: s.id, title: s.title || s.id, author: s.author || '', folder, status: 'queued', percent: 0, file: '', error: '' });
      added++;
    }
    this.notify();
    this.pump();
    return added;
  }

  pump() {
    while (this.running < MAX_PARALLEL) {
      const job = this.jobs.find((j) => j.status === 'queued');
      if (!job) break;
      this.run(job);
    }
  }

  async run(job) {
    this.running++;
    job.status = 'starting';
    this.notify();
    try {
      if (!fs.existsSync(this.bin)) {
        job.status = 'getting-tool';
        this.notify();
      }
      await this.ensureBinary();
      fs.mkdirSync(job.folder, { recursive: true });
      const base = safeName(job.author && !job.title.toLowerCase().includes(job.author.toLowerCase()) ? `${job.author} - ${job.title}` : job.title);
      // skip if this song is already in the folder
      const already = fs.readdirSync(job.folder).find((f) => f.startsWith(base + '.') && !f.endsWith('.part'));
      if (already) {
        Object.assign(job, { status: 'done', percent: 100, file: path.join(job.folder, already) });
        return;
      }
      job.status = 'downloading';
      this.notify();
      const file = await this.exec(job, [
        '-f', 'bestaudio[ext=m4a]/bestaudio',
        // --print implies --quiet, so --progress keeps the progress lines coming
        '--no-playlist', '--no-mtime', '--newline', '--no-colors', '--progress',
        '--progress-template', 'download:LBX %(progress._percent_str)s',
        '--print', 'after_move:filepath',
        '-o', path.join(job.folder, base + '.%(ext)s'),
        'https://www.youtube.com/watch?v=' + job.id,
      ]);
      Object.assign(job, { status: 'done', percent: 100, file });
    } catch (e) {
      Object.assign(job, { status: 'failed', error: e.message || 'Download failed' });
    } finally {
      delete job.proc;
      this.running--;
      this.notify();
      this.pump();
    }
  }

  exec(job, args) {
    return new Promise((resolve, reject) => {
      const p = spawn(this.bin, args, { windowsHide: true });
      job.proc = p;
      let out = '', err = '', lastSent = 0;
      const onLine = (line) => {
        const m = line.match(/LBX\s+([\d.]+)%/);
        if (m) {
          job.percent = Math.min(99, parseFloat(m[1]));
          if (Date.now() - lastSent > 300) { lastSent = Date.now(); this.notify(); }
        } else if (line.trim() && !line.startsWith('[')) out = line.trim();
      };
      let buf = '';
      p.stdout.on('data', (d) => { buf += d; const lines = buf.split(/\r?\n/); buf = lines.pop(); lines.forEach(onLine); });
      p.stderr.on('data', (d) => { err += d; });
      p.on('error', reject);
      p.on('close', (code) => {
        if (buf) onLine(buf);
        if (job.status === 'cancelled') return reject(new Error('Cancelled'));
        if (code === 0) return resolve(out);
        const msg = (err.match(/ERROR: (.*)/) || [])[1] || 'yt-dlp exited with code ' + code;
        reject(new Error(msg.replace(/^\[youtube\] [\w-]+: /, '')));
      });
    });
  }

  cancel(key) {
    const job = this.jobs.find((j) => j.key === key);
    if (!job) return;
    if (job.proc) { job.status = 'cancelled'; job.proc.kill(); }
    this.jobs = this.jobs.filter((j) => j !== job);
    this.notify();
  }

  clearFinished() {
    this.jobs = this.jobs.filter((j) => !['done', 'failed'].includes(j.status));
    this.notify();
  }

  retry(key) {
    const job = this.jobs.find((j) => j.key === key && j.status === 'failed');
    if (job) { Object.assign(job, { status: 'queued', percent: 0, error: '' }); this.notify(); this.pump(); }
  }

  // update yt-dlp itself (YouTube changes often break old versions)
  update() {
    return new Promise((resolve) => {
      if (!fs.existsSync(this.bin)) return resolve('not installed');
      const p = spawn(this.bin, ['-U'], { windowsHide: true });
      let out = '';
      p.stdout.on('data', (d) => (out += d));
      p.on('close', () => resolve(out.trim().split(/\r?\n/).pop() || 'done'));
      p.on('error', () => resolve('failed'));
    });
  }
}

module.exports = { Downloader, safeName };
