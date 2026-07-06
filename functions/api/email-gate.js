// Cloudflare Pages Function — POST /api/email-gate
// Captures the lead from the Assess gates AND sends BOTH:
//   1) the respondent a full report email (score + per-dimension breakdown + interpretations
//      + an AI advisory read + a copy of their own answers), and
//   2) Hesam a rich lead email with the same breakdown + AI read + the respondent's full answers,
//      so he can actually advise instead of staring at a single number.
// Fire-and-forget: always returns ok:true so the results page is never blocked.
//
// Accepted JSON payload:
//   email      (required)  — respondent email
//   name       (optional)  — respondent name
//   source     (optional)  — where the capture happened
//   track      (optional)  — assessment id, e.g. 'big5' | 'disc' | 'business'
//   test_title (optional)  — human title, e.g. 'DISC Profile'
//   scale_name (optional)  — e.g. 'IPIP-50'
//   score      (optional)  — overall 0–100
//   scores     (optional)  — raw scores object (per-dimension or {total,pct,level})
//   result_type(optional)  — 'single' | 'big5'
//   summary    (optional)  — profile summary line
//   breakdown  (optional)  — [{label,pct,level,level_label,interpretation}]
//   answers    (optional)  — [{q,a}] the respondent's actual answers
//   consent    (optional)  — boolean
//
// Env: BREVO_API_KEY, BREVO_LIST_ID?, BREVO_SENDER?, BREVO_SENDER_NAME?, ADMIN_NOTIFY_EMAIL?
// Bindings: ASSESS_DB (D1, optional), AI (Workers AI, optional — powers the advisory read)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CAL = 'https://calendly.com/ahoosh/strategy';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function levelWord(l) {
  const m = { high: 'High', medium: 'Moderate', low: 'Low' };
  return m[String(l || '').toLowerCase()] || (l ? String(l) : '');
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  const reply = (body) => new Response(JSON.stringify(body), { headers });

  let body = {};
  try { body = await request.json(); } catch { return reply({ ok: true, captured: false, status: 'parse_error' }); }

  const email = String(body.email || '').trim().toLowerCase();
  const name = String(body.name || '').trim().slice(0, 100);
  const source = String(body.source || 'assess_report_pdf').slice(0, 60);
  const track = String(body.track || '').slice(0, 30);
  const consent = body.consent === true;
  const score =
    typeof body.score === 'number' && isFinite(body.score) ? Math.max(0, Math.min(100, Math.round(body.score))) : null;
  const testTitle = String(body.test_title || '').slice(0, 80);
  const scaleName = String(body.scale_name || '').slice(0, 80);
  const resultType = String(body.result_type || '').slice(0, 20);
  const summary = String(body.summary || '').slice(0, 300);
  const scores = body.scores && typeof body.scores === 'object' ? body.scores : null;
  const breakdown = Array.isArray(body.breakdown) ? body.breakdown.slice(0, 12) : [];
  const answers = Array.isArray(body.answers) ? body.answers.slice(0, 80) : [];

  if (!EMAIL_RE.test(email)) return reply({ ok: true, captured: false, status: 'invalid_email' });

  // ── Store in D1 (fire-and-forget) — now includes answers + breakdown for the record ──
  let stored = false;
  if (env.ASSESS_DB) {
    stored = true;
    const record = { kind: 'email_capture', name, source, track, test_title: testTitle, result_type: resultType, score, scores, summary, breakdown, answers, consent };
    context.waitUntil(
      env.ASSESS_DB.prepare(
        `INSERT INTO assess_sessions (id, email, assessments, report, created_at, ip)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
        .bind(crypto.randomUUID(), email, JSON.stringify(record), null, new Date().toISOString(), request.headers.get('CF-Connecting-IP') || null)
        .run()
        .catch((e) => console.error('[email-gate] D1 persist failed:', e))
    );
  }

  if (!env.BREVO_API_KEY) return reply({ ok: true, captured: false, stored, status: 'brevo_not_configured' });

  try {
    // ── Brevo contact upsert ──
    const attributes = { SOURCE: source, ASSESS_DATE: new Date().toISOString().split('T')[0], CONSENT: consent };
    if (name) attributes.FIRSTNAME = name;
    if (track) attributes.ASSESS_TRACK = track;
    if (score !== null) attributes.ASSESS_SCORE = score;
    const contactBody = { email, attributes, updateEnabled: true };
    if (env.BREVO_LIST_ID) { const id = parseInt(env.BREVO_LIST_ID, 10); if (!isNaN(id)) contactBody.listIds = [id]; }

    const brevoRes = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': env.BREVO_API_KEY, accept: 'application/json' },
      body: JSON.stringify(contactBody),
    });
    const captured = brevoRes.status === 201 || brevoRes.status === 204;
    if (!captured) console.error('[email-gate] Brevo contact', brevoRes.status, await brevoRes.text().catch(() => ''));

    // ── Generate the AI advisory read + send BOTH rich emails, all in the background ──
    if (captured) {
      const sender = { email: env.BREVO_SENDER || 'contact@ahoosh.ai', name: env.BREVO_SENDER_NAME || 'AHoosh' };
      const adminTo = env.ADMIN_NOTIFY_EMAIL || 'hesamjafarzadeh@gmail.com';
      const label = testTitle || 'assessment';

      context.waitUntil((async () => {
        const advisory = await buildAdvisory(env, { testTitle: label, scaleName, summary, score, breakdown, answers });

        // shared HTML fragments
        const scoreBlock = score !== null
          ? `<div style="font-size:40px;font-weight:700;color:#D7A13D;line-height:1;margin:6px 0;">${score}<span style="font-size:15px;color:#9FB0C4;"> / 100</span></div>`
          : '';
        const breakdownHtml = breakdown.length
          ? `<h3 style="font-size:14px;color:#D7A13D;letter-spacing:1px;text-transform:uppercase;margin:22px 0 8px;">Your breakdown</h3>` +
            breakdown.map((b) => {
              const pct = (b && b.pct != null) ? `${b.pct}/100` : '';
              const lvl = levelWord(b && b.level);
              const tag = lvl ? ` &middot; <span style="color:#D7A13D;">${esc(lvl)}</span>` : '';
              const interp = (b && b.interpretation) ? `<div style="color:#C8D4E0;font-size:13px;line-height:1.5;margin:2px 0 10px;">${esc(b.interpretation)}</div>` : '';
              return `<div style="margin:0 0 4px;"><b style="color:#F0F2F5;font-size:14px;">${esc(b && b.label)}</b> <span style="color:#9FB0C4;font-size:13px;">${pct}${tag}</span></div>${interp}`;
            }).join('')
          : '';
        const advisoryHtml = advisory
          ? `<h3 style="font-size:14px;color:#D7A13D;letter-spacing:1px;text-transform:uppercase;margin:22px 0 8px;">What this means for you</h3>` +
            advisory.split(/\n\n+/).map((p) => `<p style="color:#C8D4E0;font-size:14px;line-height:1.6;margin:0 0 10px;">${esc(p)}</p>`).join('')
          : '';
        const answersHtml = answers.length ? answersTable(answers, true) : '';

        // ── 1) Customer full-report email ──
        const custHtml = `<div style="background:#03142E;color:#F0F2F5;font-family:Georgia,serif;padding:32px;border-radius:12px;max-width:600px;margin:auto;">
          <div style="color:#D7A13D;letter-spacing:3px;font-size:11px;text-transform:uppercase;">AHoosh &middot; Growth Assessment</div>
          <h1 style="font-size:22px;margin:10px 0 2px;font-weight:700;">Your ${esc(label)} report</h1>
          ${scaleName ? `<div style="color:#7f92a8;font-size:12px;margin-bottom:6px;">${esc(scaleName)}</div>` : ''}
          ${scoreBlock}
          ${summary ? `<p style="color:#F0F2F5;font-size:15px;margin:6px 0 4px;">You are most strongly characterized as <b style="color:#D7A13D;">${esc(summary)}</b>.</p>` : ''}
          ${breakdownHtml}
          ${advisoryHtml}
          ${answersHtml}
          <div style="margin-top:22px;padding-top:16px;border-top:1px solid rgba(215,161,61,0.25);">
            <p style="color:#C8D4E0;font-size:14px;line-height:1.6;margin:0 0 10px;">Want a human read on what this means for your business or career? Book a free 30-minute call &mdash; no pitch.</p>
            <a href="${CAL}" style="display:inline-block;background:#D7A13D;color:#03142E;font-weight:700;text-decoration:none;padding:12px 26px;border-radius:8px;">Book a strategy call &rarr;</a>
          </div>
          <p style="color:#5e6e82;font-size:12px;margin-top:24px;">AHoosh.ai &mdash; AI-augmented consulting &middot; ahoosh.ai. For informational purposes only.</p>
        </div>`;

        await sendBrevo(env, { sender, to: [{ email, name: name || undefined }], subject: `Your ${label} report — AHoosh`, html: custHtml, tag: 'result email' });

        // ── 2) Admin lead email — everything Hesam needs to advise ──
        const rows = [
          ['Name', name || '—'], ['Email', email], ['Assessment', testTitle || track || '—'],
          ['Overall', score != null ? score + '/100' : '—'], ['Profile', summary || '—'],
          ['Source', source], ['Consent', consent ? 'yes' : 'no'], ['When', new Date().toISOString()],
        ].map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#555;"><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join('');
        const adminBreakdown = breakdown.length
          ? `<h3 style="font-size:13px;color:#111;margin:16px 0 6px;">Breakdown</h3><table style="border-collapse:collapse;font-size:13px;">` +
            breakdown.map((b) => `<tr><td style="padding:2px 12px 2px 0;"><b>${esc(b && b.label)}</b></td><td>${b && b.pct != null ? esc(b.pct) + '/100' : ''} ${esc(levelWord(b && b.level))}</td></tr><tr><td></td><td style="color:#666;padding-bottom:6px;">${esc(b && b.interpretation)}</td></tr>`).join('') +
            `</table>`
          : '';
        const adminAdvisory = advisory
          ? `<h3 style="font-size:13px;color:#111;margin:16px 0 6px;">AI read (for advising)</h3>` +
            advisory.split(/\n\n+/).map((p) => `<p style="font-size:13px;line-height:1.55;color:#333;margin:0 0 8px;">${esc(p)}</p>`).join('')
          : '';
        const adminAnswers = answers.length
          ? `<h3 style="font-size:13px;color:#111;margin:16px 0 6px;">Their answers (${answers.length})</h3>` + answersTable(answers, false)
          : '';
        const adminHtml = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;max-width:640px;">
          <h2 style="margin:0 0 10px;">New assessment lead</h2>
          <table style="border-collapse:collapse;font-size:14px;">${rows}</table>
          ${adminBreakdown}${adminAdvisory}${adminAnswers}
          <p style="color:#888;font-size:12px;margin-top:16px;">Saved to Brevo${stored ? ' + D1' : ''}. Automated alert from ahoosh.ai/assess.</p>
        </div>`;

        await sendBrevo(env, {
          sender: { email: env.BREVO_SENDER || 'contact@ahoosh.ai', name: 'AHoosh Assessments' },
          to: [{ email: adminTo }], replyTo: { email }, subject: `New lead: ${name || email} — ${testTitle || track || 'assessment'} (${score != null ? score + '/100' : 'n/a'})`,
          html: adminHtml, tag: 'admin alert',
        });
      })());
    }

    return reply({ ok: true, captured, stored, status: captured ? 'captured' : 'brevo_rejected' });
  } catch (e) {
    console.error('[email-gate] error:', e);
    return reply({ ok: true, captured: false, stored, status: 'brevo_error' });
  }
}

// Render a Q→A answers table. dark=true for the navy customer email, false for the light admin email.
function answersTable(answers, dark) {
  const head = dark
    ? `<h3 style="font-size:14px;color:#D7A13D;letter-spacing:1px;text-transform:uppercase;margin:22px 0 8px;">Your answers</h3>`
    : '';
  const qCol = dark ? '#C8D4E0' : '#333';
  const aCol = dark ? '#F0F2F5' : '#111';
  const border = dark ? 'rgba(215,161,61,0.15)' : '#eee';
  const rows = answers.map((a) =>
    `<tr><td style="padding:5px 12px 5px 0;color:${qCol};font-size:13px;border-bottom:1px solid ${border};">${esc(a && a.q)}</td><td style="padding:5px 0;color:${aCol};font-size:13px;font-weight:bold;white-space:nowrap;border-bottom:1px solid ${border};">${esc(a && a.a)}</td></tr>`
  ).join('');
  return `${head}<table style="border-collapse:collapse;width:100%;font-family:Arial,Helvetica,sans-serif;">${rows}</table>`;
}

// Send one transactional email through Brevo (best-effort; logs on failure).
async function sendBrevo(env, { sender, to, replyTo, subject, html, tag }) {
  try {
    const payload = { sender, to, subject, htmlContent: html };
    if (replyTo) payload.replyTo = replyTo;
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': env.BREVO_API_KEY, accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    if (r.status >= 300) console.error(`[email-gate] ${tag} failed`, r.status, await r.text().catch(() => ''));
  } catch (e) {
    console.error(`[email-gate] ${tag} error`, e);
  }
}

// Generate a concise advisory read from the scores/answers using free Workers AI (Llama).
// Returns '' if the AI binding is unavailable so emails still send without it.
async function buildAdvisory(env, { testTitle, scaleName, summary, score, breakdown, answers }) {
  if (!env.AI) return '';
  const lines = [];
  if (score != null) lines.push(`Overall: ${score}/100`);
  if (summary) lines.push(`Profile: ${summary}`);
  (breakdown || []).forEach((b) => { if (b && b.pct != null) lines.push(`${b.label}: ${b.pct}/100 (${b.level || ''})`); });
  const ans = (answers || []).slice(0, 30).map((a) => `- ${a.q} → ${a.a}`).join('\n');
  const system =
    `You are a warm, precise occupational psychologist writing directly to the person who just took the "${testTitle}"${scaleName ? ` (${scaleName})` : ''} assessment. ` +
    `Write in second person ("you"). Structure: (1) two-sentence summary of who they are; (2) core strengths and where they show up at work; (3) blind spots framed constructively; (4) one concrete suggestion. ` +
    `Ground it in the actual scores AND their answers — reference specific tendencies you infer from what they chose. Interpret the standard dimensions of this instrument correctly. ` +
    `No generic horoscope language, no flattery, no filler. 160–230 words. Plain paragraphs, no headings, no markdown.`;
  const userMsg = `Assessment: ${testTitle}\nScores:\n${lines.join('\n')}\n\nTheir answers:\n${ans}\n\nWrite their analysis.`;
  try {
    const out = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fp8', {
      messages: [{ role: 'system', content: system }, { role: 'user', content: userMsg }],
      max_tokens: 700,
    });
    return (out && typeof out.response === 'string') ? out.response.trim() : '';
  } catch (e) {
    console.error('[email-gate] advisory error', e);
    return '';
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
