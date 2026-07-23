const nodemailer = require('nodemailer');
const keychain = require('./keychain');

function fmtTime(d) {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function fmtDurationMins(startMs, endMs) {
  return Math.max(1, Math.round((endMs - startMs) / 60000));
}

function buildReminder({ callStart, callEnd, match }) {
  const durationMins = fmtDurationMins(callStart.getTime(), callEnd.getTime());
  const who = match ? match.title : null;

  const subject = who
    ? `Log notes + hours: ${who}`
    : `Log notes + hours for your ${durationMins}-min call`;

  const lines = [];
  if (who) {
    lines.push(`You just finished a call — matched to your calendar event "${who}".`);
  } else {
    lines.push(`You just finished a Zoom call, but it couldn't be matched to a calendar event.`);
  }
  lines.push('');
  lines.push(`Call time: ${fmtTime(callStart)}–${fmtTime(callEnd)} (~${durationMins} min)`);
  if (match && match.attendees.length) {
    lines.push(`Calendar attendees: ${match.attendees.join(', ')}`);
  }
  lines.push('');
  lines.push('Two things to do now:');
  lines.push('  1. Send session notes to the client.');
  lines.push('  2. Log this session’s hours on your time sheet.');

  const text = lines.join('\n');
  return { subject, text };
}

async function sendReminder(settings, payload) {
  const { smtpHost, smtpPort, smtpUser, reminderTo, fromName } = settings;
  if (!smtpHost || !smtpUser || !reminderTo) {
    throw new Error('SMTP is not fully configured (host/user/recipient missing)');
  }
  const smtpPass = keychain.getPassword(smtpUser);
  if (!smtpPass) {
    throw new Error('No SMTP password saved in Keychain for this account — re-save it in Settings');
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: Number(smtpPort) === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });

  const { subject, text } = buildReminder(payload);

  await transporter.sendMail({
    from: `"${fromName || 'Coaching Reminder'}" <${smtpUser}>`,
    to: reminderTo,
    subject,
    text,
  });

  return { subject, text };
}

async function sendTestEmail(settings) {
  return sendReminder(settings, {
    callStart: new Date(Date.now() - 30 * 60 * 1000),
    callEnd: new Date(),
    match: { title: 'Test Client — Coaching Session', attendees: ['Test Client'] },
  });
}

module.exports = { sendReminder, sendTestEmail, buildReminder };
