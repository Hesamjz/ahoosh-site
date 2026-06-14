import { SOURCES, type Source } from "./sources";
import { parseFeed } from "./rss";
import { classify } from "./relevance";

interface Env {
  DB: D1Database;
  AI: { run: (model: string, input: Record<string, unknown>) => Promise<{ translated_text?: string }> };
}

const LANGS = ["en", "fa", "de", "sr"] as const;
type Lang = (typeof LANGS)[number];

// Cloudflare caps subrequests per invocation (50 free / 1000 paid). Budget:
// FETCH_N feed fetches + (MAX_NEW × ~4 AI calls). Keep the total well under 50.
const FETCH_N = 18;       // rotating window of sources per 5-min run
const MAX_NEW = 6;        // new items fully translated per run
const TR_MODEL = "@cf/meta/m2m100-1.2b";

type Candidate = { url: string; title: string; summary: string; source: string; src_lang: Lang; published: string | null };

// Rotate the fetched window each tick so all sources get covered over time.
function pool(): Source[] {
  const off = (Math.floor(Date.now() / 300000) * FETCH_N) % SOURCES.length;
  return [...SOURCES.slice(off), ...SOURCES.slice(0, off)].slice(0, FETCH_N);
}

async function fetchSource(s: Source): Promise<Candidate[]> {
  try {
    const res = await fetch(s.url, { headers: { "User-Agent": "Mozilla/5.0 (AHoosh)" }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    return parseFeed(await res.text()).map((it) => ({
      url: it.link, title: it.title, summary: it.summary, source: s.name, src_lang: s.lang, published: it.published,
    }));
  } catch { return []; }
}

// Translate title+summary in ONE call (delimiter-split) to halve AI subrequests.
async function trPair(env: Env, title: string, summary: string, from: Lang, to: Lang): Promise<{ t: string; s: string }> {
  if (from === to) return { t: title, s: summary };
  try {
    const r = await env.AI.run(TR_MODEL, { text: `${title}\n${(summary || "").slice(0, 700)}`, source_lang: from, target_lang: to });
    const out = (r.translated_text || "").split("\n");
    return { t: out[0]?.trim() || title, s: out.slice(1).join(" ").trim() || summary };
  } catch { return { t: title, s: summary }; } // fail-soft: keep source text
}

async function runCycle(env: Env): Promise<Record<string, unknown>> {
  try {
    const settled = await Promise.allSettled(pool().map(fetchSource));
    const all = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));

    const seen = new Set<string>();
    const batch = all.filter((c) => c.url && !seen.has(c.url) && seen.add(c.url));
    const business = batch.map((c) => ({ c, cat: classify(c.title, c.summary) })).filter((x) => x.cat);

    let fresh = business;
    if (business.length) {
      const urls = business.map((x) => x.c.url);
      const ex = await env.DB.prepare(`SELECT url FROM news_items WHERE url IN (${urls.map(() => "?").join(",")})`).bind(...urls).all<{ url: string }>();
      const have = new Set((ex.results ?? []).map((r) => r.url));
      fresh = business.filter((x) => !have.has(x.c.url));
    }
    fresh = fresh.slice(0, MAX_NEW);

    let inserted = 0;
    for (const { c, cat } of fresh) {
      const en = await trPair(env, c.title, c.summary, c.src_lang, "en");           // → English canonical
      const others = await Promise.all((["fa", "de", "sr"] as Lang[]).map((L) => trPair(env, en.t, en.s, "en", L)));
      const [fa, de, sr] = others;
      try {
        await env.DB.prepare(
          `INSERT OR IGNORE INTO news_items
           (url, source, src_lang, category, title_en, summary_en, title_fa, summary_fa, title_de, summary_de, title_sr, summary_sr, published_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
        ).bind(c.url, c.source, c.src_lang, cat, en.t, en.s, fa.t, fa.s, de.t, de.s, sr.t, sr.s, c.published).run();
        inserted++;
      } catch { /* skip */ }
    }
    return { updated: new Date().toISOString(), fetched: all.length, business: business.length, new: fresh.length, inserted };
  } catch (e) {
    return { error: String((e as Error)?.message ?? e) };
  }
}

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=60" } });

export default {
  async scheduled(_e: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runCycle(env).then((s) => console.log("[news-aggregator]", JSON.stringify(s))));
  },
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/api/news/latest") {
      const lang = (url.searchParams.get("lang") || "en") as Lang;
      const L = LANGS.includes(lang) ? lang : "en";
      const rows = await env.DB.prepare(
        `SELECT url, source, category, published_at, title_${L} AS title, summary_${L} AS summary
         FROM news_items ORDER BY ingested_at DESC LIMIT 60`
      ).all();
      return json({ updated: new Date().toISOString(), lang: L, total: (rows.results ?? []).length, items: rows.results ?? [] });
    }
    if (url.pathname === "/run") return json({ ran: true, ...(await runCycle(env)) });
    if (url.pathname === "/health" || url.pathname === "/") return json({ ok: true, worker: "news-aggregator" });
    return json({ error: "not found" }, 404);
  },
};
