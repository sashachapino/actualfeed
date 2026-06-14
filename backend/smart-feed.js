const Anthropic = require('@anthropic-ai/sdk');
const db = require('./db');

const SYSTEM_PROMPT = `You are writing the "Smart People Are Thinking" section of a curated weekly digest. Your voice is that of Bilahari Kausikan — the former Singaporean diplomat and scholar: deeply skeptical of Western liberal universalism, attuned to the long cycles of history and the rhythms of power, thoroughly unimpressed by trends and the opinions of people who have never had to govern anything. You hold multiple analytical frameworks simultaneously and are not captured by any of them. You are amused by the gap between elite pretension and geopolitical reality. You take the long view, you notice what the anxious are missing, and you notice what the confident are ignoring. Your irony is dry, not performative. You do not moralize. You do not provide false comfort. You are not an optimist or a pessimist — you are a realist who has seen enough history to find the present unsurprising.`;

async function generateSmartFeed() {
  const apiKey = db.getSetting('anthropicApiKey') || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('No Anthropic API key configured. Add it in Settings.');

  // Recent articles from all tracked sources
  const cutoff = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString();
  const recent = db.getUnreadArticles()
    .filter(a => a.published_date > cutoff)
    .slice(0, 60);

  const articleLines = recent.length > 0
    ? recent.map(a => `[${a.source_id}] "${a.title}" (${(a.published_date || '').slice(0, 10)})`).join('\n')
    : '(No recent tracked articles)';

  // Broader news context
  let newsContext = '';
  try {
    const Parser = require('rss-parser');
    const p = new Parser({ timeout: 8000 });
    const [eco, fa] = await Promise.allSettled([
      p.parseURL('https://www.economist.com/rss/the_world_this_week_rss.xml'),
      p.parseURL('https://www.foreignaffairs.com/rss.xml'),
    ]);
    const headlines = [];
    if (eco.status === 'fulfilled') headlines.push(...eco.value.items.slice(0, 6).map(i => `- ${i.title}`));
    if (fa.status  === 'fulfilled') headlines.push(...fa.value.items.slice(0,  4).map(i => `- ${i.title}`));
    if (headlines.length) newsContext = `\n\nBroader news landscape:\n${headlines.join('\n')}`;
  } catch { /* proceed without */ }

  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1200,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `Here are what the tracked thinkers have published recently:\n\n${articleLines}${newsContext}\n\nWrite a 450–600 word synthesis of what the intellectually serious world is currently preoccupied with. Cover 3–4 themes. Offer a perspective, not a summary. Notice the silences and the presuppositions. Be geopolitically and economically specific. Write flowing prose — no bullet points, no section headers.`,
    }],
  });

  const content = message.content[0].text;
  db.insertSmartFeed(content);
  return { content, generated_at: new Date().toISOString() };
}

function getLatestSmartFeed() {
  return db.getLatestSmartFeed();
}

module.exports = { generateSmartFeed, getLatestSmartFeed };
