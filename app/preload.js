// The page's only ties to main: its size and shape, dragging, folding, and the two buttons.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('host', {
  size: (w, h) => ipcRenderer.send('size', w, h),
  rects: r => ipcRenderer.send('rects', r),
  drag: k => ipcRenderer.send('drag', k),
  folded: f => ipcRenderer.send('folded', f),
  click: what => ipcRenderer.send('click', what),
});
