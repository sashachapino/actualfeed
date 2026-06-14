const fs   = require('fs');
const path = require('path');
const { app } = require('electron');

let dbFile;
let data = { articles: [], smart_feed: [], settings: {} };

function initialize() {
  dbFile = path.join(app.getPath('userData'), 'actualfeed.json');
  if (fs.existsSync(dbFile)) {
    try {
      const raw = fs.readFileSync(dbFile, 'utf8');
      const parsed = JSON.parse(raw);
      data.articles   = parsed.articles   || [];
      data.smart_feed = parsed.smart_feed || [];
      data.settings   = parsed.settings   || {};
    } catch (e) {
      console.error('[db] Read error, starting fresh:', e.message);
    }
  }
}

function save() {
  try {
    fs.writeFileSync(dbFile, JSON.stringify(data));
  } catch (e) {
    console.error('[db] Write error:', e.message);
  }
}

// ── Articles ───────────────────────────────────────────────────────

function insertArticle({ source_id, title, url, content_snippet, published_date }) {
  if (!url || data.articles.some(a => a.url === url)) return false;
  data.articles.push({
    id:              Date.now() + Math.floor(Math.random() * 10000),
    source_id,
    title:           title || 'Untitled',
    url,
    content_snippet: content_snippet || '',
    published_date:  published_date  || new Date().toISOString(),
    fetched_at:      new Date().toISOString(),
    is_read:         false,
  });
  save();
  return true;
}

function getUnreadArticles() {
  return [...data.articles]
    .filter(a => !a.is_read)
    .sort((a, b) => new Date(b.published_date) - new Date(a.published_date))
    .slice(0, 200);
}

function getArticlesBySource(sourceId) {
  return [...data.articles]
    .filter(a => a.source_id === sourceId)
    .sort((a, b) => new Date(b.published_date) - new Date(a.published_date))
    .slice(0, 80);
}

function getUnreadCounts() {
  const counts = {};
  data.articles.filter(a => !a.is_read).forEach(a => {
    counts[a.source_id] = (counts[a.source_id] || 0) + 1;
  });
  return counts;
}

function markAsRead(id) {
  const a = data.articles.find(a => a.id === id);
  if (a) { a.is_read = true; save(); }
}

function markAllRead(ids) {
  const set = new Set(ids);
  data.articles.forEach(a => { if (set.has(a.id)) a.is_read = true; });
  save();
}

// ── Smart Feed ─────────────────────────────────────────────────────

function insertSmartFeed(content) {
  data.smart_feed.push({ id: Date.now(), content, generated_at: new Date().toISOString() });
  if (data.smart_feed.length > 20) data.smart_feed = data.smart_feed.slice(-20);
  save();
}

function getLatestSmartFeed() {
  if (!data.smart_feed.length) return null;
  return data.smart_feed[data.smart_feed.length - 1];
}

// ── Settings ───────────────────────────────────────────────────────

function getSettings() {
  return { ...data.settings };
}

function saveSettings(settings) {
  Object.assign(data.settings, settings);
  save();
}

function getSetting(key) {
  return data.settings[key];
}

module.exports = {
  initialize,
  insertArticle,
  getUnreadArticles,
  getArticlesBySource,
  getUnreadCounts,
  markAsRead,
  markAllRead,
  insertSmartFeed,
  getLatestSmartFeed,
  getSettings,
  saveSettings,
  getSetting,
};
