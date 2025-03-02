try {
  require('electron-reloader')(module)
} catch (_) {}

const { app, BrowserWindow, Menu, ipcMain, dialog, globalShortcut } = require('electron')
const path = require('path')
const chokidar = require('chokidar')
const fs = require('fs')
let Store;
(async () => {
  const storeModule = await import('electron-store');
  Store = storeModule.default;
})();

// Declare win at the top level
let win;

// Add this at the top level of the file, outside any functions
let isDarkMode = false;

const createWindow = () => {
  // Use the global win variable instead of local const
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  // Create application menu
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'New Note',
          accelerator: 'CmdOrCtrl+N',
          click: () => win.webContents.send('new-note')
        },
        {
          label: 'Focus Search',
          accelerator: 'CmdOrCtrl+L',
          click: () => win.webContents.send('focus-search')
        },
        {
          label: 'Next Note',
          accelerator: 'CmdOrCtrl+J',
          click: () => win.webContents.send('navigate-note', 'next')
        },
        {
          label: 'Previous Note',
          accelerator: 'CmdOrCtrl+K',
          click: () => win.webContents.send('navigate-note', 'previous')
        },
        { type: 'separator' },
        { role: 'close' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'delete' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Dark Mode',
          accelerator: process.platform === 'darwin' ? 'Control+Command+K' : 'Control+Alt+K',
          type: 'checkbox',
          checked: isDarkMode,
          click: () => {
            isDarkMode = !isDarkMode;
            win.webContents.send('toggle-dark-mode', isDarkMode);
            // Update the menu item's checked state
            Menu.getApplicationMenu().getMenuItemById('dark-mode').checked = isDarkMode;
            // Notify to refresh the settings note
            win.webContents.send('refresh-settings-note', isDarkMode);
          },
          id: 'dark-mode'
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)

  win.loadFile('index.html') 
}

app.whenReady().then(() => {
  createWindow()
  
  // Register global shortcut for dark mode toggle
  const shortcutKey = process.platform === 'darwin' 
    ? 'Control+Command+K'  // macOS: Ctrl+Cmd+K
    : 'Control+Alt+K';     // Windows/Linux: Ctrl+Alt+K
    
  globalShortcut.register(shortcutKey, () => {
    isDarkMode = !isDarkMode;
    win.webContents.send('toggle-dark-mode', isDarkMode);
    
    // Update the menu item's checked state
    const menuItem = Menu.getApplicationMenu().getMenuItemById('dark-mode');
    if (menuItem) {
      menuItem.checked = isDarkMode;
    }
    
    // Notify to refresh the settings note
    win.webContents.send('refresh-settings-note', isDarkMode);
  });
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Clean up shortcuts when app is quitting
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

let store;
(async () => {
  const storeModule = await import('electron-store');
  Store = storeModule.default;
  store = new Store();
})();

let watcher;

function watchDirectory(dir) {
  if (watcher) watcher.close();
  
  watcher = chokidar.watch(dir, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 200,
      pollInterval: 100
    }
  });

  watcher.on('all', (event, path) => {
    console.log(`File event: ${event} on ${path}`)
    if (['add', 'change', 'unlink'].includes(event)) {
      // Add slight delay to allow disk writes to complete
      setTimeout(() => {
        win.webContents.send('notes-updated')
      }, 300)
    }
  })
}

ipcMain.handle('choose-notes-dir', async () => {
  if (!store) {
    console.log('Store not yet initialized');
    return null;
  }
  
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (!result.canceled) {
    const dir = result.filePaths[0];
    store.set('notesDir', dir);
    watchDirectory(dir);
    return dir;
  }
  return store.get('notesDir');
});

ipcMain.handle('get-notes', async (event, dir) => {
  if (!dir || !fs.existsSync(dir)) return [getKeyboardShortcutsNote(), getSettingsNote(isDarkMode)];
  
  const notes = await readNotesDirectory(dir);
  
  // Find the settings note to determine the search mode
  const settingsNote = notes.find(note => note.path === "system://settings");
  const searchMode = settingsNote ? parseSearchMode(settingsNote.content) : 'fuzzy';
  
  console.log('Settings note found:', !!settingsNote);
  console.log('Parsed search mode:', searchMode);
  
  // Send the search mode to the renderer
  win.webContents.send('search-mode-changed', searchMode);
  
  return notes;
});

ipcMain.handle('update-note', async (_, path, content) => {
  try {
    // Handle settings note updates
    if (path === "system://settings") {
      // Parse dark mode setting
      const darkModeMatch = content.match(/Dark Mode:\s*(\S+)/i);
      if (darkModeMatch) {
        const value = darkModeMatch[1].toLowerCase();
        const validTrueValues = ['on', 'true', '1', 'yes'];
        const validFalseValues = ['off', 'false', '0', 'no'];
        
        if (validTrueValues.includes(value) && !isDarkMode) {
          // Turn dark mode on
          isDarkMode = true;
          win.webContents.send('toggle-dark-mode', isDarkMode);
          // Update the menu item's checked state
          const menuItem = Menu.getApplicationMenu().getMenuItemById('dark-mode');
          if (menuItem) {
            menuItem.checked = isDarkMode;
          }
        } else if ((validFalseValues.includes(value) || !validTrueValues.includes(value)) && isDarkMode) {
          // Turn dark mode off if value is explicitly false OR is an invalid value
          isDarkMode = false;
          win.webContents.send('toggle-dark-mode', isDarkMode);
          // Update the menu item's checked state
          const menuItem = Menu.getApplicationMenu().getMenuItemById('dark-mode');
          if (menuItem) {
            menuItem.checked = isDarkMode;
          }
        }
      }
      
      // Parse search mode setting
      const searchMode = parseSearchMode(content);
      win.webContents.send('search-mode-changed', searchMode);
      
      // Return the path without writing to disk (it's a virtual note)
      return path;
    }
    
    // Original code for regular notes
    console.log(`Saving to ${path} with content:`, content);
    await fs.promises.writeFile(path, content);
    console.log('Save successful');
    return path;
  } catch (error) {
    console.error('Error saving note:', error);
    throw error;
  }
});

ipcMain.handle('create-note', async (_, fullPath, content) => {
  try {
    if (!fullPath) throw new Error('File path is required');
    
    let counter = 1;
    const parsed = path.parse(fullPath);
    let uniquePath = fullPath;
    
    while (fs.existsSync(uniquePath)) {
      uniquePath = path.join(
        parsed.dir, 
        `${parsed.name}${counter++}${parsed.ext}`
      );
    }

    await fs.promises.writeFile(uniquePath, content);
    return uniquePath;
  } catch (error) {
    console.error('Error creating note:', error);
    throw error;
  }
});

function getKeyboardShortcutsNote() {
  // Determine if we're on macOS
  const isMac = process.platform === 'darwin';
  
  // Define shortcuts with platform-specific formatting
  let shortcuts;
  
  if (isMac) {
    // macOS shortcuts with symbols
    shortcuts = [
      "New Note: ⌘N",
      "Focus Search: ⌘L",
      "Next Note: ⌘J",
      "Previous Note: ⌘K",
      "Toggle Dark Mode: ⌃⌘K",
      "Escape to Focus Search: Esc (when in editor)",
      "Clear Search: Esc (when in search)",
    ];
  } else {
    // Windows/Linux shortcuts
    shortcuts = [
      "New Note: Ctrl+N",
      "Focus Search: Ctrl+L",
      "Next Note: Ctrl+J",
      "Previous Note: Ctrl+K",
      "Toggle Dark Mode: Ctrl+Alt+K",
      "Escape to Focus Search: Esc (when in editor)",
      "Clear Search: Esc (when in search)",
    ];
  }

  const content = `# Keyboard Shortcuts [System]\n\n${shortcuts.join("\n")}`;
  
  return {
    path: "system://keyboard-shortcuts",
    title: "Keyboard Shortcuts",
    content,
    created: 0,
    updated: 0,
    isSystemNote: true,
    isHidden: true
  };
}

function getSettingsNote(isDarkMode) {
  const content = `# Settings

  - Changes take effect immediately as you type

Dark Mode: ${isDarkMode ? 'on' : 'off'}
Search: fuzzy

- Accepted values for Dark Mode: on/off, true/false, 0/1, yes/no

- Toggle Dark Mode with ${process.platform === 'darwin' ? '⌃⌘K' : 'Ctrl+Alt+K'} or via View menu`;

  return {
    path: "system://settings",
    title: "Settings",
    content,
    created: 0,
    updated: 0,
    isSystemNote: true,
    isHidden: true
  };
}

function parseSearchMode(settingsContent) {
  const searchMatch = settingsContent.match(/Search:\s*(precise|fuzzy)/i);
  return searchMatch ? searchMatch[1].toLowerCase() : 'fuzzy';
}

function readNotesDirectory(dir) {
  if (!dir || !fs.existsSync(dir)) return [getKeyboardShortcutsNote(), getSettingsNote(isDarkMode)];
  
  const notes = fs.readdirSync(dir)
    .filter(f => f.endsWith('.md') || f.endsWith('.txt'))
    .map(f => {
      const filePath = path.join(dir, f)
      try {
        const stats = fs.statSync(filePath)
        const content = fs.readFileSync(filePath, 'utf-8')
        return {
          path: filePath,
          title: extractTitle(content, f),
          content,
          created: stats.birthtimeMs,
          updated: stats.mtimeMs
        }
      } catch (error) {
        console.error('Error reading file:', filePath, error)
        return null
      }
    })
    .filter(note => note !== null)
    .sort((a, b) => b.updated - a.updated);
  
  // Add the keyboard shortcuts and settings system notes
  return [getKeyboardShortcutsNote(), getSettingsNote(isDarkMode), ...notes];
}

function extractTitle(content, filename) {
  const h1Match = content.match(/^#\s+(.+)$/m);
  return h1Match 
    ? h1Match[1] 
    : path.basename(filename, path.extname(filename));
}

ipcMain.handle('test', () => 'API working');

// Add handler for path joining
ipcMain.handle('join-paths', (_, ...paths) => {
  return path.join(...paths);
});

// Add this IPC handler
ipcMain.handle('rename-note', async (_, oldPath, newPath) => {
  try {
    // Check if target file already exists
    if (fs.existsSync(newPath)) {
      let counter = 1;
      const parsed = path.parse(newPath);
      let uniquePath = newPath;
      
      while (fs.existsSync(uniquePath)) {
        uniquePath = path.join(
          parsed.dir, 
          `${parsed.name}${counter++}${parsed.ext}`
        );
      }
      
      newPath = uniquePath;
    }
    
    await fs.promises.rename(oldPath, newPath);
    return newPath;
  } catch (error) {
    console.error('Error renaming file:', error);
    throw error;
  }
});

// Add this IPC handler
ipcMain.handle('get-path-info', (_, filePath) => {
  return {
    dirname: path.dirname(filePath),
    basename: path.basename(filePath),
    extname: path.extname(filePath)
  };
});

// In the function that handles note updates, add logic to detect settings changes
function handleNoteUpdate(notePath, content) {
  // ... existing code ...
  
  // Check if this is the settings note
  if (notePath === "system://settings") {
    const isDarkMode = content.includes('Theme: dark');
    const searchMode = parseSearchMode(content);
    
    // Notify the renderer about the settings change
    win.webContents.send('refresh-settings-note', isDarkMode, searchMode);
  }
  
  // ... existing code ...
} 