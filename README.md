# Electron Video Player

Lightweight Electron desktop player powered by videojs for local files and internet URLs (MP4, HLS/m3u8, YouTube), with cross-platform support for Windows and macOS.

## Features

- Welcome screen with Open File and Play from URL
- URL playback for `mp4`, `m3u8` (HLS), and YouTube links
- Auto–scales video (keeps aspect; upscales low‑res sources)
- Dynamic ambient background (blurred, mirrored overlay)
- Header auto‑hide during playback; reappears on interaction
- Back button (return to welcome), theme toggle (dark/light)
- Keyboard shortcuts for seek, volume, speed, fullscreen, open
- Picture-in-Picture (PiP)

### YouTube Streaming

- Paste any `youtube.com`, `youtu.be`, or playlist link into the URL box or drop it into the window—playback uses the official iframe tech via `videojs-youtube`.
- The app serves itself from a localhost origin so embeds pass YouTube’s security checks. No data is proxied: the iframe talks directly to YouTube.
- Privacy‑enhanced mode (`youtube-nocookie.com`) is enabled and the ambient mirror backdrop automatically disables for iframe sources.

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

## Main Menu

[![Main Menu](https://images2.imgbox.com/31/67/meDRsIwC_o.png)](https://imgbox.com/meDRsIwC)

---

### Local file

[![Local file](https://i.meee.com.tw/lVEsu4L.png)


---

### YouTube embedded video player

[![YouTube embedded video player](https://images2.imgbox.com/cf/78/F2MiD57J_o.png)](https://imgbox.com/F2MiD57J)


## Usage

- Open local file: click “Open Video” on the welcome screen or press `O`.
- Play URL: paste an `http(s)` URL (MP4, `.m3u8`, or a YouTube link) and click “Play URL” or press Enter. On the welcome screen, press `L` to focus the URL box.
- Back: click Back in the header to return to welcome.
- Theme: click the moon/sun icon to toggle dark/light.
- Maximize: when the window is maximized, the player is slightly reduced to showcase more ambient glow.

Notes on streaming:
- Remote servers must allow CORS for the manifest and segment requests; otherwise playback may fail. Check DevTools network errors if a stream does not load.
- YouTube playback is powered by the official iframe API (via `videojs-youtube`). The app now serves its UI from a local HTTP origin so YouTube embeds initialise correctly, disables the ambient mirror backdrop for those sources, and still respects the same CSP.

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
