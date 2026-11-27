/* Loudbox: a music player that plays YouTube videos as songs. */
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const thumb = (id, q = 'mqdefault') => `https://i.ytimg.com/vi/${id}/${q}.jpg`;
const uid = () => Math.random().toString(36).slice(2, 10);
const fmt = (s) => {
  if (!isFinite(s) || s <= 0) return '0:00';
  s = Math.floor(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};
const ago = (t) => {
  const d = (Date.now() - t) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} h ago`;
  if (d < 86400 * 30) return `${Math.floor(d / 86400)} days ago`;
  return new Date(t).toLocaleDateString();
};
const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15L20 12z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zm8 0h4v16h-4z"/></svg>',
  more: '<svg viewBox="0 0 24 24"><path d="M5 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm7 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm7 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/></svg>',
  radio: '<svg viewBox="0 0 24 24"><path d="M12 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM7.8 7.8l1.4 1.4a4 4 0 0 0 0 5.6l-1.4 1.4a6 6 0 0 1 0-8.4zm8.4 0a6 6 0 0 1 0 8.4l-1.4-1.4a4 4 0 0 0 0-5.6zM5 5l1.4 1.4a8 8 0 0 0 0 11.2L5 19A10 10 0 0 1 5 5zm14 0a10 10 0 0 1 0 14l-1.4-1.4a8 8 0 0 0 0-11.2z"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path d="M11 3h2v10.2l3.6-3.6 1.4 1.4-6 6-6-6 1.4-1.4 3.6 3.6zM4 19h16v2H4z"/></svg>',
  done: '<svg viewBox="0 0 24 24"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>',
  note: '<svg viewBox="0 0 24 24"><path d="M9 3h12v13.5a3.5 3.5 0 1 1-2-3.2V7h-8v11.5A3.5 3.5 0 1 1 9 15.3z"/></svg>',
  mute: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4zm12.3.3 1.4-1.4 2.3 2.3 2.3-2.3 1.4 1.4-2.3 2.3 2.3 2.3-1.4 1.4-2.3-2.3-2.3 2.3-1.4-1.4 2.3-2.3z"/></svg>',
  vol: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>',
};

/* ---------------- state ---------------- */
const KEY = 'loudbox.v1';
const STARTER = [
  ['dQw4w9WgXcQ', 'Never Gonna Give You Up', 'Rick Astley'],
  ['fJ9rUzIMcZQ', 'Bohemian Rhapsody', 'Queen Official'],
  ['4NRXx6U8ABQ', 'Blinding Lights', 'The Weeknd'],
  ['kJQP7kiw5Fk', 'Despacito ft. Daddy Yankee', 'Luis Fonsi'],
  ['JGwWNGJdvx8', 'Shape of You', 'Ed Sheeran'],
];
function defaultState() {
  const now = Date.now();
  const songs = {};
  STARTER.forEach(([id, title, author], i) => (songs[id] = { id, title, author, addedAt: now - i * 60000 }));
  return {
    songs,
    playlists: [{ id: uid(), name: 'Starter mix', songIds: STARTER.map((s) => s[0]), createdAt: now }],
    queue: [], qi: -1, shuffle: false, repeat: 'off', volume: 80, muted: false,
    showVideo: true, apiKey: '', recent: [], history: [], downloaded: {}, radio: null,
  };
}
let state;
try { state = JSON.parse(localStorage.getItem(KEY)) || defaultState(); } catch { state = defaultState(); }
state = Object.assign(defaultState(), state);
// older versions kept only song ids; turn them into history entries
if (!state.history.length && state.recent.length) {
  state.history = state.recent.map((id, i) => ({ id, title: state.songs[id]?.title || id, author: state.songs[id]?.author || '', playedAt: Date.now() - i * 60000, plays: 1 }));
}
let saveTimer;
const save = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    // remember titles of queued songs that aren't in the library, so the queue survives a restart
    const qm = {};
    for (const id of state.queue) {
      if (state.songs[id] || qm[id]) continue;
      const m = meta(id);
      if (m.title && m.title !== id) qm[id] = { id, title: m.title, author: m.author || '', duration: m.duration || '' };
    }
    state.queueMeta = qm;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  }, 150);
};

let view = { name: 'home' };
let player = null, playerReady = false, isPlaying = false, seeking = false;

/* ---------------- YouTube link parsing ---------------- */
function parseYouTube(text) {
  const out = { videos: [], lists: [] };
  const tokens = String(text).split(/[\s,]+/).filter(Boolean);
  for (const t of tokens) {
    if (/^[\w-]{11}$/.test(t)) { out.videos.push(t); continue; }
    let u;
    try { u = new URL(t.startsWith('http') ? t : 'https://' + t); } catch { continue; }
    const host = u.hostname.replace(/^www\.|^m\.|^music\./, '');
    if (!/youtube\.com$|youtu\.be$|youtube-nocookie\.com$/.test(host)) continue;
    const list = u.searchParams.get('list');
    let v = u.searchParams.get('v');
    if (!v && host === 'youtu.be') v = u.pathname.slice(1, 12);
    const m = u.pathname.match(/\/(?:shorts|embed|live|v)\/([\w-]{11})/);
    if (!v && m) v = m[1];
    if (list && (!v || u.pathname === '/playlist')) out.lists.push(list);
    else if (v && /^[\w-]{11}$/.test(v)) out.videos.push(v);
  }
  out.videos = [...new Set(out.videos)];
  out.lists = [...new Set(out.lists)];
  return out;
}

/* Title + channel without an API key: noembed (CORS-friendly oEmbed proxy). */
async function fetchMeta(id) {
  try {
    const r = await fetch(`https://noembed.com/embed?url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}`);
    const j = await r.json();
    if (j && j.title) return { title: j.title, author: j.author_name || '' };
  } catch {}
  return null;
}

async function addSongs(ids, { toPlaylist } = {}) {
  const fresh = [];
  for (const id of ids) {
    if (!state.songs[id]) {
      state.songs[id] = { id, title: 'Loading title…', author: 'YouTube', addedAt: Date.now() };
      fresh.push(id);
    }
  }
  if (toPlaylist) {
    const pl = state.playlists.find((p) => p.id === toPlaylist);
    if (pl) ids.forEach((id) => { if (!pl.songIds.includes(id)) pl.songIds.push(id); });
  }
  save(); render();
  // fill in titles a few at a time
  for (let i = 0; i < fresh.length; i += 6) {
    await Promise.all(fresh.slice(i, i + 6).map(async (id) => {
      const meta = await fetchMeta(id);
      const s = state.songs[id];
      if (!s) return;
      if (meta) Object.assign(s, meta);
      else if (s.title === 'Loading title…') s.title = `YouTube video ${id}`;
    }));
    save(); render(); updateNowPlaying();
  }
  return fresh.length;
}

/* Expand a playlist ID into video IDs. Uses the Data API when a key is set,
   otherwise a hidden helper player reads the list (up to ~200 videos). */
async function expandPlaylist(listId) {
  if (state.apiKey) {
    const ids = [];
    let page = '';
    do {
      const r = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=50&playlistId=${encodeURIComponent(listId)}&key=${encodeURIComponent(state.apiKey)}${page ? '&pageToken=' + page : ''}`);
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      j.items.forEach((it) => ids.push(it.contentDetails.videoId));
      page = j.nextPageToken || '';
    } while (page && ids.length < 1000);
    return ids;
  }
  return new Promise((resolve, reject) => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-9999px;top:0;width:200px;height:200px';
    const inner = document.createElement('div');
    host.appendChild(inner);
    document.body.appendChild(host);
    let done = false;
    const finish = (fn, v) => { if (done) return; done = true; try { helper.destroy(); } catch {} host.remove(); fn(v); };
    const helper = new YT.Player(inner, {
      width: 200, height: 200,
      playerVars: { listType: 'playlist', list: listId, autoplay: 0, origin: location.origin },
      events: {
        onReady: () => {
          let tries = 0;
          const poll = setInterval(() => {
            const list = helper.getPlaylist && helper.getPlaylist();
            if (list && list.length) { clearInterval(poll); finish(resolve, list); }
            else if (++tries > 40) { clearInterval(poll); finish(reject, new Error('Could not read that playlist. It may be private.')); }
          }, 250);
        },
        onError: () => finish(reject, new Error('Could not read that playlist. It may be private.')),
      },
    });
  });
}

async function playlistTitle(listId) {
  if (!state.apiKey) return null;
  try {
    const r = await fetch(`https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${encodeURIComponent(listId)}&key=${encodeURIComponent(state.apiKey)}`);
    const j = await r.json();
    return j.items?.[0]?.snippet?.title || null;
  } catch { return null; }
}

async function handleAdd(text, opts = {}) {
  const { videos, lists } = parseYouTube(text);
  if (!videos.length && !lists.length) { toast('That doesn’t look like a YouTube link'); return false; }
  let added = 0;
  if (videos.length) added += await addSongs(videos, opts);
  for (const list of lists) {
    toast('Importing playlist…');
    try {
      const ids = await expandPlaylist(list);
      const name = (await playlistTitle(list)) || `Imported playlist ${state.playlists.length + 1}`;
      const pl = { id: uid(), name, songIds: [], createdAt: Date.now() };
      state.playlists.push(pl);
      added += await addSongs(ids, { toPlaylist: pl.id });
      toast(`Imported “${name}” with ${ids.length} songs`);
      go({ name: 'playlist', id: pl.id });
    } catch (e) { toast(e.message || 'Could not import that playlist'); }
  }
  if (videos.length) toast(videos.length === 1 ? (added ? 'Added to your library' : 'Already in your library') : `Added ${added} of ${videos.length} songs`);
  return true;
}

/* ---------------- search by song or artist ---------------- */
// The app's own server (desktop app or server.js) searches YouTube without a key.
// An optional Data API key is only a fallback.
let searchResults = [];
let searchQuery = '';
let searchError = '';
let searchSeq = 0;
async function ytSearch(q) {
  q = q.trim();
  if (!q) return;
  searchQuery = q; searchError = '';
  const seq = ++searchSeq;
  if (view.name !== 'search') view = { name: 'search' };
  view.loading = true; render();
  let results = null;
  try {
    const r = await fetch('/api/search?q=' + encodeURIComponent(q));
    const j = await r.json();
    if (!r.ok || j.error) throw new Error(j.error || 'Search failed');
    results = j;
  } catch (e) {
    if (state.apiKey) {
      try {
        const r = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=25&q=${encodeURIComponent(q)}&key=${encodeURIComponent(state.apiKey)}`);
        const j = await r.json();
        if (j.error) throw new Error(j.error.message);
        const tmp = document.createElement('textarea');
        const decode = (s) => { tmp.innerHTML = s; return tmp.value; };
        results = j.items.map((it) => ({ id: it.id.videoId, title: decode(it.snippet.title), author: decode(it.snippet.channelTitle) }));
      } catch (e2) { searchError = e2.message; }
    } else {
      searchError = location.protocol === 'file:' ? 'Search needs Loudbox to be started with Start Loudbox.cmd or the desktop app.' : 'Couldn’t reach YouTube. Check your internet connection and try again.';
    }
  }
  if (seq !== searchSeq) return; // a newer search started
  searchResults = results || [];
  searchResults.forEach((r) => { if (!state.songs[r.id]) cache[r.id] = r; });
  view.loading = false;
  if (view.name === 'search') render();
}

/* ---------------- radio: endless queue of songs like one song ---------------- */
let radioLoading = false;
async function fetchRadio(id) {
  const r = await fetch('/api/radio?q=' + encodeURIComponent(id));
  const j = await r.json();
  if (!r.ok || j.error || !Array.isArray(j)) throw new Error(j.error || 'Radio unavailable');
  j.forEach((x) => { if (!state.songs[x.id]) cache[x.id] = x; });
  return j;
}
async function startRadio(id) {
  const known = state.songs[id] || cache[id];
  toast(known ? `Starting radio from “${known.title}”…` : 'Starting radio…');
  try {
    const list = await fetchRadio(id);
    const seed = meta(id); // the radio list includes the seed song, so its title is known now
    const ids = [id, ...list.map((x) => x.id).filter((x) => x !== id)];
    playQueue(ids, 0);             // also clears state.radio
    if (state.shuffle) { state.queue = ids; state.qi = 0; }
    state.radio = { seed: id, title: seed.title };
    save(); updateNowPlaying(); render();
    toast(`${seed.title} Radio`);
  } catch (e) {
    toast(location.protocol === 'file:' ? 'Radio needs the Loudbox app or Start Loudbox.cmd' : 'Couldn’t start radio. Check your internet connection.');
  }
}
// when radio is on and fewer than 4 songs remain, add more based on the current song
async function extendRadio() {
  if (!state.radio || radioLoading || state.queue.length - state.qi > 4) return;
  radioLoading = true;
  try {
    const recentSet = new Set([...state.queue.slice(-150), ...state.recent]);
    const fresh = (await fetchRadio(currentId())).map((x) => x.id).filter((x) => !recentSet.has(x));
    if (fresh.length && state.radio) { state.queue.push(...fresh.slice(0, 20)); save(); updateNowPlaying(); if (view.name === 'queue') render(); }
  } catch {}
  radioLoading = false;
}
function stopRadio() { state.radio = null; save(); updateNowPlaying(); render(); toast('Radio off'); }

const cache = {}; // songs seen in search results but not saved to the library
function meta(id) { return state.songs[id] || cache[id] || state.queueMeta?.[id] || state.history.find((h) => h.id === id) || { id, title: id, author: '' }; }
function saveSong(r) {
  if (state.songs[r.id]) return false;
  state.songs[r.id] = { id: r.id, title: r.title, author: r.author, addedAt: Date.now() };
  save(); return true;
}

/* suggestions dropdown under the top search box */
let suggestTimer, suggestSeq = 0, suggestIdx = -1;
function updateSuggest(q) {
  clearTimeout(suggestTimer);
  const box = $('#suggest');
  if (!q.trim() || parseYouTube(q).videos.length) { box.hidden = true; return; }
  suggestTimer = setTimeout(async () => {
    const seq = ++suggestSeq;
    let list = [];
    try { list = await (await fetch('/api/suggest?q=' + encodeURIComponent(q))).json(); } catch {}
    if (seq !== suggestSeq || !Array.isArray(list) || !list.length || document.activeElement !== $('#tb-search-input')) { box.hidden = true; return; }
    suggestIdx = -1;
    box.innerHTML = list.map((s, i) => `<button type="button" data-suggest="${esc(s)}" data-si="${i}"><svg viewBox="0 0 24 24"><path d="M10.5 3a7.5 7.5 0 0 1 5.9 12.1l4.8 4.8-1.4 1.4-4.8-4.8A7.5 7.5 0 1 1 10.5 3zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z"/></svg>${esc(s)}</button>`).join('');
    box.hidden = false;
  }, 160);
}
function runTopSearch(q) {
  clearTimeout(suggestTimer); suggestSeq++;
  $('#suggest').hidden = true;
  q = q.trim();
  if (!q) return;
  const parsed = parseYouTube(q);
  if (parsed.videos.length || parsed.lists.length) { handleAdd(q); $('#tb-search-input').value = ''; return; }
  $('#tb-search-input').value = q;
  ytSearch(q);
}

/* ---------------- player ---------------- */
window.onYouTubeIframeAPIReady = () => {
  player = new YT.Player('yt', {
    width: '100%', height: '100%',
    playerVars: { autoplay: 0, controls: 0, disablekb: 1, modestbranding: 1, rel: 0, playsinline: 1, origin: location.origin },
    events: {
      onReady: () => {
        playerReady = true;
        player.setVolume(state.volume);
        state.muted ? player.mute() : player.unMute();
        const cur = currentId();
        if (cur) player.cueVideoById(cur);
        updateNowPlaying();
      },
      onStateChange: (e) => {
        isPlaying = e.data === YT.PlayerState.PLAYING || e.data === YT.PlayerState.BUFFERING;
        if (e.data === YT.PlayerState.PLAYING) {
          const d = player.getVideoData && player.getVideoData();
          const s = state.songs[currentId()];
          if (d && s && (s.title === 'Loading title…' || s.title.startsWith('YouTube video ')) && d.title) {
            s.title = d.title; s.author = d.author || s.author; save(); render();
          }
          const h = state.history.find((x) => x.id === currentId());
          if (h && d && d.title && (h.title === h.id || h.title === 'Loading title…' || h.title.startsWith('YouTube video '))) {
            h.title = d.title; h.author = d.author || h.author; save();
            if (view.name === 'home' || view.name === 'history') render();
          }
        }
        if (e.data === YT.PlayerState.ENDED) onEnded();
        updatePlayState();
      },
      onError: (e) => {
        const why = e.data === 101 || e.data === 150 ? 'The owner doesn’t allow this video outside YouTube' : e.data === 100 ? 'This video was removed or is private' : 'This video can’t be played';
        toast(`${why}. Skipping.`);
        setTimeout(() => next(true), 1200);
      },
    },
  });
};
(function loadYT() {
  const s = document.createElement('script');
  s.src = 'https://www.youtube.com/iframe_api';
  s.onerror = () => toast('Can’t reach YouTube. Check your internet connection.');
  document.head.appendChild(s);
})();

const currentId = () => state.queue[state.qi];

function playQueue(ids, start = 0) {
  if (!ids.length) return;
  let q = ids.slice();
  let i = start;
  if (state.shuffle) {
    const first = q.splice(start, 1)[0];
    q = [first, ...shuffled(q)];
    i = 0;
  }
  state.queue = q; state.qi = i;
  state.radio = null;
  loadCurrent(true);
}
function shuffled(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function loadCurrent(autoplay) {
  const id = currentId();
  if (!id) return;
  const m = meta(id), prev = state.history.find((h) => h.id === id);
  state.history = [{ id, title: m.title, author: m.author, playedAt: Date.now(), plays: (prev?.plays || 0) + 1 },
    ...state.history.filter((h) => h.id !== id)].slice(0, 200);
  state.recent = state.history.slice(0, 20).map((h) => h.id);
  save();
  if (playerReady) autoplay ? player.loadVideoById(id) : player.cueVideoById(id);
  updateNowPlaying(); render();
  extendRadio();
}

function togglePlay() {
  if (!playerReady) return;
  if (state.qi < 0 || !currentId()) {
    const pool = state.playlists[0]?.songIds.length ? state.playlists[0].songIds : Object.keys(state.songs);
    return playQueue(pool, 0);
  }
  isPlaying ? player.pauseVideo() : player.playVideo();
}
function next(auto = false) {
  if (!state.queue.length) return;
  if (state.qi < state.queue.length - 1) state.qi++;
  else if (state.repeat === 'all' || !auto) state.qi = 0;
  else { isPlaying = false; updatePlayState(); return; }
  loadCurrent(true);
}
function prev() {
  if (!state.queue.length) return;
  if (playerReady && player.getCurrentTime() > 3) { player.seekTo(0, true); return; }
  state.qi = state.qi > 0 ? state.qi - 1 : state.repeat === 'all' ? state.queue.length - 1 : 0;
  loadCurrent(true);
}
function onEnded() {
  if (state.repeat === 'one') { player.seekTo(0, true); player.playVideo(); return; }
  next(true);
}
function toggleShuffle() {
  state.shuffle = !state.shuffle;
  if (state.shuffle && state.queue.length > 1) {
    const head = state.queue.slice(0, state.qi + 1);
    state.queue = head.concat(shuffled(state.queue.slice(state.qi + 1)));
  }
  save(); updateControls(); render();
  toast(state.shuffle ? 'Shuffle on' : 'Shuffle off');
}
function cycleRepeat() {
  state.repeat = { off: 'all', all: 'one', one: 'off' }[state.repeat];
  save(); updateControls();
  toast({ off: 'Repeat off', all: 'Repeat all', one: 'Repeat this song' }[state.repeat]);
}
function playNext(id) {
  if (state.qi < 0) { playQueue([id]); return; }
  state.queue.splice(state.qi + 1, 0, id); save(); render(); updateNowPlaying(); toast('Plays next');
}
function addToQueue(id) {
  if (state.qi < 0) { playQueue([id]); return; }
  state.queue.push(id); save(); render(); updateNowPlaying(); toast('Added to queue');
}
function setVolume(v) {
  state.volume = Math.max(0, Math.min(100, Math.round(v)));
  if (state.volume > 0 && state.muted) state.muted = false;
  if (playerReady) { player.setVolume(state.volume); state.muted ? player.mute() : player.unMute(); }
  save(); updateControls();
}
function toggleMute() {
  state.muted = !state.muted;
  if (playerReady) state.muted ? player.mute() : player.unMute();
  save(); updateControls();
}
function toggleVideo() { state.showVideo = !state.showVideo; save(); updateControls(); }

/* ---------------- progress loop ---------------- */
setInterval(() => {
  if (!playerReady || seeking) return;
  const cur = player.getCurrentTime?.() || 0, dur = player.getDuration?.() || 0;
  syncLyrics(cur);
  const seek = $('#seek');
  seek.value = dur ? Math.round((cur / dur) * 1000) : 0;
  seek.style.setProperty('--p', (seek.value / 10) + '%');
  $('#t-cur').textContent = fmt(cur);
  $('#t-dur').textContent = dur ? fmt(dur) : (currentId() ? 'LIVE' : '0:00');
  if ('mediaSession' in navigator && dur && isPlaying) {
    try { navigator.mediaSession.setPositionState({ duration: dur, position: Math.min(cur, dur), playbackRate: 1 }); } catch {}
  }
}, 250);

/* ---------------- now playing UI ---------------- */
function updatePlayState() {
  $('#btn-play').innerHTML = isPlaying ? ICON.pause : ICON.play;
  $('#btn-play').setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
  document.body.classList.toggle('paused', !isPlaying);
  document.querySelectorAll('.big-play[data-current]').forEach((b) => (b.innerHTML = isPlaying ? ICON.pause : ICON.play));
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  const s = state.songs[currentId()];
  document.title = s && isPlaying ? `${s.title} · Loudbox` : 'Loudbox';
}
function updateControls() {
  $('#btn-shuffle').classList.toggle('on', state.shuffle);
  $('#btn-repeat').classList.toggle('on', state.repeat !== 'off');
  $('#repeat-one').hidden = state.repeat !== 'one';
  $('#btn-video').classList.toggle('on', state.showVideo);
  document.querySelector('.app').classList.toggle('no-video', !state.showVideo);
  const vol = $('#volume');
  vol.value = state.muted ? 0 : state.volume;
  vol.style.setProperty('--p', vol.value + '%');
  $('#btn-mute').innerHTML = state.muted || state.volume === 0 ? ICON.mute : ICON.vol;
}
function updateNowPlaying() {
  const id = currentId();
  const s = id && (meta(id));
  $('#video-empty').hidden = !!id;
  $('#np-label').innerHTML = state.radio ? `${ICON.radio}<span>${esc(state.radio.title)} Radio</span><button class="np-stop" data-stop-radio title="Stop radio">Stop</button>` : 'Now playing';
  $('#np-label').classList.toggle('on-radio', !!state.radio);
  $('#bar-radio').classList.toggle('on', !!state.radio);
  $('#bar-lyrics').classList.toggle('on', view.name === 'lyrics');
  $('#np-title').textContent = s ? s.title : 'Nothing playing';
  $('#np-artist').textContent = s ? s.author : 'Add a YouTube link to get going';
  $('#bar-title').textContent = s ? s.title : 'Nothing playing';
  $('#bar-artist').textContent = s ? s.author : '';
  const bt = $('#bar-thumb');
  if (s) { bt.src = thumb(s.id, 'default'); bt.hidden = false; } else bt.hidden = true;
  const upcoming = state.queue.slice(state.qi + 1, state.qi + 6);
  $('#np-next').innerHTML = upcoming.length
    ? upcoming.map((u, k) => miniRow(u, state.qi + 1 + k)).join('')
    : `<div class="hint">${state.repeat === 'all' && state.queue.length ? 'Queue repeats from the start' : 'Nothing queued after this one'}</div>`;
  if ('mediaSession' in navigator && s) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: s.title, artist: s.author, album: 'Loudbox',
      artwork: [{ src: thumb(s.id, 'hqdefault'), sizes: '480x360', type: 'image/jpeg' }],
    });
  }
  updatePlayState();
}
function miniRow(id, qIndex) {
  const s = meta(id);
  return `<button class="mini" data-jump="${qIndex}"><img src="${thumb(id, 'default')}" alt="" loading="lazy"><div><div class="t">${esc(s.title)}</div><div class="a">${esc(s.author)}</div></div></button>`;
}

if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession;
  ms.setActionHandler('play', () => player?.playVideo());
  ms.setActionHandler('pause', () => player?.pauseVideo());
  ms.setActionHandler('nexttrack', () => next());
  ms.setActionHandler('previoustrack', () => prev());
  try { ms.setActionHandler('seekto', (d) => player?.seekTo(d.seekTime, true)); } catch {}
}

/* ---------------- lyrics (from LRCLIB, synced when available) ---------------- */
const lyricsCache = {};   // song id -> { status: 'loading'|'ok'|'none'|'error', data, lines }
let lyricsPrevView = null, lyricsActive = -1, lyricsUserScrollAt = 0;

function guessArtistTrack(s) {
  let title = String(s.title || '');
  let artist = String(s.author || '').replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').replace(/\s+Official$/i, '').trim();
  title = title
    .replace(/[([][^)\]]*(official|video|audio|lyric|visuali[sz]er|\bhd\b|\b4k\b|\bmv\b|m\/v|remaster|explicit|clean|color coded)[^)\]]*[)\]]/gi, '')
    .replace(/\s*[([]\s*(ft\.?|feat\.?|featuring|with)\s[^)\]]*[)\]]/gi, '')
    .replace(/\s+(ft\.?|feat\.?|featuring)\s.*$/i, '')
    .replace(/\s+[|/]{1,2}\s.*$/, '')
    .trim();
  let track = title;
  const m = title.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (m) { artist = m[1].trim(); track = m[2].trim(); }
  track = track.replace(/^["“'‘]+|["”'’]+$/g, '').trim();
  artist = artist.replace(/\s*(,|&|\s(ft\.?|feat\.?|x)\s).*$/i, '').trim();
  return { artist, track };
}
function parseLRC(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!stamps.length) continue;
    const words = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const st of stamps) out.push({ t: Number(st[1]) * 60 + Number(st[2]), text: words });
  }
  return out.sort((a, b) => a.t - b.t);
}
const durSeconds = (d) => String(d || '').split(':').reduce((a, n) => a * 60 + Number(n), 0) || 0;

async function loadLyrics(id, query) {
  const s = meta(id);
  const { artist, track } = guessArtistTrack(s);
  const dur = (id === currentId() && playerReady && player.getDuration()) || durSeconds(s.duration);
  lyricsCache[id] = { status: 'loading', artist, track };
  if (view.name === 'lyrics') render();
  const params = new URLSearchParams(query ? { q: query } : { artist, track, q: `${artist} ${track}`.trim(), dur: Math.round(dur) || '' });
  try {
    const r = await fetch('/api/lyrics?' + params);
    const data = await r.json();
    if (!r.ok || data?.error) throw new Error(data?.error || 'failed');
    lyricsCache[id] = data
      ? { status: 'ok', data, lines: data.synced ? parseLRC(data.synced) : [], artist, track }
      : { status: 'none', artist, track, query };
  } catch {
    lyricsCache[id] = { status: 'error', artist, track };
  }
  if (view.name === 'lyrics' && currentId() === id) render();
}

function lyricsHTML() {
  const id = currentId();
  if (!id) return `<div class="lyrics-view"><div class="lyr-empty"><strong>Nothing playing</strong>Play a song to see its lyrics here.</div></div>`;
  const s = meta(id);
  let L = lyricsCache[id];
  if (!L) { loadLyrics(id); L = lyricsCache[id]; }
  const head = `<div class="lyr-head"><img src="${thumb(id, 'mqdefault')}" alt=""><div class="lyr-head-text"><div class="eyebrow">Lyrics</div>
    <div class="lyr-title">${esc(L.data?.track || L.track || s.title)}</div><div class="lyr-artist">${esc(L.data?.artist || L.artist || s.author)}</div></div></div>`;
  const retry = (msg) => `<div class="lyr-empty"><strong>${msg}</strong>
      If the title is unusual, try the artist and song name yourself.
      <form class="field lyr-form" id="lyr-form"><input class="input" id="lyr-q" value="${esc(L.query || `${L.artist} ${L.track}`.trim())}" autocomplete="off" aria-label="Lyrics search"><button class="btn" type="submit">Find lyrics</button></form></div>`;
  let body;
  if (L.status === 'loading') body = `<div class="lyr-empty">Looking up lyrics…</div>`;
  else if (L.status === 'error') body = retry('Couldn’t reach the lyrics service');
  else if (L.status === 'none') body = retry(`No lyrics found for “${esc(L.track || s.title)}”`);
  else if (L.data.instrumental && !L.data.plain && !L.data.synced) body = `<div class="lyr-empty"><strong>Instrumental</strong>This song has no lyrics. Enjoy the music.</div>`;
  else if (L.lines.length) body = `<div class="lyr-lines synced">${L.lines.map((l, i) => `<button class="lyr-line" data-lyr-t="${l.t}" data-lyr-i="${i}">${l.text ? esc(l.text) : '♪'}</button>`).join('')}</div>`;
  else body = `<div class="lyr-lines plain">${L.data.plain.split(/\r?\n/).map((t) => t.trim() ? `<p>${esc(t)}</p>` : '<p class="gap"></p>').join('')}</div><p class="hint">These lyrics aren’t time-synced.</p>`;
  return `<div class="lyrics-view">${head}${body}<p class="lyr-credit">Lyrics from <a href="https://lrclib.net" target="_blank" rel="noopener">LRCLIB</a>. Wrong song? <button class="linkish" data-lyr-retry>Search again</button></p></div>`;
}

function syncLyrics(cur, force = false) {
  const L = lyricsCache[currentId()];
  if (view.name !== 'lyrics' || !L || L.status !== 'ok' || !L.lines.length) return;
  let i = -1;
  for (let k = 0; k < L.lines.length; k++) { if (L.lines[k].t <= cur + 0.25) i = k; else break; }
  if (i === lyricsActive && !force) return;
  lyricsActive = i;
  const els = document.querySelectorAll('.lyr-line');
  els.forEach((el, k) => { el.classList.toggle('active', k === i); el.classList.toggle('past', k < i); });
  if (i >= 0 && Date.now() - lyricsUserScrollAt > 3000) els[i]?.scrollIntoView({ block: 'center', behavior: force ? 'auto' : 'smooth' });
}
function toggleLyrics() {
  if (view.name === 'lyrics') return go(lyricsPrevView && lyricsPrevView.name !== 'lyrics' ? lyricsPrevView : { name: 'home' });
  lyricsPrevView = view;
  go({ name: 'lyrics' });
}
$('#main').addEventListener('wheel', () => { lyricsUserScrollAt = Date.now(); }, { passive: true });

/* ---------------- views ---------------- */
function go(v) { view = v; render(); $('#main').scrollTop = 0; closeMenu(); }

function cover(ids, cls = '') {
  const pics = ids.slice(0, 4);
  if (!pics.length) return `<div class="cover empty ${cls}">${ICON.note}</div>`;
  if (pics.length < 4) return `<div class="cover single ${cls}"><img src="${thumb(pics[0], 'mqdefault')}" alt="" loading="lazy"></div>`;
  return `<div class="cover ${cls}">${pics.map((p) => `<img src="${thumb(p, 'mqdefault')}" alt="" loading="lazy">`).join('')}</div>`;
}

function trackList(ids, { context, showAdded = true, when, whenHead = 'Added' } = {}) {
  if (!ids.length) return '';
  const cur = currentId();
  const rows = ids.map((id, i) => {
    const s = meta(id);
    const playingHere = id === cur;
    return `<div class="track ${playingHere ? 'playing' : ''}" data-row="${i}" data-id="${id}">
      <div class="num">${playingHere ? '<span class="eq"><i></i><i></i><i></i></span>' : `<span class="idx">${i + 1}</span>`}<button class="hover-play icon-btn small" data-play-row="${i}" aria-label="Play ${esc(s.title)}">${ICON.play}</button></div>
      <div class="main-col"><img src="${thumb(id, 'default')}" alt="" loading="lazy"><div class="tt"><div class="title">${dlMark(id)}${esc(s.title)}</div><div class="artist">${esc(s.author)}</div></div></div>
      <div class="col">${esc(context?.label || s.author)}</div>
      <div class="when">${when ? when(id) : showAdded && s.addedAt ? ago(s.addedAt) : ''}</div>
      <button class="icon-btn more" data-more="${id}" data-ctx="${context?.playlistId || ''}" data-qi="${context?.queue ? i : ''}" aria-label="More options for ${esc(s.title)}">${ICON.more}</button>
    </div>`;
  }).join('');
  return `<div class="tracks"><div class="track-head"><div class="num">#</div><div>Title</div><div class="col">${context?.colHead || 'Channel'}</div><div class="when">${whenHead}</div><div></div></div>${rows}</div>`;
}

function render() {
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === view.name));
  renderSidebar();
  const main = $('#main');
  const lib = Object.values(state.songs).sort((a, b) => b.addedAt - a.addedAt);
  main.__ids = null;

  if (view.name === 'home') {
    const hour = new Date().getHours();
    const greet = hour < 5 ? 'Late night listening' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const recent = state.history.slice(0, 8);
    const recentIds = recent.map((h) => h.id);
    main.innerHTML = `
      <div class="hero"><div class="hero-text"><div class="eyebrow">Loudbox</div><h1>${greet}</h1>
        <div class="stats">${lib.length} songs · ${state.playlists.length} playlists</div></div></div>
      <div class="section">
        <form class="field" id="quick-add"><input class="input" id="quick-input" placeholder="Paste a YouTube video or playlist link" autocomplete="off"><button class="btn" type="submit">Add</button></form>
      </div>
      ${recent.length ? `<div class="section"><div class="section-head"><h2>Recently played</h2>${state.history.length > recent.length ? `<button class="show-all" data-view="history">Show all</button>` : ''}</div>
        <div class="grid recent-grid">${recent.map((h) => songCard(h.id, recentIds, `${meta(h.id).author ? meta(h.id).author + ' · ' : ''}${ago(h.playedAt)}`)).join('')}</div></div>` : ''}
      ${state.playlists.length ? `<div class="section"><h2>Your playlists</h2><div class="grid">${state.playlists.map((p) => `
        <div class="card" role="button" tabindex="0" data-open-pl="${p.id}">${cover(p.songIds)}<div><div class="name">${esc(p.name)}</div><div class="sub">${p.songIds.length} songs</div></div>
        <button class="float-play" data-play-pl="${p.id}" aria-label="Play ${esc(p.name)}">${ICON.play}</button></div>`).join('')}</div></div>` : ''}
      <div class="section"><h2>Recently added</h2>${lib.length ? `<div class="grid">${lib.slice(0, 8).map((s) => songCard(s.id, lib.map((x) => x.id))).join('')}</div>` : '<p class="hint">Your library is empty. Paste a link above to add your first song.</p>'}</div>`;
  }

  else if (view.name === 'history') {
    const ids = state.history.map((h) => h.id);
    const when = {}; state.history.forEach((h) => (when[h.id] = h.playedAt));
    main.__ids = ids;
    main.innerHTML = `
      <div class="hero" style="--hero:#3fa77a">${cover(ids)}<div class="hero-text"><div class="eyebrow">History</div><h1>Recently played</h1><div class="stats">${ids.length} songs · kept on this computer</div></div></div>
      <div class="actions">
        <button class="big-play" data-play-view ${ids.length ? '' : 'disabled'} aria-label="Play recently played">${ICON.play}</button>
        ${ids.length ? '<button class="btn ghost" id="clear-history">Clear history</button>' : ''}
      </div>
      ${ids.length ? trackList(ids, { when: (id) => ago(when[id]), whenHead: 'Played' }) : '<div class="empty"><strong>Nothing played yet</strong>Songs you listen to will show up here.</div>'}`;
  }

  else if (view.name === 'library') {
    const f = (view.filter || '').toLowerCase();
    const ids = lib.filter((s) => !f || s.title.toLowerCase().includes(f) || s.author.toLowerCase().includes(f)).map((s) => s.id);
    main.__ids = ids;
    main.innerHTML = `
      <div class="hero" style="--hero:#6d5bd0">${cover(lib.map((s) => s.id))}<div class="hero-text"><div class="eyebrow">Collection</div><h1>Your library</h1><div class="stats">${lib.length} songs</div></div></div>
      <div class="actions">
        <button class="big-play" data-play-view ${ids.length ? '' : 'disabled'} aria-label="Play library">${ICON.play}</button>
        <input class="input" id="lib-filter" placeholder="Filter by title or channel" value="${esc(view.filter || '')}" style="max-width:320px">
      </div>
      ${ids.length ? trackList(ids) : `<div class="empty"><strong>${lib.length ? 'No matches' : 'No songs yet'}</strong>${lib.length ? 'Try a different word.' : 'Go to Add music and paste a YouTube link.'}</div>`}`;
  }

  else if (view.name === 'playlist') {
    const pl = state.playlists.find((p) => p.id === view.id);
    if (!pl) return go({ name: 'home' });
    main.__ids = pl.songIds;
    const isCurrent = pl.songIds.length && state.queue.join() === pl.songIds.join();
    main.innerHTML = `
      <div class="hero" style="--hero:#ff7a3d">${cover(pl.songIds)}<div class="hero-text"><div class="eyebrow">Playlist</div><h1>${esc(pl.name)}</h1><div class="stats">${pl.songIds.length} songs</div></div></div>
      <div class="actions">
        <button class="big-play" data-play-view ${isCurrent ? 'data-current' : ''} ${pl.songIds.length ? '' : 'disabled'} aria-label="Play ${esc(pl.name)}">${isCurrent && isPlaying ? ICON.pause : ICON.play}</button>
        ${DL && pl.songIds.length ? `<button class="btn ghost dl-btn" data-dl-playlist="${pl.id}">${ICON.download}<span>Download playlist</span></button>` : ''}
        <button class="icon-btn" data-pl-menu="${pl.id}" aria-label="Playlist options">${ICON.more}</button>
      </div>
      <div class="section"><form class="field" id="pl-add"><input class="input" id="pl-add-input" placeholder="Paste YouTube links to add them to this playlist" autocomplete="off"><button class="btn ghost" type="submit">Add</button></form></div>
      ${pl.songIds.length ? trackList(pl.songIds, { context: { playlistId: pl.id } }) : '<div class="empty"><strong>This playlist is empty</strong>Paste a link above, or use the ⋯ menu on any song.</div>'}`;
  }

  else if (view.name === 'queue') {
    main.__ids = state.queue;
    const cur = currentId();
    const upcoming = state.queue.slice(state.qi + 1);
    main.innerHTML = `
      <div class="section"><h2 style="font-size:32px;margin-top:28px">Queue</h2>
        ${state.radio ? `<div class="radio-banner">${ICON.radio}<div><b>${esc(state.radio.title)} Radio</b><span>Similar songs keep coming as you listen</span></div><button class="btn ghost" data-stop-radio>Stop radio</button></div>` : ''}</div>
      ${cur ? `<div class="section"><h2>Now playing</h2></div>${queueList([state.qi])}` : '<div class="empty"><strong>Nothing is playing</strong>Play a playlist or a song to fill the queue.</div>'}
      ${upcoming.length ? `<div class="section" style="display:flex;justify-content:space-between;align-items:center"><h2>Next up</h2><button class="btn ghost" id="clear-queue">Clear</button></div>${queueList(upcoming.map((_, k) => state.qi + 1 + k))}` : ''}`;
  }

  else if (view.name === 'lyrics') {
    main.innerHTML = lyricsHTML();
    lyricsActive = -1;
    requestAnimationFrame(() => syncLyrics(playerReady ? player.getCurrentTime() : 0, true));
  }

  else if (view.name === 'search') {
    const top = searchResults[0];
    const ideas = ['Daft Punk', 'Lo-fi beats', 'Coldplay', 'Billie Eilish', '90s hits', 'Jazz for work', 'Arctic Monkeys', 'Workout mix'];
    let body;
    if (view.loading) body = '<div class="empty">Searching YouTube…</div>';
    else if (searchError) body = `<div class="empty"><strong>Search didn’t work</strong>${esc(searchError)}</div>`;
    else if (searchQuery && !searchResults.length) body = `<div class="empty"><strong>No results for “${esc(searchQuery)}”</strong>Check the spelling or try fewer words.</div>`;
    else if (top) {
      const saved = !!state.songs[top.id];
      body = `
        <div class="search-top">
          <div class="top-result">
            <h2>Top result</h2>
            <div class="top-card" data-search-play="0" role="button" tabindex="0">
              <img src="${thumb(top.id, 'hqdefault')}" alt="">
              <div class="tc-title">${esc(top.title)}</div>
              <div class="tc-sub"><span class="pill">Song</span>${esc(top.author)}${top.duration ? ' · ' + esc(top.duration) : ''}</div>
              <button class="float-play" data-search-play="0" aria-label="Play ${esc(top.title)}">${ICON.play}</button>
            </div>
            <div class="top-actions"><button class="btn ghost save-top" data-search-add="0">${saved ? '✓ Saved' : '+ Save to library'}</button>
              <button class="btn ghost dl-btn" data-radio="${top.id}">${ICON.radio}<span>Start radio</span></button></div>
          </div>
          <div class="top-songs"><h2>Songs</h2>${searchList(1, 5)}</div>
        </div>
        ${searchResults.length > 5 ? `<div class="section"><h2>More results</h2></div>${searchList(5, searchResults.length)}` : ''}`;
    } else {
      body = `<div class="section"><h2>Try searching for</h2><div class="chips">${ideas.map((q) => `<button class="chip" data-idea="${esc(q)}">${esc(q)}</button>`).join('')}</div></div>`;
    }
    main.innerHTML = `
      <div class="section search-page-box">
        <form class="field" id="search-form" role="search"><input class="input big" id="search-input" placeholder="Search songs or artists" value="${esc(searchQuery)}" autocomplete="off"><button class="btn" type="submit">Search</button></form>
      </div>
      ${body}
      <details class="section paste-box">
        <summary>Have a YouTube link? Paste it here</summary>
        <form class="field" id="paste-add"><input class="input" id="paste-input" placeholder="https://www.youtube.com/watch?v=…  or a playlist link" autocomplete="off"><button class="btn ghost" type="submit">Add to library</button></form>
        <p class="hint">Works with videos, Shorts, <code>youtu.be</code>, YouTube Music links and whole playlists. You can also press Ctrl+V anywhere in Loudbox.</p>
      </details>`;
  }
  updatePlayState();
}

function songCard(id, ctxIds, sub) {
  const s = meta(id);
  if (!s) return '';
  return `<div class="card" role="button" tabindex="0" data-card-play="${id}" data-ctx-ids="${ctxIds.join(',')}">
    <img class="thumb" src="${thumb(id)}" alt="" loading="lazy">
    <div><div class="name">${esc(s.title)}</div><div class="sub">${esc(sub ?? s.author)}</div></div></div>`;
}

function queueList(indices) {
  const cur = state.qi;
  return `<div class="tracks">${indices.map((qi) => {
    const id = state.queue[qi];
    const s = meta(id);
    return `<div class="track ${qi === cur ? 'playing' : ''}" data-id="${id}" data-q-row="${qi}">
      <div class="num">${qi === cur ? '<span class="eq"><i></i><i></i><i></i></span>' : `<span class="idx">${qi - cur}</span>`}<button class="hover-play icon-btn small" data-jump="${qi}" aria-label="Play">${ICON.play}</button></div>
      <div class="main-col"><img src="${thumb(id, 'default')}" alt="" loading="lazy"><div class="tt"><div class="title">${dlMark(id)}${esc(s.title)}</div><div class="artist">${esc(s.author)}</div></div></div>
      <div class="col"></div><div class="when"></div>
      <button class="icon-btn more" data-more="${id}" data-qi="${qi}" aria-label="More options">${ICON.more}</button></div>`;
  }).join('')}</div>`;
}

function searchList(from, to) {
  return `<div class="tracks search-tracks">${searchResults.slice(from, to).map((r, k) => {
    const i = from + k;
    const inLib = !!state.songs[r.id];
    return `<div class="track ${r.id === currentId() ? 'playing' : ''}" data-id="${r.id}" data-search-row="${i}">
      <div class="num">${r.id === currentId() ? '<span class="eq"><i></i><i></i><i></i></span>' : `<span class="idx">${i + 1}</span>`}<button class="hover-play icon-btn small" data-search-play="${i}" aria-label="Play ${esc(r.title)}">${ICON.play}</button></div>
      <div class="main-col"><img src="${thumb(r.id, 'default')}" alt="" loading="lazy"><div class="tt"><div class="title">${esc(r.title)}</div><div class="artist">${esc(r.author)}${r.views ? ' · ' + esc(r.views) + ' views' : ''}</div></div></div>
      <button class="icon-btn save ${inLib ? 'on' : ''}" data-search-add="${i}" title="${inLib ? 'In your library' : 'Save to library'}" aria-label="${inLib ? 'In your library' : 'Save to library'}">${inLib ? '<svg viewBox="0 0 24 24"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7z"/></svg>'}</button>
      <div class="when dur">${esc(r.duration || '')}</div>
      <button class="icon-btn more" data-search-more="${i}" aria-label="More options">${ICON.more}</button></div>`;
  }).join('')}</div>`;
}

function renderSidebar() {
  $('#side-playlists').innerHTML = state.playlists.map((p) => `
    <button class="side-pl ${view.name === 'playlist' && view.id === p.id ? 'active' : ''}" data-open-pl="${p.id}">${cover(p.songIds)}<div class="meta"><div class="name">${esc(p.name)}</div><div class="sub">Playlist · ${p.songIds.length}</div></div></button>`).join('')
    || '<p class="hint" style="padding:0 12px">Create a playlist with the + button.</p>';
}

/* ---------------- menus, modals, toast ---------------- */
function openMenu(anchor, items) {
  const m = $('#menu');
  m.innerHTML = items.map((it) => it === '-' ? '<div class="sep"></div>' : it.label && !it.run ? `<div class="label">${esc(it.label)}</div>` :
    `<button class="${it.danger ? 'danger' : ''}">${esc(it.text)}</button>`).join('');
  const runs = items.filter((it) => it !== '-' && it.run);
  m.querySelectorAll('button').forEach((b, i) => b.addEventListener('click', () => { closeMenu(); runs[i].run(); }));
  m.hidden = false;
  const r = anchor.getBoundingClientRect();
  const mw = m.offsetWidth, mh = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(r.right - mw, innerWidth - mw - 8)) + 'px';
  m.style.top = (r.bottom + mh + 8 > innerHeight ? Math.max(8, r.top - mh - 4) : r.bottom + 4) + 'px';
  m.querySelector('button')?.focus();
}
function closeMenu() { $('#menu').hidden = true; }

function songMenu(anchor, id, { playlistId, qi } = {}) {
  const s = state.songs[id];
  const items = [
    { text: 'Start radio', run: () => startRadio(id) },
    '-',
    { text: 'Play next', run: () => playNext(id) },
    { text: 'Add to queue', run: () => addToQueue(id) },
    ...(DL ? [{ text: state.downloaded[id] ? 'Download again' : 'Download', run: () => downloadSongs([id]) }] : []),
    ...(state.songs[id] ? [] : [{ text: 'Save to library', run: () => { saveSong(meta(id)); render(); toast('Saved to your library'); } }]),
  ];
  if (qi !== undefined && qi !== '' && Number(qi) !== state.qi) items.push({ text: 'Remove from queue', run: () => { removeFromQueue(Number(qi)); } });
  items.push('-', { label: 'Add to playlist' });
  state.playlists.forEach((p) => items.push({ text: (p.songIds.includes(id) ? '✓ ' : '') + p.name, run: () => addToPlaylist(id, p.id) }));
  items.push({ text: '+ New playlist…', run: () => newPlaylist([id]) });
  items.push('-', { text: 'Open on YouTube', run: () => window.open(`https://www.youtube.com/watch?v=${id}`, '_blank', 'noopener') });
  items.push({ text: 'Copy link', run: () => copy(`https://www.youtube.com/watch?v=${id}`) });
  if (playlistId) items.push('-', { text: 'Remove from this playlist', danger: true, run: () => removeFromPlaylist(id, playlistId) });
  if (view.name === 'history') items.push('-', { text: 'Remove from history', danger: true, run: () => { state.history = state.history.filter((h) => h.id !== id); state.recent = state.history.slice(0, 20).map((h) => h.id); save(); render(); } });
  if (s && !playlistId && qi === undefined && view.name !== 'history') items.push('-', { text: 'Remove from library', danger: true, run: () => confirmBox(`Remove “${s.title}”?`, 'It will also be removed from every playlist.', 'Remove', () => removeSong(id)) });
  openMenu(anchor, items);
}

function addToPlaylist(id, plId) {
  const p = state.playlists.find((x) => x.id === plId);
  if (!p) return;
  if (p.songIds.includes(id)) return toast(`Already in ${p.name}`);
  if (!state.songs[id]) saveSong(meta(id));
  p.songIds.push(id); save(); render(); toast(`Added to ${p.name}`);
}
function removeFromPlaylist(id, plId) {
  const p = state.playlists.find((x) => x.id === plId);
  p.songIds = p.songIds.filter((x) => x !== id); save(); render(); toast(`Removed from ${p.name}`);
}
function removeSong(id) {
  delete state.songs[id];
  state.playlists.forEach((p) => (p.songIds = p.songIds.filter((x) => x !== id)));
  state.recent = state.recent.filter((x) => x !== id);
  save(); render(); toast('Removed from library');
}
function removeFromQueue(qi) {
  state.queue.splice(qi, 1);
  if (qi < state.qi) state.qi--;
  save(); render(); updateNowPlaying();
}
function copy(text) {
  navigator.clipboard?.writeText(text).then(() => toast('Link copied'), () => toast(text));
}

function modal(html, onMount) {
  $('#modal-body').innerHTML = html;
  $('#modal').hidden = false;
  onMount?.($('#modal-body'));
}
function closeModal() { $('#modal').hidden = true; }
function confirmBox(title, body, okText, onOk) {
  modal(`<h3>${esc(title)}</h3><p class="hint" style="margin:0">${esc(body)}</p><div class="row"><button class="btn ghost" data-close>Cancel</button><button class="btn" id="ok">${esc(okText)}</button></div>`,
    (el) => { $('#ok', el).onclick = () => { closeModal(); onOk(); }; $('#ok', el).focus(); });
}
function promptBox(title, value, okText, onOk, placeholder = '') {
  modal(`<h3>${esc(title)}</h3><form id="pf" style="display:contents"><input class="input" id="pf-input" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off"><div class="row"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn" type="submit">${esc(okText)}</button></div></form>`,
    (el) => {
      const input = $('#pf-input', el); input.focus(); input.select();
      $('#pf', el).onsubmit = (e) => { e.preventDefault(); closeModal(); onOk(input.value.trim()); };
    });
}
function newPlaylist(withIds = []) {
  promptBox('New playlist', `My playlist #${state.playlists.length + 1}`, 'Create', (name) => {
    if (!name) return;
    const pl = { id: uid(), name, songIds: withIds.slice(), createdAt: Date.now() };
    state.playlists.push(pl); save();
    go({ name: 'playlist', id: pl.id });
    toast(`Created ${name}`);
  });
}
function playlistMenu(anchor, plId) {
  const p = state.playlists.find((x) => x.id === plId);
  openMenu(anchor, [
    { text: 'Play', run: () => playQueue(p.songIds) },
    { text: 'Start playlist radio', run: () => startRadio(p.songIds[Math.floor(Math.random() * p.songIds.length)]) },
    { text: 'Add all to queue', run: () => { p.songIds.forEach((id) => state.queue.push(id)); if (state.qi < 0) playQueue(p.songIds); save(); updateNowPlaying(); toast('Added to queue'); } },
    { text: 'Rename…', run: () => promptBox('Rename playlist', p.name, 'Save', (n) => { if (n) { p.name = n; save(); render(); } }) },
    '-',
    { text: 'Delete playlist', danger: true, run: () => confirmBox(`Delete “${p.name}”?`, 'The songs stay in your library.', 'Delete', () => { state.playlists = state.playlists.filter((x) => x.id !== plId); save(); go({ name: 'home' }); toast('Playlist deleted'); }) },
  ]);
}
function keyBox() {
  modal(`<h3>YouTube API key</h3>
    <p class="hint" style="margin:0">A free key lets Loudbox search YouTube and import big playlists with titles. Create one in the Google Cloud console: make a project, enable <b>YouTube Data API v3</b>, then go to Credentials → Create credentials → API key. It’s stored only on this computer.</p>
    <form id="kf" style="display:contents"><input class="input" id="kf-input" value="${esc(state.apiKey)}" placeholder="AIza…" autocomplete="off" spellcheck="false">
    <div class="row">${state.apiKey ? '<button type="button" class="btn ghost" id="kf-clear">Remove key</button>' : ''}<button type="button" class="btn ghost" data-close>Cancel</button><button class="btn" type="submit">Save</button></div></form>`,
    (el) => {
      $('#kf-input', el).focus();
      $('#kf', el).onsubmit = (e) => { e.preventDefault(); state.apiKey = $('#kf-input', el).value.trim(); save(); closeModal(); render(); toast(state.apiKey ? 'Key saved. Search is on.' : 'Key removed'); };
      const c = $('#kf-clear', el); if (c) c.onclick = () => { state.apiKey = ''; save(); closeModal(); render(); toast('Key removed'); };
    });
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 2600);
}

/* ---------------- events ---------------- */
document.addEventListener('click', (e) => {
  const t = e.target.closest('button, [data-open-pl], [data-card-play], [data-search-play], [data-idea], [data-suggest], [data-close], .modal-back');
  if (!$('#menu').hidden && !e.target.closest('#menu')) closeMenu();
  const row = e.target.closest('.track');
  if (row && !e.target.closest('button, a, input')) {
    if (row.dataset.id === currentId() && row.dataset.qRow === undefined) return togglePlay();
    if (row.dataset.row !== undefined) return playQueue($('#main').__ids || [], Number(row.dataset.row));
    if (row.dataset.searchRow !== undefined) return playQueue(searchResults.map((r) => r.id), Number(row.dataset.searchRow));
    if (row.dataset.qRow !== undefined) { const qi = Number(row.dataset.qRow); if (qi === state.qi) return togglePlay(); state.qi = qi; return loadCurrent(true); }
  }
  if (!t) return;
  const d = t.dataset;
  if (t.id === 'modal' && e.target === t) return closeModal();
  if ('close' in d) return closeModal();
  if (d.view) return go({ name: d.view });
  if (d.playPl) { e.stopPropagation(); const p = state.playlists.find((x) => x.id === d.playPl); return p && playQueue(p.songIds); }
  if (d.openPl) return go({ name: 'playlist', id: d.openPl });
  if (d.cardPlay) { const ids = d.ctxIds.split(',').filter(Boolean); return playQueue(ids, Math.max(0, ids.indexOf(d.cardPlay))); }
  if ('playView' in d) {
    const ids = $('#main').__ids || [];
    if ('current' in d && state.queue.join() === ids.join()) return togglePlay();
    return playQueue(ids, 0);
  }
  if (d.playRow !== undefined) { const ids = $('#main').__ids || []; return playQueue(ids, Number(d.playRow)); }
  if (d.jump !== undefined) { state.qi = Number(d.jump); return loadCurrent(true); }
  if (d.more) { e.stopPropagation(); return songMenu(t, d.more, { playlistId: d.ctx || undefined, qi: d.qi === '' ? undefined : d.qi }); }
  if (d.plMenu) { e.stopPropagation(); return playlistMenu(t, d.plMenu); }
  if (d.searchPlay !== undefined) { e.stopPropagation(); return playQueue(searchResults.map((r) => r.id), Number(d.searchPlay)); }
  if (d.searchAdd !== undefined) {
    const r = searchResults[Number(d.searchAdd)];
    if (saveSong(r)) { render(); return toast('Saved to your library'); }
    return toast('Already in your library');
  }
  if (d.searchMore !== undefined) { e.stopPropagation(); return songMenu(t, searchResults[Number(d.searchMore)].id); }
  if (d.dlPlaylist) return downloadPlaylist(d.dlPlaylist);
  if (d.dlRetry) return DL.retry(d.dlRetry);
  if (d.dlCancel) return DL.cancel(d.dlCancel);
  if (d.dlShow) return DL.showFile(d.dlShow);
  if (d.idea) { $('#tb-search-input').value = d.idea; return ytSearch(d.idea); }
  if (d.suggest) return runTopSearch(d.suggest);
  if (t.id === 'edit-key') return keyBox();
  if (d.lyrT !== undefined) { if (playerReady) { player.seekTo(Number(d.lyrT), true); player.playVideo(); } lyricsUserScrollAt = 0; return; }
  if ('lyrRetry' in d) { const id = currentId(); if (id) { const L = lyricsCache[id]; lyricsCache[id] = { status: 'none', artist: L?.artist || '', track: L?.track || '' }; render(); setTimeout(() => $('#lyr-q')?.focus(), 0); } return; }
  if (d.radio) return startRadio(d.radio);
  if ('stopRadio' in d) return stopRadio();
  if (t.id === 'clear-history') return confirmBox('Clear your listening history?', 'Recently played will be empty. Your library and playlists stay as they are.', 'Clear history', () => { state.history = []; state.recent = []; save(); render(); toast('History cleared'); });
  if (t.id === 'clear-queue') { state.queue = state.queue.slice(0, state.qi + 1); save(); render(); return updateNowPlaying(); }
});
// double-click a row to play it
// rows play on a single click/tap (see the click handler above)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('[role=button]')) e.target.click();
});

document.addEventListener('submit', async (e) => {
  const f = e.target;
  if (f.id === 'quick-add' || f.id === 'paste-add' || f.id === 'pl-add') {
    e.preventDefault();
    const input = f.querySelector('input');
    const ok = await handleAdd(input.value, f.id === 'pl-add' ? { toPlaylist: view.id } : {});
    if (ok) input.value = '';
  }
  if (f.id === 'lyr-form') {
    e.preventDefault();
    const q = $('#lyr-q').value.trim();
    if (q && currentId()) loadLyrics(currentId(), q);
    return;
  }
  if (f.id === 'search-form' || f.id === 'tb-search') {
    e.preventDefault();
    const q = (f.id === 'search-form' ? $('#search-input') : $('#tb-search-input')).value.trim();
    if (!q) return;
    // links get added, words get searched
    if (f.id === 'search-form') runTopSearch(q); else runTopSearch($('#tb-search-input').value);
    return;
  }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'lib-filter') {
    view.filter = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const nf = $('#lib-filter'); nf.focus(); nf.setSelectionRange(pos, pos);
  }
});

$('#btn-play').onclick = togglePlay;
$('#btn-next').onclick = () => next();
$('#btn-prev').onclick = prev;
$('#btn-shuffle').onclick = toggleShuffle;
$('#btn-repeat').onclick = cycleRepeat;
$('#btn-mute').onclick = toggleMute;
$('#btn-video').onclick = toggleVideo;
$('#new-playlist').onclick = () => newPlaylist();
$('#bar-radio').onclick = () => { const id = currentId(); if (!id) return toast('Play a song first, then start its radio'); state.radio && state.radio.seed === id ? stopRadio() : startRadio(id); };
$('#bar-lyrics').onclick = toggleLyrics;
$('#bar-dl').onclick = () => { const id = currentId(); if (id) downloadSongs([id]); else toast('Nothing is playing'); };
$('#bar-like').onclick = (e) => { e.stopPropagation(); const id = currentId(); if (id) songMenu(e.currentTarget, id); else toast('Nothing is playing'); };
$('#np-next').addEventListener('click', (e) => { const b = e.target.closest('[data-jump]'); if (b) { e.stopPropagation(); state.qi = Number(b.dataset.jump); loadCurrent(true); } });
$('#volume').addEventListener('input', (e) => setVolume(Number(e.target.value)));
const seekEl = $('#seek');
seekEl.addEventListener('input', () => {
  seeking = true;
  seekEl.style.setProperty('--p', (seekEl.value / 10) + '%');
  const dur = playerReady ? player.getDuration() : 0;
  $('#t-cur').textContent = fmt((seekEl.value / 1000) * dur);
});
seekEl.addEventListener('change', () => {
  if (playerReady) player.seekTo((seekEl.value / 1000) * player.getDuration(), true);
  seeking = false;
});

// paste a YouTube link anywhere (outside a text field) to add it
document.addEventListener('paste', (e) => {
  if (e.target.matches('input, textarea')) return;
  const text = e.clipboardData?.getData('text') || '';
  const parsed = parseYouTube(text);
  if (parsed.videos.length || parsed.lists.length) { e.preventDefault(); handleAdd(text); }
});

/* top search box: suggestions with arrow keys */
const tbInput = $('#tb-search-input');
tbInput.addEventListener('input', () => updateSuggest(tbInput.value));
tbInput.addEventListener('focus', () => { if (tbInput.value.trim()) updateSuggest(tbInput.value); });
tbInput.addEventListener('blur', () => setTimeout(() => ($('#suggest').hidden = true), 150));
tbInput.addEventListener('keydown', (e) => {
  const box = $('#suggest');
  const items = [...box.querySelectorAll('[data-suggest]')];
  if (e.key === 'Escape') { box.hidden = true; tbInput.blur(); return; }
  if (box.hidden || !items.length || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
  e.preventDefault();
  suggestIdx = (suggestIdx + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
  items.forEach((b, i) => b.classList.toggle('sel', i === suggestIdx));
  tbInput.value = items[suggestIdx].dataset.suggest;
});

/* ---------------- downloads (desktop app only) ---------------- */
const DL = window.loudboxDl;
let dlJobs = [];
function dlMark(id) {
  return DL && state.downloaded[id] ? `<span class="dl-mark" title="Downloaded">${ICON.done}</span>` : '';
}
async function downloadSongs(ids, playlistName = '') {
  if (!DL) return toast('Downloads work in the Loudbox desktop app');
  const songs = ids.map((id) => meta(id)).map((s) => ({ id: s.id, title: s.title, author: s.author }));
  const added = await DL.add(songs, playlistName);
  if (!added) toast(ids.length === 1 ? 'Already downloading' : 'Those songs are already downloading');
  else toast(added === 1 ? `Downloading “${songs[0].title}”` : `Downloading ${added} songs`);
}
function downloadPlaylist(plId) {
  const pl = state.playlists.find((p) => p.id === plId);
  if (!pl || !pl.songIds.length) return toast('This playlist is empty');
  downloadSongs(pl.songIds, pl.name);
}
const DL_STATUS = { queued: 'Waiting…', starting: 'Starting…', 'getting-tool': 'Getting the downloader (first time only)…', downloading: '', done: 'Saved', failed: 'Failed', cancelled: 'Cancelled' };
function renderDownloads() {
  if (!DL) return;
  const active = dlJobs.filter((j) => !['done', 'failed'].includes(j.status));
  const badge = $('#dl-badge');
  badge.hidden = !active.length;
  badge.textContent = active.length > 99 ? '99+' : active.length;
  const ring = $('#dl-ring');
  const running = dlJobs.filter((j) => j.status === 'downloading');
  ring.hidden = !active.length;
  const pct = active.length ? active.reduce((a, j) => a + (j.percent || 0), 0) / active.length : 0;
  ring.style.setProperty('--p', pct.toFixed(0) + '%');
  $('#dl-toggle').classList.toggle('busy', running.length > 0);
  if ($('#dl-panel').hidden) return;
  const list = $('#dl-list');
  if (!dlJobs.length) {
    list.innerHTML = '<p class="hint dl-empty">Nothing downloaded yet. Use the download button on a song, in the player bar, or on a playlist.</p>';
    return;
  }
  list.innerHTML = dlJobs.slice().reverse().map((j) => {
    const k = esc(j.key);
    const status = j.status === 'downloading' ? `${Math.round(j.percent)}%` : j.status === 'failed' ? `Failed: ${esc(j.error)}` : DL_STATUS[j.status] || j.status;
    const action = j.status === 'done' ? `<button class="icon-btn small" data-dl-show="${esc(j.file)}" title="Show in folder" aria-label="Show in folder"><svg viewBox="0 0 24 24"><path d="M3 5h7l2 2h9v12H3zm2 4v8h14V9z"/></svg></button>`
      : j.status === 'failed' ? `<button class="icon-btn small" data-dl-retry="${k}" title="Try again" aria-label="Try again"><svg viewBox="0 0 24 24"><path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"/></svg></button>`
      : `<button class="icon-btn small" data-dl-cancel="${k}" title="Cancel" aria-label="Cancel"><svg viewBox="0 0 24 24"><path d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4z"/></svg></button>`;
    return `<div class="dl-item ${j.status}">
      <img src="${thumb(j.id, 'default')}" alt="" loading="lazy">
      <div class="dl-meta"><div class="t">${esc(j.title)}</div>
        <div class="dl-status">${status}</div>
        ${['downloading', 'starting', 'getting-tool', 'queued'].includes(j.status) ? `<div class="dl-bar"><i style="width:${j.percent || 0}%"></i></div>` : ''}
      </div>${action}</div>`;
  }).join('');
}
function onDlJobs(jobs) {
  const before = new Set(dlJobs.filter((j) => j.status === 'done').map((j) => j.key));
  dlJobs = jobs;
  let changed = false;
  for (const j of jobs) {
    if (j.status === 'done' && !state.downloaded[j.id]) { state.downloaded[j.id] = true; changed = true; }
    if (j.status === 'done' && !before.has(j.key) && jobs.filter((x) => x.status !== 'done' && x.status !== 'failed').length === 0) {
      toast(jobs.length > 1 ? 'All downloads finished' : `Downloaded “${j.title}”`);
    }
  }
  if (changed) { save(); render(); }
  renderDownloads();
}
async function toggleDlPanel(force) {
  const panel = $('#dl-panel');
  const open = force ?? panel.hidden;
  panel.hidden = !open;
  $('#dl-toggle').setAttribute('aria-expanded', String(open));
  if (open) { $('#dl-folder-path').textContent = await DL.folder(); renderDownloads(); }
}
if (DL) {
  $('#bar-dl').hidden = false;
  DL.onJobs(onDlJobs);
  DL.list().then(onDlJobs);
  $('#dl-toggle').onclick = (e) => { e.stopPropagation(); toggleDlPanel(); };
  $('#dl-close').onclick = () => toggleDlPanel(false);
  $('#dl-open').onclick = () => DL.openFolder();
  $('#dl-change').onclick = async () => { $('#dl-folder-path').textContent = await DL.chooseFolder(); };
  $('#dl-clear').onclick = () => DL.clearFinished();
  document.addEventListener('mousedown', (e) => {
    if (!$('#dl-panel').hidden && !e.target.closest('#dl-panel, #dl-toggle')) toggleDlPanel(false);
  });
} else {
  $('#dl-toggle').hidden = true;
}

/* custom window frame (desktop app only) */
const W = window.loudboxWin;
function applyWinState(s) {
  document.body.classList.toggle('maximized', !!s.maximized);
  document.body.classList.toggle('blurred', s.focused === false);
  const pin = $('#win-pin');
  pin.classList.toggle('on', !!s.pinned);
  pin.title = s.pinned ? 'Unpin from top (P)' : 'Pin on top of other windows (P)';
  pin.setAttribute('aria-pressed', String(!!s.pinned));
  $('#win-max').title = s.maximized ? 'Restore' : 'Maximize';
  $('#win-max').innerHTML = s.maximized
    ? '<svg viewBox="0 0 24 24"><path d="M8 4h12v12h-2V6H8z M4 8h12v12H4zm2 2v8h8v-8z"/></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M5 5h14v14H5zm2 2v10h10V7z"/></svg>';
}
async function togglePin() {
  if (!W) return;
  const s = await W.togglePin();
  applyWinState(s);
  toast(s.pinned ? 'Pinned on top' : 'Unpinned');
}
if (W) {
  document.body.classList.add('desktop');
  $('#win-controls').hidden = false;
  $('#win-min').onclick = () => W.minimize();
  $('#win-max').onclick = () => W.toggleMaximize();
  $('#win-close').onclick = () => W.close();
  $('#win-pin').onclick = togglePin;
  $('#titlebar').addEventListener('dblclick', (e) => { if (!e.target.closest('button, input, form')) W.toggleMaximize(); });
  W.onState(applyWinState);
  W.getState().then(applyWinState);
}
else $('#get-app').hidden = false;

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeMenu(); closeModal(); return; }
  if ((e.ctrlKey && e.key.toLowerCase() === 'k') || (e.key === '/' && !e.target.matches('input, textarea'))) {
    e.preventDefault(); tbInput.focus(); tbInput.select(); return;
  }
  if (e.target.matches('input, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key.toLowerCase() === 'p' && W) { togglePin(); return; }
  if (!$('#modal').hidden) return;
  const k = e.key.toLowerCase();
  if (k === ' ') { e.preventDefault(); togglePlay(); }
  else if (k === 'arrowright' && e.shiftKey) next();
  else if (k === 'arrowleft' && e.shiftKey) prev();
  else if (k === 'arrowright' && playerReady) player.seekTo(player.getCurrentTime() + 10, true);
  else if (k === 'arrowleft' && playerReady) player.seekTo(Math.max(0, player.getCurrentTime() - 10), true);
  else if (k === 'arrowup') { e.preventDefault(); setVolume(state.volume + 5); }
  else if (k === 'arrowdown') { e.preventDefault(); setVolume(state.volume - 5); }
  else if (k === 's') toggleShuffle();
  else if (k === 'r') cycleRepeat();
  else if (k === 'm') toggleMute();
  else if (k === 'v') toggleVideo();
  else if (k === 'l') toggleLyrics();
});

/* fill in titles for history entries that only have a video id (from older versions) */
(async () => {
  const missing = state.history.filter((h) => h.title === h.id || h.title === 'Loading title…').slice(0, 20);
  for (const h of missing) {
    const m = await fetchMeta(h.id);
    if (m) { h.title = m.title; h.author = m.author; }
  }
  // queued songs from older versions that lost their titles
  const unknownQ = [...new Set(state.queue)].filter((id) => meta(id).title === id).slice(0, 30);
  for (const id of unknownQ) {
    const m = await fetchMeta(id);
    if (m) cache[id] = { id, ...m };
  }
  if (missing.length || unknownQ.length) { save(); render(); updateNowPlaying(); }
})();

/* ---------------- boot ---------------- */
updateControls();
render();
updateNowPlaying();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
