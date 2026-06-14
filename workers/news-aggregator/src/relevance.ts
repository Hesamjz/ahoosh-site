// Business-relevance gate — the core rule: keep an item ONLY if it's about
// business/markets/economy/finance/trade/companies/crypto/AI-as-business.
// Everything else (general politics, sport, culture, crime, lifestyle) is dropped.
// Politics counts ONLY if it carries market/economic signal.
//
// v1 is a multilingual keyword classifier (free, in-Worker, fast). It can be
// tightened later with a Workers AI confirm pass on borderline items, but the
// lexicon already removes the bulk of non-business noise.

export type Category =
  | "markets"
  | "economy"
  | "finance"
  | "business"
  | "trade-supply"
  | "crypto"
  | "ai-tech"
  | null;

// Strong business signals (EN + FA + DE + SR). Lowercased substring match.
const LEX: Record<Exclude<Category, null>, string[]> = {
  markets: [
    "stock", "shares", "equit", "index", "s&p", "nasdaq", "dow", "dax", "ftse", "bourse",
    "yield", "bond", "treasur", "oil price", "brent", "gold price", "commodit", "futures",
    "بورس", "سهام", "شاخص", "بازار سرمایه", "طلا", "نفت", "aktie", "börse", "akcij", "berza",
  ],
  economy: [
    "econom", "gdp", "inflation", "recession", "unemployment", "interest rate", "central bank",
    "fed ", "ecb", "imf", "tariff", "budget deficit", "fiscal", "monetary",
    "اقتصاد", "تورم", "نرخ بهره", "بانک مرکزی", "wirtschaft", "konjunktur", "zins", "privreda", "inflacij",
  ],
  finance: [
    "bank", "lending", "loan", "credit", "fund", "investor", "investment", "valuation",
    "ipo", "earnings", "revenue", "profit", "dividend", "merger", "acquisition", "buyout",
    "currency", "forex", "exchange rate", "بانک", "ارز", "سرمایه‌گذاری", "وام", "finanz", "finansij",
  ],
  business: [
    "company", "ceo", "startup", "firm", "corporate", "factory", "manufactur", "retail",
    "شرکت", "کسب‌وکار", "استارتاپ", "صنعت", "unternehmen", "konzern", "kompanij", "biznis", "preduzeć",
  ],
  "trade-supply": [
    "trade", "export", "import", "supply chain", "logistic", "freight", "shipping", "cargo",
    "port ", "tariff", "customs", "chamber of commerce", "تجارت", "صادرات", "واردات", "گمرک",
    "handel", "export", "lieferkette", "logistik", "trgovin", "izvoz", "uvoz",
  ],
  crypto: [
    "bitcoin", "ethereum", "crypto", "blockchain", "stablecoin", "token", "defi",
    "بیت‌کوین", "ارز دیجیتال", "رمزارز", "krypto", "kripto",
  ],
  "ai-tech": [
    "ai ", "artificial intelligence", "openai", "anthropic", "nvidia", "chip", "semiconductor",
    "tech funding", "saas", "هوش مصنوعی", "künstliche intelligenz", "veštačka inteligencij",
  ],
};

// Hard vetoes — if the title is dominated by these and has no business term, drop.
const VETO = [
  "football", "soccer", "match", "goal", "tournament", "olympic", "celebrity", "movie", "film",
  "actor", "singer", "recipe", "horoscope", "weather", "obituary",
  "فوتبال", "بازیکن", "سینما", "فیلم", "fußball", "spiel", "fudbal", "utakmic",
];

function hay(title: string, summary: string): string {
  return `${title} ${summary}`.toLowerCase();
}

// Returns the matched business category, or null if not business-relevant.
export function classify(title: string, summary = ""): Category {
  const h = hay(title, summary);
  let matched: Category = null;
  for (const [cat, terms] of Object.entries(LEX) as [Exclude<Category, null>, string[]][]) {
    if (terms.some((t) => h.includes(t))) {
      matched = cat;
      break;
    }
  }
  if (!matched) return null;
  // a clearly-sport/entertainment headline with an incidental business word still drops
  const vetoed = VETO.some((v) => h.includes(v));
  if (vetoed && !LEX.markets.concat(LEX.finance, LEX.crypto).some((t) => title.toLowerCase().includes(t))) {
    return null;
  }
  return matched;
}

export function isBusiness(title: string, summary = ""): boolean {
  return classify(title, summary) !== null;
}
