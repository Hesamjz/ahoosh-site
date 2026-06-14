// Cloudflare Pages Function — POST /api/report
// Receives assessment JSON → calls Claude Haiku → returns consulting report JSON
// Persists session to D1 (fire-and-forget, bound as ASSESS_DB)
//
// Required Cloudflare env secrets (set via Cloudflare dashboard → Pages → Settings → Variables):
//   ANTHROPIC_API_KEY  — your Anthropic API key
// Required D1 binding (set via Cloudflare dashboard → Pages → Settings → Bindings):
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

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const { assessments } = body;

    if (!assessments || Object.keys(assessments).length === 0) {
      return json({ error: "No assessment data provided" }, 400);
    }

    if (!env.ANTHROPIC_API_KEY) {
      return json({ error: "AI service not configured" }, 503);
    }

    // Call Claude Haiku
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
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

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      console.error("[report] Claude API error:", err);
      return json({ error: "AI synthesis failed", _debug: { status: claudeRes.status, body: err } }, 502);
    }

    const claudeData = await claudeRes.json();
    const raw = claudeData.content?.[0]?.text || "";

    let report;
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      report = JSON.parse(match ? match[0] : raw);
    } catch {
      console.error("[report] Parse error — raw:", raw);
      return json({ error: "Failed to parse AI response", raw }, 502);
    }

    // Persist to D1 (fire-and-forget — never blocks response)
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

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
