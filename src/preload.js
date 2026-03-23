const { contextBridge, ipcRenderer, clipboard } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openVideoFile: () => ipcRenderer.invoke('dialog:open-video'),
  readClipboard: () => {
    try {
      return clipboard.readText() || '';
    } catch {
      return '';
    }
  },
  setTitle: (title) => ipcRenderer.send('window:set-title', title),
  onWindowMaximized: (callback) => {
    const handler = (_event, isMax) => callback(!!isMax);
    ipcRenderer.on('window:maximized', handler);
    return () => ipcRenderer.removeListener('window:maximized', handler);
  },
  onVideoSelected: (callback) => {
    const subscription = (_event, data) => callback(data);
    ipcRenderer.on('video:selected', subscription);
    return () => ipcRenderer.removeListener('video:selected', subscription);
  },
  toFileUrl: async (absolutePath) => {
    try {
      if (typeof absolutePath !== 'string' || !absolutePath) return null;
      const url = await ipcRenderer.invoke('local-file-url', absolutePath);
      return url || null;
    } catch {
      return null;
    }
  },

  // --- Stream download ---
  startDownload: (opts) => ipcRenderer.invoke('download:start', opts),
  cancelDownload: (id) => ipcRenderer.invoke('download:cancel', id),
  openDownloadedFile: (filePath) => ipcRenderer.invoke('download:open-file', filePath),
  onDownloadProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('download:progress', handler);
    return () => ipcRenderer.removeListener('download:progress', handler);
  },
  onDownloadComplete: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('download:complete', handler);
    return () => ipcRenderer.removeListener('download:complete', handler);
  },
  onDownloadError: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('download:error', handler);
    return () => ipcRenderer.removeListener('download:error', handler);
  },
});
