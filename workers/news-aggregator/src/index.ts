import { SOURCES, type Source } from "./sources";
import { parseFeed } from "./rss";
import { classify } from "./relevance";

// ARCHITECTURE (Hesam decision 2026-06-14): ALL AI runs on Cowork (Claude, Hesam's
// plan), NOT on Cloudflare. This Worker does ZERO AI — it only fetches headlines,
// keyword-classifies for business relevance, dedupes, and stores the RAW source text
// with needs_tr=1. The Cowork scripts then translate (hourly) and write original
// articles (2/day) with Claude, setting needs_tr=0. Read endpoints hide rows that
// Claude hasn't translated yet, so the site never shows raw/untranslated text.
//   - news_translate_cowork.py  → fills title_*/summary_* + needs_tr=0
//   - news_articles_cowork.py   → writes news_articles

interface Env {
  DB: D1Database;
}

const LANGS = ["en"] as const; // English-only (2026-06-22): no translation step
type Lang = (typeof LANGS)[number];

const FETCH_N = 30;     // rotating window of sources per ingest run (~100 EN sources)
const MAX_NEW = 25;     // new items stored per run — shown immediately (English, no translation)

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

// Ingest only — no AI. Store raw source text + needs_tr=1 for Cowork/Claude to translate.
async function runIngest(env: Env): Promise<Record<string, unknown>> {
  try {
    // English-only: nothing needs translation. Surface any rows previously stuck hidden
    // behind the old needs_tr=1 (Cowork-translate) gate — clears the 3-day backlog.
    await env.DB.prepare("UPDATE news_items SET needs_tr = 0 WHERE needs_tr = 1").run();
    const settled = await Promise.allSettled(pool().map(fetchSource));
    const all = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));

    const seen = new Set<string>();
    const batch = all.filter((c) => c.url && !seen.has(c.url) && seen.add(c.url));
    const business = batch.map((c) => ({ c, cat: classify(c.title, c.summary) })).filter((x) => x.cat);

    let fresh = business;
    if (business.length) {
      const urls = business.map((x) => x.c.url);
      const have = new Set<string>();
      // Chunk the existence check — D1 caps bound params at ~100 per statement.
      for (let i = 0; i < urls.length; i += 80) {
        const chunk = urls.slice(i, i + 80);
        const ex = await env.DB.prepare(`SELECT url FROM news_items WHERE url IN (${chunk.map(() => "?").join(",")})`).bind(...chunk).all<{ url: string }>();
        for (const r of ex.results ?? []) have.add(r.url);
      }
      fresh = business.filter((x) => !have.has(x.c.url));
    }
    fresh = fresh.slice(0, MAX_NEW);

    let inserted = 0;
    for (const { c, cat } of fresh) {
      // English source text IS the display text — store it directly as title_en/summary_en
      // with needs_tr=0 so /api/news serves it immediately (no translation step).
      try {
        await env.DB.prepare(
          `INSERT OR IGNORE INTO news_items
           (url, source, src_lang, category, title_en, summary_en, published_at, needs_tr)
           VALUES (?,?,?,?,?,?,?,0)`
        ).bind(c.url, c.source, c.src_lang, cat, c.title, (c.summary || "").slice(0, 600), c.published).run();
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
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    // Every 5 min → fetch + store raw headlines (no AI). Cowork/Claude translates hourly.
    ctx.waitUntil(runIngest(env).then((s) => console.log("[news] ingest", JSON.stringify(s))));
  },
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    // Only show rows Claude has translated (needs_tr=0) — never raw source text.
    if (url.pathname === "/api/news/latest") {
      const lang = (url.searchParams.get("lang") || "en") as Lang;
      const L = LANGS.includes(lang) ? lang : "en";
      const rows = await env.DB.prepare(
        `SELECT url, source, category, published_at, title_${L} AS title, summary_${L} AS summary
         FROM news_items WHERE needs_tr = 0 ORDER BY ingested_at DESC LIMIT 60`
      ).all();
      return json({ updated: new Date().toISOString(), lang: L, total: (rows.results ?? []).length, items: rows.results ?? [] });
    }
    // /api/news — backward-compat alias used by NewsPage.astro. ?lang= returns
    // title/desc in that DISPLAY language; lang field stays the source language.
    if (url.pathname === "/api/news") {
      const lang = (url.searchParams.get("lang") || "en") as Lang;
      const L = LANGS.includes(lang) ? lang : "en";
      const rows = await env.DB.prepare(
        `SELECT url AS link, source, src_lang AS lang, category,
                published_at AS pubDate, title_${L} AS title, substr(summary_${L},1,180) AS desc
         FROM news_items WHERE needs_tr = 0 ORDER BY ingested_at DESC LIMIT 150`
      ).all();
      return json({
        updated: new Date().toISOString(),
        lang: L,
        total: (rows.results ?? []).length,
        sources: SOURCES.length,
        articles: rows.results ?? [],
      });
    }
    // Original AHoosh articles (written by Cowork/Claude into news_articles).
    if (url.pathname === "/api/news/articles") {
      const L = (LANGS.includes((url.searchParams.get("lang") || "en") as Lang) ? url.searchParams.get("lang") : "en") as Lang;
      const rows = await env.DB.prepare(
        `SELECT slug, category, source_name, source_url, published_at, title_${L} AS title FROM news_articles ORDER BY published_at DESC LIMIT 60`
      ).all();
      return json({ updated: new Date().toISOString(), lang: L, total: (rows.results ?? []).length, items: rows.results ?? [] });
    }
    if (url.pathname === "/api/news/article") {
      const slug = url.searchParams.get("slug") || "";
      const L = (LANGS.includes((url.searchParams.get("lang") || "en") as Lang) ? url.searchParams.get("lang") : "en") as Lang;
      const row = await env.DB.prepare(
        `SELECT slug, category, source_name, source_url, published_at, title_${L} AS title, body_${L} AS body FROM news_articles WHERE slug = ?`
      ).bind(slug).first();
      return row ? json(row) : json({ error: "not found" }, 404);
    }
    // Manual ingest trigger (workers.dev + ahoosh.ai). No AI runs here.
    if (url.pathname === "/run" || url.pathname === "/api/news/trigger") return json({ ran: true, ...(await runIngest(env)) });
    if (url.pathname === "/health" || url.pathname === "/") return json({ ok: true, worker: "news-aggregator", ai: "none (cowork/Claude)" });
    return json({ error: "not found" }, 404);
  },
};
