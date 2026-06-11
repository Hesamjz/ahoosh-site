-- markets-fetcher D1 schema — verbatim from MARKETS_NEWS_ARTICLES_PIPELINE.md
-- Apply: npx wrangler d1 execute ahoosh-markets --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS markets_snapshots (
  id INTEGER PRIMARY KEY,
  asset TEXT NOT NULL,
  value REAL NOT NULL,
  source_url TEXT NOT NULL,
  fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_markets_asset_time ON markets_snapshots(asset, fetched_at DESC);

CREATE TABLE IF NOT EXISTS markets_failures (
  asset TEXT PRIMARY KEY,
  consecutive_failures INTEGER DEFAULT 0,
  last_failure_at TIMESTAMP,
  last_error TEXT
);
