const { app, BrowserWindow, ipcMain, Tray, Menu, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('node:path');
const fs = require('node:fs');
const axios = require('axios');
const yaml = require('js-yaml');

let win;
let tray;
let miniPlayerWindow;

const POEMS_REPO_RAW_URL = 'https://raw.githubusercontent.com/Hayyan0/Poems/main';
const POETS_DATA_URL = `${POEMS_REPO_RAW_URL}/Data.json`;

const poetsFolderPath = path.join(app.getPath('userData'), 'Poets');
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
    } catch (err) { console.error('حدث خطأ أثناء تحميل الإعدادات:', err); }
    return { onClose: 'exit' };
}
function saveSettings(settings) {
    try {
        fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
        return true;
    } catch (err) {
        console.error('حدث خطأ أثناء حفظ الإعدادات:', err);
        return false;
    }
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
  console.log('تحديث متوفر:', info);
  win.webContents.send('update-available', info);
});
autoUpdater.on('update-not-available', () => {
  console.log('لا يوجد تحديث متوفر');
  win.webContents.send('update-not-available');
});
autoUpdater.on('update-downloaded', () => {
  console.log('تم تنزيل التحديث');
  win.webContents.send('update-downloaded');
});
autoUpdater.on('error', (err) => {
  console.error('حدث خطأ في التحديث التلقائي:', err);
  win.webContents.send('update-error', err.message);
});
autoUpdater.on('download-progress', (progressObj) => {
  console.log('تقدم التنزيل:', progressObj.percent);
  win.webContents.send('update-download-progress', {
    percent: progressObj.percent
  });
});

ipcMain.on('restart-app', () => {
  console.log('إعادة تشغيل التطبيق لتثبيت التحديث');
  app.isQuitting = true;
  autoUpdater.quitAndInstall();
});

ipcMain.on('download-update', () => {
  console.log('بدء تنزيل التحديث');
  autoUpdater.downloadUpdate();
});
ipcMain.on('check-for-updates', () => {
  console.log('تم تشغيل فحص التحديث يدويًا');
  if (app.isPackaged) {
    autoUpdater.checkForUpdates();
  } else {
    console.log('تم تخطي فحص التحديث في وضع التطوير');
    win.webContents.send('update-not-available');
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

function getLocalPoetsVersion() {
    try {
        if (fs.existsSync(poetsVersionFilePath)) {
            const fileContents = fs.readFileSync(poetsVersionFilePath, 'utf8');
            const localConfig = yaml.load(fileContents);
            return localConfig.Version?.replace(/^v/, '') || null;
        }
        return '0.0.0';
    } catch (error) {
        console.error('تعذر قراءة إصدار القصائد المحلي:', error);
        return null;
    }
}


async function checkForPoetsUpdate() {
    try {
        const localVersion = getLocalPoetsVersion();
        if (localVersion === null) { 
            console.error('تعذر تحديد إصدار القصائد المحلي.');
            return;
        }

        const response = await axios.get(POETS_DATA_URL);
        const remoteConfig = response.data;
        const remoteVersion = remoteConfig.version;

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
        console.error('فشل في التحقق من تحديث القصائد:', error.message);
    }
}


ipcMain.handle('download-poets', async () => {
    try {
        win.webContents.send('download-progress', { percent: 0, message: 'جاري جلب بيانات التحديث...' });
        const mainDataResponse = await axios.get(POETS_DATA_URL);
        const { version: remoteVersion, folders: remoteFoldersRaw } = mainDataResponse.data;

        if (!remoteFoldersRaw || !Array.isArray(remoteFoldersRaw)) {
            throw new Error('هيكلة البيانات خاطئة في ملف Data.json');
        }
        
        const remoteFolders = remoteFoldersRaw.map(f => f.trim());

        if (!fs.existsSync(poetsFolderPath)) {
            fs.mkdirSync(poetsFolderPath, { recursive: true });
        }

        const localFolders = fs.readdirSync(poetsFolderPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        for (const localFolder of localFolders) {
            if (!remoteFolders.includes(localFolder)) {
                console.log(`يتم إزالة مجلد الشاعر القديم: ${localFolder}`);
                const folderToRemovePath = path.join(poetsFolderPath, localFolder);
                fs.rmSync(folderToRemovePath, { recursive: true, force: true });
            }
        }

        let totalFilesToDownload = 0;
        let filesDownloaded = 0;
        const allDownloadTasks = [];

        for (const folderName of remoteFolders) {
            const encodedFolderName = encodeURIComponent(folderName);
            const poetDataUrl = `${POEMS_REPO_RAW_URL}/Poets/${encodedFolderName}/.Data.json`;
            const localPoetPath = path.join(poetsFolderPath, folderName);

            if (!fs.existsSync(localPoetPath)) {
                fs.mkdirSync(localPoetPath, { recursive: true });
            }

            try {
                const poetDataResponse = await axios.get(poetDataUrl);
                const poetData = poetDataResponse.data;

                const localDataPath = path.join(localPoetPath, '.Data.json');
                fs.writeFileSync(localDataPath, JSON.stringify(poetData, null, 2), 'utf-8');

                if (poetData.qasidas && Array.isArray(poetData.qasidas)) {
                    for (const qasida of poetData.qasidas) {
                        if (!qasida.file_name) continue;
                        const localFilePath = path.join(localPoetPath, qasida.file_name);
                        if (!fs.existsSync(localFilePath)) {
                            totalFilesToDownload++;
                            const encodedFileName = encodeURIComponent(qasida.file_name);
                            const fileUrl = `${POEMS_REPO_RAW_URL}/Poets/${encodedFolderName}/${encodedFileName}`;
                            allDownloadTasks.push({ url: fileUrl, path: localFilePath });
                        }
                    }
                }
            } catch (err) {
                console.error(`فشل في جلب أو معالجة بيانات القصائد: ${folderName}`, err.message);
            }
        }
        
        if (allDownloadTasks.length === 0) {
             win.webContents.send('download-progress', { percent: 100, message: 'القصائد محدثة بالفعل.' });
        } else {
            win.webContents.send('download-progress', { percent: 0, message: `جاري تنزيل ${allDownloadTasks.length} ملف...` });
        }

        for (const task of allDownloadTasks) {
            try {
                const response = await axios({
                    method: 'get',
                    url: task.url,
                    responseType: 'stream'
                });
                
                const writer = fs.createWriteStream(task.path);
                response.data.pipe(writer);

                await new Promise((resolve, reject) => {
                    writer.on('finish', resolve);
                    writer.on('error', reject);
                });

                filesDownloaded++;
                const percentage = (filesDownloaded / totalFilesToDownload) * 100;
                win.webContents.send('download-progress', { percent: percentage, message: `جاري تنزيل ${filesDownloaded} من ${totalFilesToDownload}` });

            } catch (err) {
                 console.error(`فشل في تنزيل الملف: ${task.url}`, err.message);
                 if (fs.existsSync(task.path)) {
                     fs.unlinkSync(task.path); 
                 }
            }
        }

        const newVersionContent = yaml.dump({ Version: `v${remoteVersion}` });
        fs.writeFileSync(poetsVersionFilePath, newVersionContent, 'utf-8');
        
        win.webContents.send('unpacking-start'); 

        return { success: true };

    } catch (error) {
        console.error('حدث خطأ أثناء تنزيل/تحديث القصائد:', error);
        win.webContents.send('download-progress', { percent: 0, message: `خطأ: ${error.message}` });
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

                if (data.qasidas && Array.isArray(data.qasidas)) {
                    data.qasidas.forEach(qasida => {
                        if (!qasida.file_name) return;
                        
                        const originalFilePath = path.join(poetsFolderPath, folder, qasida.file_name);
                        let fileExists = fs.existsSync(originalFilePath);

                        if (fileExists) {
                            const tags = qasida.Tags ? qasida.Tags.split('،').map(t => t.trim()).filter(t => t) : [];
                            allQasidas.push({
                                ...qasida,
                                directory: path.join(poetsFolderPath, folder).replace(/\\/g, '/'),
                                tagsArray: tags
                            });
                        }
                    });
                }
            }
        }
    } catch (error) {
        console.error("حدث خطأ أثناء قراءة بيانات القصائد:", error);
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
        console.error('حدث خطأ أثناء حفظ المفضلات:', err);
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
        console.error('حدث خطأ أثناء تحميل المفضلات:', err);
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
