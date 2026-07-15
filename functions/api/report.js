// Cloudflare Pages Function — POST /api/report
// Receives assessment JSON → calls Claude Haiku → returns consulting report JSON
//
// Persists every session to D1 (fire-and-forget, bound as ASSESS_DB).
//
// Hesam's decision 2026-07-15: store EVERYTHING, including sessions where the
// visitor never gives an email. The row carries answers, the generated report,
// and the caller's IP.
//
// Because of that, the on-page notice MUST describe this accurately. It used to
// say "Skip and nothing is stored", which was false while this write existed.
// The wording was corrected in the same commit as this comment. If you ever
// change what is stored here, change the notice on /assess/report and in
// AssessBody.astro in the same commit — an IP is personal data under GDPR and
// the notice is the lawful-basis disclosure. (Not legal advice: worth one pass
// by a lawyer, since a "legitimate interests" basis is doing the work here
// rather than consent.)
//
// Required Cloudflare env secrets (set via Cloudflare dashboard → Pages → Settings → Variables):
//   ANTHROPIC_API_KEY  — your Anthropic API key
// Required D1 binding (Cloudflare dashboard → Pages → Settings → Bindings):
//   ASSESS_DB          — D1 database "ahoosh-assess"

const SYSTEM_PROMPT = `You are a senior business consultant working at AHoosh.ai. You have received assessment results from a potential client. Produce a concise, precise consulting report.

AHoosh.ai services: branding, strategy, digital marketing, website design/build, SEO, content, AI agent setup, ad campaigns, social management, video production.

OUTPUT FORMAT (strict JSON — no markdown, no code fences, raw JSON only):
{
  "executive_summary": "3 sentences. The core diagnosis. What is actually wrong and why it matters.",
  "priorities": [
    {
      "area": "string",
      "finding": "1-2 sentences: what the data shows",
      "recommendation": "1-2 sentences: specific action",
      "ahoosh_service": "string or null"
    }
  ],
  "quick_win": "One thing they can do this week without hiring anyone. Specific.",
  "founder_note": "1 sentence connecting personality profile to business pattern. Only if personality data present. Otherwise null.",
  "overall_score": number
}

Rules:
- Maximum 3 priorities
- No filler. No flattery. No generic advice.
- If data is missing for a category, skip it — do not fabricate
- Mention AHoosh services only where genuinely relevant
- Tone: direct, clear, respectful. Like a smart friend who happens to be an expert.`;

import { fromOurSite, denyForeign, preflight } from './_guard.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  // Only our own pages may call this — it spends an LLM call per request.
  if (!fromOurSite(request)) return denyForeign(request);

  try {
    const body = await request.json();
    const { assessments } = body;

    if (!assessments || Object.keys(assessments).length === 0) {
      return json({ error: "No assessment data provided" }, 400);
    }

    if (!env.ANTHROPIC_API_KEY) {
      return json({ error: "AI service not configured" }, 503);
    }

    // Call Claude Haiku (25s timeout — Cloudflare kills Worker at 30s)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    let claudeRes;
    try {
      claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: `Assessment data:\n${JSON.stringify(assessments, null, 2)}`,
            },
          ],
        }),
      });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      const msg = fetchErr.name === "AbortError" ? "AI service timed out" : fetchErr.message;
      console.error("[report] fetch error:", msg);
      return json({ error: msg }, 422);
    }
    clearTimeout(timeoutId);

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      console.error("[report] Claude API error:", claudeRes.status, err);
      return json({ error: "AI synthesis failed", detail: `${claudeRes.status}: ${err.substring(0, 300)}` }, 422);
    }

    const claudeData = await claudeRes.json();
    const raw = claudeData.content?.[0]?.text || "";

    let report;
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      report = JSON.parse(match ? match[0] : raw);
    } catch {
      console.error("[report] Parse error — raw:", raw);
      return json({ error: "Failed to parse AI response", raw }, 422);
    }

    // Persist to D1 (fire-and-forget — never blocks the response).
    // Stores every session, with or without an email. The on-page notice says so.
    if (env.ASSESS_DB) {
      const sessionId = crypto.randomUUID();
      const email = body.email || null;
      const ip = request.headers.get("CF-Connecting-IP") || null;
      context.waitUntil(
        env.ASSESS_DB.prepare(
          `INSERT INTO assess_sessions (id, email, assessments, report, created_at, ip) VALUES (?, ?, ?, ?, ?, ?)`
        )
          .bind(
            sessionId,
            email,
            JSON.stringify(assessments),
            JSON.stringify(report),
            new Date().toISOString(),
            ip
          )
          .run()
          .catch((e) => console.error("[report] D1 persist failed:", e))
      );
    }

    return json({ ok: true, report });
  } catch (e) {
    console.error("[report] Unexpected error:", e);
    return json({ error: e.message || "Internal error" }, 500);
  }
}

export async function onRequestOptions(context) {
  return preflight(context.request);
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      // Locked to our own origin (was "*", which let any site call this).
      "Access-Control-Allow-Origin": "https://ahoosh.ai",
      Vary: "Origin",
    },
  });
}
