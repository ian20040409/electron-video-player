const { app, BrowserWindow, dialog, ipcMain, shell, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL, fileURLToPath } = require('url');

// Keep a global reference to the main window to avoid GC closing it.
let mainWindow;

const VIDEO_EXTS = new Set(['mp4','m4v','mov','webm','mkv','avi','wmv','flv']);

function isVideoFile(p) {
  if (!p || typeof p !== 'string') return false;
  const ext = path.extname(p).replace(/^\./,'').toLowerCase();
  return VIDEO_EXTS.has(ext);
}

function sendVideoToRenderer(filePath) {
  if (!filePath) return;
  const payload = {
    fileUrl: pathToFileURL(filePath).toString(),
    fileName: path.basename(filePath),
  };
  if (!mainWindow) return;
  const send = () => { try { mainWindow.webContents.send('video:selected', payload); } catch {} };
  if (mainWindow.webContents.isLoading()) {
    mainWindow.webContents.once('did-finish-load', send);
  } else {
    send();
  }
}

function resolveHtmlPath() {
  // Load local index.html in development and production.
  return path.join(__dirname, 'index.html');
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 720,
    autoHideMenuBar: true,
    title: 'Electron Video Player',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(resolveHtmlPath());
  mainWindow.setTitle('Electron Video Player');

  // Intercept navigation attempts (e.g., file drops that try to navigate)
  mainWindow.webContents.on('will-navigate', (event, url) => {
    try { event.preventDefault(); } catch {}
    try {
      if (url && url.startsWith('file://')) {
        const filePath = fileURLToPath(url);
        if (filePath) {
          mainWindow.webContents.send('video:selected', {
            fileUrl: pathToFileURL(filePath).toString(),
            fileName: path.basename(filePath),
          });
        }
      }
    } catch {}
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function handleOpenVideoDialog() {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Select a video file',
    properties: ['openFile'],
    filters: [
      {
        name: 'Video Files',
        extensions: [
          'mp4',
          'mov',
          'mkv',
          'webm',
          'avi',
          'm4v',
          'wmv',
          'flv',
        ],
      },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (canceled || filePaths.length === 0) {
    return null;
  }

  const absolutePath = filePaths[0];

  return {
    fileUrl: pathToFileURL(absolutePath).toString(),
    fileName: path.basename(absolutePath),
  };
}

// Ensure single instance so double-click opens in existing window
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv, _cwd) => {
    try {
      if (!mainWindow) return;
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      // On Windows/Linux, the file path is in argv
      const candidates = Array.isArray(argv) ? argv.slice(1) : [];
      for (let i = candidates.length - 1; i >= 0; i--) {
        const p = candidates[i];
        if (!p || p === '.' || p.startsWith('--')) continue;
        // Strip quotes if any
        const fp = p.replace(/^"|"$/g, '');
        if (isVideoFile(fp) && fs.existsSync(fp)) {
          sendVideoToRenderer(fp);
          break;
        }
      }
    } catch {}
  });
}

app.whenReady().then(() => {
  // Hide the default Electron application menu (File/Edit/View...)
  Menu.setApplicationMenu(null);

  // Set a CSP header so directives like frame-ancestors take effect
  try {
    const csp = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: file:",
      "media-src 'self' blob: file: http: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join('; ');
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const headers = details.responseHeaders || {};
      headers['Content-Security-Policy'] = [csp];
      callback({ responseHeaders: headers });
    });
  } catch {}

  createMainWindow();

  try { if (process.platform === 'win32') app.setAppUserModelId('com.lnu.electronvideoplayer'); } catch {}

  ipcMain.handle('dialog:open-video', handleOpenVideoDialog);
  // Notify renderer when window is maximized/unmaximized
  mainWindow.on('maximize', () => {
    if (mainWindow) mainWindow.webContents.send('window:maximized', true);
  });
  mainWindow.on('unmaximize', () => {
    if (mainWindow) mainWindow.webContents.send('window:maximized', false);
  });
  ipcMain.on('window:set-title', (_event, title) => {
    if (mainWindow && typeof title === 'string') {
      mainWindow.setTitle(title);
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });

  // Handle initial launch with a file path (Windows/Linux)
  try {
    const argv = process.argv || [];
    const candidates = argv.slice(1);
    for (let i = candidates.length - 1; i >= 0; i--) {
      const p = candidates[i];
      if (!p || p === '.' || p.startsWith('--')) continue;
      const fp = p.replace(/^"|"$/g, '');
      if (isVideoFile(fp) && fs.existsSync(fp)) {
        sendVideoToRenderer(fp);
        break;
      }
    }
  } catch {}
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Support drag-and-drop from finder on macOS.
app.on('open-file', (event, filePath) => {
  event.preventDefault();

  if (!mainWindow) {
    createMainWindow();
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.send('video:selected', {
        fileUrl: pathToFileURL(filePath).toString(),
        fileName: path.basename(filePath),
      });
    });
    return;
  }

  mainWindow.webContents.send('video:selected', {
    fileUrl: pathToFileURL(filePath).toString(),
    fileName: path.basename(filePath),
  });
});

// Open links in external browser.
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
});
