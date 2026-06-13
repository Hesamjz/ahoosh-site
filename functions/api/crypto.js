// Cloudflare Pages Function — /api/crypto
// Proxies CoinGecko top-10 crypto by market cap.
// Edge-cached for 5 minutes — one fetch per 5 min globally, no rate-limit hits on client.

const TTL = 300;

export async function onRequestGet(context) {
  const cache = caches.default;
  const cacheKey = new Request(new URL(context.request.url).origin + '/api/crypto');
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1&price_change_percentage=24h',
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; AHoosh/1.0; +https://ahoosh.ai)',
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'upstream', status: res.status }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const data = await res.json();

    const resp = new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': `public, max-age=${TTL}`,
      },
    });

    context.waitUntil(cache.put(cacheKey, resp.clone()));
    return resp;
  } catch (e) {
    return new Response(JSON.stringify({ error: 'timeout' }), {
      status: 504,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
