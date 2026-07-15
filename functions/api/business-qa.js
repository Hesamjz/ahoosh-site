// functions/api/business-qa.js
// Accepts 10 business Q&A answers → Claude Haiku → structured business analysis
// Also returns a deterministic 0–100 score + interpretation band (no AI dependency):
//   0–25 Starting out · 26–50 Developing · 51–75 Established · 76–100 Advanced

const BANDS = [
  { min: 0,  max: 25,  label: 'Starting out' },
  { min: 26, max: 50,  label: 'Developing' },
  { min: 51, max: 75,  label: 'Established' },
  { min: 76, max: 100, label: 'Advanced' },
];

const BAND_INTERPRETATIONS = {
  'Starting out':
    'You gave us a first sketch of the business, but most of the picture is still blank. ' +
    'Fill in the basics — customers, revenue, what sets you apart — and the diagnosis gets much sharper.',
  'Developing':
    'The outline of your business is clear, but several answers are thin. ' +
    'More detail on how you win customers and what makes you different would turn this sketch into a plan.',
  'Established':
    'You know your business well and it shows in your answers. ' +
    'The gaps that remain are specific, which means they are fixable.',
  'Advanced':
    'Your answers are complete and specific — the mark of an owner who knows the numbers and the customers. ' +
    'The question now is execution speed, not clarity.',
};

// Deterministic score: 60% completeness (questions answered) + 40% depth
// (answers with enough detail to actually diagnose from, >= 40 chars).
function scoreBusinessAnswers(answers, questionCount) {
  let answered = 0;
  let detailed = 0;
  for (let i = 1; i <= questionCount; i++) {
    const a = String(answers[i] || '').trim();
    if (a.length > 2) answered++;
    if (a.length >= 40) detailed++;
  }
  const score = Math.round((answered / questionCount) * 60 + (detailed / questionCount) * 40);
  const clamped = Math.max(0, Math.min(100, score));
  const band = BANDS.find(b => clamped >= b.min && clamped <= b.max) || BANDS[0];
  return { score: clamped, band: band.label, interpretation: BAND_INTERPRETATIONS[band.label] };
}

import { fromOurSite, denyForeign, preflight } from './_guard.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return preflight(request);
  }

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Only our own pages may call this — every request spends an LLM call.
  if (!fromOurSite(request)) return denyForeign(request);

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { answers = {} } = body;
  const answeredCount = Object.values(answers).filter(v => v && v.trim().length > 2).length;
  if (answeredCount < 5) {
    return Response.json({ error: 'Please answer at least 5 questions before submitting.' }, { status: 400, headers: { 'Access-Control-Allow-Origin': 'https://ahoosh.ai', Vary: 'Origin' } });
  }

  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: 'Service temporarily unavailable.' }, { status: 503, headers: { 'Access-Control-Allow-Origin': 'https://ahoosh.ai', Vary: 'Origin' } });

  const questions = [
    'What industry or business sector are you in?',
    'Who are your target customers? (B2B, B2C, demographics, geography)',
    'What is your main product or service?',
    'What is your biggest business challenge right now?',
    'How do you currently acquire new customers?',
    'What is your approximate monthly revenue range?',
    'How many people are on your team?',
    'What makes you different from your competitors?',
    'What are your main goals for the next 12 months?',
    'What is the #1 thing you wish you could fix in your business?',
  ];

  const qaText = questions.map((q, i) => {
    const a = answers[i + 1];
    return `Q${i + 1}: ${q}\nA: ${a && a.trim() ? a.trim() : '(not answered)'}`;
  }).join('\n\n');

  const systemPrompt = `You are a senior business strategy consultant at AHoosh.ai, a digital consulting firm. Analyze the business owner's answers and produce a concise, actionable diagnosis.

Return ONLY valid JSON — no markdown, no explanation outside the JSON:
{
  "archetype": "2-4 word label (e.g. 'Early B2B SaaS', 'Local Service Business', 'Solo Consulting')",
  "summary": "2-3 sentence honest assessment. Be direct, not encouraging. Identify the real situation.",
  "strengths": ["concrete strength 1", "concrete strength 2", "concrete strength 3"],
  "challenges": ["specific challenge 1", "specific challenge 2"],
  "quickWins": [
    { "action": "specific action to take", "impact": "expected measurable result", "timeframe": "1-4 weeks" },
    { "action": "specific action to take", "impact": "expected measurable result", "timeframe": "1-4 weeks" },
    { "action": "specific action to take", "impact": "expected measurable result", "timeframe": "2-6 weeks" }
  ],
  "priority90days": "The single most important thing to focus on in the next 90 days — one sentence, no fluff",
  "ahooshFit": "How AHoosh.ai's services (branding, SEO, digital marketing, website, AI setup, social media) could concretely help THIS business — one specific sentence"
}

Rules: Base everything on actual answers. No generic startup advice. No motivational language. If answers suggest a problem, name it.`;

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        system: systemPrompt,
        messages: [{ role: 'user', content: `Business owner Q&A:\n\n${qaText}` }],
      }),
    });

    const claudeData = await claudeRes.json();
    const text = claudeData.content?.[0]?.text || '';

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return Response.json({ error: 'Analysis generation failed. Please try again.' }, { status: 500, headers: { 'Access-Control-Allow-Origin': 'https://ahoosh.ai', Vary: 'Origin' } });

    const analysis = JSON.parse(jsonMatch[0]);
    const scoring = scoreBusinessAnswers(answers, questions.length);
    return Response.json({ analysis, scoring }, { headers: { 'Access-Control-Allow-Origin': 'https://ahoosh.ai', Vary: 'Origin' } });

  } catch (err) {
    return Response.json({ error: 'Analysis failed: ' + err.message }, { status: 500, headers: { 'Access-Control-Allow-Origin': 'https://ahoosh.ai', Vary: 'Origin' } });
  }
}
