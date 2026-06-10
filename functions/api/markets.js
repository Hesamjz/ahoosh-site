// Cloudflare Pages Function — /api/markets
// Server-side price proxy for sources that block browser CORS:
//   TGJU (USD/IRR, EUR/IRR — Iranian free-market rates, attribution required)
//   Yahoo Finance (gold GC=F, silver SI=F, Brent BZ=F, WTI CL=F)
//   exchangerate-api open endpoint (EUR/RSD — ECB/Frankfurter has no RSD)
// Cached at the edge for 5 minutes to stay polite to upstreams.

const TTL_SECONDS = 300;

const TGJU_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Referer: 'https://tgju.org/',
  Accept: 'application/json',
};

async function fetchTgju(symbol) {
  const res = await fetch(
    `https://api.tgju.org/v1/market/indicator/summary-table-data/${symbol}`,
    { headers: TGJU_HEADERS, signal: AbortSignal.timeout(10000) }
  );
  if (!res.ok) throw new Error(`tgju ${symbol}: HTTP ${res.status}`);
  const data = await res.json();
  const rows = data.data || (data.response && data.response.data) || [];
  if (!rows.length) throw new Error(`tgju ${symbol}: empty`);
  const num = (v) => parseFloat(String(v).replace(/[,٬]/g, ''));
  const price = num(rows[0][0]);
  const prev = num(rows[0][1]);
  if (!isFinite(price) || price < 1000) throw new Error(`tgju ${symbol}: bad price ${price}`);
  let change = null;
  if (isFinite(prev) && prev > 1000) {
    const pct = ((price - prev) / prev) * 100;
    if (Math.abs(pct) < 20) change = Math.round(pct * 100) / 100;
  }
  return { price, change };
}

async function fetchYahoo(symbol) {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
    { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10000) }
  );
  if (!res.ok) throw new Error(`yahoo ${symbol}: HTTP ${res.status}`);
  const data = await res.json();
  const meta = data.chart && data.chart.result && data.chart.result[0] && data.chart.result[0].meta;
  if (!meta || !isFinite(meta.regularMarketPrice)) throw new Error(`yahoo ${symbol}: no price`);
  let change = null;
  if (isFinite(meta.chartPreviousClose) && meta.chartPreviousClose > 0) {
    change = Math.round(((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose) * 10000) / 100;
  }
  return { price: meta.regularMarketPrice, change };
}

async function fetchRsd() {
  const res = await fetch('https://open.er-api.com/v6/latest/EUR', {
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`er-api: HTTP ${res.status}`);
  const data = await res.json();
  const rsd = data.rates && data.rates.RSD;
  if (!isFinite(rsd)) throw new Error('er-api: no RSD');
  return { price: Math.round(rsd * 100) / 100, change: null };
}

export async function onRequestGet(context) {
  const cache = caches.default;
  const cacheKey = new Request(new URL(context.request.url).origin + '/api/markets');
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const [usdIrr, eurIrr, gold, silver, brent, wti, eurRsd] = await Promise.allSettled([
    fetchTgju('price_dollar_rl'),
    fetchTgju('price_eur'),
    fetchYahoo('GC=F'),
    fetchYahoo('SI=F'),
    fetchYahoo('BZ=F'),
    fetchYahoo('CL=F'),
    fetchRsd(),
  ]);

  const val = (r) => (r.status === 'fulfilled' ? r.value : null);

  const body = JSON.stringify({
    updated: new Date().toISOString(),
    irr: {
      usd: val(usdIrr), // TGJU free-market rate, rial
      eur: val(eurIrr),
      source: 'TGJU',
      source_url: 'https://tgju.org',
    },
    eur_rsd: val(eurRsd),
    commodities: {
      gold: val(gold),
      silver: val(silver),
      brent: val(brent),
      wti: val(wti),
      source: 'Yahoo Finance',
    },
  });

  const resp = new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': `public, max-age=${TTL_SECONDS}`,
    },
  });
  context.waitUntil(cache.put(cacheKey, resp.clone()));
  return resp;
}
