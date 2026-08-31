-- Migration: 0001_create_news_table.sql
-- Table des actualités et nouveautés pour Yapapouaiye Launcher & Site

CREATE TABLE IF NOT EXISTS news (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  badge TEXT DEFAULT 'Mise à jour',
  version TEXT DEFAULT '',
  date TEXT NOT NULL,
  author TEXT DEFAULT 'Admin',
  featured INTEGER DEFAULT 0,
  summary TEXT DEFAULT '',
  content TEXT NOT NULL,
  image TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_news_created_at ON news(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_featured ON news(featured DESC, created_at DESC);
