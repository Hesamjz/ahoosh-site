-- news-aggregator D1 schema. Apply:
--   npx wrangler d1 execute ahoosh-news --remote --file=./schema.sql
-- Only business-relevant items are stored (relevance gate runs before insert).
-- Canonical text is English; FA/DE/SR are translations for display.

CREATE TABLE IF NOT EXISTS news_items (
  id INTEGER PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,          -- dedupe key
  source TEXT NOT NULL,
  src_lang TEXT NOT NULL,
  category TEXT,                     -- markets|economy|finance|business|trade-supply|crypto|ai-tech
  title_en TEXT NOT NULL,
  summary_en TEXT,
  title_fa TEXT, summary_fa TEXT,
  title_de TEXT, summary_de TEXT,
  title_sr TEXT, summary_sr TEXT,
  published_at TEXT,
  ingested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_news_ingested ON news_items(ingested_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_category ON news_items(category);
