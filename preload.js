const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // --- Existing APIs ---
  getQasidas: () => ipcRenderer.invoke('get-qasidas'),
  saveFavorites: (favorites) => ipcRenderer.invoke('save-favorites', favorites),
  loadFavorites: () => ipcRenderer.invoke('load-favorites'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  loadSettings: () => ipcRenderer.invoke('load-settings'),

  // --- General Send/Receive ---
  send: (channel, data) => ipcRenderer.send(channel, data),
  receive: (channel, callback) => {
    const subscription = (event, ...args) => callback(...args);
    ipcRenderer.on(channel, subscription);
    // Return an unsubscribe function
    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  },
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
  
  // --- New APIs for Updates & Data Management ---
  downloadPoets: () => ipcRenderer.invoke('download-poets'),
  // --- App Update Events ---
  downloadUpdate: () => ipcRenderer.send('download-update'),
  restartApp: () => ipcRenderer.send('restart-app'),
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
});
