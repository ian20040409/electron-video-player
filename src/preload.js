const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openVideoFile: () => ipcRenderer.invoke('dialog:open-video'),
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
});
