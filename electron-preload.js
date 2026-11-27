// Bridge between the page and the window: custom title bar buttons, pin-on-top and downloads.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('loudboxWin', {
  minimize: () => ipcRenderer.send('win:minimize'),
  toggleMaximize: () => ipcRenderer.send('win:toggle-maximize'),
  close: () => ipcRenderer.send('win:close'),
  togglePin: () => ipcRenderer.invoke('win:toggle-pin'),
  getState: () => ipcRenderer.invoke('win:state'),
  onState: (cb) => ipcRenderer.on('win:state', (_e, s) => cb(s)),
});

contextBridge.exposeInMainWorld('loudboxDl', {
  add: (songs, playlistName) => ipcRenderer.invoke('dl:add', songs, playlistName || ''),
  list: () => ipcRenderer.invoke('dl:list'),
  cancel: (key) => ipcRenderer.invoke('dl:cancel', key),
  retry: (key) => ipcRenderer.invoke('dl:retry', key),
  clearFinished: () => ipcRenderer.invoke('dl:clear'),
  updateTool: () => ipcRenderer.invoke('dl:update-tool'),
  folder: () => ipcRenderer.invoke('dl:folder'),
  chooseFolder: () => ipcRenderer.invoke('dl:choose-folder'),
  openFolder: (sub) => ipcRenderer.invoke('dl:open-folder', sub || ''),
  showFile: (file) => ipcRenderer.invoke('dl:show-file', file),
  onJobs: (cb) => ipcRenderer.on('dl:jobs', (_e, jobs) => cb(jobs)),
});
