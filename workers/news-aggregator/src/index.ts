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

// ── Pipeline B — AHoosh-owned take (AI-written, business focus, 4-lang) ────────
const OWNED_MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8";
const MAX_OWNED = 2; // per hourly run (relevance-gated by the business pool)

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "item";
}

async function writeTake(env: Env, title: string, summary: string, source: string): Promise<string> {
  const system =
    "You are AHoosh, an AI-augmented B2B consulting brand. Write a short, sharp operator-angle take on a business/markets news item for B2B distributors and operators. Lead with what it means for an operator. 200-300 words, plain concrete English, no hype. Never use: leverage, robust, seamless, game-changing, transform, unlock, empower, supercharge, deep dive. Do not invent facts beyond the summary.";
  const user = `Headline: ${title}\nSummary: ${summary}\nSource: ${source}\n\nWrite the take: a 1-line angle, then 2-3 short paragraphs, then one practical takeaway.`;
  try {
    const r = (await env.AI.run(OWNED_MODEL, { messages: [{ role: "system", content: system }, { role: "user", content: user }], max_tokens: 600 })) as { response?: string };
    return (r.response || "").trim();
  } catch {
    return "";
  }
}

const LANG_NAME: Record<string, string> = { fa: "Persian", de: "German", sr: "Serbian" };
// Long-form translation via the multilingual LLM (m2m100 truncates long bodies).
async function translateLong(env: Env, text: string, to: Lang): Promise<string> {
  try {
    const r = (await env.AI.run(OWNED_MODEL, {
      messages: [
        { role: "system", content: `Translate the user's text into ${LANG_NAME[to]}. Output ONLY the translation, preserving paragraph breaks. No preamble, no notes.` },
        { role: "user", content: text },
      ],
      max_tokens: 900,
    })) as { response?: string };
    return (r.response || "").trim() || text;
  } catch {
    return text;
  }
}

async function runOwned(env: Env): Promise<Record<string, unknown>> {
  try {
    const sel = await env.DB.prepare(
      "SELECT id, url, source, category, title_en, summary_en FROM news_items WHERE used_for_owned = 0 AND title_en IS NOT NULL ORDER BY ingested_at DESC LIMIT ?"
    ).bind(MAX_OWNED).all<{ id: number; url: string; source: string; category: string; title_en: string; summary_en: string }>();
    const items = sel.results ?? [];
    let made = 0;
    for (const it of items) {
      const body_en = await writeTake(env, it.title_en, it.summary_en || "", it.source);
      if (!body_en) continue;
      const tr: Record<string, { t: string; s: string }> = {};
      for (const L of ["fa", "de", "sr"] as Lang[]) {
        const titleT = await trPair(env, it.title_en, "", "en", L); // short title via m2m100
        const bodyT = await translateLong(env, body_en, L);          // long body via LLM
        tr[L] = { t: titleT.t, s: bodyT };
      }
      const slug = `${slugify(it.title_en)}-${it.id}`;
      await env.DB.prepare(
        `INSERT OR IGNORE INTO news_articles
         (slug, source_url, source_name, category, title_en, body_en, title_fa, body_fa, title_de, body_de, title_sr, body_sr)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(slug, it.url, it.source, it.category, it.title_en, body_en, tr.fa.t, tr.fa.s, tr.de.t, tr.de.s, tr.sr.t, tr.sr.s).run();
      await env.DB.prepare("UPDATE news_items SET used_for_owned = 1 WHERE id = ?").bind(it.id).run();
      made++;
    }
    return { updated: new Date().toISOString(), candidates: items.length, owned_made: made };
  } catch (e) {
    return { error: String((e as Error)?.message ?? e) };
  }
}

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=60" } });

export default {
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    // */5 → Pipeline A (aggregate+translate); hourly → Pipeline B (owned takes)
    const job = event.cron === "0 * * * *" ? runOwned(env) : runCycle(env);
    ctx.waitUntil(job.then((s) => console.log("[news]", event.cron, JSON.stringify(s))));
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
    // /api/news — backward-compat alias used by NewsPage.astro
    // Returns old {articles:[{title,link,lang,source,pubDate,desc}]} shape
    if (url.pathname === "/api/news") {
      const rows = await env.DB.prepare(
        `SELECT url AS link, source, src_lang AS lang, category,
                published_at AS pubDate, title_en AS title, summary_en AS desc
         FROM news_items ORDER BY ingested_at DESC LIMIT 150`
      ).all();
      return json({
        updated: new Date().toISOString(),
        total: (rows.results ?? []).length,
        sources: SOURCES.length,
        articles: rows.results ?? [],
      });
    }
    // Pipeline B — owned AHoosh articles
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
    if (url.pathname === "/run-owned") return json({ ran: true, ...(await runOwned(env)) });
    if (url.pathname === "/run") return json({ ran: true, ...(await runCycle(env)) });
    if (url.pathname === "/health" || url.pathname === "/") return json({ ok: true, worker: "news-aggregator" });
    return json({ error: "not found" }, 404);
  },
};
