# Electron Video Player

Lightweight Electron desktop player powered by [videojs](https://videojs.com/) for local files and internet URLs (MP4, HLS/m3u8). Minimal chrome, auto–scaling video, clean dark/light themes, and a subtle ambient glow.

## Features

- Welcome screen with Open File and Play from URL
- URL playback for `mp4` and `m3u8` (HLS)
- Auto–scales video (keeps aspect; upscales low‑res sources)
- Dynamic ambient background (blurred, mirrored overlay)
- Header auto‑hide during playback; reappears on interaction
- Back button (return to welcome), theme toggle (dark/light)
- Keyboard shortcuts for seek, volume, speed, fullscreen, open
- OS window title shows the current filename

## Prerequisites

- Node.js 18+
- npm 9+

## Install

```
npm install
```

Having trouble downloading Electron in restricted networks (ENOTFOUND on GitHub assets)? Use an Electron mirror:

PowerShell (one‑off in current session):

```
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
npm cache clean --force
Remove-Item -Recurse -Force node_modules; Remove-Item package-lock.json -ErrorAction Ignore
npm install
```

Or add a project `.npmrc`:

```
electron_mirror=https://npmmirror.com/mirrors/electron/
```

## Run

```
npm start
```
## Screenshots

<p align="center">

<a href="https://imgbox.com/3I3vHj7L" target="_blank"><img src="https://images2.imgbox.com/3f/fd/3I3vHj7L_o.png" alt="image host"/></a>

&nbsp;

<a href="https://imgbox.com/wpRawarL" target="_blank"><img src="https://images2.imgbox.com/18/37/wpRawarL_o.png" alt="image host"/></a>

</p>


## Usage

- Open local file: click “Open Video” on the welcome screen or press `O`.
- Play URL: paste an `http(s)` URL (MP4 or `.m3u8`) and click “Play URL” or press Enter. On the welcome screen, press `L` to focus the URL box.
- Back: click Back in the header to return to welcome.
- Theme: click the moon/sun icon to toggle dark/light.
- Maximize: when the window is maximized, the player is slightly reduced to showcase more ambient glow.

Notes on HLS (m3u8):
- Remote servers must allow CORS for the manifest and segment requests; otherwise playback may fail. Check DevTools network errors if a stream does not load.

## Keyboard Shortcuts

- Space / `K`: Play / Pause
- Arrow Right / Left: +5s / −5s (Shift: 10s, Ctrl/Cmd: 30s)
- Arrow Up / Down: Volume +5% / −5%
- `M`: Mute / Unmute
- `[` / `]` / `+` / `-`: Speed down / up
- `0`: Reset speed to 1.0
- `F`: Fullscreen toggle
- `O`: Open local file dialog
- `L` (welcome screen): Focus URL input
- `1`..`9`: Jump to 10%..90%
- Double‑click on player: Fullscreen toggle

## Project Structure

- `src/main.js` — Electron main process (window, dialogs, menu removal)
- `src/preload.js` — Safe bridge (`window.electronAPI`) for renderer
- `src/index.html` — UI shell (welcome, header, player)
- `src/styles.css` — Theme, layout, player sizing, ambient overlay
- `src/renderer.js` — Video.js setup, UI logic, hotkeys, URL playback

## Known Limitations / Notes

- Drag & drop is disabled by request; use the Open button or URL field.
- Some HLS streams require CORS support from the server and may not play without it.
- The ambient effect uses a mirrored hidden video overlay; if you prefer a subtler look, we can reduce opacity/blur.

## License

MIT — see [LICENSE](LICENSE)

