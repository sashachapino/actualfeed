// Stores the SMTP password in the macOS login Keychain via the `security`
// CLI, so it never sits in plaintext in our JSON settings file. No native
// node module / compilation required.
const { execFileSync } = require('child_process');

const SERVICE = 'coaching-reminder-smtp';

function setPassword(account, password) {
  if (!account) return;
  try {
    execFileSync('security', ['delete-generic-password', '-a', account, '-s', SERVICE], { stdio: 'ignore' });
  } catch (e) {
    // no existing entry — fine
  }
  execFileSync('security', ['add-generic-password', '-a', account, '-s', SERVICE, '-w', password, '-U']);
}

function getPassword(account) {
  if (!account) return '';
  try {
    return execFileSync('security', ['find-generic-password', '-a', account, '-s', SERVICE, '-w'])
      .toString('utf8')
      .trim();
  } catch (e) {
    return '';
  }
}

module.exports = { setPassword, getPassword };
