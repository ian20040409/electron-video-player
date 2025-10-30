const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

// Keep a global reference to the main window to avoid GC closing it.
let mainWindow;

function resolveHtmlPath() {
  // Load local index.html in development and production.
  return path.join(__dirname, 'index.html');
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(resolveHtmlPath());

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

app.whenReady().then(() => {
  createMainWindow();

  ipcMain.handle('dialog:open-video', handleOpenVideoDialog);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
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
