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
  controlBar: { playbackRateMenuButton: true },
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
  fileNameLabel.textContent = fileName || 'Unknown file';

  teardownAmbient();

  const source = {
    src: fileUrl,
    type: guessMimeType(fileName),
  };

  player.src(source);
  player.ready(() => {
    player.play().catch(() => {
      // Autoplay might be blocked - ignore and allow manual play.
    });
    // Recompute sizing when metadata is available
    try { player.one('loadedmetadata', () => { try { player.resize(); } catch {} }); } catch {}
  });
  rewireAmbientWhenReady();

  // Switch UI to player view
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

if (backBtn) {
  backBtn.addEventListener('click', () => {
    try { player.pause(); } catch {}
    teardownAmbient();
    document.body.classList.remove('has-video');
    document.body.classList.remove('header-hidden');
    if (welcomeSection) welcomeSection.setAttribute('aria-hidden', 'false');
    fileNameLabel.textContent = 'No file selected';
    if (window.electronAPI?.setTitle) {
    window.electronAPI.setTitle(`${fileName} - Electron Video Player`);
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

window.addEventListener('dragenter', (e) => {
  e.preventDefault();
  document.body.classList.add('is-dragging');
});

window.addEventListener('dragover', (e) => {
  e.preventDefault();
  document.body.classList.add('is-dragging');
});

window.addEventListener('dragleave', (e) => {
  e.preventDefault();
  document.body.classList.remove('is-dragging');
});

window.addEventListener('drop', (e) => {
  e.preventDefault();
  document.body.classList.remove('is-dragging');

  const files = e.dataTransfer.files;
  if (files.length > 0) {
    const file = files[0];
    const fileUrl = 'file:///' + file.path.replace(/\\/g, '/');
    const fileName = file.name;

    if (guessMimeType(fileName)) {
      loadVideo({ fileUrl, fileName });
    }
  }
});

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
