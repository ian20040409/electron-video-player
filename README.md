# LNU Player

A lightweight, privacy-first desktop media player built on Electron + Video.js. Supports local files, internet URLs, HLS/DASH streams, and YouTube — with automatic transcoding for virtually any format via bundled FFmpeg.

## Features

- Welcome screen with Open File and Play from URL
- **Universal format support** — AVI, WMV, MOV, MKV, FLAC and 20+ more via built-in FFmpeg transcoding
- URL playback for `mp4`, `m3u8` (HLS), `mpd` (DASH), and YouTube links
- Auto-scales video (preserves aspect ratio)
- Dynamic ambient background (blurred, mirrored overlay)
- Header auto-hide during playback; cursor hides in fullscreen
- Back button, dark/light theme toggle
- Keyboard shortcuts for seek, volume, speed, fullscreen, open
- Picture-in-Picture (PiP)
- Drag & drop files into the window

## Supported Formats

### Natively Played (no conversion)
| Type | Formats |
|------|---------|
| Video | MP4, M4V, WebM, OGV |
| Audio | MP3, M4A, AAC, OGG, WAV |
| Streaming | HLS (`.m3u8`), DASH (`.mpd`), YouTube |

### Auto-Transcoded via FFmpeg
These formats are automatically converted to MP4 before playback. A progress bar is shown during conversion — no user installation required (FFmpeg binary is bundled).

| Type | Formats |
|------|---------|
| Video | MOV, MKV, AVI, WMV, FLV, M2TS, MTS, 3GP, 3G2, ASF, VOB, DIVX, F4V, RM, RMVB, MXF |
| Audio | FLAC, OPUS, WMA, AIFF, ALAC |

> **Tip:** MOV and MKV files containing H.264/AAC are remuxed (container swap only), which completes in seconds. Files with incompatible codecs are re-encoded, which takes longer depending on file size and CPU speed.

### YouTube
Paste any `youtube.com`, `youtu.be`, or playlist link into the URL box or drop it into the window. Playback uses the official iframe API via `videojs-youtube`. Privacy-enhanced mode (`youtube-nocookie.com`) is enabled by default.

## Prerequisites

- Node.js 18+
- npm 9+

## Install

```
npm install
```

Having trouble downloading Electron on restricted networks? Use a mirror:

```powershell
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
npm cache clean --force
Remove-Item -Recurse -Force node_modules; Remove-Item package-lock.json -ErrorAction Ignore
npm install
```

Or add to `.npmrc`:

```
electron_mirror=https://npmmirror.com/mirrors/electron/
```

## Run

```
npm start
```

## Building and Releasing

This project uses GitHub Actions to automate builds for Windows and macOS. The workflow is defined in `.github/workflows/build-and-release.yml`.

### Tag-based Release
Push a version tag (e.g. `v1.2.0`) to trigger an automated build that produces installers for all platforms and attaches them to a GitHub Release.

### Manual Trigger
1. Go to the **Actions** tab in the repository
2. Select **Build and Release**
3. Click **Run workflow**, enter a tag name and choose draft or public
4. Click **Run workflow**

## Download and Install

### macOS
1. Download the latest `.dmg` from [Releases](https://github.com/ian20040409/electron-video-player/releases)
2. Open the `.dmg` and drag the app to Applications
3. If you see a security warning, go to **System Preferences → Security & Privacy → Open Anyway**
4. Or remove quarantine via Terminal:
```bash
sudo xattr -r -d com.apple.quarantine /Applications/LNU\ Player.app
```

### Windows
1. Download the latest `.exe` installer from [Releases](https://github.com/ian20040409/electron-video-player/releases)
2. Run the installer and follow the prompts

## Screenshots

### Main Menu
![Main Menu](https://github.com/ian20040409/electron-video-player/blob/main/docs/pics/Main%20Menu.png?raw=true)

---

### Local file
![Local file](https://github.com/ian20040409/electron-video-player/blob/main/docs/pics/Local%20file.png?raw=true)

---

### YouTube embedded video player
![YouTube embedded video player](https://github.com/ian20040409/electron-video-player/blob/main/docs/pics/YouTube%20embedded%20video%20player.png?raw=true)

## Usage

- **Open local file:** click "Open Media" on the welcome screen or press `O`
- **Play URL:** paste an `http(s)` URL (MP4, `.m3u8`, YouTube, etc.) and click "Play URL" or press Enter
- **Unsupported formats:** open or drop any file — if transcoding is needed, a progress overlay appears automatically
- **Back:** click Back in the header to return to the welcome screen
- **Theme:** click the moon/sun icon to toggle dark/light mode

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` / `K` | Play / Pause |
| `→` / `←` | Seek +5s / −5s |
| `Shift` + `→` / `←` | Seek +10s / −10s |
| `Ctrl` + `→` / `←` | Seek +30s / −30s |
| `↑` / `↓` | Volume +5% / −5% |
| `M` | Mute / Unmute |
| `[` / `]` or `+` / `-` | Speed down / up (0.25× step) |
| `0` | Reset speed to 1.0× |
| `F` | Toggle fullscreen |
| `O` | Open file dialog |
| `L` | Focus URL input (welcome screen) |
| `1`–`9` | Jump to 10%–90% of video |
| Double-click | Toggle fullscreen |

## Project Structure

```
src/
  main.js       — Electron main process: window, dialogs, local server, FFmpeg IPC
  preload.js    — Context bridge (window.electronAPI) for renderer
  index.html    — UI shell: header, welcome screen, player, overlays
  styles.css    — Theme, layout, animations, transcode overlay
  renderer.js   — Video.js setup, format detection, FFmpeg flow, hotkeys
```

## Known Limitations

- Remote HLS/DASH streams require CORS support from the server
- YouTube playback requires an internet connection and uses the official iframe API
- FFmpeg transcoding stores a temporary MP4 in the system temp directory; it is deleted when you press Back or close the app
- `fluent-ffmpeg` is deprecated upstream but remains functional

## License

MIT — see [LICENSE](LICENSE)
