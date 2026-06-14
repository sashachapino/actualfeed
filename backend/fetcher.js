const Parser = require('rss-parser');
const db      = require('./db');
const sources = require('./sources');

const parser = new Parser({
  timeout: 15000,
  headers: { 'User-Agent': 'ActualFeed/1.0 RSS Reader' },
  customFields: { item: ['description'] },
});

function extractSnippet(raw) {
  if (!raw) return '';
  return raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ').trim()
    .slice(0, 1000);
}

async function fetchFeed(url) {
  return parser.parseURL(url);
}

async function processItems(source, items) {
  let inserted = 0;
  for (const item of items.slice(0, 20)) {
    const ok = db.insertArticle({
      source_id:       source.id,
      title:           item.title?.trim() || 'Untitled',
      url:             item.link || item.guid || '',
      content_snippet: extractSnippet(
        item.contentSnippet || item['content:encodedSnippet'] || item.content || item.description || item.summary || ''
      ),
      published_date: item.pubDate || item.isoDate || new Date().toISOString(),
    });
    if (ok) inserted++;
  }
  return inserted;
}

async function fetchRSS(source) {
  let feed;
  try {
    feed = await fetchFeed(source.feedUrl);
  } catch {
    if (source.fallbackFeedUrl) {
      try { feed = await fetchFeed(source.fallbackFeedUrl); }
      catch (e) { console.error(`[${source.id}] both feeds failed:`, e.message); return 0; }
    } else {
      return 0;
    }
  }
  const n = await processItems(source, feed.items || []);
  console.log(`[${source.id}] RSS: ${n} new`);
  return n;
}

async function fetchGoogleNews(source) {
  const q   = encodeURIComponent(source.searchQuery);
  const url = `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
  let feed;
  try { feed = await fetchFeed(url); }
  catch (e) { console.error(`[${source.id}] GNews failed:`, e.message); return 0; }
  const n = await processItems(source, feed.items || []);
  console.log(`[${source.id}] GNews: ${n} new`);
  return n;
}

async function refreshAll() {
  console.log('[fetcher] Refreshing…');
  const results = await Promise.allSettled(
    sources.map(s => s.type === 'rss' ? fetchRSS(s) : fetchGoogleNews(s))
  );
  const total = results.reduce((sum, r) => sum + (r.status === 'fulfilled' ? r.value : 0), 0);
  console.log(`[fetcher] Done — ${total} new articles`);
  return total;
}

module.exports = { refreshAll };
