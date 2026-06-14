// ahoosh-assess-report — POST /api/report
// Synthesizes a consulting report from assessment data.
//
// TIERED (Hesam's decision 2026-06-14): the report is the lead-magnet → booked-call
// path, so it runs on a real frontier model where quality converts to revenue.
//   PRIMARY : Claude Haiku (Anthropic) — needs the ANTHROPIC_API_KEY worker secret + credit.
//   FALLBACK: free Cloudflare Workers AI (Llama) — used if the key is missing or Anthropic
//             errors (e.g. out of credit). Reports degrade instead of breaking.
// News stays on free Workers AI (separate worker) — only client-facing synthesis pays.
//
// Contract (unchanged — the website needs no edit):
//   IN : { assessments: { website?, personality?, business? }, email? }
//   OUT: { ok: true, report: { executive_summary, priorities[], quick_win, founder_note, overall_score } }

export interface Env {
  AI: Ai;
  ASSESS_DB?: D1Database;
  ANTHROPIC_API_KEY?: string;
}

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const FALLBACK_MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8";

const SYSTEM_PROMPT = `You are a senior business consultant at AHoosh.ai. You received assessment results from a potential client. Produce a concise, precise consulting report.

AHoosh.ai services: branding, strategy, digital marketing, website design/build, SEO, content, AI agent setup, ad campaigns, social management, video production.

OUTPUT FORMAT (strict JSON — no markdown, no code fences, raw JSON only):
{
  "executive_summary": "3 sentences. The core diagnosis. What is actually wrong and why it matters.",
  "priorities": [
    { "area": "string", "finding": "1-2 sentences: what the data shows", "recommendation": "1-2 sentences: specific action", "ahoosh_service": "string or null" }
  ],
  "quick_win": "One thing they can do this week without hiring anyone. Specific.",
  "founder_note": "1 sentence connecting personality profile to business pattern. Only if personality data present. Otherwise null.",
  "overall_score": number
}

Rules:
- Maximum 3 priorities.
- No filler. No flattery. No generic advice.
- If data is missing for a category, skip it — do not fabricate.
- Mention AHoosh services only where genuinely relevant.
- overall_score: integer 0-100 reflecting overall business/digital readiness.
- Tone: direct, clear, respectful. Like a smart friend who happens to be an expert.`;

// Schema used to force structured output from the Workers AI fallback.
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    executive_summary: { type: "string" },
    priorities: {
      type: "array",
      items: {
        type: "object",
        properties: {
          area: { type: "string" },
          finding: { type: "string" },
          recommendation: { type: "string" },
          ahoosh_service: { type: ["string", "null"] },
        },
        required: ["area", "finding", "recommendation"],
      },
    },
    quick_win: { type: "string" },
    founder_note: { type: ["string", "null"] },
    overall_score: { type: "number" },
  },
  required: ["executive_summary", "priorities", "quick_win", "overall_score"],
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

    try {
      const body: any = await request.json();
      const assessments = body?.assessments;

      if (!assessments || Object.keys(assessments).length === 0) {
        return json({ error: "No assessment data provided" }, 400);
      }

      const userMsg = `Assessment data:\n${JSON.stringify(assessments, null, 2)}\n\nReturn the consulting report as JSON.`;

      let report: any = null;
      let engine = "none";

      // PRIMARY — Claude Haiku.
      if (env.ANTHROPIC_API_KEY) {
        try {
          report = await runClaude(env.ANTHROPIC_API_KEY, userMsg);
          if (report) engine = "claude-haiku";
        } catch (e: any) {
          console.error("[report] Claude failed, falling back to Workers AI:", e?.message);
        }
      }

      // FALLBACK — free Workers AI (Llama).
      if (!report) {
        try {
          report = await runWorkersAI(env.AI, userMsg);
          if (report) engine = "workers-ai-llama";
        } catch (e: any) {
          console.error("[report] Workers AI fallback failed:", e?.message);
        }
      }

      if (!report || !report.executive_summary) {
        return json({ error: "AI synthesis failed — no usable report from any engine" }, 422);
      }

      report = normalize(report);

      // Fire-and-forget persistence (never blocks the response).
      if (env.ASSESS_DB) {
        const email = body?.email || null;
        const ip = request.headers.get("CF-Connecting-IP") || null;
        ctx.waitUntil(
          env.ASSESS_DB.prepare(
            `INSERT INTO assess_sessions (id, email, assessments, report, created_at, ip) VALUES (?, ?, ?, ?, ?, ?)`
          )
            .bind(
              crypto.randomUUID(),
              email,
              JSON.stringify(assessments),
              JSON.stringify(report),
              new Date().toISOString(),
              ip
            )
            .run()
            .catch((e: any) => console.error("[report] D1 persist failed:", e?.message))
        );
      }

      return json({ ok: true, report, engine });
    } catch (e: any) {
      console.error("[report] Unexpected error:", e?.message);
      return json({ error: e?.message || "Internal error" }, 500);
    }
  },
};

async function runClaude(apiKey: string, userMsg: string): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMsg }],
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic ${res.status}: ${err.substring(0, 200)}`);
    }
    const data: any = await res.json();
    return coerceReport(data.content?.[0]?.text || "");
  } finally {
    clearTimeout(timeoutId);
  }
}

async function runWorkersAI(ai: Ai, userMsg: string): Promise<any> {
  // Try structured output first; fall back to free-form JSON if the runtime ignores it.
  try {
    const out: any = await ai.run(FALLBACK_MODEL, {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMsg },
      ],
      max_tokens: 1024,
      response_format: { type: "json_schema", json_schema: RESPONSE_SCHEMA },
    });
    const r = coerceReport(out);
    if (r) return r;
  } catch (e: any) {
    console.error("[report] Workers AI json_schema run failed, retrying free-form:", e?.message);
  }
  const out: any = await ai.run(FALLBACK_MODEL, {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMsg },
    ],
    max_tokens: 1024,
  });
  return coerceReport(out);
}

// Accepts a Claude text string, a Workers AI { response } object, or a raw object.
function coerceReport(out: any): any {
  if (!out) return null;
  let r = typeof out === "object" && "response" in out ? out.response : out;
  if (typeof r === "string") {
    const match = r.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      r = JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
  return r && typeof r === "object" ? r : null;
}

// Clamp/shape fields to exactly what the website renderer expects.
function normalize(r: any): any {
  const priorities = Array.isArray(r.priorities) ? r.priorities.slice(0, 3) : [];
  let score = Number(r.overall_score);
  if (!Number.isFinite(score)) score = 50;
  score = Math.max(0, Math.min(100, Math.round(score)));
  return {
    executive_summary: String(r.executive_summary || "").trim(),
    priorities: priorities.map((p: any) => ({
      area: String(p?.area || "").trim(),
      finding: String(p?.finding || "").trim(),
      recommendation: String(p?.recommendation || "").trim(),
      ahoosh_service: p?.ahoosh_service ? String(p.ahoosh_service).trim() : null,
    })),
    quick_win: String(r.quick_win || "").trim(),
    founder_note: r.founder_note ? String(r.founder_note).trim() : null,
    overall_score: score,
  };
}

function cors(res: Response): Response {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return res;
}

function json(body: any, status = 200): Response {
  return cors(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  );
}
