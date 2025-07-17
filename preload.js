const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getQasidas: () => ipcRenderer.invoke('get-qasidas'),
  send: (channel, data) => ipcRenderer.send(channel, data),
  saveFavorites: (favorites) => ipcRenderer.invoke('save-favorites', favorites),
  loadFavorites: () => ipcRenderer.invoke('load-favorites'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  loadSettings: () => ipcRenderer.invoke('load-settings'),
  receive: (channel, callback) => {
    ipcRenderer.on(channel, (event, ...args) => callback(...args));
  },
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});