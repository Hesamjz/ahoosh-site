// Source POOL — deliberately broad and business-weighted. Per Hesam: the list
// itself doesn't matter; the business-relevance gate (relevance.ts) decides what
// survives. Drawn from _publishing_rules/news_sources_200.md. Add/remove freely.
export type Source = { url: string; name: string; lang: "en" | "fa" };

export const SOURCES: Source[] = [
  // EN — markets/business/economy/trade/crypto/ai
  { url: "https://feeds.bloomberg.com/markets/news.rss", name: "Bloomberg Markets", lang: "en" },
  { url: "https://feeds.bloomberg.com/economics/news.rss", name: "Bloomberg Economics", lang: "en" },
  { url: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml", name: "WSJ Markets", lang: "en" },
  { url: "https://feeds.marketwatch.com/marketwatch/topstories/", name: "MarketWatch", lang: "en" },
  { url: "https://www.cnbc.com/id/20910258/device/rss/rss.html", name: "CNBC Markets", lang: "en" },
  { url: "https://www.investing.com/rss/news.rss", name: "Investing.com", lang: "en" },
  { url: "https://seekingalpha.com/feed.xml", name: "Seeking Alpha", lang: "en" },
  { url: "https://feeds.bbci.co.uk/news/business/rss.xml", name: "BBC Business", lang: "en" },
  { url: "https://www.theguardian.com/uk/business/rss", name: "Guardian Business", lang: "en" },
  { url: "https://feeds.npr.org/1006/rss.xml", name: "NPR Business", lang: "en" },
  { url: "https://www.supplychaindive.com/feeds/news/", name: "Supply Chain Dive", lang: "en" },
  { url: "https://www.freightwaves.com/news/feed", name: "FreightWaves", lang: "en" },
  { url: "https://techcrunch.com/feed/", name: "TechCrunch", lang: "en" },
  { url: "https://venturebeat.com/category/ai/feed/", name: "VentureBeat AI", lang: "en" },
  { url: "https://www.coindesk.com/arc/outboundfeeds/rss/", name: "CoinDesk", lang: "en" },
  { url: "https://cointelegraph.com/rss", name: "Cointelegraph", lang: "en" },
  { url: "https://www.arabnews.com/rss.xml", name: "Arab News", lang: "en" },
  // FA — economy/markets/bourse/business
  { url: "https://www.tejaratnews.com/feed", name: "Tejarat News", lang: "fa" },
  { url: "https://donya-e-eqtesad.com/feeds", name: "Donya-e-Eqtesad", lang: "fa" },
  { url: "https://www.eghtesadonline.com/rss", name: "Eghtesad Online", lang: "fa" },
  { url: "https://www.boursenews.ir/fa/rss/allnews", name: "Bourse News", lang: "fa" },
  { url: "https://www.isna.ir/rss", name: "ISNA", lang: "fa" },
  { url: "https://www.mehrnews.com/rss", name: "Mehr News", lang: "fa" },
  { url: "https://www.zoomit.ir/feed/", name: "Zoomit", lang: "fa" },
  { url: "https://digiato.com/feed", name: "Digiato", lang: "fa" },
  { url: "https://www.iranintl.com/feed/economy", name: "Iran Intl Economy", lang: "fa" },
  // DE — wirtschaft/börse/finance/tech
  // SR — business/economy (light)
];
