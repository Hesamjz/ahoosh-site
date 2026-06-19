// Cloudflare Pages Function — /api/news
// Fetches 50+ RSS feeds in parallel, parses XML, returns JSON.
// Edge-cached for 5 minutes — so only one fetch per 5 min globally.

const TTL = 300;
const MAX_PER = 3; // max articles per source

// Topic blocklist — titles containing these words are dropped across ALL sources.
// Covers: sports, entertainment, health/lifestyle, domestic religion topics.
const BLOCKLIST = [
  // Sports (Persian)
  'فوتبال','بسکتبال','والیبال','تنیس','المپیک','جام جهانی','جام‌جهانی',
  'سامورایی','لیگ برتر','لیگ قهرمانان','بازی‌های آسیایی','مسابقات',
  // Health/lifestyle/religion (Persian)
  'تشنج','حجاب','آشپزی','رژیم غذایی','پوست و مو','زیبایی','ازدواج',
  // Sports (English)
  'shark attack','world cup','super bowl',' nba ',' nfl ','premier league',
  'champions league','formula 1','grand prix','olympic games','match result',
  'transfer window','goal scored',
  // Entertainment (English)
  'box office','album release','celebrity','red carpet',
  // Health fluff (English)
  'weight loss','diet tips','beauty tips','skincare',
];

function isBlocked(title) {
  var t = (title || '').toLowerCase();
  for (var i = 0; i < BLOCKLIST.length; i++) {
    if (t.includes(BLOCKLIST[i].toLowerCase())) return true;
  }
  return false;
}

const SOURCES = [
  // ── Persian-language ───────────────────────────────────────────────
  { url: 'https://feeds.bbci.co.uk/persian/rss.xml',                   name: 'BBC Persian',         lang: 'fa' },
  { url: 'https://www.radiofarda.com/api/zrqojmoryit',                 name: 'Radio Farda',          lang: 'fa' },
  { url: 'https://www.voanews.com/api/ztmqooky_t',                     name: 'VOA Persian',          lang: 'fa' },
  { url: 'https://www.iranintl.com/rss.xml',                           name: 'Iran International',   lang: 'fa' },
  { url: 'https://www.khabaronline.ir/rss',                            name: 'Khabaronline',         lang: 'fa' },
  { url: 'https://donya-e-eqtesad.com/rss/',                           name: 'Donya-e-Eqtesad',      lang: 'fa' },
  { url: 'https://rss.dw.com/xml/rss-fa-all',                          name: 'DW Farsi',             lang: 'fa' },

  // ── US / English ───────────────────────────────────────────────────
  { url: 'https://feeds.apnews.com/rss/apf-topnews',                   name: 'AP News',              lang: 'en' },
  { url: 'https://feeds.foxnews.com/foxnews/world',                    name: 'Fox News',             lang: 'en' },
  { url: 'https://feeds.skynews.com/feeds/rss/world.xml',              name: 'Sky News',             lang: 'en' },
  { url: 'https://feeds.bbci.co.uk/news/world/rss.xml',                name: 'BBC World',            lang: 'en' },
  { url: 'https://feeds.npr.org/1001/rss.xml',                         name: 'NPR',                  lang: 'en' },
  { url: 'https://www.cnbc.com/id/100727362/device/rss/rss.html',      name: 'CNBC',                 lang: 'en' },
  { url: 'https://feeds.marketwatch.com/marketwatch/topstories/',      name: 'MarketWatch',          lang: 'en' },
  { url: 'https://www.theguardian.com/world/rss',                      name: 'The Guardian',         lang: 'en' },
  { url: 'https://feeds.feedburner.com/euronews/en/home/',             name: 'Euronews EN',          lang: 'en' },
  { url: 'https://rss.dw.com/xml/rss-en-all',                          name: 'DW English',           lang: 'en' },
  { url: 'https://www.aljazeera.com/xml/rss/all.xml',                  name: 'Al Jazeera',           lang: 'en' },
  { url: 'https://feeds.washingtonpost.com/rss/world',                 name: 'Washington Post',      lang: 'en' },
  { url: 'https://abcnews.go.com/abcnews/internationalheadlines',      name: 'ABC News',             lang: 'en' },
  { url: 'https://rss.cnn.com/rss/edition_world.rss',                  name: 'CNN World',            lang: 'en' },
  { url: 'https://feeds.nbcnews.com/nbcnews/public/world',             name: 'NBC News',             lang: 'en' },
  { url: 'https://www.politico.com/rss/politics08.xml',                name: 'Politico',             lang: 'en' },
  { url: 'https://feeds.wsj.com/xml/rss/3_7014.xml',                   name: 'WSJ Markets',          lang: 'en' },

  // ── Business & Finance ─────────────────────────────────────────────
  { url: 'https://feeds.bloomberg.com/markets/news.rss',               name: 'Bloomberg Markets',   lang: 'en' },
  { url: 'https://www.ft.com/world?format=rss',                        name: 'Financial Times',     lang: 'en' },
  { url: 'https://feeds.a.dj.com/rss/RSSMarketsMain.xml',             name: 'Dow Jones Markets',   lang: 'en' },
  { url: 'https://www.economist.com/rss/the_world_this_week_rss.xml', name: 'The Economist',       lang: 'en' },
  { url: 'https://feeds.businessinsider.com/rss/home',                 name: 'Business Insider',    lang: 'en' },

  // ── Tech ───────────────────────────────────────────────────────────
  { url: 'https://techcrunch.com/feed/',                               name: 'TechCrunch',          lang: 'en' },
  { url: 'https://feeds.arstechnica.com/arstechnica/index',           name: 'Ars Technica',        lang: 'en' },
  { url: 'https://www.theverge.com/rss/index.xml',                     name: 'The Verge',           lang: 'en' },
  { url: 'https://www.wired.com/feed/rss',                             name: 'Wired',               lang: 'en' },
  { url: 'https://feeds.feedburner.com/TheHackersNews',               name: 'Hacker News',         lang: 'en' },

  // ── European ───────────────────────────────────────────────────────
  { url: 'https://rss.dw.com/xml/rss-de-all',                          name: 'DW Deutsch',          lang: 'de' },
  { url: 'https://www.lemonde.fr/rss/une.xml',                         name: 'Le Monde',            lang: 'fr' },
  { url: 'https://www.spiegel.de/schlagzeilen/index.rss',             name: 'Spiegel',             lang: 'de' },
  { url: 'https://www.euractiv.com/feed/',                             name: 'Euractiv',            lang: 'en' },
  { url: 'https://www.politico.eu/feed/',                              name: 'Politico EU',         lang: 'en' },
  { url: 'https://www.b92.net/info/rss/zivot.php',                    name: 'B92 (Serbia)',        lang: 'sr' },

  // ── Middle East & Regional ─────────────────────────────────────────
  { url: 'https://www.arabnews.com/rss.xml',                           name: 'Arab News',           lang: 'en' },
  { url: 'https://www.haaretz.com/cmlink/1.628808',                    name: 'Haaretz',             lang: 'en' },
  { url: 'https://www.jpost.com/rss/rssfeedsworld.aspx',              name: 'Jerusalem Post',      lang: 'en' },
  { url: 'https://www.dailysabah.com/rssfeed/world',                   name: 'Daily Sabah (TR)',    lang: 'en' },
  { url: 'https://timesofindia.indiatimes.com/rssfeeds/296589292.cms', name: 'Times of India',     lang: 'en' },
  { url: 'https://www.scmp.com/rss/5/feed',                            name: 'South China Morning Post', lang: 'en' },
  { url: 'https://www.asahi.com/rss/asahi/newsheadlines.rdf',         name: 'Asahi Shimbun',       lang: 'ja' },

  // ── Science & World ────────────────────────────────────────────────
  { url: 'https://www.nature.com/nature.rss',                          name: 'Nature',              lang: 'en' },
  { url: 'https://feeds.newscientist.com/full-feed',                   name: 'New Scientist',       lang: 'en' },
  { url: 'https://www.un.org/rss.xml',                                 name: 'UN News',             lang: 'en' },
];

function extractTag(block, tag) {
  // Handle CDATA and normal content
  const re = new RegExp(
    '<' + tag + '[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/' + tag + '>',
    'i'
  );
  const m = block.match(re);
  if (!m) return '';
  return m[1]
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, '') // strip any nested HTML tags
    .trim();
}

function parseRSS(xml, srcName, srcLang) {
  const items = [];
  // Match <item>...</item> blocks
  const itemRe = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let match;
  let count = 0;
  while ((match = itemRe.exec(xml)) !== null && count < MAX_PER) {
    const block = match[1];
    const title = extractTag(block, 'title');
    if (!title || title.length < 5) continue;
    if (isBlocked(title)) continue;
    // link: prefer <link>, fallback to guid
    let link = extractTag(block, 'link');
    if (!link) link = extractTag(block, 'guid');
    // strip non-URL junk
    link = link.replace(/\s/g, '').split('\n')[0];
    const pubDate = extractTag(block, 'pubDate') || extractTag(block, 'dc:date') || '';
    const desc = extractTag(block, 'description');
    items.push({ title, link, pubDate, desc: desc.slice(0, 200), source: srcName, lang: srcLang });
    count++;
  }
  return items;
}

async function fetchSource(src) {
  try {
    const res = await fetch(src.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AHoosh/1.0; +https://ahoosh.ai)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
    });
    if (!res.ok) return [];
    const text = await res.text();
    return parseRSS(text, src.name, src.lang);
  } catch {
    return [];
  }
}

export async function onRequestGet(context) {
  const cache = caches.default;
  const cacheKey = new Request(new URL(context.request.url).origin + '/api/news');
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  // Fetch all sources in parallel (Cloudflare handles the fan-out)
  const results = await Promise.all(SOURCES.map(fetchSource));
  const articles = results.flat();

  const body = JSON.stringify({
    updated: new Date().toISOString(),
    total: articles.length,
    sources: SOURCES.length,
    articles,
  });

  const resp = new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': `public, max-age=${TTL}`,
    },
  });
  context.waitUntil(cache.put(cacheKey, resp.clone()));
  return resp;
}
