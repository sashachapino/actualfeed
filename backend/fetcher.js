const Parser = require('rss-parser');
const { getDb } = require('./db');
const sources = require('./sources');

const parser = new Parser({
  timeout: 15000,
  headers: { 'User-Agent': 'ActualFeed/1.0 RSS Reader' },
  customFields: { item: ['description'] },
});

function extractSnippet(raw) {
  if (!raw) return '';
  const text = raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, 1000);
}

async function fetchFeed(url) {
  return parser.parseURL(url);
}

async function processItems(source, items) {
  const db = getDb();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO articles (source_id, title, url, content_snippet, published_date)
    VALUES (?, ?, ?, ?, ?)
  `);

  let inserted = 0;
  for (const item of items.slice(0, 20)) {
    const snippet = extractSnippet(
      item.contentSnippet || item['content:encodedSnippet'] || item.content || item.description || item.summary || ''
    );
    const pub = item.pubDate || item.isoDate || new Date().toISOString();
    const url = item.link || item.guid || '';
    if (!url) continue;

    const r = insert.run(source.id, item.title?.trim() || 'Untitled', url, snippet, pub);
    if (r.changes > 0) inserted++;
  }
  return inserted;
}

async function fetchRSS(source) {
  let feed;
  try {
    feed = await fetchFeed(source.feedUrl);
  } catch (err) {
    if (source.fallbackFeedUrl) {
      try {
        feed = await fetchFeed(source.fallbackFeedUrl);
      } catch (err2) {
        console.error(`[${source.id}] Both feeds failed:`, err2.message);
        return 0;
      }
    } else {
      console.error(`[${source.id}] RSS failed:`, err.message);
      return 0;
    }
  }

  const inserted = await processItems(source, feed.items || []);
  console.log(`[${source.id}] RSS: ${feed.items?.length ?? 0} items, ${inserted} new`);
  return inserted;
}

async function fetchGoogleNews(source) {
  const q = encodeURIComponent(source.searchQuery);
  const url = `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;

  let feed;
  try {
    feed = await fetchFeed(url);
  } catch (err) {
    console.error(`[${source.id}] Google News failed:`, err.message);
    return 0;
  }

  const inserted = await processItems(source, feed.items || []);
  console.log(`[${source.id}] GNews: ${feed.items?.length ?? 0} items, ${inserted} new`);
  return inserted;
}

async function refreshAll() {
  console.log('[fetcher] Starting refresh...');
  const results = await Promise.allSettled(
    sources.map(s => {
      if (s.type === 'rss') return fetchRSS(s);
      if (s.type === 'google-news') return fetchGoogleNews(s);
      return Promise.resolve(0);
    })
  );

  const total = results.reduce((sum, r) => sum + (r.status === 'fulfilled' ? r.value : 0), 0);
  console.log(`[fetcher] Done. ${total} new articles.`);
  return total;
}

module.exports = { refreshAll };
