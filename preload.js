const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  chooseNotesDirectory: () => ipcRenderer.invoke('choose-notes-dir'),
  getNotes: (dir) => ipcRenderer.invoke('get-notes', dir),
  onNotesUpdate: (callback) => ipcRenderer.on('notes-updated', callback),
  joinPaths: (...paths) => ipcRenderer.invoke('join-paths', ...paths),
  createNote: (path, content) => ipcRenderer.invoke('create-note', path, content),
  updateNote: (path, content) => ipcRenderer.invoke('update-note', path, content),
  renameNote: (oldPath, newPath) => ipcRenderer.invoke('rename-note', oldPath, newPath),
  deleteNote: (path) => ipcRenderer.invoke('delete-note', path),
  getPathInfo: (filePath) => ipcRenderer.invoke('get-path-info', filePath),
  onDarkModeToggle: (callback) => ipcRenderer.on('toggle-dark-mode', (_, isDarkMode) => callback(isDarkMode)),
  onFocusSearch: (callback) => ipcRenderer.on('focus-search', callback),
  onNavigateNote: (callback) => ipcRenderer.on('navigate-note', (_, direction) => callback(direction)),
  onRefreshSettingsNote: (callback) => ipcRenderer.on('refresh-settings-note', (_, isDarkMode, searchMode) => callback(isDarkMode, searchMode)),
  onSearchModeChange: (callback) => ipcRenderer.on('search-mode-changed', (_, searchMode) => callback(searchMode)),
  onDeleteNote: (callback) => ipcRenderer.on('delete-note', callback),
})

window.testAPI = {
  test: () => ipcRenderer.invoke('test')
}; 