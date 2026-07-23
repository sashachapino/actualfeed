# Coaching Reminder

A tiny macOS menu-bar app for a coaching practice. It watches for a Zoom call
ending, matches it against your calendar (Fantastical/Calendar.app), and
emails you a reminder to send session notes and log hours — so admin never
falls through the cracks.

No dock icon, no window by default — just a menu-bar item with a Settings
panel.

## How it works

1. **Call detection** (`lib/zoomMonitor.js`) polls the local process list
   every N seconds for a Zoom helper process that's only present while a
   meeting's audio/video is live (historically named `CptHost`). This is a
   heuristic, not an official API — Zoom has changed internal process names
   before. The pattern is configurable in Settings (comma-separated,
   case-insensitive substrings) if detection stops working after a Zoom
   update.
2. **Calendar match** (`lib/calendarMatch.js`) asks Calendar.app, via
   AppleScript, for the event that best overlaps the call's start/end time
   (padded by a configurable buffer). This relies on Fantastical's events
   being synced into a normal macOS calendar account (iCloud/Google/Exchange
   etc.) — Fantastical uses the same on-device EventKit store as Calendar.app
   for those. A Fantastical-only local calendar that never syncs into
   Calendar.app won't be visible here.
3. **Reminder email** (`lib/mailer.js`) sends via SMTP (nodemailer) once the
   call ends, naming the matched event/client and asking you to send notes
   and log hours. If no event matched, it still sends — just without a name.

Sent reminders are deduplicated by call start/end time so a flaky detection
(quick on/off) won't double-email you, and are logged in the Settings window
under "Recent activity".

## Setup (on your Mac)

```
cd coaching-reminder
npm install
npm start
```

On first run macOS will prompt to let the app control Calendar (Automation)
and/or access your calendar data — approve both. If you don't see the
prompt, add the app manually under **System Settings → Privacy & Security →
Calendars / Automation**.

Open the tray icon → **Settings…** and fill in:
- SMTP host/port/username (e.g. Gmail: `smtp.gmail.com`, port `587`, an
  [App Password](https://myaccount.google.com/apppasswords) as the password
  — not your normal Gmail password)
- The address to send reminders to (probably your own inbox)

The SMTP password is stored in your macOS Keychain (via the `security` CLI),
not in a plaintext settings file.

Use **Send test email** to confirm delivery before relying on it.

## Packaging as a standalone app

```
npm run build:mac
```

produces a `.dmg` in `dist/` (via `electron-builder`) that you can drag into
Applications and set to launch at login (also toggleable from Settings).

## Known limitations / things to watch

- **macOS only.** Zoom process detection and the Calendar.app AppleScript
  integration are both Mac-specific; the app logs an error and won't
  function on Windows/Linux.
- **Heuristic call detection.** The Zoom helper-process trick can break on
  a Zoom app update. If reminders stop firing, check Activity Monitor during
  a live call for the actual helper process name and update the pattern in
  Settings.
- **Calendar match is best-effort.** If two calendar events overlap the
  call window, it picks the one with the largest time overlap — it doesn't
  understand which one you actually joined.
- **Untested in this environment.** This code was written and syntax-checked
  in a Linux sandbox that can't run Electron or macOS-only APIs (Zoom
  process polling, Calendar.app AppleScript, Keychain `security` CLI) — the
  `electron` binary itself couldn't even be downloaded here. It has **not**
  been run live end-to-end. Please try it on your Mac and treat the first
  few real calls as a trial — check that detection, matching, and the email
  all come through as expected, and report back anything that misbehaves.
