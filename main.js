const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

let win;
let tray;
let miniPlayerWindow;

// --- Settings Management ---
const SETTINGS_PATH = path.join(__dirname, 'settings.json');

function loadSettings() {
    try {
        if (fs.existsSync(SETTINGS_PATH)) {
            const data = fs.readFileSync(SETTINGS_PATH, 'utf-8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.error('Error loading settings:', err);
    }
    return { onClose: 'exit' };
}

function saveSettings(settings) {
    try {
        fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
        return true;
    } catch (err) {
        console.error('Error saving settings:', err);
        return false;
    }
}

function createTray() {
    const iconPath = path.join(__dirname, 'Assets', 'icon.png');     
    tray = new Tray(iconPath);

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'عرض المشغل المصغر',
            click: () => {
                if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
                    miniPlayerWindow.show();
                } else {
                    createMiniPlayerWindow();
                }
            }
        },
        {
            label: 'عرض المشغل',
            click: () => {
                win.show();
            }
        },
        {
            label: 'إغلاق',
            click: () => {
                app.isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setToolTip('Qasida Player');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
        if (miniPlayerWindow && !miniPlayerWindow.isDestroyed() && miniPlayerWindow.isVisible()) {
           miniPlayerWindow.hide();
       } else {
           if (!miniPlayerWindow || miniPlayerWindow.isDestroyed()) {
               createMiniPlayerWindow();
           }
           const trayBounds = tray.getBounds();
           const windowBounds = miniPlayerWindow.getBounds();
           const x = Math.round(trayBounds.x + (trayBounds.width / 2) - (windowBounds.width / 2));
           const y = Math.round(trayBounds.y - windowBounds.height - 4); 
           miniPlayerWindow.setPosition(x, y, false);
           miniPlayerWindow.show();
       }
   });
}

function createMiniPlayerWindow() {
    if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
        miniPlayerWindow.show();
        return;
    }
    miniPlayerWindow = new BrowserWindow({
        width: 297,
        height: 448,
        frame: false,
        transparent: false,
        show: false,
        skipTaskbar: true,
        resizable: false,
        hasShadow: false, 
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        }
    });

    miniPlayerWindow.webContents.on('did-finish-load', () => {
        if (win && !win.isDestroyed()) {
            win.webContents.send('request-state-sync');
        }
    });

    miniPlayerWindow.loadFile('mini-player.html');

    miniPlayerWindow.on('blur', () => {
        if (!miniPlayerWindow.webContents.isDevToolsOpened()) {
            miniPlayerWindow.hide();
        }
    });

    miniPlayerWindow.on('closed', () => {
        miniPlayerWindow = null;
    });
}


function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 720,
    minWidth: 940,
    minHeight: 700,
    frame: false,
    transparent: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile('index.html');

  win.on('close', (event) => {
    const settings = loadSettings();
    if (settings.onClose === 'tray' && !app.isQuitting) {
        event.preventDefault();
        win.hide();
        if (!tray) {
            createTray();
        }
    }
  });

  win.on('maximize', () => {
    win.webContents.send('window-state', { state: 'maximized' });
  });
  win.on('unmaximize', () => {
    win.webContents.send('window-state', { state: 'restored' });
  });
  win.on('enter-full-screen', () => {
    win.webContents.send('window-state', { state: 'fullscreen' });
  });
  win.on('leave-full-screen', () => {
    win.webContents.send('window-state', { state: 'restored' });
  });

  ipcMain.on('window-action', (event, action) => {
    if (action === 'close') {
      win.close();
    } else if (action === 'minimize') {
      win.minimize();
    } else if (action === 'maximize') {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC Handlers ---

ipcMain.handle('save-settings', (event, settings) => saveSettings(settings));
ipcMain.handle('load-settings', () => loadSettings());

const FAVORITES_PATH = path.join(__dirname, 'favorites.json');
ipcMain.handle('save-favorites', async (event, favorites) => {
    try {
        fs.writeFileSync(FAVORITES_PATH, JSON.stringify(favorites, null, 2), 'utf-8');
        return true;
    } catch (err) {
        console.error('Error saving favorites:', err);
        return false;
    }
});
ipcMain.handle('load-favorites', async () => {
    try {
        if (fs.existsSync(FAVORITES_PATH)) {
            const data = fs.readFileSync(FAVORITES_PATH, 'utf-8');
            return JSON.parse(data);
        }
        return [];
    } catch (err) {
        console.error('Error loading favorites:', err);
        return [];
    }
});

ipcMain.handle('get-qasidas', async () => {
    const poetsBaseDir = path.join(__dirname, 'Poets');
    const allQasidas = [];
    try {
        const poetFolders = fs.readdirSync(poetsBaseDir, { withFileTypes: true })
                              .filter(dirent => dirent.isDirectory())
                              .map(dirent => dirent.name);

        for (const folder of poetFolders) {
            const dataPath = path.join(poetsBaseDir, folder, '.Data.json');
            if (fs.existsSync(dataPath)) {
                const content = fs.readFileSync(dataPath, 'utf-8');
                const data = JSON.parse(content);
                const relativeFolderPath = path.join('Poets', folder).replace(/\\/g, '/');

                data.qasidas.forEach(qasida => {
                    if (!qasida.file_name) {
                        console.error(`Skipping qasida with no file_name in ${dataPath}`);
                        return;
                    }

                    const originalFilePath = path.join(poetsBaseDir, folder, qasida.file_name);
                    let finalFileName = qasida.file_name;
                    let fileExists = fs.existsSync(originalFilePath);

                    if (!fileExists) {
                        const originalExtension = path.extname(qasida.file_name).toLowerCase();
                        const baseName = path.basename(qasida.file_name, path.extname(qasida.file_name));
                        let alternativeFileName;

                        if (originalExtension === '.mp3') {
                            alternativeFileName = baseName + '.m4a';
                        } else if (originalExtension === '.m4a') {
                            alternativeFileName = baseName + '.mp3';
                        }

                        if (alternativeFileName) {
                            const alternativeFilePath = path.join(poetsBaseDir, folder, alternativeFileName);
                            if (fs.existsSync(alternativeFilePath)) {
                                console.log(`Original file '${qasida.file_name}' not found. Using alternative: '${alternativeFileName}'`);
                                finalFileName = alternativeFileName;
                                fileExists = true;
                            }
                        }
                    }

                    if (fileExists) {
                        const tags = qasida.Tags ? qasida.Tags.split('،').map(t => t.trim()).filter(t => t) : [];
                        allQasidas.push({
                            ...qasida,
                            file_name: finalFileName, 
                            directory: relativeFolderPath,
                            tagsArray: tags
                        });
                    } else {
                        console.error(`Audio file not found for qasida: '${qasida.qasida_name}'. Looked for '${qasida.file_name}' and potential alternatives.`);
                    }
                });
            }
        }
    } catch (error) {
        console.error("Error reading qasida data:", error);
        return [];
    }
    return allQasidas;
});

ipcMain.on('player-state-update', (event, state) => {
    if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
        miniPlayerWindow.webContents.send('update-from-main', state);
    }
});

ipcMain.on('mini-player-action', (event, data) => {
    if (data.action === 'hide-window') {
        if (miniPlayerWindow) miniPlayerWindow.hide();
        return;
    }
    if (data.action === 'show-main') {
        if (win) win.show();
        if (miniPlayerWindow) miniPlayerWindow.hide();
        return;
    }
    
    if (win && !win.isDestroyed()) {
        win.webContents.send('control-from-mini', data);
    }
});