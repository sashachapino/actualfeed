const path = require('path');
const { app } = require('electron');
const Database = require('better-sqlite3');

let db;

function initialize() {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'actualfeed.db');

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS articles (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id     TEXT    NOT NULL,
      title         TEXT    NOT NULL,
      url           TEXT    NOT NULL UNIQUE,
      content_snippet TEXT,
      published_date  TEXT,
      fetched_at    TEXT    DEFAULT (datetime('now')),
      is_read       INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS smart_feed (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      content      TEXT NOT NULL,
      generated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source_id);
    CREATE INDEX IF NOT EXISTS idx_articles_read   ON articles(is_read);
    CREATE INDEX IF NOT EXISTS idx_articles_date   ON articles(published_date DESC);
  `);

  return db;
}

function getDb() {
  return db;
}

module.exports = { initialize, getDb };
