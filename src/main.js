const { app, BrowserWindow, dialog, ipcMain, shell, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL, fileURLToPath } = require('url');
const http = require('http');

// Keep a global reference to the main window to avoid GC closing it.
let mainWindow;
let staticServer;
let staticServerPort;

const ROOT_DIR = path.resolve(__dirname, '..');
const MIME_BY_EXT = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mjs': 'application/javascript; charset=utf-8',
  '.m3u8': 'application/x-mpegURL',
  '.ts': 'video/mp2t',
  '.m4a': 'audio/mp4',
};

function guessMimeForPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_BY_EXT[ext] || 'application/octet-stream';
}

async function ensureStaticServer() {
  if (staticServerPort) {
    return staticServerPort;
  }

  staticServer = http.createServer((req, res) => {
    try {
      const requestUrl = new URL(req.url, 'http://127.0.0.1');
      let pathname = decodeURIComponent(requestUrl.pathname);
      if (!pathname || pathname === '/') {
        pathname = '/src/index.html';
      } else if (pathname.endsWith('/')) {
        pathname += 'index.html';
      }

      if (pathname.startsWith('/__file')) {
        const targetPath = requestUrl.searchParams.get('p') || '';
        if (!targetPath || !path.isAbsolute(targetPath)) {
          res.writeHead(400);
          res.end('Missing path');
          return;
        }

        fs.stat(targetPath, (statErr, stats) => {
          if (statErr || !stats.isFile()) {
            res.writeHead(404);
            res.end('Not found');
            return;
          }

          const total = stats.size;
          const rangeHeader = req.headers.range;
          res.setHeader('Accept-Ranges', 'bytes');
          const contentType = guessMimeForPath(targetPath);

          if (req.method === 'HEAD') {
            res.writeHead(200, {
              'Content-Length': total,
              'Content-Type': contentType,
            });
            res.end();
            return;
          }

          if (rangeHeader) {
            const rangeMatch = rangeHeader.match(/bytes=(\d*)-(\d*)/);
            if (rangeMatch) {
              let start = rangeMatch[1] ? parseInt(rangeMatch[1], 10) : 0;
              let end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : total - 1;
              if (Number.isNaN(start)) start = 0;
              if (Number.isNaN(end) || end >= total) end = total - 1;
              if (start > end) {
                res.writeHead(416, {
                  'Content-Range': `bytes */${total}`,
                });
                res.end();
                return;
              }
              res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${total}`,
                'Content-Length': end - start + 1,
                'Content-Type': contentType,
              });
              const stream = fs.createReadStream(targetPath, { start, end });
              stream.on('error', () => {
                if (!res.headersSent) {
                  res.writeHead(500);
                }
                res.end();
              });
              stream.pipe(res);
              return;
            }
          }

          res.writeHead(200, {
            'Content-Length': total,
            'Content-Type': contentType,
          });
          const stream = fs.createReadStream(targetPath);
          stream.on('error', () => {
            if (!res.headersSent) {
              res.writeHead(500);
            }
            res.end();
          });
          stream.pipe(res);
        });
        return;
      }

      const filePath = path.join(ROOT_DIR, pathname.replace(/^\//, ''));
      if (!filePath.startsWith(ROOT_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      fs.readFile(filePath, (err, data) => {
        if (err) {
          if (err.code === 'ENOENT') {
            res.writeHead(404);
            res.end('Not found');
          } else {
            res.writeHead(500);
            res.end('Server error');
          }
          return;
        }
        res.setHeader('Content-Type', guessMimeForPath(filePath));
        res.setHeader('Cache-Control', 'no-store');
        res.end(data);
      });
    } catch (error) {
      res.writeHead(500);
      res.end('Server error');
    }
  });

  await new Promise((resolve, reject) => {
    staticServer.listen(0, '127.0.0.1', () => {
      const addressInfo = staticServer.address();
      staticServerPort = addressInfo && addressInfo.port;
      resolve();
    });
    staticServer.on('error', reject);
  });

  return staticServerPort;
}

const VIDEO_EXTS = new Set(['mp4','m4v','mov','webm','mkv','avi','wmv','flv']);

function isVideoFile(p) {
  if (!p || typeof p !== 'string') return false;
  const ext = path.extname(p).replace(/^\./,'').toLowerCase();
  return VIDEO_EXTS.has(ext);
}

async function sendVideoToRenderer(filePath) {
  if (!filePath) return;
  const payload = {
    fileUrl: await buildServedFileUrl(filePath),
    fileName: path.basename(filePath),
    localPath: filePath,
  };
  if (!mainWindow) return;
  const send = () => { try { mainWindow.webContents.send('video:selected', payload); } catch {} };
  if (mainWindow.webContents.isLoading()) {
    mainWindow.webContents.once('did-finish-load', send);
  } else {
    send();
  }
}

async function resolveEntryUrl() {
  try {
    const port = await ensureStaticServer();
    return `http://127.0.0.1:${port}/src/index.html`;
  } catch (error) {
    // Fallback to file protocol if the server fails (e.g., permissions)
    return path.join(__dirname, 'index.html');
  }
}

async function buildServedFileUrl(absolutePath) {
  if (!absolutePath || typeof absolutePath !== 'string') {
    return null;
  }
  try {
    const port = await ensureStaticServer();
    if (port) {
      const origin = `http://127.0.0.1:${port}`;
      const url = new URL('/__file', origin);
      url.searchParams.set('p', absolutePath);
      return url.toString();
    }
  } catch {}
  try {
    return pathToFileURL(absolutePath).toString();
  } catch {
    return null;
  }
}

async function createMainWindow() {
  const iconFile = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  const iconPath = path.join(__dirname, '..', 'build', iconFile);
  const windowOptions = {
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
  };

  if (process.platform !== 'darwin') {
    windowOptions.icon = iconPath;
  }

  mainWindow = new BrowserWindow(windowOptions);

  const entryUrl = await resolveEntryUrl();
  if (entryUrl.startsWith('http')) {
    mainWindow.loadURL(entryUrl);
  } else {
    mainWindow.loadFile(entryUrl);
  }
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
    fileUrl: await buildServedFileUrl(absolutePath),
    fileName: path.basename(absolutePath),
    localPath: absolutePath,
  };
}

// Ensure single instance so double-click opens in existing window
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', async (_event, argv, _cwd) => {
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
          await sendVideoToRenderer(fp);
          break;
        }
      }
    } catch {}
  });
}

app.whenReady().then(async () => {
  // Hide the default Electron application menu (File/Edit/View...)
  Menu.setApplicationMenu(null);

  // Set a CSP header so directives like frame-ancestors take effect
  try {
    const csp = [
      "default-src 'self'",
      "script-src 'self' https://www.youtube.com https://s.ytimg.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: file: https://*.ytimg.com",
      "media-src 'self' blob: file: http: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "worker-src 'self' blob:",
      "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://*.youtube.com",
      "child-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://*.youtube.com",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join('; ');
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      try {
        const requestUrl = details.url || '';
        const isLocal = requestUrl.startsWith('file://')
          || requestUrl.startsWith('app://')
          || requestUrl.startsWith('http://127.0.0.1:')
          || requestUrl.startsWith('http://localhost:');
        if (!isLocal) {
          callback({ responseHeaders: details.responseHeaders });
          return;
        }

        // Only enforce our CSP on local app assets so we don't clobber
        // third-party responses (e.g., YouTube iframe) that ship their own policies.
        const headers = details.responseHeaders || {};
        headers['Content-Security-Policy'] = [csp];
        callback({ responseHeaders: headers });
      } catch (error) {
        callback({ responseHeaders: details.responseHeaders });
      }
    });
  } catch {}

  await createMainWindow();

  try { if (process.platform === 'win32') app.setAppUserModelId('com.lnu.electronvideoplayer'); } catch {}

  ipcMain.handle('dialog:open-video', handleOpenVideoDialog);
  ipcMain.handle('local-file-url', async (_event, absolutePath) => buildServedFileUrl(absolutePath));
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
        await sendVideoToRenderer(fp);
        break;
      }
    }
  } catch {}
});

app.on('will-quit', () => {
  try {
    staticServer?.close?.();
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
