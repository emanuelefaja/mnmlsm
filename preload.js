const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  chooseNotesDirectory: () => ipcRenderer.invoke('choose-notes-dir'),
  getNotes: (dir) => ipcRenderer.invoke('get-notes', dir),
  onNotesUpdate: (callback) => ipcRenderer.on('notes-updated', callback),
  joinPaths: (...paths) => ipcRenderer.invoke('join-paths', ...paths),
  createNote: (path, content) => ipcRenderer.invoke('create-note', path, content),
  updateNote: (path, content) => ipcRenderer.invoke('update-note', path, content),
  renameNote: (oldPath, newPath) => ipcRenderer.invoke('rename-note', oldPath, newPath),
  getPathInfo: (filePath) => ipcRenderer.invoke('get-path-info', filePath),
})

window.testAPI = {
  test: () => ipcRenderer.invoke('test')
}; 