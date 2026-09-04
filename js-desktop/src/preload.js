const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktop', {
  defaultOutputRoot: () => ipcRenderer.invoke('app:default-output-root'),
  chooseOutputRoot: () => ipcRenderer.invoke('dialog:choose-output-root'),
  openFolder: (payload) => ipcRenderer.invoke('folder:open', payload),
  saveAudio: (payload) => ipcRenderer.invoke('audio:save', payload),
  createZip: (payload) => ipcRenderer.invoke('zip:create', payload),
  showFile: (filePath) => ipcRenderer.invoke('file:show', filePath),
  openFile: (filePath) => ipcRenderer.invoke('file:open', filePath),
})
