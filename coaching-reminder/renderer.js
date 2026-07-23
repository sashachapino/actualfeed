(() => {
  const fields = ['smtpHost', 'smtpPort', 'smtpUser', 'reminderTo', 'fromName',
    'zoomProcessPattern', 'pollSeconds', 'minCallMinutes', 'matchBufferMins'];
  const checkboxes = ['enabled', 'launchAtLogin'];

  async function load() {
    const settings = await window.api.getSettings();
    fields.forEach(id => { document.getElementById(id).value = settings[id] ?? ''; });
    checkboxes.forEach(id => { document.getElementById(id).checked = !!settings[id]; });
    await loadActivity();
  }

  async function loadActivity() {
    const activity = await window.api.getActivity();
    const list = document.getElementById('activity');
    list.innerHTML = '';
    if (!activity.length) {
      const li = document.createElement('li');
      li.textContent = 'No calls detected yet.';
      li.className = 'empty';
      list.appendChild(li);
      return;
    }
    activity.slice(0, 20).forEach(a => {
      const li = document.createElement('li');
      const when = new Date(a.at).toLocaleString();
      const status = a.emailed ? 'sent' : (a.skipped ? `skipped (${a.skipped})` : `failed: ${a.error || 'unknown error'}`);
      li.textContent = `${when} — ${a.title || 'Untitled call'} — ${status}`;
      li.className = a.emailed ? 'ok' : 'warn';
      list.appendChild(li);
    });
  }

  document.getElementById('save').addEventListener('click', async () => {
    const settings = {};
    fields.forEach(id => {
      const el = document.getElementById(id);
      settings[id] = el.type === 'number' ? Number(el.value) : el.value.trim();
    });
    checkboxes.forEach(id => { settings[id] = document.getElementById(id).checked; });

    const smtpPass = document.getElementById('smtpPass').value;
    if (smtpPass) settings.smtpPass = smtpPass;

    await window.api.saveSettings(settings);
    document.getElementById('smtpPass').value = '';
    const result = document.getElementById('saveResult');
    result.textContent = 'Saved.';
    setTimeout(() => { result.textContent = ''; }, 2000);
  });

  document.getElementById('testEmail').addEventListener('click', async () => {
    const result = document.getElementById('testResult');
    result.textContent = 'Sending…';
    try {
      await window.api.sendTestEmail();
      result.textContent = 'Sent!';
    } catch (e) {
      result.textContent = `Failed: ${e.message}`;
    }
    setTimeout(() => { result.textContent = ''; }, 4000);
  });

  load();
  setInterval(loadActivity, 15000);
})();
