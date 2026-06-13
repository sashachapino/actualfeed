const nodemailer = require('nodemailer');
const { getDb } = require('./db');

const RECIPIENT = 'sasha.chapin@gmail.com';

async function sendWeeklyDigest() {
  const db = getDb();
  const get = key => db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value;

  const smtpHost = get('smtpHost') || process.env.SMTP_HOST;
  const smtpPort = parseInt(get('smtpPort') || process.env.SMTP_PORT || '587', 10);
  const smtpUser = get('smtpUser') || process.env.SMTP_USER;
  const smtpPass = get('smtpPass') || process.env.SMTP_PASS;

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.log('[email] Not configured — skipping weekly digest');
    return false;
  }

  const unreadCount = db.prepare('SELECT COUNT(*) as n FROM articles WHERE is_read = 0').get().n;

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f0e8;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0e8;padding:40px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#1a1612;border-radius:4px;overflow:hidden;">
        <tr>
          <td style="padding:32px 40px 20px;border-bottom:1px solid #2a2520;">
            <p style="margin:0;font-family:Georgia,serif;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#c4913a;">ActualFeed</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 40px;">
            <p style="margin:0 0 16px;font-family:Georgia,serif;font-size:22px;color:#e0d8cc;line-height:1.4;">Your weekly digest is ready.</p>
            <p style="margin:0 0 24px;font-family:Georgia,serif;font-size:15px;color:#9a8f80;line-height:1.7;">
              There ${unreadCount === 1 ? 'is' : 'are'} <span style="color:#c4913a;font-weight:bold;">${unreadCount}</span>
              unread ${unreadCount === 1 ? 'article' : 'articles'} from the people worth reading.
            </p>
            <p style="margin:0;font-family:Georgia,serif;font-size:13px;color:#5a5048;font-style:italic;">
              Open ActualFeed on your desktop.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await transporter.sendMail({
    from: `"ActualFeed" <${smtpUser}>`,
    to: RECIPIENT,
    subject: `ActualFeed — ${unreadCount} new ${unreadCount === 1 ? 'piece' : 'pieces'} this week`,
    html,
  });

  console.log('[email] Weekly digest sent to', RECIPIENT);
  return true;
}

module.exports = { sendWeeklyDigest };
