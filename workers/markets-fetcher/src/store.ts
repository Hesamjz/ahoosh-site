import type { QuoteMap } from "./sources";

// The full Day-1 asset universe (FX + gold + crypto). Anything in this list that
// is missing from a cycle's quotes counts as a per-asset failure.
export const EXPECTED_ASSETS = [
  "USD/IRR", "EUR/IRR", "USD/RSD", "EUR/RSD",
  "EUR/USD", "GBP/USD", "USD/JPY", "USD/CNY", "USD/TRY", "USD/AED",
  "XAU/USD", "XAU/EUR",
  "BTC", "ETH", "BNB", "SOL", "XRP", "USDT", "USDC", "ADA", "DOGE", "AVAX",
];

export interface Env {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_HESAM_CHAT_ID?: string;
  // CoinGecko Demo API key. Set via: wrangler secret put COINGECKO_API_KEY
  // Without it, CoinGecko 429s anonymous calls from Cloudflare's shared IPs.
  COINGECKO_API_KEY?: string;
}

const FAIL_THRESHOLD = 3; // brief: alert on >3 consecutive failures

// Insert one snapshot row per successfully-fetched asset.
export async function writeSnapshots(env: Env, quotes: QuoteMap): Promise<void> {
  const entries = Object.entries(quotes);
  if (!entries.length) return;
  const stmt = env.DB.prepare(
    "INSERT INTO markets_snapshots (asset, value, source_url) VALUES (?, ?, ?)"
  );
  await env.DB.batch(entries.map(([asset, q]) => stmt.bind(asset, q.value, q.source_url)));
}

// Reconcile per-asset failure counters. Returns assets that JUST crossed the
// alert threshold this cycle (so we alert once, not every minute).
export async function reconcileFailures(
  env: Env,
  quotes: QuoteMap,
  errors: Record<string, string>
): Promise<string[]> {
  const prior = await env.DB.prepare(
    "SELECT asset, consecutive_failures FROM markets_failures"
  ).all<{ asset: string; consecutive_failures: number }>();
  const priorMap = new Map((prior.results ?? []).map((r) => [r.asset, r.consecutive_failures]));

  const ops: D1PreparedStatement[] = [];
  const newlyAlerting: string[] = [];
  const resetStmt = env.DB.prepare(
    "INSERT INTO markets_failures (asset, consecutive_failures, last_failure_at, last_error) " +
      "VALUES (?, 0, NULL, NULL) ON CONFLICT(asset) DO UPDATE SET consecutive_failures=0"
  );
  const failStmt = env.DB.prepare(
    "INSERT INTO markets_failures (asset, consecutive_failures, last_failure_at, last_error) " +
      "VALUES (?, 1, CURRENT_TIMESTAMP, ?) ON CONFLICT(asset) DO UPDATE SET " +
      "consecutive_failures = markets_failures.consecutive_failures + 1, " +
      "last_failure_at = CURRENT_TIMESTAMP, last_error = excluded.last_error"
  );

  for (const asset of EXPECTED_ASSETS) {
    if (quotes[asset]) {
      ops.push(resetStmt.bind(asset));
    } else {
      const next = (priorMap.get(asset) ?? 0) + 1;
      ops.push(failStmt.bind(asset, errors[asset] ?? "missing from cycle"));
      if (next === FAIL_THRESHOLD + 1) newlyAlerting.push(asset); // first crossing only
    }
  }
  await env.DB.batch(ops);
  return newlyAlerting;
}

// Freshest stored value per asset (this cycle's row if it succeeded, else the
// last good one). Lets the page show all assets even when a source blips —
// sources_of_truth_v2 Rule 7: "use the most recent successful snapshot with
// timestamp." One query for the whole universe (latest row = MAX(id) per asset).
export type LastKnown = { value: number; source_url: string; fetched_at: string };

export async function latestPerAsset(env: Env): Promise<Map<string, LastKnown>> {
  const rows = await env.DB.prepare(
    "SELECT asset, value, source_url, fetched_at FROM markets_snapshots " +
      "WHERE id IN (SELECT MAX(id) FROM markets_snapshots GROUP BY asset)"
  ).all<{ asset: string; value: number; source_url: string; fetched_at: string }>();
  const m = new Map<string, LastKnown>();
  for (const r of rows.results ?? []) m.set(r.asset, { value: r.value, source_url: r.source_url, fetched_at: r.fetched_at });
  return m;
}

// Build the full /api/markets/latest payload directly from D1.
// Returns the same shape as the old KV payload — no KV reads needed.
export type AssetEntry = {
  value: number; change: number | null; source: string;
  source_url: string; as_of: string; fresh: boolean;
};

export async function buildLatestPayload(env: Env): Promise<{
  updated: string;
  assets: Record<string, AssetEntry>;
  shown_count: number;
}> {
  // Two most recent rows per asset (to compute change vs previous cycle)
  const rows = await env.DB.prepare(
    "SELECT asset, value, source_url, fetched_at FROM markets_snapshots " +
    "WHERE id IN (" +
    "  SELECT id FROM markets_snapshots s2 " +
    "  WHERE s2.asset = markets_snapshots.asset " +
    "  ORDER BY id DESC LIMIT 2" +
    ") ORDER BY asset, id DESC"
  ).all<{ asset: string; value: number; source_url: string; fetched_at: string }>();

  // Group by asset — first row = latest, second = previous
  const byAsset = new Map<string, { latest: typeof rows.results[0]; prev?: typeof rows.results[0] }>();
  for (const r of rows.results ?? []) {
    const ex = byAsset.get(r.asset);
    if (!ex) { byAsset.set(r.asset, { latest: r }); }
    else if (!ex.prev) { ex.prev = r; }
  }

  const updated = new Date().toISOString();
  const assets: Record<string, AssetEntry> = {};
  for (const asset of EXPECTED_ASSETS) {
    const d = byAsset.get(asset);
    if (!d) continue;
    const change = (d.prev && d.prev.value > 0)
      ? Math.round(((d.latest.value - d.prev.value) / d.prev.value) * 10000) / 100
      : null;
    try {
      assets[asset] = {
        value: d.latest.value,
        change,
        source: new URL(d.latest.source_url).hostname.replace(/^www\./, ""),
        source_url: d.latest.source_url,
        as_of: d.latest.fetched_at,
        fresh: true,
      };
    } catch { /* skip malformed source_url */ }
  }
  return { updated, assets, shown_count: Object.keys(assets).length };
}
