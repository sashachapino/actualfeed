const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');

app.setName('ActualFeed');

let mainWindow;
let db, fetcher, smartFeedSvc, emailSvc, sources;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0f0e0c',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'ActualFeed',
    show: false,
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadFile('index.html');
}

app.whenReady().then(async () => {
  db           = require('./backend/db');
  fetcher      = require('./backend/fetcher');
  smartFeedSvc = require('./backend/smart-feed');
  emailSvc     = require('./backend/email');
  sources      = require('./backend/sources');

  db.initialize();
  setupIPC();
  createWindow();

  setTimeout(() => fetcher.refreshAll().catch(e => console.error('[init refresh]', e)), 4000);

  try {
    const cron = require('node-cron');
    cron.schedule('0 8 * * 1', async () => {
      await fetcher.refreshAll().catch(console.error);
      await emailSvc.sendWeeklyDigest().catch(console.error);
    });
  } catch (e) {
    console.error('[cron]', e.message);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function withSourceName(article) {
  const src = sources.find(s => s.id === article.source_id);
  return { ...article, source_name: src?.name || article.source_id };
}

function setupIPC() {
  ipcMain.handle('get-sources',          ()           => sources);
  ipcMain.handle('get-unread-articles',  ()           => db.getUnreadArticles().map(withSourceName));
  ipcMain.handle('get-articles-by-source', (_, id)   => db.getArticlesBySource(id).map(withSourceName));
  ipcMain.handle('get-unread-counts',    ()           => db.getUnreadCounts());
  ipcMain.handle('mark-as-read',         (_, id)      => { db.markAsRead(id); return true; });
  ipcMain.handle('mark-all-read',        (_, ids)     => { db.markAllRead(ids); return true; });
  ipcMain.handle('refresh-feeds',        ()           => fetcher.refreshAll());
  ipcMain.handle('get-smart-feed',       ()           => smartFeedSvc.getLatestSmartFeed());
  ipcMain.handle('generate-smart-feed',  ()           => smartFeedSvc.generateSmartFeed());
  ipcMain.handle('get-settings',         ()           => db.getSettings());
  ipcMain.handle('save-settings',        (_, s)       => { db.saveSettings(s); return true; });
  ipcMain.handle('open-external',        (_, url)     => { shell.openExternal(url); return true; });
  ipcMain.handle('send-test-email',      ()           => emailSvc.sendWeeklyDigest());
}
