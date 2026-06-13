/* ActualFeed renderer — runs in Electron BrowserWindow */
const { api } = window;

// ── State ──────────────────────────────────────────────────────────
let currentSource  = 'unread';
let currentArticle = null;
let visibleArticles = [];
let allSources = [];

// ── Boot ───────────────────────────────────────────────────────────
async function init() {
  allSources = await api.getSources();
  renderSourceList();
  await loadPane('unread');
}

// ── Sidebar ────────────────────────────────────────────────────────
function renderSourceList() {
  const list = document.getElementById('source-list');
  list.innerHTML = allSources.map(s => `
    <div class="source-item ${s.id === currentSource ? 'active' : ''}" data-source="${s.id}">
      <div class="source-main">
        ${esc(s.name)}
        ${s.subtitle ? `<span class="source-sub">${esc(s.subtitle)}</span>` : ''}
      </div>
      <span class="source-count" id="cnt-${s.id}"></span>
    </div>
  `).join('');

  list.querySelectorAll('.source-item').forEach(el =>
    el.addEventListener('click', () => loadPane(el.dataset.source))
  );

  refreshCounts();
}

async function refreshCounts() {
  const counts = await api.getUnreadCounts();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  const totalEl = document.getElementById('unread-total');
  if (totalEl) totalEl.textContent = total > 0 ? total : '';

  allSources.forEach(s => {
    const el = document.getElementById(`cnt-${s.id}`);
    if (!el) return;
    const n = counts[s.id] || 0;
    el.textContent = n > 0 ? n : '';
    const item = document.querySelector(`.source-item[data-source="${s.id}"]`);
    if (item) item.classList.toggle('has-unread', n > 0);
  });
}

function setActiveNav(sourceId) {
  document.querySelectorAll('.nav-item, .source-item').forEach(el =>
    el.classList.toggle('active', el.dataset.source === sourceId)
  );
}

// ── Pane loading ───────────────────────────────────────────────────
async function loadPane(sourceId) {
  currentSource  = sourceId;
  currentArticle = null;
  setActiveNav(sourceId);
  closeReader();

  if (sourceId === 'smart-feed') {
    document.getElementById('pane-title').textContent = 'Smart Feed';
    document.getElementById('mark-all-btn').style.display = 'none';
    document.getElementById('article-list').innerHTML = '<div class="pane-empty">—</div>';
    await showSmartFeed();
    return;
  }

  const title = sourceId === 'unread'
    ? 'All Unread'
    : (allSources.find(s => s.id === sourceId)?.name || sourceId);

  document.getElementById('pane-title').textContent = title;
  document.getElementById('article-list').innerHTML = '<div class="pane-empty">Loading…</div>';

  visibleArticles = sourceId === 'unread'
    ? await api.getUnreadArticles()
    : await api.getArticlesBySource(sourceId);

  renderArticleList();
}

// ── Article list ───────────────────────────────────────────────────
function renderArticleList() {
  const list = document.getElementById('article-list');
  const markAllBtn = document.getElementById('mark-all-btn');

  if (visibleArticles.length === 0) {
    list.innerHTML = '<div class="pane-empty">Nothing here yet.<br>Try ↻ Refresh.</div>';
    markAllBtn.style.display = 'none';
    return;
  }

  const unreadIds = visibleArticles.filter(a => !a.is_read).map(a => a.id);
  markAllBtn.style.display = unreadIds.length > 0 ? '' : 'none';

  list.innerHTML = visibleArticles.map(a => `
    <div class="article-item ${a.is_read ? 'read' : 'unread'} ${currentArticle?.id === a.id ? 'active' : ''}"
         data-id="${a.id}">
      <div class="article-title">${esc(a.title)}</div>
      <div class="article-meta">
        ${currentSource === 'unread' ? `<span class="article-source-tag">${esc(a.source_name)}</span><span>·</span>` : ''}
        <span class="article-date">${fmtDate(a.published_date)}</span>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.article-item').forEach(el =>
    el.addEventListener('click', () => openArticle(parseInt(el.dataset.id)))
  );
}

// ── Article reader ─────────────────────────────────────────────────
function openArticle(id) {
  currentArticle = visibleArticles.find(a => a.id === id);
  if (!currentArticle) return;

  // Highlight in list
  document.querySelectorAll('.article-item')
    .forEach(el => el.classList.toggle('active', parseInt(el.dataset.id) === id));

  // Hide other panels
  document.getElementById('reader-empty').style.display  = 'none';
  document.getElementById('reader-smart').style.display  = 'none';
  document.getElementById('reader-article').style.display = 'block';

  // Fill content
  document.getElementById('reader-source').textContent = currentArticle.source_name || '';
  document.getElementById('reader-date').textContent   = fmtDate(currentArticle.published_date);
  document.getElementById('reader-title').textContent  = currentArticle.title;

  const body = document.getElementById('reader-body');
  const snippet = currentArticle.content_snippet;
  if (snippet && snippet.length > 30) {
    const paras = snippet.split(/\n{2,}/);
    body.innerHTML = paras.map(p => `<p>${esc(p.trim())}</p>`).join('');
  } else {
    body.innerHTML = `<p style="color:var(--text-dim);font-style:italic;">No preview available — open in browser to read.</p>`;
  }

  const readBtn = document.getElementById('read-btn');
  if (currentArticle.is_read) {
    readBtn.textContent = '✓ Already read';
    readBtn.disabled = true;
  } else {
    readBtn.textContent = 'Mark as Read';
    readBtn.disabled = false;
  }

  document.getElementById('open-btn').dataset.url = currentArticle.url;
}

function closeReader() {
  document.getElementById('reader-empty').style.display   = 'flex';
  document.getElementById('reader-article').style.display = 'none';
  document.getElementById('reader-smart').style.display   = 'none';
}

async function markCurrentRead() {
  if (!currentArticle || currentArticle.is_read) return;
  await api.markAsRead(currentArticle.id);
  currentArticle.is_read = true;

  // Update list item
  const el = document.querySelector(`.article-item[data-id="${currentArticle.id}"]`);
  if (el) {
    el.classList.remove('unread');
    el.classList.add('read');
  }

  // Update button
  const btn = document.getElementById('read-btn');
  btn.textContent = '✓ Read';
  btn.disabled = true;

  await refreshCounts();
  renderArticleList(); // re-check mark-all visibility
}

async function markAllRead() {
  const ids = visibleArticles.filter(a => !a.is_read).map(a => a.id);
  if (ids.length === 0) return;
  await api.markAllRead(ids);
  visibleArticles.forEach(a => { if (ids.includes(a.id)) a.is_read = true; });
  renderArticleList();
  closeReader();
  await refreshCounts();
  toast(`Marked ${ids.length} as read.`);
}

// ── Smart Feed ─────────────────────────────────────────────────────
async function showSmartFeed() {
  document.getElementById('reader-empty').style.display   = 'none';
  document.getElementById('reader-article').style.display = 'none';
  document.getElementById('reader-smart').style.display   = 'block';

  const feed = await api.getSmartFeed();
  if (feed) {
    document.getElementById('smart-date').textContent = `Generated ${fmtDate(feed.generated_at)}`;
    document.getElementById('smart-body').textContent = feed.content;
  } else {
    document.getElementById('smart-date').textContent = '';
    document.getElementById('smart-body').textContent =
      'No synthesis generated yet.\n\nAdd your Anthropic API key in Settings, then click Regenerate.';
  }
}

async function regenerate() {
  const btn = document.getElementById('regen-btn');
  btn.disabled = true;
  btn.textContent = '↺ Generating…';
  document.getElementById('smart-body').textContent = 'Consulting the oracle…';
  document.getElementById('smart-date').textContent = '';

  try {
    const feed = await api.generateSmartFeed();
    document.getElementById('smart-date').textContent = `Generated ${fmtDate(feed.generated_at)}`;
    document.getElementById('smart-body').textContent = feed.content;
  } catch (e) {
    document.getElementById('smart-body').textContent =
      `Error: ${e.message}\n\nCheck your Anthropic API key in Settings.`;
  } finally {
    btn.disabled = false;
    btn.textContent = '↺ Regenerate';
  }
}

// ── Refresh ────────────────────────────────────────────────────────
async function refresh() {
  const btn = document.getElementById('refresh-btn');
  btn.textContent = '↻ …';
  btn.disabled = true;
  toast('Refreshing feeds…');

  try {
    const n = await api.refreshFeeds();
    await refreshCounts();
    if (currentSource !== 'smart-feed') {
      visibleArticles = currentSource === 'unread'
        ? await api.getUnreadArticles()
        : await api.getArticlesBySource(currentSource);
      renderArticleList();
    }
    toast(n > 0 ? `${n} new ${n === 1 ? 'article' : 'articles'}.` : 'Up to date.');
  } catch (e) {
    toast('Refresh failed.');
  } finally {
    btn.textContent = '↻ Refresh';
    btn.disabled = false;
  }
}

// ── Settings modal ─────────────────────────────────────────────────
async function openSettings() {
  const s = await api.getSettings();
  document.getElementById('s-api-key').value   = s.anthropicApiKey || '';
  document.getElementById('s-smtp-host').value = s.smtpHost || '';
  document.getElementById('s-smtp-port').value = s.smtpPort || '587';
  document.getElementById('s-smtp-user').value = s.smtpUser || '';
  document.getElementById('s-smtp-pass').value = s.smtpPass || '';
  document.getElementById('settings-overlay').style.display = 'flex';
}

async function saveSettings() {
  await api.saveSettings({
    anthropicApiKey: document.getElementById('s-api-key').value.trim(),
    smtpHost:        document.getElementById('s-smtp-host').value.trim(),
    smtpPort:        document.getElementById('s-smtp-port').value.trim(),
    smtpUser:        document.getElementById('s-smtp-user').value.trim(),
    smtpPass:        document.getElementById('s-smtp-pass').value.trim(),
  });
  closeSettings();
  toast('Settings saved.');
}

function closeSettings() {
  document.getElementById('settings-overlay').style.display = 'none';
}

// ── Toast ──────────────────────────────────────────────────────────
let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.display = 'block';
  el.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.opacity = '0'; setTimeout(() => { el.style.display = 'none'; }, 300); }, 3000);
}

// ── Utilities ──────────────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(str) {
  if (!str) return '';
  const d = new Date(str);
  if (isNaN(d)) return str;
  const now = new Date();
  const days = Math.floor((now - d) / 86400000);
  if (days < 0)  return 'Today';
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7)  return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

// ── Event bindings ─────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(el =>
  el.addEventListener('click', () => loadPane(el.dataset.source))
);

document.getElementById('refresh-btn').addEventListener('click', refresh);
document.getElementById('settings-btn').addEventListener('click', openSettings);
document.getElementById('mark-all-btn').addEventListener('click', markAllRead);
document.getElementById('read-btn').addEventListener('click', markCurrentRead);
document.getElementById('regen-btn').addEventListener('click', regenerate);

document.getElementById('open-btn').addEventListener('click', e => {
  const url = e.currentTarget.dataset.url;
  if (url) api.openExternal(url);
});

document.getElementById('save-settings-btn').addEventListener('click', saveSettings);
document.getElementById('cancel-settings-btn').addEventListener('click', closeSettings);
document.getElementById('close-modal-btn').addEventListener('click', closeSettings);

document.getElementById('test-email-btn').addEventListener('click', async () => {
  const btn = document.getElementById('test-email-btn');
  btn.textContent = 'Sending…';
  btn.disabled = true;
  try {
    await api.sendTestEmail();
    toast('Test email sent to sasha.chapin@gmail.com');
  } catch (e) {
    toast('Email failed: ' + e.message);
  } finally {
    btn.textContent = 'Send Test Email';
    btn.disabled = false;
  }
});

// Close modal on overlay click
document.getElementById('settings-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeSettings();
});

// ── Start ──────────────────────────────────────────────────────────
init();
