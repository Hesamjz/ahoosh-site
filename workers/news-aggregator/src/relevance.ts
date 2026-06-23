// Relevance gate — LOCKED scope (2026-06-22, Hesam): keep an item only if it's about
// business, strategy, economy/markets/finance, technology, AI, ICT/telecom companies,
// or politics/geopolitics for Europe · Middle East · US · Iran · Asia.
// Everything else (sport, celebrity, entertainment, lifestyle, crime, weather) is dropped.
// English-only keyword classifier (free, in-Worker, fast). Sources are pre-curated, so
// this mostly removes incidental noise and tags a category.

export type Category =
  | "markets"
  | "economy"
  | "finance"
  | "business"
  | "trade-supply"
  | "tech"
  | "ai"
  | "ict-telecom"
  | "politics"
  | null;

const LEX: Record<Exclude<Category, null>, string[]> = {
  markets: [
    "stock", "shares", "equit", "index", "s&p", "nasdaq", "dow ", "ftse", "dax", "nikkei", "bourse",
    "yield", "bond", "treasur", "oil price", "brent", "crude", "gold price", "commodit", "futures", "etf",
  ],
  economy: [
    "econom", "gdp", "inflation", "deflation", "recession", "unemployment", "jobs report", "interest rate",
    "central bank", "federal reserve", "the fed", "ecb", "imf", "world bank", "tariff", "deficit", "fiscal",
    "monetary", "stimulus", "sanction", "trade war", "supply", "cost of living",
  ],
  finance: [
    "bank", "lending", "loan", "credit", "fund", "investor", "investment", "valuation", "venture",
    "ipo", "earnings", "revenue", "profit", "dividend", "merger", "acquisition", "buyout", "funding round",
    "currency", "forex", "exchange rate", "bitcoin", "ethereum", "crypto", "blockchain", "stablecoin",
  ],
  business: [
    "company", "ceo", "cfo", "startup", "founder", "firm", "corporate", "enterprise", "factory",
    "manufactur", "retail", "ecommerce", "e-commerce", "strategy", "market share", "layoff", "hiring",
    "expansion", "partnership", "deal", "contract", "revenue model", "business model", "smb", "sme",
  ],
  "trade-supply": [
    "trade", "export", "import", "supply chain", "logistic", "freight", "shipping", "cargo", "port ",
    "customs", "chamber of commerce", "tariff", "sanctions", "embargo", "manufacturing",
  ],
  tech: [
    "tech", "software", "hardware", "app ", "platform", "cloud", "cyber", "data center", "datacenter",
    "quantum", "robot", "automation", "gadget", "device", "internet", "digital", "saas", "developer",
  ],
  ai: [
    "ai ", " ai", "a.i.", "artificial intelligence", "machine learning", "deep learning", "neural",
    "openai", "anthropic", "deepmind", "gemini", "chatgpt", "llm", "generative", "nvidia", "gpu",
    "chip", "semiconductor", "model", "agent", "copilot",
  ],
  "ict-telecom": [
    "telecom", "5g", "6g", "broadband", "fiber", "spectrum", "carrier", "operator", "network",
    "ericsson", "nokia", "huawei", "vodafone", "at&t", "verizon", "isp", "satellite", "starlink",
  ],
  politics: [
    "election", "parliament", "congress", "senate", "government", "minister", "president", "prime minister",
    "policy", "regulation", "regulator", "antitrust", "diplomac", "summit", "treaty", "war", "ceasefire",
    "geopolit", "foreign policy", "eu ", "european union", "nato", "white house", "kremlin",
    // regional anchors (Europe / Middle East / US / Iran / Asia)
    "europe", "brussels", "germany", "france", "uk ", "britain",
    "middle east", "israel", "gaza", "saudi", "uae", "qatar", "turkey", "egypt",
    "iran", "tehran", "irgc",
    "united states", "washington", "u.s.", "america",
    "china", "beijing", "india", "japan", "korea", "asia", "taiwan", "asean",
  ],
};

// Hard vetoes — drop if dominated by these and no business/econ/tech term present.
const VETO = [
  "football", "soccer", "match ", "goal ", "tournament", "olympic", "world cup", "nba", "nfl", "cricket",
  "celebrity", "movie", "film ", "box office", "actor", "actress", "singer", "album", "concert",
  "recipe", "horoscope", "weather", "obituary", "royal family", "kardashian", "fashion week", "gossip",
];

function hay(title: string, summary: string): string {
  return `${title} ${summary}`.toLowerCase();
}

// Returns the matched category, or null if out of locked scope.
export function classify(title: string, summary = ""): Category {
  const h = hay(title, summary);
  let matched: Category = null;
  for (const [cat, terms] of Object.entries(LEX) as [Exclude<Category, null>, string[]][]) {
    if (terms.some((t) => h.includes(t))) { matched = cat; break; }
  }
  if (!matched) return null;
  // A clearly sport/entertainment headline with only an incidental keyword still drops,
  // unless it carries a strong money/market/AI term in the TITLE itself.
  const vetoed = VETO.some((v) => h.includes(v));
  if (vetoed) {
    const strong = LEX.markets.concat(LEX.finance, LEX.ai, LEX.economy);
    if (!strong.some((t) => title.toLowerCase().includes(t))) return null;
  }
  return matched;
}

export function isBusiness(title: string, summary = ""): boolean {
  return classify(title, summary) !== null;
}
