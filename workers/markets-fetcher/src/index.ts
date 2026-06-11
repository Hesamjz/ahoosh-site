import { fetchIrr, fetchMajors, fetchRsd, fetchGold, fetchCrypto, type QuoteMap } from "./sources";
import { writeSnapshots, reconcileFailures, latestPerAsset, EXPECTED_ASSETS, type Env } from "./store";
import { alertFailures } from "./alerts";

const KV_LATEST = "markets:latest";

type Family = { assets: string[]; fn: () => Promise<QuoteMap> };

const FAMILIES: Family[] = [
  { assets: ["USD/IRR", "EUR/IRR"], fn: fetchIrr },
  { assets: ["EUR/USD", "GBP/USD", "USD/JPY", "USD/CNY", "USD/TRY"], fn: fetchMajors },
  { assets: ["USD/RSD", "EUR/RSD", "USD/AED"], fn: fetchRsd },
  { assets: ["XAU/USD"], fn: () => fetchGold() },
  {
    assets: ["BTC", "ETH", "BNB", "SOL", "XRP", "USDT", "USDC", "ADA", "DOGE", "AVAX"],
    fn: fetchCrypto,
  },
];

// Run one full fetch → store → cache cycle. Returns a summary for the smoke test.
async function runCycle(env: Env): Promise<Record<string, unknown>> {
  const quotes: QuoteMap = {};
  const errors: Record<string, string> = {};

  const results = await Promise.allSettled(FAMILIES.map((f) => f.fn()));
  results.forEach((res, i) => {
    const fam = FAMILIES[i];
    if (res.status === "fulfilled") {
      Object.assign(quotes, res.value);
    } else {
      const msg = String(res.reason?.message ?? res.reason);
      for (const a of fam.assets) errors[a] = msg;
    }
  });

  // XAU/EUR derived from XAU/USD × (EUR per USD). EUR/USD = USD per 1 EUR.
  if (quotes["XAU/USD"] && quotes["EUR/USD"] && quotes["EUR/USD"].value > 0) {
    const eurPerUsd = 1 / quotes["EUR/USD"].value;
    quotes["XAU/EUR"] = {
      value: Math.round(quotes["XAU/USD"].value * eurPerUsd * 100) / 100,
      change: null,
      source: "derived (XAU/USD × EUR/USD)",
      source_url: "https://goldprice.org",
    };
  }

  await writeSnapshots(env, quotes);
  const newlyAlerting = await reconcileFailures(env, quotes, errors);
  if (newlyAlerting.length) await alertFailures(env, newlyAlerting);

  // Build the payload from the freshest stored value per asset, so a transient
  // source blip shows last-known-good (with its real timestamp) instead of a gap.
  const latest = await latestPerAsset(env);
  const updated = new Date().toISOString();
  const assets: Record<string, unknown> = {};
  for (const asset of EXPECTED_ASSETS) {
    const fresh = quotes[asset];
    const stored = latest.get(asset);
    if (fresh) {
      assets[asset] = {
        value: fresh.value,
        change: fresh.change,
        source: fresh.source,
        source_url: fresh.source_url,
        as_of: stored?.fetched_at ?? updated, // D1 timestamp of this cycle's row
        fresh: true,
      };
    } else if (stored) {
      assets[asset] = {
        value: stored.value,
        change: null,
        source: hostOf(stored.source_url),
        source_url: stored.source_url,
        as_of: stored.fetched_at,
        fresh: false, // last-known-good — not refreshed this cycle
      };
    }
    // asset with no fresh quote AND no stored history is simply omitted
  }
  const failedThisCycle = EXPECTED_ASSETS.filter((a) => !quotes[a]);

  const payload = {
    updated,
    assets,
    shown_count: Object.keys(assets).length,
    fresh_count: Object.keys(quotes).length,
    stale_count: Object.keys(assets).length - Object.keys(quotes).length,
    failed_this_cycle: failedThisCycle,
  };
  await env.MARKETS_KV.put(KV_LATEST, JSON.stringify(payload));

  return {
    updated,
    fresh_count: payload.fresh_count,
    stale_count: payload.stale_count,
    failed_this_cycle: failedThisCycle,
    alerted: newlyAlerting,
  };
}

const hostOf = (u: string): string => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

const json = (body: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=30",
      ...extraHeaders,
    },
  });

export default {
  // Cron: every minute.
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runCycle(env).then((s) => console.log("[markets-fetcher] cycle", JSON.stringify(s))));
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/api/markets/latest") {
      const cached = await env.MARKETS_KV.get(KV_LATEST);
      if (!cached) return json({ error: "no snapshot yet" }, 503);
      return json(JSON.parse(cached));
    }

    if (path === "/api/markets/history") {
      const asset = url.searchParams.get("asset");
      const hours = Math.min(parseInt(url.searchParams.get("hours") || "24", 10) || 24, 168);
      if (!asset) return json({ error: "asset query param required" }, 400);
      const rows = await env.DB.prepare(
        "SELECT value, fetched_at FROM markets_snapshots WHERE asset = ? " +
          "AND fetched_at >= datetime('now', ?) ORDER BY fetched_at ASC"
      )
        .bind(asset, `-${hours} hours`)
        .all();
      return json({ asset, hours, points: rows.results ?? [] });
    }

    // Manual trigger — used by the deploy smoke test (and harmless otherwise).
    if (path === "/run") {
      const summary = await runCycle(env);
      return json({ ran: true, ...summary });
    }

    if (path === "/" || path === "/health") return json({ ok: true, worker: "markets-fetcher" });

    return json({ error: "not found" }, 404);
  },
};
