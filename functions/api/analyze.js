// Cloudflare Pages Function — POST /api/analyze
// Turns a completed assessment's scores into a personalized, written character
// analysis via Claude. Used by the personality results screen to show more than
// just a number. Falls back gracefully (returns ok:false) if the LLM is unavailable.
//
// Env: ANTHROPIC_API_KEY (already set in Pages → Settings → Variables).
//
// Accepted JSON:
//   test_title   (string)  e.g. "Big Five Personality"
//   scale_name   (string)  optional, e.g. "IPIP-50"
//   result_type  (string)  "big5" | "single"
//   scores       (object)  per-dimension {DIM:{pct,level}} or single {total,pct,level}
//   name         (string)  optional first name

export async function onRequestPost(context) {
  const { request, env } = context;
  const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  const reply = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: cors });

  let body = {};
  try { body = await request.json(); } catch { return reply({ ok: false, error: 'bad_json' }, 400); }

  const testTitle = String(body.test_title || 'assessment').slice(0, 80);
  const scaleName = String(body.scale_name || '').slice(0, 60);
  const scores = body.scores && typeof body.scores === 'object' ? body.scores : null;
  const name = String(body.name || '').trim().slice(0, 60);

  if (!scores) return reply({ ok: false, error: 'no_scores' }, 400);
  // Prefer the free Cloudflare Workers AI binding (env.AI); fall back to Anthropic if a key is set.
  if (!env.AI && !env.ANTHROPIC_API_KEY) return reply({ ok: false, error: 'llm_not_configured' });

  // Readable score lines for the prompt.
  const lines = [];
  if (typeof scores.pct === 'number') {
    lines.push(`Overall score: ${scores.pct}/100 (${scores.level || ''})`);
  } else {
    for (const k of Object.keys(scores)) {
      const v = scores[k];
      if (v && typeof v.pct === 'number') lines.push(`${k}: ${v.pct}/100 (${v.level || ''})`);
    }
  }

  const system =
    `You are a warm, precise occupational psychologist writing directly to the person who just took the "${testTitle}"${scaleName ? ` (${scaleName})` : ''} assessment. ` +
    `Write a personalized character analysis in second person ("you"). ` +
    `Structure: (1) a two-sentence summary of who they are based on the scores; (2) their core strengths and where these show up at work; (3) blind spots or watch-outs, framed constructively; (4) one concrete suggestion. ` +
    `Interpret the standard dimensions of this instrument correctly (e.g. Big Five O/C/E/A/N, DISC, decision-making styles). ` +
    `Be specific to the actual scores — no generic horoscope language, no flattery, no filler. 180–240 words. Plain paragraphs, no headings, no markdown.`;

  const userMsg =
    `Assessment: ${testTitle}\n` +
    (name ? `Name: ${name}\n` : '') +
    `Scores:\n${lines.join('\n')}\n\n` +
    `Write their character analysis.`;

  try {
    let text = '';
    if (env.AI) {
      // Free Cloudflare Workers AI (Llama) — no per-call cost. Same model your report worker uses.
      const out = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fp8', {
        messages: [{ role: 'system', content: system }, { role: 'user', content: userMsg }],
        max_tokens: 700,
      });
      text = (out && typeof out.response === 'string') ? out.response.trim() : '';
    } else if (env.ANTHROPIC_API_KEY) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 700, system, messages: [{ role: 'user', content: userMsg }] }),
        signal: AbortSignal.timeout(25000),
      });
      const data = await res.json();
      text = (data.content && data.content[0] && data.content[0].text) ? data.content[0].text.trim() : '';
    }
    if (!text) return reply({ ok: false, error: 'empty' });
    return reply({ ok: true, analysis: text });
  } catch (e) {
    return reply({ ok: false, error: 'llm_error', detail: String(e && e.message || e) });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
