// Keyless YouTube search: reads the public results page and pulls out the videos.
// Used by both the desktop app and server.js, served to the page at /api/search?q=...
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  // skips the EU cookie-consent interstitial
  Cookie: 'SOCS=CAI; CONSENT=YES+1',
};

function textOf(t) {
  if (!t) return '';
  if (t.simpleText) return t.simpleText;
  if (Array.isArray(t.runs)) return t.runs.map((r) => r.text).join('');
  return '';
}

function extractInitialData(html) {
  const marker = html.match(/(?:var\s+ytInitialData|window\["ytInitialData"\])\s*=\s*/);
  if (!marker) throw new Error('YouTube changed its page format');
  let i = marker.index + marker[0].length;
  // walk the JSON object by brace depth (strings may contain braces)
  let depth = 0, inStr = false, esc = false;
  const start = i;
  for (; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return JSON.parse(html.slice(start, i));
}

function collectVideos(node, out) {
  if (!node || typeof node !== 'object' || out.length >= 40) return;
  if (Array.isArray(node)) { node.forEach((n) => collectVideos(n, out)); return; }
  const v = node.videoRenderer;
  if (v && v.videoId) {
    const isLive = (v.badges || []).some((b) => /LIVE/i.test(JSON.stringify(b)));
    out.push({
      id: v.videoId,
      title: textOf(v.title),
      author: textOf(v.ownerText) || textOf(v.longBylineText),
      duration: textOf(v.lengthText) || (isLive ? 'LIVE' : ''),
      views: textOf(v.shortViewCountText) || textOf(v.viewCountText),
    });
    return;
  }
  for (const k in node) collectVideos(node[k], out);
}

async function searchYouTube(query) {
  const url = 'https://www.youtube.com/results?hl=en&search_query=' + encodeURIComponent(query);
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error('YouTube returned ' + res.status);
  const data = extractInitialData(await res.text());
  const out = [];
  collectVideos(data.contents || data, out);
  const seen = new Set();
  return out.filter((v) => !seen.has(v.id) && seen.add(v.id)).slice(0, 30);
}

async function suggest(query) {
  const url = 'https://suggestqueries-clients6.youtube.com/complete/search?client=youtube&ds=yt&hl=en&q=' + encodeURIComponent(query);
  const res = await fetch(url, { headers: HEADERS });
  const text = await res.text();
  const m = text.match(/\((\[.*\])\)\s*$/s);
  if (!m) return [];
  return (JSON.parse(m[1])[1] || []).map((s) => s[0]).slice(0, 8);
}

// Radio: YouTube's automatic "Mix" playlist (list=RD<videoId>) of songs similar to one song.
function collectPanel(node, out) {
  if (!node || typeof node !== 'object' || out.length >= 60) return;
  if (Array.isArray(node)) { node.forEach((n) => collectPanel(n, out)); return; }
  const v = node.playlistPanelVideoRenderer;
  if (v && v.videoId) {
    out.push({ id: v.videoId, title: textOf(v.title), author: textOf(v.shortBylineText) || textOf(v.longBylineText), duration: textOf(v.lengthText) });
    return;
  }
  for (const k in node) collectPanel(node[k], out);
}
async function radio(videoId) {
  if (!/^[\w-]{11}$/.test(videoId)) throw new Error('Not a YouTube video');
  const url = `https://www.youtube.com/watch?v=${videoId}&list=RD${videoId}&hl=en`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error('YouTube returned ' + res.status);
  const data = extractInitialData(await res.text());
  const out = [];
  collectPanel(data.contents?.twoColumnWatchNextResults?.playlist || data, out);
  const seen = new Set();
  const list = out.filter((v) => v.title && !seen.has(v.id) && seen.add(v.id));
  if (list.length < 2) {
    // no mix for this video: fall back to a search for the same artist
    return searchYouTube(textOf(data.contents?.twoColumnWatchNextResults?.results?.results?.contents?.[0]?.videoPrimaryInfoRenderer?.title) || videoId);
  }
  return list;
}

// Shared HTTP handler: returns true when it answered the request.
async function handleApi(req, res) {
  const u = new URL(req.url, 'http://x');
  if (!['/api/search', '/api/suggest', '/api/radio'].includes(u.pathname)) return false;
  const q = (u.searchParams.get('q') || '').trim().slice(0, 200);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (!q) { res.end('[]'); return true; }
  try {
    const result = u.pathname === '/api/search' ? await searchYouTube(q) : u.pathname === '/api/radio' ? await radio(q) : await suggest(q);
    res.end(JSON.stringify(result));
  } catch (e) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: e.message || 'Search failed' }));
  }
  return true;
}

module.exports = { searchYouTube, suggest, radio, handleApi };
