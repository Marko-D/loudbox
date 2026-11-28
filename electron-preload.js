// Bridge between the page and the window: custom title bar buttons and pin-on-top.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('loudboxWin', {
  minimize: () => ipcRenderer.send('win:minimize'),
  toggleMaximize: () => ipcRenderer.send('win:toggle-maximize'),
  close: () => ipcRenderer.send('win:close'),
  togglePin: () => ipcRenderer.invoke('win:toggle-pin'),
  getState: () => ipcRenderer.invoke('win:state'),
  onState: (cb) => ipcRenderer.on('win:state', (_e, s) => cb(s)),
});

