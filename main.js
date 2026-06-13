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
  db            = require('./backend/db');
  fetcher       = require('./backend/fetcher');
  smartFeedSvc  = require('./backend/smart-feed');
  emailSvc      = require('./backend/email');
  sources       = require('./backend/sources');

  db.initialize();
  setupIPC();
  createWindow();

  // Refresh feeds shortly after launch
  setTimeout(() => fetcher.refreshAll().catch(err => console.error('[init refresh]', err)), 4000);

  // Weekly cron: Monday 8 AM
  try {
    const cron = require('node-cron');
    cron.schedule('0 8 * * 1', async () => {
      await fetcher.refreshAll().catch(console.error);
      await emailSvc.sendWeeklyDigest().catch(console.error);
    });
  } catch (e) {
    console.error('[cron setup]', e.message);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function sourceName(id) {
  return sources.find(s => s.id === id)?.name || id;
}

function enrich(article) {
  return { ...article, source_name: sourceName(article.source_id) };
}

function setupIPC() {
  const dbRef = () => db.getDb();

  ipcMain.handle('get-sources', () => sources);

  ipcMain.handle('get-unread-articles', () => {
    return dbRef().prepare(`
      SELECT * FROM articles
      WHERE is_read = 0
      ORDER BY published_date DESC
      LIMIT 200
    `).all().map(enrich);
  });

  ipcMain.handle('get-articles-by-source', (_, sourceId) => {
    return dbRef().prepare(`
      SELECT * FROM articles
      WHERE source_id = ?
      ORDER BY published_date DESC
      LIMIT 80
    `).all(sourceId).map(enrich);
  });

  ipcMain.handle('get-unread-counts', () => {
    const rows = dbRef().prepare(`
      SELECT source_id, COUNT(*) as count FROM articles WHERE is_read = 0 GROUP BY source_id
    `).all();
    return Object.fromEntries(rows.map(r => [r.source_id, r.count]));
  });

  ipcMain.handle('mark-as-read', (_, articleId) => {
    dbRef().prepare('UPDATE articles SET is_read = 1 WHERE id = ?').run(articleId);
    return true;
  });

  ipcMain.handle('mark-all-read', (_, ids) => {
    const stmt = dbRef().prepare('UPDATE articles SET is_read = 1 WHERE id = ?');
    const tx = dbRef().transaction(ids => ids.forEach(id => stmt.run(id)));
    tx(ids);
    return true;
  });

  ipcMain.handle('refresh-feeds', async () => {
    return fetcher.refreshAll();
  });

  ipcMain.handle('get-smart-feed', () => {
    return smartFeedSvc.getLatestSmartFeed();
  });

  ipcMain.handle('generate-smart-feed', async () => {
    return smartFeedSvc.generateSmartFeed();
  });

  ipcMain.handle('get-settings', () => {
    const rows = dbRef().prepare('SELECT key, value FROM settings').all();
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  });

  ipcMain.handle('save-settings', (_, settings) => {
    const stmt = dbRef().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    const tx = dbRef().transaction(s => {
      for (const [k, v] of Object.entries(s)) stmt.run(k, v);
    });
    tx(settings);
    return true;
  });

  ipcMain.handle('open-external', (_, url) => {
    shell.openExternal(url);
    return true;
  });

  ipcMain.handle('send-test-email', async () => {
    return emailSvc.sendWeeklyDigest();
  });
}
