const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  chooseNotesDirectory: () => ipcRenderer.invoke('choose-notes-dir'),
  getNotes: (dir) => ipcRenderer.invoke('get-notes', dir),
  saveNote: (path, content) => ipcRenderer.invoke('save-note', path, content),
  onNotesUpdate: (callback) => ipcRenderer.on('notes-updated', callback)
})

window.testAPI = {
  test: () => ipcRenderer.invoke('test')
}; 