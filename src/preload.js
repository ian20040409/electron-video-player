const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openVideoFile: () => ipcRenderer.invoke('dialog:open-video'),
  onVideoSelected: (callback) => {
    const subscription = (_event, data) => callback(data);
    ipcRenderer.on('video:selected', subscription);
    return () => ipcRenderer.removeListener('video:selected', subscription);
  },
});
