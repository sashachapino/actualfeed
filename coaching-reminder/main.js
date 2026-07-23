const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, Notification } = require('electron');
const path = require('path');

const store = require('./lib/store');
const keychain = require('./lib/keychain');
const ZoomMonitor = require('./lib/zoomMonitor');
const calendarMatch = require('./lib/calendarMatch');
const mailer = require('./lib/mailer');

if (process.platform !== 'darwin') {
  console.error('Coaching Reminder relies on macOS-only integrations (Zoom process detection, Calendar.app via AppleScript) and will not work on this platform.');
}

let tray;
let settingsWindow;
let monitor;
let inCallSince = null;

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 480,
    height: 640,
    resizable: false,
    title: 'Coaching Reminder — Settings',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWindow.loadFile('index.html');
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

function trayTitle() {
  if (inCallSince) {
    const mins = Math.max(0, Math.round((Date.now() - inCallSince.getTime()) / 60000));
    return `In call (${mins}m)`;
  }
  return store.getSettings().enabled ? 'Idle' : 'Paused';
}

function rebuildMenu() {
  if (!tray) return;
  const settings = store.getSettings();
  const recent = store.getActivity().slice(0, 5);

  const recentItems = recent.length
    ? recent.map(a => ({
        label: `${a.emailed ? '✓' : '✗'} ${a.title || 'Untitled'} — ${new Date(a.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`,
        enabled: false,
      }))
    : [{ label: 'No calls detected yet', enabled: false }];

  const menu = Menu.buildFromTemplate([
    { label: trayTitle(), enabled: false },
    { type: 'separator' },
    {
      label: settings.enabled ? 'Pause monitoring' : 'Resume monitoring',
      click: () => { store.saveSettings({ enabled: !settings.enabled }); rebuildMenu(); },
    },
    { type: 'separator' },
    { label: 'Recent', enabled: false },
    ...recentItems,
    { type: 'separator' },
    { label: 'Settings…', click: () => createSettingsWindow() },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip(`Coaching Reminder — ${trayTitle()}`);
}

function notify(title, body) {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
}

async function handleCallEnded({ start, end }) {
  const settings = store.getSettings();
  inCallSince = null;
  rebuildMenu();

  const durationMins = (end.getTime() - start.getTime()) / 60000;
  if (durationMins < (settings.minCallMinutes || 0)) {
    console.log(`[coaching-reminder] Call too short (${durationMins.toFixed(1)}m), skipping`);
    return;
  }

  const callKey = `${start.toISOString()}_${end.toISOString()}`;
  if (store.hasReminderFor(callKey)) return;

  if (!settings.enabled) {
    store.addActivity({ callKey, title: null, emailed: false, skipped: 'paused' });
    rebuildMenu();
    return;
  }

  let match = null;
  try {
    match = await calendarMatch.findBestMatch(start, end, settings.matchBufferMins);
  } catch (e) {
    console.error('[coaching-reminder] Calendar lookup failed:', e.message);
  }

  try {
    await mailer.sendReminder(settings, { callStart: start, callEnd: end, match });
    store.addActivity({ callKey, title: match?.title, emailed: true });
    notify('Reminder sent', match ? `Notes + hours reminder sent for "${match.title}"` : 'Notes + hours reminder sent');
  } catch (e) {
    console.error('[coaching-reminder] Failed to send reminder email:', e.message);
    store.addActivity({ callKey, title: match?.title, emailed: false, error: e.message });
    notify('Reminder email failed', e.message);
  }
  rebuildMenu();
}

function setupIPC() {
  ipcMain.handle('get-settings', () => store.getSettings());

  ipcMain.handle('save-settings', (_, { smtpPass, ...settings }) => {
    store.saveSettings(settings);
    if (smtpPass) keychain.setPassword(settings.smtpUser, smtpPass);
    app.setLoginItemSettings({ openAtLogin: !!settings.launchAtLogin });
    rebuildMenu();
    return true;
  });

  ipcMain.handle('get-activity', () => store.getActivity());

  ipcMain.handle('send-test-email', async () => {
    const settings = store.getSettings();
    await mailer.sendTestEmail(settings);
    return true;
  });
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock.hide();

  store.initialize();
  setupIPC();

  const trayIconPath = path.join(__dirname, 'assets', 'trayTemplate.png');
  const icon = nativeImage.createFromPath(trayIconPath);
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.on('click', () => tray.popUpContextMenu());
  rebuildMenu();

  monitor = new ZoomMonitor(() => store.getSettings());
  monitor.on('start', ({ at }) => { inCallSince = at; rebuildMenu(); });
  monitor.on('end', (window) => { handleCallEnded(window).catch(e => console.error('[coaching-reminder]', e)); });
  monitor.start();

  setInterval(rebuildMenu, 60 * 1000);
});

// Tray-only app: macOS already keeps background (non-dock) apps running
// when their windows close, so no window-all-closed override is needed.
