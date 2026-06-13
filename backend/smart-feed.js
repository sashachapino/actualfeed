const Anthropic = require('@anthropic-ai/sdk');
const { getDb } = require('./db');

const SYSTEM_PROMPT = `You are writing the "Smart People Are Thinking" section of a curated weekly digest. Your voice is that of Bilahari Kausikan — the former Singaporean diplomat and scholar: deeply skeptical of Western liberal universalism, attuned to the long cycles of history and the rhythms of power, thoroughly unimpressed by trends and the opinions of people who have never had to govern anything. You hold multiple analytical frameworks simultaneously and are not captured by any of them. You are amused by the gap between elite pretension and geopolitical reality. You take the long view, you notice what the anxious are missing, and you notice what the confident are ignoring. Your irony is dry, not performative. You do not moralize. You do not provide false comfort. You are not an optimist or a pessimist — you are a realist who has seen enough history to find the present unsurprising.`;

async function generateSmartFeed() {
  const db = getDb();

  const keyRow = db.prepare("SELECT value FROM settings WHERE key = 'anthropicApiKey'").get();
  const apiKey = keyRow?.value || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error('No Anthropic API key configured. Add it in Settings.');
  }

  // Get recent articles from tracked sources (last 3 weeks)
  const cutoff = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString();
  const articles = db.prepare(`
    SELECT source_id, title, published_date
    FROM articles
    WHERE published_date > ?
    ORDER BY published_date DESC
    LIMIT 60
  `).all(cutoff);

  // Try to get some broader news context from The Economist
  let newsContext = '';
  try {
    const Parser = require('rss-parser');
    const p = new Parser({ timeout: 8000 });
    const [economist, fa] = await Promise.allSettled([
      p.parseURL('https://www.economist.com/rss/the_world_this_week_rss.xml'),
      p.parseURL('https://www.foreignaffairs.com/rss.xml'),
    ]);
    const headlines = [];
    if (economist.status === 'fulfilled') {
      headlines.push(...economist.value.items.slice(0, 6).map(i => `- ${i.title}`));
    }
    if (fa.status === 'fulfilled') {
      headlines.push(...fa.value.items.slice(0, 4).map(i => `- ${i.title}`));
    }
    if (headlines.length > 0) {
      newsContext = `\n\nBroader news landscape:\n${headlines.join('\n')}`;
    }
  } catch {
    // proceed without broader context
  }

  const articleLines = articles.length > 0
    ? articles.map(a => `[${a.source_id}] "${a.title}" (${(a.published_date || '').slice(0, 10)})`).join('\n')
    : '(No recent tracked articles)';

  const userPrompt = `Here are what the tracked thinkers have published recently:\n\n${articleLines}${newsContext}

Write a 450–600 word synthesis of what the intellectually serious world is currently preoccupied with. Cover 3–4 themes. Offer a perspective, not a summary. Notice the silences and the presuppositions. Be geopolitically and economically specific. Write flowing prose — no bullet points, no section headers.`;

  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1200,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const content = message.content[0].text;

  db.prepare(`INSERT INTO smart_feed (content, generated_at) VALUES (?, datetime('now'))`).run(content);

  return { content, generated_at: new Date().toISOString() };
}

function getLatestSmartFeed() {
  const db = getDb();
  return db.prepare(`SELECT content, generated_at FROM smart_feed ORDER BY id DESC LIMIT 1`).get() || null;
}

module.exports = { generateSmartFeed, getLatestSmartFeed };
