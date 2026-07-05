// Cloudflare Pages Function — GET /api/pagespeed?url=https://example.com
// Proxies Google PageSpeed Insights API v5 so the API key stays server-side.
//
// Required Cloudflare env var (set in Pages → Settings → Variables):
//   PAGESPEED_API_KEY — Google Cloud Console key (free, no billing required)
//                       Leave unset to use the no-key free tier (lower rate limit)

export async function onRequestGet(context) {
  const { searchParams } = new URL(context.request.url);
  const siteUrl = searchParams.get("url");

  if (!siteUrl) return json({ error: "url param required" }, 400);

  try {
    new URL(siteUrl); // validate URL
  } catch {
    return json({ error: "invalid url" }, 400);
  }

  const key = context.env.PAGESPEED_API_KEY || "";
  const encoded = encodeURIComponent(siteUrl);
  const apiUrl =
    `https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed` +
    `?url=${encoded}` +
    `&strategy=MOBILE` +
    `&category=PERFORMANCE` +
    `&category=ACCESSIBILITY` +
    `&category=SEO` +
    `&category=BEST_PRACTICES` +
    (key ? `&key=${key}` : "");

  try {
    // Heavy sites (lots of JS/animation) can take 40-60s for a full 4-category
    // Lighthouse run, so allow up to 55s before aborting (was 20s → 502 on heavy pages).
    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(55000) });
    const data = await res.json();

    if (!res.ok) {
      return json({ error: "PageSpeed API error", detail: data }, res.status);
    }

    // Extract just the scores we need (lighter response for the client)
    const cats = data.lighthouseResult?.categories || {};
    const audits = data.lighthouseResult?.audits || {};

    const scores = {
      performance:     Math.round((cats.performance?.score    ?? 0) * 100),
      accessibility:   Math.round((cats.accessibility?.score  ?? 0) * 100),
      seo:             Math.round((cats.seo?.score            ?? 0) * 100),
      best_practices:  Math.round((cats["best-practices"]?.score ?? 0) * 100),
    };

    const vitals = {
      lcp:  audits["largest-contentful-paint"]?.displayValue  || null,
      cls:  audits["cumulative-layout-shift"]?.displayValue   || null,
      fid:  audits["total-blocking-time"]?.displayValue       || null,
      fcp:  audits["first-contentful-paint"]?.displayValue    || null,
      ttfb: audits["server-response-time"]?.displayValue      || null,
      speed_index: audits["speed-index"]?.displayValue        || null,
    };

    const opportunities = Object.values(audits)
      .filter((a) => a.score !== null && a.score < 0.9 && a.details?.type === "opportunity")
      .map((a) => ({ id: a.id, title: a.title, savings: a.displayValue }))
      .slice(0, 5);

    return json({
      ok: true,
      url: siteUrl,
      strategy: "MOBILE",
      scores,
      vitals,
      opportunities,
      fetched_at: new Date().toISOString(),
    });
  } catch (e) {
    return json({ error: "Fetch failed", detail: e.message }, 502);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
}
