// Heuristic Zoom "in a meeting" detector for macOS.
//
// Zoom doesn't expose a public local API for meeting state. The common trick
// (used by several menu-bar "Zoom status" utilities) is that Zoom spawns a
// dedicated helper process — historically named `CptHost` — only while a
// meeting's audio/video pipeline is active, and it disappears the moment the
// call ends. That process name has changed across Zoom versions before and
// may change again, so it's exposed as a configurable, comma-separated list
// of substrings (case-insensitive) rather than hardcoded, and is checked
// against the live process list on an interval.
//
// This is a best-effort signal, not a guarantee — if Zoom renames its helper
// process again, adjust "Zoom process name pattern" in Settings and this
// keeps working without a code change.

const { EventEmitter } = require('events');
const { exec } = require('child_process');

class ZoomMonitor extends EventEmitter {
  constructor(getSettings) {
    super();
    this.getSettings = getSettings;
    this.inCall = false;
    this.callStart = null;
    this.timer = null;
  }

  start() {
    this.stop();
    const tick = () => {
      const { pollSeconds } = this.getSettings();
      this.timer = setTimeout(() => this.poll().finally(tick), Math.max(5, pollSeconds || 20) * 1000);
    };
    tick();
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  poll() {
    return new Promise((resolve) => {
      exec('ps -axo comm=', { timeout: 5000 }, (err, stdout) => {
        if (err) {
          resolve();
          return;
        }
        const { zoomProcessPattern } = this.getSettings();
        const patterns = (zoomProcessPattern || 'CptHost')
          .split(',')
          .map(s => s.trim().toLowerCase())
          .filter(Boolean);
        const lower = stdout.toLowerCase();
        const nowInCall = patterns.some(p => lower.includes(p));

        if (nowInCall && !this.inCall) {
          this.inCall = true;
          this.callStart = new Date();
          this.emit('start', { at: this.callStart });
        } else if (!nowInCall && this.inCall) {
          this.inCall = false;
          const end = new Date();
          const start = this.callStart;
          this.callStart = null;
          this.emit('end', { start, end });
        }
        resolve();
      });
    });
  }
}

module.exports = ZoomMonitor;
