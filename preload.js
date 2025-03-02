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
  onDarkModeToggle: (callback) => ipcRenderer.on('toggle-dark-mode', (_, isDarkMode) => callback(isDarkMode)),
  onFocusSearch: (callback) => ipcRenderer.on('focus-search', callback),
  onNavigateNote: (callback) => ipcRenderer.on('navigate-note', (_, direction) => callback(direction)),
  onRefreshSettingsNote: (callback) => ipcRenderer.on('refresh-settings-note', (_, isDarkMode) => callback(isDarkMode)),
})

window.testAPI = {
  test: () => ipcRenderer.invoke('test')
}; 