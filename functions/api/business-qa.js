// functions/api/business-qa.js
// Accepts 10 business Q&A answers → Claude Haiku → structured business analysis
export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' } });
  }

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { answers = {} } = body;
  const answeredCount = Object.values(answers).filter(v => v && v.trim().length > 2).length;
  if (answeredCount < 5) {
    return Response.json({ error: 'Please answer at least 5 questions before submitting.' }, { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: 'Service temporarily unavailable.' }, { status: 503, headers: { 'Access-Control-Allow-Origin': '*' } });

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
    if (!jsonMatch) return Response.json({ error: 'Analysis generation failed. Please try again.' }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });

    const analysis = JSON.parse(jsonMatch[0]);
    return Response.json({ analysis }, { headers: { 'Access-Control-Allow-Origin': '*' } });

  } catch (err) {
    return Response.json({ error: 'Analysis failed: ' + err.message }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
}
