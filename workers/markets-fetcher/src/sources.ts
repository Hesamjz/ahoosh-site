// Day-1 sources: FX + crypto + gold. One fetcher per source family.
// Each returns a map of { asset -> { value, change, source, source_url } }.
// A throw means the whole family failed; per-asset gaps are returned as absent keys.
//
// CONTRACT NOTE (sources_of_truth_v2.md): three Day-1 deviations are flagged in
// the session report for Workspace_Manager to ratify into the contract —
//   1. USD/IRR, EUR/IRR use TGJU's JSON API (api.tgju.org), not the HTML-scrape
//      URL in the contract. The JSON API is what the live /api/markets Pages
//      Function already uses; the HTML profile page is JS-rendered and unscrapable
//      from a Worker.
//   2. USD/RSD, EUR/RSD use open.er-api.com (proven in the live function), not the
//      NBS endpoint in the contract — NBS's public API needs registration and
//      would alert-spam every minute. Honest source_url is recorded.
//   3. XAU uses goldprice.org's JSON feed (data-asg.goldprice.org), same provider
//      as the contract's "goldprice.org", just the machine-readable endpoint.

export type Quote = { value: number; change: number | null; source: string; source_url: string };
export type QuoteMap = Record<string, Quote>;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const timeout = (ms: number) => AbortSignal.timeout(ms);

// ── TGJU (Iranian free-market FX) ───────────────────────────────────────────
const TGJU_HEADERS = { "User-Agent": UA, Referer: "https://tgju.org/", Accept: "application/json" };

async function tgju(symbol: string): Promise<Quote> {
  const url = `https://api.tgju.org/v1/market/indicator/summary-table-data/${symbol}`;
  const res = await fetch(url, { headers: TGJU_HEADERS, signal: timeout(10000) });
  if (!res.ok) throw new Error(`tgju ${symbol}: HTTP ${res.status}`);
  const data: any = await res.json();
  const rows = data.data || (data.response && data.response.data) || [];
  if (!rows.length) throw new Error(`tgju ${symbol}: empty`);
  const num = (v: any) => parseFloat(String(v).replace(/[,٬]/g, ""));
  const price = num(rows[0][0]);
  const prev = num(rows[0][1]);
  if (!isFinite(price) || price < 1000) throw new Error(`tgju ${symbol}: bad price ${price}`);
  let change: number | null = null;
  if (isFinite(prev) && prev > 1000) {
    const pct = ((price - prev) / prev) * 100;
    if (Math.abs(pct) < 20) change = Math.round(pct * 100) / 100;
  }
  return { value: price, change, source: "TGJU", source_url: "https://www.tgju.org/profile/" + symbol };
}

export async function fetchIrr(): Promise<QuoteMap> {
  const out: QuoteMap = {};
  const settled = await Promise.allSettled([tgju("price_dollar_rl"), tgju("price_eur")]);
  if (settled[0].status === "fulfilled") out["USD/IRR"] = settled[0].value;
  if (settled[1].status === "fulfilled") out["EUR/IRR"] = settled[1].value;
  if (!Object.keys(out).length) throw new Error("TGJU: all IRR pairs failed");
  return out;
}

// ── Frankfurter (ECB majors, no key) ────────────────────────────────────────
// AED is NOT an ECB reference currency (Frankfurter has no AED) — it comes from
// er-api in fetchRsd instead. Contract note 4 (USD/AED: Frankfurter → er-api).
export async function fetchMajors(): Promise<QuoteMap> {
  // One call, USD base; reciprocate for the /USD-quoted pairs.
  const res = await fetch(
    "https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,JPY,CNY,TRY",
    { signal: timeout(10000) }
  );
  if (!res.ok) throw new Error(`frankfurter: HTTP ${res.status}`);
  const data: any = await res.json();
  const r = data.rates || {};
  const src = "https://api.frankfurter.app/latest?from=USD";
  const q = (v: number): Quote => ({ value: Math.round(v * 1e6) / 1e6, change: null, source: "Frankfurter (ECB)", source_url: src });
  const out: QuoteMap = {};
  if (isFinite(r.EUR)) out["EUR/USD"] = q(1 / r.EUR); // USD per 1 EUR
  if (isFinite(r.GBP)) out["GBP/USD"] = q(1 / r.GBP);
  if (isFinite(r.JPY)) out["USD/JPY"] = q(r.JPY);
  if (isFinite(r.CNY)) out["USD/CNY"] = q(r.CNY);
  if (isFinite(r.TRY)) out["USD/TRY"] = q(r.TRY);
  if (!Object.keys(out).length) throw new Error("frankfurter: no rates");
  return out;
}

// ── Dinar + dirham (open.er-api.com — see contract notes 2 & 4) ─────────────
export async function fetchRsd(): Promise<QuoteMap> {
  const res = await fetch("https://open.er-api.com/v6/latest/USD", { signal: timeout(10000) });
  if (!res.ok) throw new Error(`er-api: HTTP ${res.status}`);
  const data: any = await res.json();
  const rates = data.rates || {};
  const usdRsd = rates.RSD;
  const usdAed = rates.AED;
  const eurUsd = rates.EUR; // EUR per USD
  if (!isFinite(usdRsd)) throw new Error("er-api: no RSD");
  const src = "https://open.er-api.com/v6/latest/USD";
  const out: QuoteMap = {
    "USD/RSD": { value: Math.round(usdRsd * 100) / 100, change: null, source: "er-api", source_url: src },
  };
  if (isFinite(eurUsd) && eurUsd > 0) {
    out["EUR/RSD"] = { value: Math.round((usdRsd / eurUsd) * 100) / 100, change: null, source: "er-api", source_url: src };
  }
  if (isFinite(usdAed)) {
    out["USD/AED"] = { value: Math.round(usdAed * 10000) / 10000, change: null, source: "er-api", source_url: src };
  }
  return out;
}

// ── Gold (Yahoo GC=F — see contract note 3) ─────────────────────────────────
// goldprice.org returns 403 to programmatic requests; metals-api needs a key
// (violates the no-key rule). Yahoo's gold future is the proven, key-free source
// already used by the live /api/markets Pages Function. XAU/EUR is derived in
// the cycle from XAU/USD × EUR/USD.
export async function fetchGold(): Promise<QuoteMap> {
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=1d&range=1d";
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: timeout(10000) });
  if (!res.ok) throw new Error(`yahoo gold: HTTP ${res.status}`);
  const data: any = await res.json();
  const meta = data?.chart?.result?.[0]?.meta;
  const xau = meta?.regularMarketPrice;
  if (!isFinite(xau) || xau < 100) throw new Error(`yahoo gold: bad xau ${xau}`);
  let change: number | null = null;
  if (isFinite(meta.chartPreviousClose) && meta.chartPreviousClose > 0) {
    change = Math.round(((xau - meta.chartPreviousClose) / meta.chartPreviousClose) * 10000) / 100;
  }
  return {
    "XAU/USD": { value: Math.round(xau * 100) / 100, change, source: "Yahoo Finance (GC=F)", source_url: "https://finance.yahoo.com/quote/GC=F" },
  };
}

// ── Crypto (CoinGecko volume-weighted index — contract canonical) ───────────
const COINS: Record<string, string> = {
  bitcoin: "BTC",
  ethereum: "ETH",
  binancecoin: "BNB",
  solana: "SOL",
  ripple: "XRP",
  tether: "USDT",
  "usd-coin": "USDC",
  cardano: "ADA",
  dogecoin: "DOGE",
  "avalanche-2": "AVAX",
};

export async function fetchCrypto(apiKey?: string): Promise<QuoteMap> {
  const ids = Object.keys(COINS).join(",");
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`;
  // Anonymous calls from Cloudflare's shared egress IPs get HTTP 429 — CoinGecko's
  // docs name this exact case ("IP sharing ... register for a demo account").
  // Demo plan: same root URL, header x-cg-demo-api-key, ~30 req/min (we use ~0.2).
  const headers: Record<string, string> = { Accept: "application/json", "User-Agent": UA };
  if (apiKey) headers["x-cg-demo-api-key"] = apiKey;
  const res = await fetch(url, { headers, signal: timeout(10000) });
  if (!res.ok) throw new Error(`coingecko: HTTP ${res.status}`);
  const data: any = await res.json();
  const out: QuoteMap = {};
  for (const [id, sym] of Object.entries(COINS)) {
    const row = data[id];
    if (row && isFinite(row.usd)) {
      const ch = row.usd_24h_change;
      out[sym] = {
        value: row.usd,
        change: isFinite(ch) ? Math.round(ch * 100) / 100 : null,
        source: "CoinGecko",
        source_url: "https://www.coingecko.com",
      };
    }
  }
  if (!Object.keys(out).length) throw new Error("coingecko: no prices");
  return out;
}
