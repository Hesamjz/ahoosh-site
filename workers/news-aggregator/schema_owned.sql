-- Pipeline B — AHoosh-owned articles (AI-written take, 4 languages).
CREATE TABLE IF NOT EXISTS news_articles (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  source_url TEXT, source_name TEXT, category TEXT,
  title_en TEXT, body_en TEXT,
  title_fa TEXT, body_fa TEXT,
  title_de TEXT, body_de TEXT,
  title_sr TEXT, body_sr TEXT,
  published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_articles_pub ON news_articles(published_at DESC);
