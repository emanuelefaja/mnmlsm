try {
  require('electron-reloader')(module)
} catch (_) {}

const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron')
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

app.whenReady().then(createWindow)

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
    awaitWriteFinish: true
  });

  watcher.on('all', (event) => {
    if (['add', 'change', 'unlink'].includes(event)) {
      win.webContents.send('notes-updated');
    }
  });
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

ipcMain.handle('get-notes', (_, dir) => {
  return readNotesDirectory(dir);
});

ipcMain.handle('save-note', async (_, fullPath, content) => {
  try {
    if (!fullPath) throw new Error('File path is required');
    
    // Get unique filename
    let counter = 1;
    const parsed = path.parse(fullPath);
    let uniquePath = fullPath;
    
    while (fs.existsSync(uniquePath)) {
      uniquePath = path.join(
        parsed.dir, 
        `${parsed.name}${counter++}${parsed.ext}`
      );
    }

    fs.writeFileSync(uniquePath, content);
    return uniquePath;
  } catch (error) {
    console.error('Error saving note:', error);
    throw error;
  }
});

function readNotesDirectory(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md') || f.endsWith('.txt'))
    .map(f => {
      const filePath = path.join(dir, f);
      const stats = fs.statSync(filePath);
      const content = fs.readFileSync(filePath, 'utf-8');
      console.log(`Loaded file: ${filePath} with ${content.length} chars`);
      
      return {
        path: filePath,
        title: extractTitle(content, f),
        content,
        created: stats.birthtimeMs,
        updated: stats.mtimeMs
      };
    })
    .sort((a, b) => b.updated - a.updated);
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