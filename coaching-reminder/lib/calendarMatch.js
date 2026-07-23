// Finds the calendar event that best overlaps a finished Zoom call, by
// asking Calendar.app directly via AppleScript.
//
// Fantastical stores its events through the same on-device calendar store
// (EventKit) that Calendar.app reads, as long as the calendars in question
// are added as normal macOS calendar accounts (iCloud, Google, Exchange,
// etc.) rather than a Fantastical-only local list. That's the common setup,
// but if you keep events in a Fantastical-only calendar that never syncs
// into Calendar.app, this won't see them.
//
// The first time this runs, macOS will prompt for permission for this app
// to access your Calendar (and possibly to control Calendar.app via
// Automation) — both prompts need to be approved once.

const { execFile } = require('child_process');

const RS = '\x1e'; // record separator, between events
const FS = '\x1f'; // field separator, between fields of one event
const AS = '\x1d'; // attendee separator, between attendee names

function dateExprAS(d) {
  return `my makeDate(${d.getFullYear()}, ${d.getMonth() + 1}, ${d.getDate()}, ${d.getHours()}, ${d.getMinutes()}, ${d.getSeconds()})`;
}

function buildScript(rangeStart, rangeEnd) {
  return `
on makeDate(y, mo, d, h, mi, s)
  set theDate to current date
  set day of theDate to 1
  set year of theDate to y
  set month of theDate to mo
  set day of theDate to d
  set hours of theDate to h
  set minutes of theDate to mi
  set seconds of theDate to s
  return theDate
end makeDate

set rangeStart to ${dateExprAS(rangeStart)}
set rangeEnd to ${dateExprAS(rangeEnd)}
set outParts to {}

tell application "Calendar"
  repeat with cal in calendars
    try
      set matchingEvents to (every event of cal whose start date < rangeEnd and end date > rangeStart and allday event is false)
    on error
      set matchingEvents to {}
    end try
    repeat with evt in matchingEvents
      set evtTitle to summary of evt
      set evtStart to start date of evt
      set evtEnd to end date of evt
      set attendeeNames to {}
      try
        repeat with att in (attendees of evt)
          set end of attendeeNames to (display name of att)
        end repeat
      end try
      set attendeeStr to my joinList(attendeeNames, "${AS}")
      set end of outParts to (evtTitle & "${FS}" & (evtStart as «class isot» as string) & "${FS}" & (evtEnd as «class isot» as string) & "${FS}" & attendeeStr)
    end repeat
  end repeat
end tell

my joinList(outParts, "${RS}")

on joinList(lst, delim)
  set AppleScript's text item delimiters to delim
  set s to lst as string
  set AppleScript's text item delimiters to ""
  return s
end joinList
`;
}

function run(rangeStart, rangeEnd) {
  return new Promise((resolve, reject) => {
    const script = buildScript(rangeStart, rangeEnd);
    execFile('osascript', ['-e', script], { timeout: 15000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr?.toString().trim() || err.message));
        return;
      }
      resolve(stdout.toString());
    });
  });
}

function parseEvents(raw) {
  if (!raw || !raw.trim()) return [];
  return raw.split(RS).filter(Boolean).map(chunk => {
    const [title, startIso, endIso, attendeeStr] = chunk.split(FS);
    return {
      title: (title || 'Untitled event').trim(),
      start: new Date(startIso),
      end: new Date(endIso),
      attendees: attendeeStr ? attendeeStr.split(AS).map(s => s.trim()).filter(Boolean) : [],
    };
  });
}

function overlapMs(aStart, aEnd, bStart, bEnd) {
  const start = Math.max(aStart.getTime(), bStart.getTime());
  const end = Math.min(aEnd.getTime(), bEnd.getTime());
  return Math.max(0, end - start);
}

// Returns the calendar event with the greatest time-overlap against the
// call window (call start/end padded by `bufferMins` on each side), or null.
async function findBestMatch(callStart, callEnd, bufferMins = 10) {
  const bufferMs = bufferMins * 60 * 1000;
  const rangeStart = new Date(callStart.getTime() - bufferMs);
  const rangeEnd = new Date(callEnd.getTime() + bufferMs);

  const raw = await run(rangeStart, rangeEnd);
  const events = parseEvents(raw);
  if (!events.length) return null;

  let best = null;
  let bestOverlap = -1;
  for (const evt of events) {
    const overlap = overlapMs(callStart, callEnd, evt.start, evt.end);
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = evt;
    }
  }
  return best;
}

module.exports = { findBestMatch };
