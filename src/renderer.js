const mimeByExtension = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  wmv: 'video/x-ms-wmv',
  flv: 'video/x-flv',
};

const fileNameLabel = document.getElementById('file-name');
const welcomeOpenButton = document.getElementById('welcome-open-file');
const urlInput = document.getElementById('url-input');
const urlPlayBtn = document.getElementById('url-play');
const urlPasteBtn = document.getElementById('url-paste');
const welcomeSection = document.getElementById('welcome');
const backBtn = document.getElementById('back-btn');
const headerEl = document.querySelector('.app-header');
const ambientVideo = document.getElementById('ambient-video');
const themeToggle = document.getElementById('theme-toggle');
const player = videojs('video-player', {
  fill: true,
  fluid: false,
  autoplay: false,
  controls: true,
  preload: 'auto',
  playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
  controlBar: {
    playbackRateMenuButton: true,
    volumePanel: {
      inline: false,
    },
  },
});
// Ensure player fills container for all sources
try { player.addClass('vjs-fill'); } catch {}

function guessMimeType(fileName) {
  if (!fileName) {
    return undefined;
  }

  const extension = fileName.split('.').pop().toLowerCase();
  return mimeByExtension[extension];
}

function isHlsUrl(u) {
  try {
    const url = new URL(u);
    const path = url.pathname.toLowerCase();
    return path.endsWith('.m3u8') || url.search.toLowerCase().includes('m3u8');
  } catch {
    return typeof u === 'string' && /\.m3u8(\?|$)/i.test(u);
  }
}

function buildSourceForUrl(u) {
  const type = isHlsUrl(u)
    ? 'application/x-mpegURL'
    : (u.toLowerCase().endsWith('.mp4') ? 'video/mp4' : undefined);
  return { src: u, type };
}

function loadVideo({ fileUrl, fileName }) {
  try { console.debug('[drop] loadVideo called:', { fileUrl, fileName }); } catch {}
  fileNameLabel.textContent = fileName || 'Unknown file';

  teardownAmbient();

  const source = {
    src: fileUrl,
    type: guessMimeType(fileName),
  };

  player.src(source);
  player.ready(() => {
    try { console.debug('[drop] player ready, attempting play'); } catch {}
    player.play().catch(() => {
      // Autoplay might be blocked - ignore and allow manual play.
    });
    // Recompute sizing when metadata is available
    try { player.one('loadedmetadata', () => { try { player.resize(); } catch {} }); } catch {}
  });
  rewireAmbientWhenReady();

  // Switch UI to player view
  try { console.debug('[drop] switching UI to player view'); } catch {}
  document.body.classList.add('has-video');
  if (welcomeSection) welcomeSection.setAttribute('aria-hidden', 'true');
  // Start header auto-hide timer once we have a video
  scheduleHeaderHide();
  // Update OS window title
  if (window.electronAPI?.setTitle) {
    window.electronAPI.setTitle(`${fileName} - Electron Video Player`);
  }
}

async function handleOpenFile() {
  try {
    const selectedFile = await window.electronAPI.openVideoFile();
    if (selectedFile) {
      loadVideo(selectedFile);
    }
  } catch (error) {
    console.error('Failed to open video file', error);
  }
}

if (welcomeOpenButton) {
  welcomeOpenButton.addEventListener('click', handleOpenFile);
}

function playFromUrlInput() {
  const value = (urlInput?.value || '').trim();
  if (!value) return;
  try {
    // Basic validation
    const u = new URL(value);
    if (!/^https?:$/i.test(u.protocol)) return;
  } catch {
    return;
  }
  const fileName = value.split(/[\/]/).pop() || value;
  const source = buildSourceForUrl(value);
  fileNameLabel.textContent = fileName;
  teardownAmbient();
  player.src(source);
  player.ready(() => {
    player.play().catch(() => {});
  });
  rewireAmbientWhenReady();

  document.body.classList.add('has-video');
  if (welcomeSection) welcomeSection.setAttribute('aria-hidden', 'true');
  scheduleHeaderHide();
  if (window.electronAPI?.setTitle) {
    window.electronAPI.setTitle(`${fileName} - Electron Video Player`);
  }
}

if (urlPlayBtn) {
  urlPlayBtn.addEventListener('click', playFromUrlInput);
}
if (urlInput) {
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      playFromUrlInput();
    }
  });
}

if (urlPasteBtn) {
  urlPasteBtn.addEventListener('click', async () => {
    if (!urlInput) return;
    let text = '';
    try {
      if (navigator.clipboard?.readText) {
        text = await navigator.clipboard.readText();
      }
    } catch (error) {
      console.error('Clipboard read failed', error);
    }

    if (!text && window.electronAPI?.readClipboard) {
      try {
        text = await window.electronAPI.readClipboard();
      } catch (error) {
        console.error('Electron clipboard read failed', error);
      }
    }

    if (typeof text === 'string' && text.trim()) {
      urlInput.value = text.trim();
      urlInput.focus();
    }
  });
}

if (backBtn) {
  backBtn.addEventListener('click', () => {
    try { player.pause(); } catch {}
    teardownAmbient();
    document.body.classList.remove('has-video');
    document.body.classList.remove('header-hidden');
  if (welcomeSection) welcomeSection.setAttribute('aria-hidden', 'false');
  fileNameLabel.textContent = 'No file selected';
  if (window.electronAPI?.setTitle) {
    window.electronAPI.setTitle('Electron Video Player');
  }
});
}

window.electronAPI.onVideoSelected((fileInfo) => {
  if (fileInfo) {
    loadVideo(fileInfo);
  }
});

// --- UI polish: theme toggle and drag-and-drop ---

// Theme persistence
function applyTheme(theme) {
  document.body.setAttribute('data-theme', theme);
  const isDark = theme === 'dark';
  themeToggle.setAttribute('aria-pressed', String(isDark));
  themeToggle.setAttribute('title', isDark ? 'Switch to light theme' : 'Switch to dark theme');
}

const prefersLight = (typeof window !== 'undefined' && typeof window.matchMedia === 'function')
  ? window.matchMedia('(prefers-color-scheme: light)').matches
  : false;
const savedTheme = localStorage.getItem('theme') || (prefersLight ? 'light' : 'dark');
applyTheme(savedTheme);

themeToggle.addEventListener('click', () => {
  const next = (document.body.getAttribute('data-theme') === 'dark') ? 'light' : 'dark';
  localStorage.setItem('theme', next);
  applyTheme(next);
});

// Ambient intensity: maximum by default (CSS handles fixed opacity)

// --- Drag and Drop --- 
const dragOverlay = document.getElementById('drag-overlay');

function processDropEvent(e) {
  // Always take ownership of the drop to prevent OS default handlers (e.g., Windows Media Player)
  e.preventDefault();
  e.stopPropagation();
  document.body.classList.remove('is-dragging');
  try { console.debug('[drop] event fired'); } catch {}

  const dt = e.dataTransfer;
  if (!dt) return false;
  const files = dt.files;
  try { console.debug('[drop] files length:', files ? files.length : 'n/a'); } catch {}

  // Files list path route (Explorer)
  if (files && files.length > 0) {
    const file = files[0];
    try { console.debug('[drop] first file:', { name: file?.name, path: file?.path }); } catch {}
    const filePath = (file && file.path) ? file.path : '';
    if (filePath) {
      let fileUrl = null;
      try { fileUrl = window.electronAPI?.toFileUrl?.(filePath) || null; } catch {}
      if (!fileUrl) {
        // Fallback: best-effort encoding for non-ASCII paths
        const raw = 'file:///' + filePath.replace(/\\/g, '/');
        fileUrl = encodeURI(raw);
      }
      const fileName = file.name || filePath.split(/[\\/]/).pop();
      loadVideo({ fileUrl, fileName });
      return true;
    }
  }

  // Items API fallback
  try {
    const items = dt.items ? Array.from(dt.items) : [];
    for (const item of items) {
      if (item.kind === 'file') {
        const f = item.getAsFile && item.getAsFile();
        if (f && f.path) {
          let fileUrl = null;
          try { fileUrl = window.electronAPI?.toFileUrl?.(f.path) || null; } catch {}
          if (!fileUrl) {
            const raw = 'file:///' + f.path.replace(/\\/g, '/');
            fileUrl = encodeURI(raw);
          }
          const fileName = f.name || f.path.split(/[\\/]/).pop();
          loadVideo({ fileUrl, fileName });
          return true;
        }
      }
    }
  } catch {}

  // Text/URL fallback
  try {
    const uri = dt.getData('text/uri-list') || dt.getData('text/plain');
    const val = (uri || '').trim();
    if (val) {
      const isFileUrl = /^file:\/\//i.test(val);
      if (isFileUrl) {
        const fileName = val.split(/[\\/]/).pop();
        try { console.debug('[drop] uri-list file url:', val); } catch {}
        loadVideo({ fileUrl: val, fileName });
        return true;
      }
      if (/^https?:\/\//i.test(val)) {
        const source = buildSourceForUrl(val);
        const fileName = val.split(/[\\/]/).pop() || val;
        try { console.debug('[drop] http(s) url:', val); } catch {}
        fileNameLabel.textContent = fileName;
        teardownAmbient();
        player.src(source);
        player.ready(() => { player.play().catch(() => {}); });
        rewireAmbientWhenReady();
        document.body.classList.add('has-video');
        if (welcomeSection) welcomeSection.setAttribute('aria-hidden', 'true');
        scheduleHeaderHide();
        if (window.electronAPI?.setTitle) {
          window.electronAPI.setTitle(`${fileName} - Electron Video Player`);
        }
        return true;
      }
    }
  } catch {}
  // Not handled here: allow Chromium to navigate so main process will intercept
  return false;
}

function onDragEnter(e) { e.preventDefault(); e.stopPropagation(); document.body.classList.add('is-dragging'); }
function onDragOver(e) { e.preventDefault(); e.stopPropagation(); try { if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; } catch {} document.body.classList.add('is-dragging'); }
function onDragLeave(e) { e.preventDefault(); e.stopPropagation(); document.body.classList.remove('is-dragging'); }

// Attach listeners broadly to capture drop regardless of target
try {
  window.addEventListener('dragenter', onDragEnter, { capture: true });
  window.addEventListener('dragover', onDragOver, { capture: true });
  window.addEventListener('dragleave', onDragLeave, { capture: true });
  window.addEventListener('drop', processDropEvent, { capture: true });

  document.addEventListener('dragenter', onDragEnter, { capture: true });
  document.addEventListener('dragover', onDragOver, { capture: true });
  document.addEventListener('dragleave', onDragLeave, { capture: true });
  document.addEventListener('drop', processDropEvent, { capture: true });

  const playerContainer = document.querySelector('.player-container');
  if (playerContainer) {
    playerContainer.addEventListener('dragover', onDragOver, { capture: true });
    playerContainer.addEventListener('drop', processDropEvent, { capture: true });
  }

  if (welcomeSection) {
    welcomeSection.addEventListener('dragover', onDragOver, { capture: true });
    welcomeSection.addEventListener('drop', processDropEvent, { capture: true });
  }
} catch {}

// --- Header auto-hide while playing ---
let headerHideTimer;

function revealHeader() {
  document.body.classList.remove('header-hidden');
  scheduleHeaderHide();
}

function scheduleHeaderHide() {
  clearTimeout(headerHideTimer);
  // Only hide header if a video is loaded and playing
  const shouldHide = document.body.classList.contains('has-video') && !player.paused();
  if (!shouldHide) return;
  headerHideTimer = setTimeout(() => {
    const stillHide = document.body.classList.contains('has-video') && !player.paused();
    if (stillHide) document.body.classList.add('header-hidden');
  }, 1800);
}

// Show header on user interaction
['mousemove', 'keydown', 'pointerdown', 'touchstart'].forEach((evt) => {
  window.addEventListener(evt, () => {
    if (!document.body.classList.contains('has-video')) return;
    revealHeader();
  }, { passive: true });
});

// Tie into player state
player.on('play', () => { scheduleHeaderHide(); ambientVideo?.play?.().catch(()=>{}); });
player.on('pause', () => { document.body.classList.remove('header-hidden'); ambientVideo?.pause?.(); });
player.on('ended', () => { document.body.classList.remove('header-hidden'); ambientVideo?.pause?.(); });

player.on('fullscreenchange', () => {
  const isFs = player.isFullscreen && player.isFullscreen();
  document.body.classList.toggle('is-fullscreen', !!isFs);
  if (!isFs) {
    document.body.classList.remove('header-hidden');
  }
  scheduleHeaderHide();
});

// --- Ambient overlay: mirror the playing video with blur
function rewireAmbientWhenReady() {
  const wire = () => wireAmbientToPlayer();
  try {
    player.one('loadedmetadata', wire);
  } catch {
    player.one('loadedmetadata', wire);
  }
  setTimeout(() => {
    try {
      if (player.readyState && player.readyState() >= 1) {
        wire();
      }
    } catch {}
  }, 0);
}

function wireAmbientToPlayer() {
  if (!ambientVideo) return;
  try {
    const videoEl = player?.el()?.querySelector('video');
    if (!videoEl) return;
    if (typeof videoEl.captureStream === 'function') {
      const stream = videoEl.captureStream();
      ambientVideo.srcObject = stream;
      ambientVideo.muted = true;
      ambientVideo.playbackRate = player.playbackRate();
      ambientVideo.play().catch(() => {});
    } else {
      const source = player.currentSource?.() || {};
      if (source.src) {
        ambientVideo.src = source.src;
        ambientVideo.muted = true;
        ambientVideo.currentTime = player.currentTime();
        ambientVideo.playbackRate = player.playbackRate();
        ambientVideo.play().catch(() => {});
      }
    }
  } catch {}
}

function teardownAmbient() {
  if (!ambientVideo) return;
  try {
    const tracks = ambientVideo.srcObject?.getTracks?.();
    if (tracks && Array.isArray(tracks)) {
      tracks.forEach((track) => track.stop?.());
    }
    ambientVideo.pause();
    ambientVideo.removeAttribute('src');
    ambientVideo.srcObject = null;
    ambientVideo.load();
  } catch {}
}

player.on('ratechange', () => {
  if (ambientVideo) ambientVideo.playbackRate = player.playbackRate();
});

// Double-click to toggle fullscreen
try {
  player.el().addEventListener('dblclick', () => toggleFullscreen());
} catch {}

// --- Keyboard shortcuts (seek, volume, speed, fullscreen, open) ---

function isEditableTarget(el) {
  const tag = el.tagName;
  const editable = el.isContentEditable;
  return editable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function togglePlayPause() {
  if (player.paused()) player.play(); else player.pause();
}

function seekBy(delta) {
  const t = clamp(player.currentTime() + delta, 0, player.duration() || Infinity);
  player.currentTime(t);
}

function changeVolume(delta) {
  const v = clamp(player.volume() + delta, 0, 1);
  player.volume(v);
  if (v > 0 && player.muted()) player.muted(false);
}

function changeSpeed(delta) {
  const r = clamp(player.playbackRate() + delta, 0.25, 4);
  player.playbackRate(r);
}

function resetSpeed() { player.playbackRate(1); }

function toggleFullscreen() {
  if (player.isFullscreen && player.isFullscreen()) {
    player.exitFullscreen();
  } else {
    player.requestFullscreen();
  }
}

window.addEventListener('keydown', (e) => {
  // Ignore when typing in fields
  if (isEditableTarget(e.target)) return;

  const key = e.key;
  const ctrlMeta = e.ctrlKey || e.metaKey;
  const shift = e.shiftKey;

  // Reveal header on interaction
  revealHeader();

  switch (key) {
    case ' ': // Space toggle
    case 'k':
    case 'K':
      e.preventDefault();
      togglePlayPause();
      break;
    case 'ArrowRight':
      e.preventDefault();
      seekBy(ctrlMeta ? 30 : shift ? 10 : 5);
      break;
    case 'ArrowLeft':
      e.preventDefault();
      seekBy(-(ctrlMeta ? 30 : shift ? 10 : 5));
      break;
    case 'ArrowUp':
      e.preventDefault();
      changeVolume(0.05);
      break;
    case 'ArrowDown':
      e.preventDefault();
      changeVolume(-0.05);
      break;
    case 'm': case 'M':
      e.preventDefault();
      player.muted(!player.muted());
      break;
    case '[':
      e.preventDefault();
      changeSpeed(-0.25);
      break;
    case ']':
      e.preventDefault();
      changeSpeed(0.25);
      break;
    case '0':
    case 'O': // fallthrough allows Shift+o on some layouts
      if (key === '0') { e.preventDefault(); resetSpeed(); }
      break;
    case '=': // plus/equal increases speed
    case '+':
      e.preventDefault();
      changeSpeed(0.25);
      break;
    case '-':
    case '_':
      e.preventDefault();
      changeSpeed(-0.25);
      break;
    case 'f': case 'F':
      e.preventDefault();
      toggleFullscreen();
      break;
    case 'o': case 'O': // Open file from anywhere
      e.preventDefault();
      handleOpenFile();
      break;
    case 'l': case 'L': // Focus URL input (like browsers)
      if (urlInput && !document.body.classList.contains('has-video')) {
        e.preventDefault();
        urlInput.focus();
        try { urlInput.select(); } catch {}
      }
      break;
    case 'Home':
      e.preventDefault();
      seekBy(-Infinity);
      break;
    case 'End':
      e.preventDefault();
      seekBy(Infinity);
      break;
    case '1': case '2': case '3': case '4': case '5':
    case '6': case '7': case '8': case '9': {
      e.preventDefault();
      const n = Number(key);
      const frac = n / 10; // 0.1 to 0.9
      const dur = player.duration() || 0;
      if (dur > 0) player.currentTime(dur * frac);
      break;
    }
    default:
      return;
  }
}, { passive: false });


// Maximize awareness: shrink player to show more ambient glow when maximized
function detectMaximizedHeuristic() {
  try {
    const max = Math.abs(window.outerWidth - screen.availWidth) < 2 && Math.abs(window.outerHeight - screen.availHeight) < 2;
    document.body.classList.toggle('is-maximized', !!max);
  } catch {}
}

window.addEventListener('resize', detectMaximizedHeuristic);
// Initial detection
setTimeout(detectMaximizedHeuristic, 0);

if (window.electronAPI && typeof window.electronAPI.onWindowMaximized === 'function') {
  window.electronAPI.onWindowMaximized((isMax) => {
    document.body.classList.toggle('is-maximized', !!isMax);
  });
}
// Resize on window changes to keep fit behavior consistent
try { window.addEventListener('resize', () => { try { player.resize(); } catch {} }); } catch {}
