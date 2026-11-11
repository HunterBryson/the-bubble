const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('bubble', {
  onState: f => ipcRenderer.on('state', (_e, s) => f(s)),
  size: (w, h) => ipcRenderer.send('size', { w, h }),
  click: what => ipcRenderer.send('click', what),
});
