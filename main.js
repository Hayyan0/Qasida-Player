const { app, BrowserWindow, ipcMain, Tray, Menu, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('node:path');
const fs = require('node:fs');
const axios = require('axios');
const yaml = require('js-yaml');
const extract = require('extract-zip');

let win;
let tray;
let miniPlayerWindow;

const REPO_URL = 'https://github.com/Hayyan0/Qasida-Player';
const appPath = app.isPackaged ? path.dirname(app.getPath('exe')) : __dirname;
const poetsFolderPath = path.join(appPath, 'Poets');
const poetsVersionFilePath = path.join(poetsFolderPath, 'version.yml');

autoUpdater.setFeedURL({
  provider: 'github',
  owner: 'Hayyan0',
  repo: 'Qasida-Player'
});

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');
function loadSettings() {
    try {
        if (fs.existsSync(SETTINGS_PATH)) {
            return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
        }
    } catch (err) { console.error('Error loading settings:', err); }
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

// --- Main Window ---
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
        if (!tray) createTray();
    }
  });

  win.on('maximize', () => win.webContents.send('window-state', { state: 'maximized' }));
  win.on('unmaximize', () => win.webContents.send('window-state', { state: 'restored' }));
  
  win.webContents.on('did-finish-load', () => {
    if(app.isPackaged) {
      autoUpdater.checkForUpdates();
    }
    checkPoetsFolder();
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

autoUpdater.on('update-available', (info) => {
  console.log('Update available:', info);
  win.webContents.send('update-available', info);
});
autoUpdater.on('update-not-available', () => {
  console.log('No update available');
  win.webContents.send('update-not-available');
});
autoUpdater.on('update-downloaded', () => {
  console.log('Update downloaded');
  win.webContents.send('update-downloaded');
});
autoUpdater.on('error', (err) => {
  console.error('Auto-updater error:', err);
  win.webContents.send('update-error', err.message);
});
autoUpdater.on('download-progress', (progressObj) => {
  console.log('Download progress:', progressObj.percent);
  win.webContents.send('update-download-progress', {
    percent: progressObj.percent
  });
});

ipcMain.on('restart-app', () => {
  console.log('Restarting app for update installation');
  autoUpdater.quitAndInstall();
});
ipcMain.on('download-update', () => {
  console.log('Starting update download');
  autoUpdater.downloadUpdate();
});
ipcMain.on('check-for-updates', () => {
  console.log('Manual update check triggered');
  if (app.isPackaged) {
    autoUpdater.checkForUpdates();
  } else {
    console.log('Update check skipped in development mode');
  }
});


function checkPoetsFolder() {
    if (fs.existsSync(poetsFolderPath)) {
        win.webContents.send('poets-folder-found');
        checkForPoetsUpdate();
    } else {
        win.webContents.send('poets-folder-missing');
    }
}

async function checkForPoetsUpdate() {
    try {
        const localVersion = getLocalPoetsVersion();
        if (localVersion === null) { 
            return;
        }

        const remoteVersionUrl = `${REPO_URL}/releases/download/Poets/Poets-Version.yml`;
        const response = await axios.get(remoteVersionUrl);
        const remoteConfig = yaml.load(response.data);
        const remoteVersion = remoteConfig.Version;

        if (remoteVersion > localVersion) {
            dialog.showMessageBox(win, {
                type: 'info',
                title: 'تحديث متوفر',
                message: `يتوفر تحديث جديد لمجلد القصائد (الإصدار ${remoteVersion}). هل ترغب في التنزيل الآن؟`,
                buttons: ['نعم', 'لاحقاً']
            }).then(result => {
                if (result.response === 0) { 
                     win.webContents.send('show-download-ui');
                }
            });
        }
    } catch (error) {
        console.error('Failed to check for Poets update:', error.message);
    }
}

function getLocalPoetsVersion() {
    try {
        if (fs.existsSync(poetsVersionFilePath)) {
            const fileContents = fs.readFileSync(poetsVersionFilePath, 'utf8');
            const localConfig = yaml.load(fileContents);
            return localConfig.Version || null;
        }
        return null; 
    } catch (error) {
        console.error('Could not read local poets version:', error);
        return null;
    }
}

ipcMain.handle('download-poets', async () => {
    const downloadUrl = `${REPO_URL}/releases/download/Poets/Poets.zip`;
    const tempZipPath = path.join(app.getPath('temp'), 'Poets.zip');
    const tempUnpackPath = path.join(app.getPath('temp'), 'Poets-Unpack');

    try {
        let oldPoetFolders = new Set();
        if (fs.existsSync(poetsFolderPath)) {
            oldPoetFolders = new Set(fs.readdirSync(poetsFolderPath, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name));
        }

        const response = await axios({
            method: 'get',
            url: downloadUrl,
            responseType: 'stream'
        });

        const totalLength = response.headers['content-length'];
        const writer = fs.createWriteStream(tempZipPath);
        let downloadedLength = 0;

        response.data.on('data', (chunk) => {
            downloadedLength += chunk.length;
            const percentage = (downloadedLength / totalLength) * 100;
            win.webContents.send('download-progress', { percent: percentage });
        });

        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        win.webContents.send('unpacking-start');
        if (fs.existsSync(tempUnpackPath)) {
            fs.rmSync(tempUnpackPath, { recursive: true, force: true });
        }
        fs.mkdirSync(tempUnpackPath, { recursive: true });
        await extract(tempZipPath, { dir: tempUnpackPath });

        const newPoetsSourcePath = path.join(tempUnpackPath, 'Poets');
        if (!fs.existsSync(newPoetsSourcePath)) {
            throw new Error('"Poets" folder not found in the downloaded zip file.');
        }
        
        const newPoetFolders = new Set(fs.readdirSync(newPoetsSourcePath));
        if (!fs.existsSync(poetsFolderPath)) {
            fs.mkdirSync(poetsFolderPath, { recursive: true });
        }

        for (const folderName of newPoetFolders) {
            const source = path.join(newPoetsSourcePath, folderName);
            const destination = path.join(poetsFolderPath, folderName);
            fs.cpSync(source, destination, { recursive: true });
        }
        
        for (const oldFolder of oldPoetFolders) {
            if (!newPoetFolders.has(oldFolder)) {
                console.log(`Removing outdated poet folder: ${oldFolder}`);
                fs.rmSync(path.join(poetsFolderPath, oldFolder), { recursive: true, force: true });
            }
        }
        
        const newVersionFileSource = path.join(tempUnpackPath, 'Poets-Version.yml');
        if (fs.existsSync(newVersionFileSource)) {
            fs.copyFileSync(newVersionFileSource, poetsVersionFilePath);
        } else {
             const remoteVersionUrl = `${REPO_URL}/releases/download/Poets/Poets-Version.yml`;
             const versionResponse = await axios.get(remoteVersionUrl);
             fs.writeFileSync(poetsVersionFilePath, versionResponse.data, 'utf-8');
        }

        fs.unlinkSync(tempZipPath);
        fs.rmSync(tempUnpackPath, { recursive: true, force: true });

        return { success: true };
    } catch (error) {
        console.error('An error occurred during poets download/unpack:', error);
        if (fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath);
        if (fs.existsSync(tempUnpackPath)) fs.rmSync(tempUnpackPath, { recursive: true, force: true });
        return { success: false, error: error.message };
    }
});


// --- IPC Handlers ---
ipcMain.handle('get-qasidas', async () => {
    const allQasidas = [];
    if (!fs.existsSync(poetsFolderPath)) {
        return []; 
    }
    try {
        const poetFolders = fs.readdirSync(poetsFolderPath, { withFileTypes: true })
                              .filter(dirent => dirent.isDirectory())
                              .map(dirent => dirent.name);

        for (const folder of poetFolders) {
            const dataPath = path.join(poetsFolderPath, folder, '.Data.json');
            if (fs.existsSync(dataPath)) {
                const content = fs.readFileSync(dataPath, 'utf-8');
                const data = JSON.parse(content);
                const relativeFolderPath = path.join('Poets', folder).replace(/\\/g, '/');

                data.qasidas.forEach(qasida => {
                    if (!qasida.file_name) return;
                    
                    const originalFilePath = path.join(poetsFolderPath, folder, qasida.file_name);
                    let finalFileName = qasida.file_name;
                    let fileExists = fs.existsSync(originalFilePath);

                    if (!fileExists) {
                        const ext = path.extname(qasida.file_name).toLowerCase();
                        const base = path.basename(qasida.file_name, ext);
                        const altExt = ext === '.mp3' ? '.m4a' : '.mp3';
                        const altPath = path.join(poetsFolderPath, folder, base + altExt);
                        if(fs.existsSync(altPath)) {
                            finalFileName = base + altExt;
                            fileExists = true;
                        }
                    }

                    if (fileExists) {
                        const tags = qasida.Tags ? qasida.Tags.split('،').map(t => t.trim()).filter(t => t) : [];
                        allQasidas.push({
                            ...qasida,
                            file_name: finalFileName,
                            directory: path.join(poetsFolderPath, folder).replace(/\\/g, '/'),
                            tagsArray: tags
                        });
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



const FAVORITES_PATH = path.join(app.getPath('userData'), 'favorites.json');

ipcMain.handle('save-settings', (event, settings) => saveSettings(settings));
ipcMain.handle('load-settings', () => loadSettings());

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
