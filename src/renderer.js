const mimeByExtension = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  flac: 'audio/flac',
  opus: 'audio/ogg',
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
const downloadBtn = document.getElementById('download-btn');
const dlManager = document.getElementById('dl-manager');
const dlManagerList = document.getElementById('dl-manager-list');
const dlManagerClose = document.getElementById('dl-manager-close');
const successToast = document.getElementById('success-toast');
const successToastMsg = document.getElementById('success-toast-msg');

// --- Stream download tracking ---
let currentStreamUrl = null;
let currentStreamType = null; // 'hls' | 'dash' | 'direct' | null
const downloads = new Map(); // id → { fileName, percent, status, path }

const appOrigin = (() => {
  try {
    if (window?.location?.protocol?.startsWith('http')) {
      return `${window.location.protocol}//${window.location.host}`;
    }
  } catch {}
  return 'https://localhost';
})();

const player = videojs('video-player', {
  fill: true,
  fluid: false,
  autoplay: false,
  controls: true,
  preload: 'auto',
  techOrder: ['html5', 'youtube'],
  youtube: {
    iv_load_policy: 3,
    modestbranding: 1,
    rel: 0,
    playsinline: 1,
    enablePrivacyEnhancedMode: true,
    customVars: {
      origin: appOrigin,
    },
  },
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

// --- Error toast ---
const errorToast = document.getElementById('error-toast');
const errorToastMsg = document.getElementById('error-toast-msg');
let errorToastTimer;

function showError(message) {
  if (!errorToast || !errorToastMsg) return;
  errorToastMsg.textContent = message;
  errorToast.setAttribute('aria-hidden', 'false');
  errorToast.classList.add('visible');
  clearTimeout(errorToastTimer);
  const duration = message.length > 80 ? 7000 : 4500;
  errorToastTimer = setTimeout(() => {
    errorToast.classList.remove('visible');
    errorToast.setAttribute('aria-hidden', 'true');
  }, duration);
}

player.on('error', () => {
  try {
    const err = player.error();
    const code = err && err.code;
    const currentSrc = player.currentSource?.()?.src || '';
    const fileName = fileNameLabel?.textContent || '';
    const isHevcFile = /\.(mov|mkv|m2ts|mts)$/i.test(fileName) || /\.(mov|mkv|m2ts|mts)/i.test(currentSrc);

    let msg;
    if (code === 3 && isHevcFile) {
      msg = 'HEVC decoding failed — install "HEVC Video Extensions" from Microsoft Store ($0.99) to enable H.265 playback.';
    } else if (code === 4 && isHevcFile) {
      msg = 'Cannot play this HEVC file — install "HEVC Video Extensions" from Microsoft Store to enable H.265 support.';
    } else {
      const messages = {
        1: 'Playback aborted.',
        2: 'Network error — check your connection or URL.',
        3: 'Decoding error — the file may be corrupted or uses an unsupported codec.',
        4: 'Unsupported format or source not found.',
      };
      msg = (code && messages[code]) || (err && err.message) || 'Failed to load media.';
    }
    showError(msg);
  } catch {
    showError('Failed to load media.');
  }
});

// --- Success toast ---
let successToastTimer;
function showSuccess(message) {
  if (!successToast || !successToastMsg) return;
  successToastMsg.textContent = message;
  successToast.setAttribute('aria-hidden', 'false');
  successToast.classList.add('visible');
  clearTimeout(successToastTimer);
  successToastTimer = setTimeout(() => {
    successToast.classList.remove('visible');
    successToast.setAttribute('aria-hidden', 'true');
  }, 4500);
}

// --- Download Manager ---
function detectStreamType(url) {
  if (!url || typeof url !== 'string') return null;
  if (isHlsUrl(url)) return 'hls';
  if (isDashUrl(url)) return 'dash';
  if (isYouTubeUrl(url)) return null;
  if (/^https?:\/\//i.test(url)) return 'direct';
  return null;
}

function updateDownloadBtn(url) {
  currentStreamUrl = url || null;
  currentStreamType = detectStreamType(url);
  if (downloadBtn) {
    downloadBtn.style.display = currentStreamType ? '' : 'none';
  }
}

function updateBadge() {
  if (!downloadBtn) return;
  let badge = downloadBtn.querySelector('.download-badge');
  const activeCount = [...downloads.values()].filter((d) => d.status === 'downloading').length;
  if (activeCount > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'download-badge';
      downloadBtn.appendChild(badge);
    }
    badge.textContent = activeCount;
  } else if (badge) {
    badge.remove();
  }
}

function toggleDlManager(forceOpen) {
  if (!dlManager) return;
  const shouldOpen = forceOpen != null ? forceOpen : !dlManager.classList.contains('open');
  dlManager.classList.toggle('open', shouldOpen);
  dlManager.setAttribute('aria-hidden', String(!shouldOpen));
}

function renderDlItem(id) {
  const d = downloads.get(id);
  if (!d) return;
  let el = dlManagerList?.querySelector(`[data-dl-id="${id}"]`);
  if (!el) {
    // Remove empty message
    const empty = dlManagerList?.querySelector('.dl-manager-empty');
    if (empty) empty.remove();

    el = document.createElement('div');
    el.className = 'dl-item';
    el.dataset.dlId = id;
    el.innerHTML = `
      <div class="dl-item-top">
        <div class="dl-item-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></div>
        <div class="dl-item-info">
          <div class="dl-item-name" title="${d.fileName}">${d.fileName}</div>
          <div class="dl-item-status">Preparing…</div>
        </div>
        <div class="dl-item-actions"></div>
      </div>
      <div class="dl-item-bar"><div class="dl-item-bar-fill"></div></div>`;
    dlManagerList?.prepend(el);
  }

  const icon = el.querySelector('.dl-item-icon');
  const status = el.querySelector('.dl-item-status');
  const barFill = el.querySelector('.dl-item-bar-fill');
  const actions = el.querySelector('.dl-item-actions');

  if (d.status === 'downloading') {
    icon.className = 'dl-item-icon';
    const speedSuffix = d.speed ? ` · ${d.speed}` : '';
    status.textContent = (d.label || `${d.percent || 0}%`) + speedSuffix;
    if (barFill) { barFill.style.width = (d.percent || 0) + '%'; barFill.className = 'dl-item-bar-fill'; }
    actions.innerHTML = `<button class="dl-cancel-btn" title="Cancel"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
    actions.querySelector('.dl-cancel-btn').onclick = () => {
      window.electronAPI.cancelDownload(id);
      d.status = 'cancelled';
      d.label = 'Cancelled';
      renderDlItem(id);
      updateBadge();
    };
  } else if (d.status === 'complete') {
    icon.className = 'dl-item-icon complete';
    icon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    status.textContent = 'Complete';
    if (barFill) { barFill.style.width = '100%'; barFill.className = 'dl-item-bar-fill complete'; }
    actions.innerHTML = `<button class="dl-open-btn" title="Show in folder"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></button>`;
    actions.querySelector('.dl-open-btn').onclick = () => {
      window.electronAPI.openDownloadedFile(d.path);
    };
  } else if (d.status === 'error' || d.status === 'cancelled') {
    icon.className = 'dl-item-icon error';
    icon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
    status.textContent = d.status === 'cancelled' ? 'Cancelled' : (d.message || 'Failed');
    if (barFill) { barFill.style.width = '100%'; barFill.className = 'dl-item-bar-fill error'; }
    actions.innerHTML = '';
  }
}

// Download button: first click starts download, long-press / second click opens manager
if (downloadBtn) {
  downloadBtn.addEventListener('click', async (e) => {
    // If there are active downloads, toggle manager panel
    const hasActive = [...downloads.values()].some((d) => d.status === 'downloading');
    if (hasActive || !currentStreamUrl || !currentStreamType) {
      toggleDlManager();
      return;
    }
    // Start new download
    const result = await window.electronAPI.startDownload({
      url: currentStreamUrl,
      type: currentStreamType,
    });
    if (result?.cancelled) return;
    if (result?.error) { showError(result.error); return; }
    if (result?.started && result.id) {
      downloads.set(result.id, {
        fileName: result.fileName || 'download',
        percent: 0,
        status: 'downloading',
        label: 'Starting…',
        speed: '',
        path: '',
      });
      renderDlItem(result.id);
      updateBadge();
      toggleDlManager(true);
    }
  });
}

// Close manager
if (dlManagerClose) {
  dlManagerClose.addEventListener('click', () => toggleDlManager(false));
}

// Download progress
if (window.electronAPI?.onDownloadProgress) {
  window.electronAPI.onDownloadProgress((data) => {
    const d = downloads.get(data.id);
    if (!d) return;
    d.percent = data.percent || 0;
    d.label = data.label || '';
    d.speed = data.speed || '';
    d.status = 'downloading';
    renderDlItem(data.id);
  });
}

// Download complete
if (window.electronAPI?.onDownloadComplete) {
  window.electronAPI.onDownloadComplete((data) => {
    const d = downloads.get(data.id);
    if (d) {
      d.status = 'complete';
      d.percent = 100;
      d.path = data.path || '';
      renderDlItem(data.id);
      updateBadge();
    }
    showSuccess(`Download complete: ${data.fileName || ''}`);
  });
}

// Download error
if (window.electronAPI?.onDownloadError) {
  window.electronAPI.onDownloadError((data) => {
    const d = downloads.get(data.id);
    if (d) {
      d.status = 'error';
      d.message = data.message || 'Unknown error';
      renderDlItem(data.id);
      updateBadge();
    }
    showError(`Download failed: ${data.message || 'Unknown error'}`);
  });
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

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

function isDashUrl(u) {
  try {
    const url = new URL(u);
    const path = url.pathname.toLowerCase();
    return path.endsWith('.mpd') || url.search.toLowerCase().includes('.mpd');
  } catch {
    return typeof u === 'string' && /\.mpd(\?|$)/i.test(u);
  }
}

function isYouTubeUrl(u) {
  try {
    const url = new URL(u);
    const host = url.hostname.toLowerCase();
    return host === 'youtu.be'
      || host.endsWith('.youtube.com')
      || host === 'youtube.com'
      || host === 'youtube-nocookie.com'
      || host.endsWith('.youtube-nocookie.com');
  } catch {
    return false;
  }
}

function extractYouTubeId(u) {
  try {
    const url = new URL(u);
    const host = url.hostname.toLowerCase();
    if (host === 'youtu.be') {
      return url.pathname.replace(/^\//, '').split('/')[0] || null;
    }
    if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      if (url.pathname.startsWith('/watch')) {
        return url.searchParams.get('v');
      }
      if (url.pathname.startsWith('/embed/') || url.pathname.startsWith('/shorts/')) {
        return url.pathname.split('/')[2] || null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function normalizeYouTubeUrl(u) {
  try {
    const url = new URL(u);
    url.protocol = 'https:';
    if (url.hostname.toLowerCase() === 'youtu.be') {
      const id = url.pathname.replace(/^\//, '').split('/')[0];
      if (id) {
        const params = new URLSearchParams(url.search);
        const suffix = params.toString();
        return `https://www.youtube.com/watch?v=${id}${suffix ? `&${suffix}` : ''}`;
      }
    }
    return url.toString();
  } catch {
    return u;
  }
}

function buildSourceForUrl(u) {
  if (isYouTubeUrl(u)) {
    const normalized = normalizeYouTubeUrl(u);
    return { src: normalized, type: 'video/youtube' };
  }

  const lower = (typeof u === 'string') ? u.toLowerCase() : '';
  let type;
  if (isHlsUrl(u)) {
    type = 'application/x-mpegURL';
  } else if (isDashUrl(u)) {
    type = 'application/dash+xml';
  } else {
    const extMatch = lower.match(/\.([a-z0-9]+)(?:(?:\?|#).*)?$/);
    if (extMatch) {
      type = mimeByExtension[extMatch[1]];
    }
  }
  return { src: u, type };
}

function formatSourceLabel(source, fallback) {
  if (!source) {
    return fallback || 'Unknown source';
  }
  if (source.type === 'video/youtube') {
    const id = extractYouTubeId(source.src || '') || '';
    return id ? `YouTube (${id})` : 'YouTube Video';
  }
  return fallback || source.src || 'Unknown source';
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
    window.electronAPI.setTitle(`${fileName} - LNU Player`);
  }
  // Local files: hide download button
  updateDownloadBtn(null);
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
  const source = buildSourceForUrl(value);
  const fallbackLabel = value.split(/[\/]/).pop() || value;
  const label = formatSourceLabel(source, fallbackLabel);
  fileNameLabel.textContent = label;
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
    window.electronAPI.setTitle(`${label} - LNU Player`);
  }
  updateDownloadBtn(value);
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
      window.electronAPI.setTitle('LNU Player');
    }
    updateDownloadBtn(null);
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

async function processDropEvent(e) {
  // Always take ownership of the drop to prevent OS default handlers (e.g., Windows Media Player)
  e.preventDefault();
  e.stopPropagation();
  document.body.classList.remove('is-dragging');

  const dt = e.dataTransfer;
  if (!dt) return false;
  const files = dt.files;

  // Files list path route (Explorer)
  if (files && files.length > 0) {
    const file = files[0];
    const filePath = (file && file.path) ? file.path : '';
    if (filePath) {
      let fileUrl = null;
      try { fileUrl = await window.electronAPI?.toFileUrl?.(filePath); } catch {}
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
          try { fileUrl = await window.electronAPI?.toFileUrl?.(f.path); } catch {}
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
        loadVideo({ fileUrl: val, fileName });
        return true;
      }
      if (/^https?:\/\//i.test(val)) {
        const source = buildSourceForUrl(val);
        const fallbackLabel = val.split(/[\\/]/).pop() || val;
        const label = formatSourceLabel(source, fallbackLabel);
        fileNameLabel.textContent = label;
        teardownAmbient();
        player.src(source);
        player.ready(() => { player.play().catch(() => {}); });
        rewireAmbientWhenReady();
        document.body.classList.add('has-video');
        if (welcomeSection) welcomeSection.setAttribute('aria-hidden', 'true');
        scheduleHeaderHide();
        if (window.electronAPI?.setTitle) {
          window.electronAPI.setTitle(`${label} - LNU Player`);
        }
        updateDownloadBtn(val);
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

// --- Header auto-hide & cursor hide while playing ---
let headerHideTimer;
let cursorHideTimer;
const playerEl = player.el();

function revealCursor() {
  clearTimeout(cursorHideTimer);
  if (playerEl) playerEl.classList.remove('cursor-hidden');
  scheduleCursorHide();
}

function scheduleCursorHide() {
  clearTimeout(cursorHideTimer);
  const shouldHide = document.body.classList.contains('has-video') && !player.paused();
  if (!shouldHide) return;
  cursorHideTimer = setTimeout(() => {
    const stillHide = document.body.classList.contains('has-video') && !player.paused();
    if (stillHide && playerEl) playerEl.classList.add('cursor-hidden');
  }, 2000);
}

function revealHeader() {
  document.body.classList.remove('header-hidden');
  revealCursor();
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

// Show header/cursor on user interaction
['mousemove', 'keydown', 'pointerdown', 'touchstart'].forEach((evt) => {
  window.addEventListener(evt, () => {
    if (!document.body.classList.contains('has-video')) return;
    revealHeader();
  }, { passive: true });
});

// Also listen on the player element for mousemove in fullscreen
// (fullscreen top-layer may not bubble to window)
if (playerEl) {
  playerEl.addEventListener('mousemove', () => {
    if (!document.body.classList.contains('has-video')) return;
    revealHeader();
  }, { passive: true });
}

// Volume persistence
try {
  const savedVolume = localStorage.getItem('volume');
  const savedMuted = localStorage.getItem('muted');
  if (savedVolume !== null) player.volume(parseFloat(savedVolume));
  if (savedMuted !== null) player.muted(savedMuted === 'true');
} catch {}

player.on('volumechange', () => {
  try {
    localStorage.setItem('volume', player.volume());
    localStorage.setItem('muted', player.muted());
  } catch {}
});

// Tie into player state
player.on('play', () => { scheduleHeaderHide(); scheduleCursorHide(); ambientVideo?.play?.().catch(()=>{}); });
player.on('pause', () => { document.body.classList.remove('header-hidden'); revealCursor(); ambientVideo?.pause?.(); });
player.on('ended', () => { document.body.classList.remove('header-hidden'); revealCursor(); ambientVideo?.pause?.(); });

player.on('fullscreenchange', () => {
  const isFs = player.isFullscreen && player.isFullscreen();
  document.body.classList.toggle('is-fullscreen', !!isFs);
  if (!isFs) {
    document.body.classList.remove('header-hidden');
  }
  revealCursor();
  scheduleHeaderHide();
});

// --- Ambient overlay: mirror the playing video with blur
function rewireAmbientWhenReady() {
  try {
    const currentType = player.currentType?.();
    if (currentType === 'video/youtube') {
      return;
    }
    const srcType = player.currentSource?.()?.type;
    if (srcType === 'video/youtube') {
      return;
    }
  } catch {}

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
    const type = player.currentType?.();
    if (type === 'video/youtube') {
      return;
    }
  } catch {}
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
