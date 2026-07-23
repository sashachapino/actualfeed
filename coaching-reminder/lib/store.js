const fs   = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULT_SETTINGS = {
  smtpHost:        '',
  smtpPort:        587,
  smtpUser:        '',
  reminderTo:      '',
  fromName:        'Coaching Reminder',
  pollSeconds:     20,
  zoomProcessPattern: 'CptHost',
  matchBufferMins: 10,
  minCallMinutes:  3,
  launchAtLogin:   false,
  enabled:         true,
};

let file;
let data = { settings: { ...DEFAULT_SETTINGS }, activity: [] };

function initialize() {
  file = path.join(app.getPath('userData'), 'coaching-reminder.json');
  if (fs.existsSync(file)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      data.settings = { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) };
      data.activity = parsed.activity || [];
    } catch (e) {
      console.error('[store] Read error, starting fresh:', e.message);
    }
  }
}

function save() {
  try {
    fs.writeFileSync(file, JSON.stringify(data));
  } catch (e) {
    console.error('[store] Write error:', e.message);
  }
}

function getSettings() {
  return { ...data.settings };
}

function saveSettings(settings) {
  Object.assign(data.settings, settings);
  save();
}

function getActivity() {
  return [...data.activity].reverse();
}

function addActivity(entry) {
  data.activity.push({ id: Date.now(), at: new Date().toISOString(), ...entry });
  if (data.activity.length > 200) data.activity = data.activity.slice(-200);
  save();
  return data.activity[data.activity.length - 1];
}

// dedupe key so a Zoom call that gets detected as two flappy start/stop
// transitions in a row doesn't fire two reminder emails
function hasReminderFor(callKey) {
  return data.activity.some(a => a.callKey === callKey && a.emailed);
}

module.exports = {
  initialize,
  getSettings,
  saveSettings,
  getActivity,
  addActivity,
  hasReminderFor,
};
