// Cloudflare Pages Function — POST /api/email-gate
// Captures email from the Assess Hub gates (results gate + PDF gate).
// Fire-and-forget philosophy: always returns ok:true so results/PDF are never blocked.
//
// Accepted JSON payload:
//   email    (required)  — respondent email
//   name     (optional)  — respondent name
//   source   (optional)  — where the capture happened (default 'assess_report_pdf')
//   track    (optional)  — assessment track, e.g. 'personality' | 'business' | 'website'
//   score    (optional)  — overall 0–100 score for that track
//   consent  (optional)  — boolean, GDPR opt-in checkbox state
//
// Env vars (Cloudflare Pages → Settings → Environment Variables):
//   BREVO_API_KEY  — Brevo API key for contact upsert (without it: clear no-op status)
//   BREVO_LIST_ID  — numeric list ID to add contacts to (optional)
// Bindings (Cloudflare Pages → Settings → Bindings):
//   ASSESS_DB      — D1 database "ahoosh-assess" (optional; stores capture in assess_sessions)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function onRequestPost(context) {
  const { request, env } = context;

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };
  const reply = (body) => new Response(JSON.stringify(body), { headers });

  let body = {};
  try {
    body = await request.json();
  } catch {
    return reply({ ok: true, captured: false, status: 'parse_error' });
  }

  const email = String(body.email || '').trim().toLowerCase();
  const name = String(body.name || '').trim().slice(0, 100);
  const source = String(body.source || 'assess_report_pdf').slice(0, 60);
  const track = String(body.track || '').slice(0, 30);
  const consent = body.consent === true;
  const score =
    typeof body.score === 'number' && isFinite(body.score)
      ? Math.max(0, Math.min(100, Math.round(body.score)))
      : null;
<<<<<<< Updated upstream
=======
  const testTitle = String(body.test_title || '').slice(0, 80);
  const resultType = String(body.result_type || '').slice(0, 20);
  // Full per-dimension scores object (Big Five / DISC / GDMS) or {total,pct,level} for single-scale tests.
  const scores = body.scores && typeof body.scores === 'object' ? body.scores : null;
>>>>>>> Stashed changes

  if (!EMAIL_RE.test(email)) {
    return reply({ ok: true, captured: false, status: 'invalid_email' });
  }

  // ── Store in D1 when the binding exists (fire-and-forget) ──
  let stored = false;
  if (env.ASSESS_DB) {
    stored = true;
<<<<<<< Updated upstream
    const record = { kind: 'email_capture', name, source, track, score, consent };
=======
    const record = { kind: 'email_capture', name, source, track, test_title: testTitle, result_type: resultType, score, scores, consent };
>>>>>>> Stashed changes
    context.waitUntil(
      env.ASSESS_DB.prepare(
        `INSERT INTO assess_sessions (id, email, assessments, report, created_at, ip)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
        .bind(
          crypto.randomUUID(),
          email,
          JSON.stringify(record),
          null,
          new Date().toISOString(),
          request.headers.get('CF-Connecting-IP') || null
        )
        .run()
        .catch((e) => console.error('[email-gate] D1 persist failed:', e))
    );
  }

  // ── Brevo upsert — clear no-op status when unconfigured ──
  if (!env.BREVO_API_KEY) {
    return reply({ ok: true, captured: false, stored, status: 'brevo_not_configured' });
  }

  try {
    const attributes = {
      SOURCE: source,
      ASSESS_DATE: new Date().toISOString().split('T')[0],
      CONSENT: consent,
    };
    if (name) attributes.FIRSTNAME = name;
    if (track) attributes.ASSESS_TRACK = track;
    if (score !== null) attributes.ASSESS_SCORE = score;

    const contactBody = {
      email,
      attributes,
      updateEnabled: true, // upsert: update if the contact already exists
    };

    if (env.BREVO_LIST_ID) {
      const listId = parseInt(env.BREVO_LIST_ID, 10);
      if (!isNaN(listId)) contactBody.listIds = [listId];
    }

    const brevoRes = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': env.BREVO_API_KEY,
        'accept': 'application/json',
      },
      body: JSON.stringify(contactBody),
    });

    // 201 = created, 204 = updated — both are success
    const captured = brevoRes.status === 201 || brevoRes.status === 204;
    if (!captured) {
      console.error('[email-gate] Brevo responded', brevoRes.status, await brevoRes.text().catch(() => ''));
    }
<<<<<<< Updated upstream
=======

    // ── Send the customer their result (transactional, best-effort, never blocks) ──
    // Requires a verified sender in Brevo. Set BREVO_SENDER (verified email) in Pages env vars.
    if (captured) {
      const sender = { email: env.BREVO_SENDER || 'hello@ahoosh.ai', name: env.BREVO_SENDER_NAME || 'AHoosh' };
      const label = testTitle || 'assessment';
      const scoreLine = score !== null
        ? `<div style="font-size:40px;font-weight:700;color:#D7A13D;margin:6px 0;">${score}<span style="font-size:15px;color:#9FB0C4;"> / 100</span></div>`
        : '';
      const html = `<div style="background:#03142E;color:#F0F2F5;font-family:Georgia,serif;padding:32px;border-radius:12px;max-width:520px;margin:auto;">
        <div style="color:#D7A13D;letter-spacing:3px;font-size:11px;text-transform:uppercase;">AHoosh &middot; Growth Assessment</div>
        <h1 style="font-size:22px;margin:10px 0 2px;font-weight:700;">Your ${label} result</h1>
        ${scoreLine}
        <p style="color:#C8D4E0;font-size:15px;line-height:1.6;">Thanks for completing the ${label}. Your full breakdown is on your results page. Want a human read on what it means for your business? Book a free 30-minute call &mdash; no pitch.</p>
        <a href="https://calendly.com/ahoosh/strategy" style="display:inline-block;margin-top:14px;background:#D7A13D;color:#03142E;font-weight:700;text-decoration:none;padding:12px 26px;border-radius:8px;">Book a strategy call &rarr;</a>
        <p style="color:#5e6e82;font-size:12px;margin-top:26px;border-top:1px solid rgba(215,161,61,0.2);padding-top:12px;">AHoosh.ai &mdash; AI-augmented B2B consulting &middot; ahoosh.ai</p>
      </div>`;
      context.waitUntil(
        fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'api-key': env.BREVO_API_KEY, accept: 'application/json' },
          body: JSON.stringify({
            sender,
            to: [{ email, name: name || undefined }],
            subject: `Your ${label} result — AHoosh`,
            htmlContent: html,
          }),
        })
          .then(async (r) => { if (r.status >= 300) console.error('[email-gate] result email failed', r.status, await r.text().catch(() => '')); })
          .catch((e) => console.error('[email-gate] result email error', e))
      );
    }

>>>>>>> Stashed changes
    return reply({ ok: true, captured, stored, status: captured ? 'captured' : 'brevo_rejected' });
  } catch (e) {
    // Never block results/PDF on a Brevo error
    console.error('[email-gate] Brevo error:', e);
    return reply({ ok: true, captured: false, stored, status: 'brevo_error' });
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
