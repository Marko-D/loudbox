# Loudbox

A desktop music player for Windows that plays YouTube videos as songs.

## Download

Get **Loudbox-Setup-x.y.z.exe** from the [latest release](../../releases/latest), run it, and follow the installer.
There is also a portable `.exe` that runs without installing.

Windows will show *"Windows protected your PC"* because the app isn't code-signed. Click **More info → Run anyway**.

## Features

- **Search** songs and artists, with suggestions as you type (no API key needed)
- **Library and playlists**: save songs, build playlists, import whole YouTube playlists by link
- **Radio**: start a radio from any song for an endless queue of similar music
- **Synced lyrics** that follow the song (from [LRCLIB](https://lrclib.net))
- **Downloads**: save a song or a whole playlist as `.m4a` audio (uses [yt-dlp](https://github.com/yt-dlp/yt-dlp), fetched on first use)
- **Mini player**: shrink the window and it becomes a compact player; pin it on top of other windows
- Shuffle, repeat, queue, media keys, keyboard shortcuts

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| Space | Play / pause |
| Shift + ← / → | Previous / next song |
| ← / → | Back / forward 10 seconds |
| ↑ / ↓ | Volume |
| Ctrl + K or / | Search |
| S / R | Shuffle / repeat |
| L | Lyrics |
| P | Pin on top |
| V / M | Show video / mute |

## Notes

- Your library lives on your own computer. Nothing is uploaded anywhere.
- Some videos can't be played outside YouTube because their owners disabled embedding; Loudbox skips them.
- Only download music you have the right to keep. Downloading from YouTube is against YouTube's Terms of Service for most videos.
- Search, radio and lyrics read public YouTube and LRCLIB pages. If YouTube changes its pages, these may stop working until Loudbox is updated.

## Build from source

Requires [Node.js](https://nodejs.org) 20 or newer.

```powershell
npm install
npm run dist
```

The installer and portable `.exe` are written to `dist/`. Keep the project in a short folder path (under ~100 characters), because the installer tool fails on very long paths.

To run it in a browser instead of as an app: `node server.js`, then open http://localhost:4517.
