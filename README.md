# LNU Player

A lightweight, privacy-first desktop media player built on Electron + Video.js. Supports local files, internet URLs, HLS/DASH streams, and YouTube — with native HEVC hardware decoding and a built-in stream downloader.

## Features

- Welcome screen with Open File and Play from URL
- **Native HEVC hardware decoding** — H.265 video plays without transcoding (Electron 39+)
- URL playback for `mp4`, `m3u8` (HLS), `mpd` (DASH), and YouTube links
- **Stream downloader** — download HLS, DASH, and direct HTTP streams with a built-in download manager
- Auto-scales video (preserves aspect ratio)
- Dynamic ambient background (blurred, mirrored overlay)
- Header & cursor auto-hide during playback
- Back button, dark/light theme toggle
- Keyboard shortcuts for seek, volume, speed, fullscreen, open
- Picture-in-Picture (PiP)
- Drag & drop files into the window

## Supported Formats

### Natively Played
| Type | Formats |
|------|---------|
| Video | MP4, M4V, WebM, OGV |
| Video (H.264/H.265) | MOV, MKV, M2TS, MTS |
| Audio | MP3, M4A, AAC, OGG, WAV, FLAC, OPUS |
| Streaming | HLS (`.m3u8`), DASH (`.mpd`), YouTube |

> **Note:** MOV and MKV files play natively when they contain H.264 or H.265 (HEVC) video. Files encoded with unsupported codecs (e.g., AVI/WMV with older codecs) will show an error — no transcoding is performed.

> **HEVC on Windows:** Chromium uses Windows MediaFoundation for HEVC decoding. You must install **[HEVC Video Extensions](https://apps.microsoft.com/detail/9nmzlz57r3t7)** from Microsoft Store ($0.99) to play H.265 files (e.g., iPhone 4K MOV). macOS supports HEVC natively via VideoToolbox — no extra installation needed.

### YouTube
Paste any `youtube.com`, `youtu.be`, or playlist link into the URL box or drop it into the window. Playback uses the official iframe API via `videojs-youtube`. Privacy-enhanced mode (`youtube-nocookie.com`) is enabled by default.

## Stream Download

When playing an HLS, DASH, or direct HTTP stream, a download button (⬇) appears in the header. Click it to save the stream to disk.

| Protocol | How it works |
|----------|-------------|
| **HLS (m3u8)** | Parses master/media playlist → downloads all TS segments in parallel (5 threads) → supports AES-128 decryption → concatenates to `.ts` |
| **DASH (mpd)** | Parses MPD manifest → downloads fMP4 segments → concatenates to `.mp4` |
| **Direct URL** | Standard HTTP(S) download with real-time progress |

### Download Manager
- Slide-in panel on the right side — click the download button when a download is active to open it
- **Multiple concurrent downloads** supported
- Each download shows: filename, progress bar, speed, and status
- Three states: **Downloading** (cancel button), **Complete** (open-in-folder button), **Failed/Cancelled**
- Active download count badge on the download button

> **Note:** YouTube downloads are not supported. No FFmpeg or transcoding is used — downloads are pure binary segment concatenation.

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
- **Download stream:** when playing a remote stream, click the ⬇ button in the header to download
- **Download manager:** click the ⬇ button again (or when downloads are active) to open the download panel
- **Unsupported formats:** opening an incompatible file shows an error toast — no transcoding occurs
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
  main.js        — Electron main process: window, dialogs, local server, HEVC flag, download IPC
  preload.js     — Context bridge (window.electronAPI) for renderer
  index.html     — UI shell: header, welcome screen, player, download manager, overlays
  styles.css     — Theme, layout, animations, download manager panel
  renderer.js    — Video.js setup, format detection, hotkeys, download UI
  downloader.js  — Stream download engine: HLS, DASH, direct HTTP (no FFmpeg)
```

## Known Limitations

- Remote HLS/DASH streams require CORS support from the server
- YouTube playback requires an internet connection and uses the official iframe API
- YouTube downloads are not supported (use the official YouTube app)
- MOV/MKV files with non-H.264/H.265 codecs (e.g., AVI, WMV, FLV) are not supported and will show an error
- DASH downloads with separate audio/video tracks save video only (no muxing without FFmpeg)

## License

MIT — see [LICENSE](LICENSE)
