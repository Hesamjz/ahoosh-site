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
// Env: RESEND_API_KEY, BACKEND_SECRET, MAIL_SENDER?, MAIL_SENDER_NAME?, ADMIN_NOTIFY_EMAIL?
// Bindings: ASSESS_DB (D1, optional), AI (Workers AI, optional — powers the advisory read)

/**
 * Has this address unsubscribed? D1 is the source of truth (see unsubscribe.js).
 *
 * json_extract is safe here: D1 ships SQLite's JSON extension — Cloudflare D1 docs,
 * "Supported SQLite extensions": "JSON extension for JSON functions and operators."
 *
 * Fails OPEN on error: a D1 hiccup must not silently kill the whole lead magnet. The
 * trade-off is deliberate — a suppressed address could be mailed during a D1 outage.
 */
async function isSuppressed(env, email) {
  if (!env.ASSESS_DB) return false;
  try {
    const row = await env.ASSESS_DB.prepare(
      `SELECT 1 AS hit FROM assess_sessions
        WHERE lower(email) = ?
          AND json_extract(assessments, '$.kind') = 'unsubscribe'
        LIMIT 1`
    )
      .bind(String(email).toLowerCase())
      .first();
    return !!row;
  } catch (e) {
    console.error('[email-gate] suppression check failed (failing open):', e);
    return false;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CAL = 'https://ahoosh.ai/contact';
// Absolute base for links/attachments inside emails.
//
// Derived from the deployment actually serving the request, NOT hard-coded.
// Learned the hard way (staging test 2026-07-15): with this pinned to
// ahoosh.ai, a Snapshot sent from staging told Brevo to attach
// https://ahoosh.ai/downloads/AI_Visibility_Snapshot_v1.pdf — a path that does
// not exist on production. The site answers unknown paths with 200 + the
// homepage HTML (no 404 route), so Brevo happily attached the HOMEPAGE renamed
// .pdf. The email looked perfect; the attachment was junk.
// Using the serving origin keeps every email self-consistent: staging emails
// carry staging's file, production emails carry production's.
// fromOurSite() already restricts callers to our own hosts.
const siteBase = (request) => new URL(request.url).origin;

/**
 * Unsubscribe token — HMAC of the address, so an unsubscribe link cannot be
 * forged for someone else's address by guessing the URL.
 *
 * The old fallback chain (BACKEND_SECRET || BREVO_API_KEY || 'ahoosh-unsub') is
 * deliberately gone. Two reasons:
 *   1. 'ahoosh-unsub' is a LITERAL IN THIS REPO. Any token signed with it is
 *      forgeable by anyone who can read the source. Silently signing with a
 *      public string is worse than not signing at all — it looks secure.
 *   2. It keyed on BREVO_API_KEY, so pulling Brevo out of the env would have
 *      silently changed the signing key and invalidated every unsubscribe link
 *      already sitting in someone's inbox. A dead unsubscribe link is the exact
 *      complaint class that got the Brevo account suspended.
 *
 * BACKEND_SECRET is set on BOTH Production and Preview (verified in the
 * Cloudflare dashboard, 2026-07-17). If it ever goes missing we fail LOUDLY
 * rather than fall back to something forgeable.
 */
async function unsubToken(env, email) {
  const secret = env.BACKEND_SECRET;
  if (!secret) throw new Error('BACKEND_SECRET missing — refusing to sign an unsubscribe token with a fallback');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(email.toLowerCase()));
  return [...new Uint8Array(sig)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function levelWord(l) {
  const m = { high: 'High', medium: 'Moderate', low: 'Low' };
  return m[String(l || '').toLowerCase()] || (l ? String(l) : '');
}

import { fromOurSite, denyForeign, preflight, corsHeaders, turnstileOk } from './_guard.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const headers = corsHeaders(request);
  const reply = (body) => new Response(JSON.stringify(body), { headers });

  // ── Guard 1: only our own pages may call this ──────────────────────────────
  // This endpoint sends mail FROM contact@ahoosh.ai TO an address supplied in
  // the request body. Left open (it was: no checks, CORS "*"), anyone could
  // script it to send mail to arbitrary recipients under our domain — a fast
  // route to a spam listing and a Brevo suspension.
  if (!fromOurSite(request)) return denyForeign(request);

  let body = {};
  try { body = await request.json(); } catch { return reply({ ok: true, captured: false, status: 'parse_error' }); }

  // ── Guard 2: Turnstile, verified when a token is supplied ──────────────────
  // Not yet REQUIRED: the assess gate renders no Turnstile widget, so demanding
  // a token here would reject every real visitor. Once the widget ships, pass
  // `true` as the last argument to make it mandatory.
  const tsToken = String(body['cf-turnstile-response'] || body.turnstile_token || '');
  if (!(await turnstileOk(request, env, tsToken, false))) {
    return reply({ ok: true, captured: false, status: 'turnstile_failed' });
  }

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
  // Consulting-report fields (business/website track). When execSummary is present we render a
  // report-style email instead of the personality one.
  const execSummary = String(body.exec_summary || '').slice(0, 6000);
  const quickWin = String(body.quick_win || '').slice(0, 1500);
  const founderNote = String(body.founder_note || '').slice(0, 1500);

  if (!EMAIL_RE.test(email)) return reply({ ok: true, captured: false, status: 'invalid_email' });

  // ── Guard 3: consent must actually be given ────────────────────────────────
  // `consent` was previously read on the line above and then ignored — we stored
  // and emailed regardless. The notice on the gate promises the visitor
  // "Skip and nothing is stored", so honour it: no consent, no row, no email.
  if (!consent) return reply({ ok: true, captured: false, status: 'no_consent' });

  // ── Guard 4: never email an address that unsubscribed ──────────────────────
  // This gate is an UNAUTHENTICATED form: anyone can type anyone's address into it.
  // Without this check, a reader who unsubscribed is re-mailed the moment a stranger
  // types their address — breaking the unsubscribe page's literal promise,
  // "We will not email <address> again", and manufacturing the complaint class that
  // got the marketing channel suspended. The consent box proves the SENDER consented,
  // never that the address's OWNER did.
  if (await isSuppressed(env, email)) {
    return reply({ ok: true, captured: false, stored: false, status: 'suppressed' });
  }

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

  if (!env.RESEND_API_KEY) return reply({ ok: true, captured: false, stored, status: 'mail_not_configured' });

  try {
    // ── Lead accepted ─────────────────────────────────────────────────────
    // Consent is given and the address is valid, so the visitor gets the report
    // they asked for. This USED to be gated on a Brevo marketing-contact write
    // (POST /v3/contacts): when that call failed, the customer's PDF silently
    // never sent. Someone requesting their own report must never depend on a
    // mailing-list write succeeding. The upsert is gone. D1 is the record.
    const captured = true;

    // ── Generate the AI advisory read + send BOTH rich emails, all in the background ──
    if (captured) {
      const sender = { email: env.MAIL_SENDER || 'contact@ahoosh.ai', name: env.MAIL_SENDER_NAME || 'AHoosh' };
      const adminTo = env.ADMIN_NOTIFY_EMAIL || 'hesamjafarzadeh@gmail.com';
      const label = testTitle || 'assessment';

      context.waitUntil((async () => {
        const isReport = !!execSummary; // consulting report (business/website) vs personality test
        const advisory = isReport ? '' : await buildAdvisory(env, { testTitle: label, scaleName, summary, score, breakdown, answers });

        // ── Snapshot lead magnet ─────────────────────────────────────────────
        // The /snapshot page promises "The Snapshot (PDF, by email)". Attach the
        // real document AND give a download link (some clients strip attachments).
        // Detected off source/track so only Snapshot requests get it.
        const SITE = siteBase(request);
        const isSnapshot = /snapshot/i.test(source) || /snapshot/i.test(track);
        const snapshotHtml = isSnapshot
          ? `<div style="margin:18px 0 4px;padding:14px 16px;border:1px solid rgba(215,161,61,0.35);border-radius:8px;">
            <p style="color:#F0F2F5;font-size:14px;line-height:1.6;margin:0 0 10px;"><b>Your Snapshot is attached</b> as a PDF &mdash; print it, tick the 12 boxes, add up your score.</p>
            <a href="${SITE}/downloads/AI_Visibility_Snapshot_v1.pdf" style="color:#D7A13D;font-size:14px;font-weight:700;text-decoration:none;">Download the Snapshot (PDF) &rarr;</a>
          </div>`
          : '';

        // The eyebrow used to hard-code "Growth Assessment" on every email,
        // including Snapshot ones. Say what the reader actually asked for.
        const eyebrow = isSnapshot ? 'AI Visibility Snapshot' : (isReport ? 'Consulting Report' : 'Growth Assessment');

        // /snapshot promises "unsubscribe any time with one click" — so ship a
        // real one-click link. We no longer add anyone to a marketing list at
        // all (the Brevo upsert is gone), but the promise on the page stands and
        // the link must keep working for every address already emailed.
        const unsubUrl = `${SITE}/api/unsubscribe?e=${encodeURIComponent(email)}&t=${await unsubToken(env, email)}`;
        const unsubHtml = `<p style="color:#5e6e82;font-size:12px;margin-top:18px;">You are getting this because you asked us for it at ahoosh.ai. <a href="${unsubUrl}" style="color:#7f92a8;">Unsubscribe in one click</a> &mdash; no questions, no form.</p>`;

        // ── shared dark-email fragments ──
        const scoreBlock = score !== null
          ? `<div style="font-size:40px;font-weight:700;color:#D7A13D;line-height:1;margin:6px 0;">${score}<span style="font-size:15px;color:#9FB0C4;"> / 100</span></div>`
          : '';
        const H3 = 'style="font-size:14px;color:#D7A13D;letter-spacing:1px;text-transform:uppercase;margin:22px 0 8px;"';
        const P = 'style="color:#C8D4E0;font-size:14px;line-height:1.6;margin:0 0 10px;"';
        const paras = (t) => t.split(/\n\n+/).map((p) => `<p ${P}>${esc(p)}</p>`).join('');
        const breakdownHtml = breakdown.length
          ? `<h3 ${H3}>${isReport ? 'Priority areas' : 'Your breakdown'}</h3>` +
            breakdown.map((b) => {
              const pct = (b && b.pct != null) ? `${b.pct}/100` : '';
              const lvl = levelWord(b && b.level);
              const tag = lvl ? ` &middot; <span style="color:#D7A13D;">${esc(lvl)}</span>` : '';
              const interp = (b && b.interpretation) ? `<div style="color:#C8D4E0;font-size:13px;line-height:1.5;margin:2px 0 10px;">${esc(b.interpretation)}</div>` : '';
              return `<div style="margin:0 0 4px;"><b style="color:#F0F2F5;font-size:14px;">${esc(b && b.label)}</b> <span style="color:#9FB0C4;font-size:13px;">${pct}${tag}</span></div>${interp}`;
            }).join('')
          : '';
        const execHtml = (isReport && execSummary) ? `<h3 ${H3}>Executive summary</h3>${paras(execSummary)}` : '';
        const quickWinHtml = (isReport && quickWin) ? `<h3 ${H3}>Quick win — do this week</h3>${paras(quickWin)}` : '';
        const founderHtml = (isReport && founderNote) ? `<h3 ${H3}>A note for you</h3>${paras(founderNote)}` : '';
        const advisoryHtml = advisory ? `<h3 ${H3}>What this means for you</h3>${paras(advisory)}` : '';
        const summaryLine = (summary && !isReport) ? `<p style="color:#F0F2F5;font-size:15px;margin:6px 0 4px;">You are most strongly characterized as <b style="color:#D7A13D;">${esc(summary)}</b>.</p>` : '';
        const answersHtml = (!isReport && answers.length) ? answersTable(answers, true) : ''; // personality: show their answers to the customer

        // ── 1) Customer full-report email ──
        const custHtml = `<div style="background:#03142E;color:#F0F2F5;font-family:Georgia,serif;padding:32px;border-radius:12px;max-width:600px;margin:auto;">
          <div style="color:#D7A13D;letter-spacing:3px;font-size:11px;text-transform:uppercase;">AHoosh &middot; ${esc(eyebrow)}</div>
          ${snapshotHtml}
          <h1 style="font-size:22px;margin:10px 0 2px;font-weight:700;">Your ${esc(label)}${isReport ? '' : ' report'}</h1>
          ${scaleName ? `<div style="color:#7f92a8;font-size:12px;margin-bottom:6px;">${esc(scaleName)}</div>` : ''}
          ${scoreBlock}
          ${summaryLine}
          ${execHtml}
          ${breakdownHtml}
          ${quickWinHtml}
          ${founderHtml}
          ${advisoryHtml}
          ${answersHtml}
          <div style="margin-top:22px;padding-top:16px;border-top:1px solid rgba(215,161,61,0.25);">
            <p ${P}>Want a human read on what this means? A paid strategy call is 60 minutes with Hesam. &euro;149 &mdash; credited toward bigger work if you start within 14 days. Tell us on the contact form and Hesam sends payment details and confirms a time.</p>
            <a href="${CAL}" style="display:inline-block;background:#D7A13D;color:#03142E;font-weight:700;text-decoration:none;padding:12px 26px;border-radius:8px;">Ask about a strategy call &mdash; &euro;149 &rarr;</a>
          </div>
          ${unsubHtml}
          <p style="color:#5e6e82;font-size:12px;margin-top:24px;">AHoosh.ai &mdash; business, digital &amp; AI consulting &middot; ahoosh.ai. For informational purposes only.</p>
        </div>`;

        await sendResend(env, {
          sender, to: [{ email, name: name || undefined }],
          subject: `Your ${label}${isReport ? '' : ' report'} — AHoosh`,
          html: custHtml, tag: 'result email',
          // Real attachment for the Snapshot, read from our own asset store.
          attachment: isSnapshot
            ? await fetchAsset(env, request.url, '/downloads/AI_Visibility_Snapshot_v1.pdf', 'AI Visibility Snapshot — AHoosh.pdf')
            : undefined,
          unsubUrl,
        });

        // ── 2) Admin lead email — everything Hesam needs to advise ──
        const rows = [
          ['Name', name || '—'], ['Email', email], ['Assessment', testTitle || track || '—'],
          ['Overall', score != null ? score + '/100' : '—'], [isReport ? 'Summary' : 'Profile', summary || (isReport ? 'see below' : '—')],
          ['Source', source], ['Consent', consent ? 'yes' : 'no'], ['When', new Date().toISOString()],
        ].map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#555;"><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join('');
        const aH3 = 'style="font-size:13px;color:#111;margin:16px 0 6px;"';
        const aParas = (t) => t.split(/\n\n+/).map((p) => `<p style="font-size:13px;line-height:1.55;color:#333;margin:0 0 8px;">${esc(p)}</p>`).join('');
        const adminExec = (isReport && execSummary) ? `<h3 ${aH3}>Executive summary</h3>${aParas(execSummary)}` : '';
        const adminBreakdown = breakdown.length
          ? `<h3 ${aH3}>${isReport ? 'Priority areas' : 'Breakdown'}</h3><table style="border-collapse:collapse;font-size:13px;">` +
            breakdown.map((b) => `<tr><td style="padding:2px 12px 2px 0;"><b>${esc(b && b.label)}</b></td><td>${b && b.pct != null ? esc(b.pct) + '/100' : ''} ${esc(levelWord(b && b.level))}</td></tr><tr><td></td><td style="color:#666;padding-bottom:6px;">${esc(b && b.interpretation)}</td></tr>`).join('') +
            `</table>`
          : '';
        const adminQuick = (isReport && quickWin) ? `<h3 ${aH3}>Quick win</h3>${aParas(quickWin)}` : '';
        const adminFounder = (isReport && founderNote) ? `<h3 ${aH3}>Note</h3>${aParas(founderNote)}` : '';
        const adminAdvisory = advisory ? `<h3 ${aH3}>AI read (for advising)</h3>${aParas(advisory)}` : '';
        const adminAnswers = answers.length
          ? `<h3 ${aH3}>${isReport ? 'Their inputs' : 'Their answers'} (${answers.length})</h3>` + answersTable(answers, false)
          : '';
        const adminHtml = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;max-width:640px;">
          <h2 style="margin:0 0 10px;">New ${isReport ? 'report lead' : 'assessment lead'}</h2>
          <table style="border-collapse:collapse;font-size:14px;">${rows}</table>
          ${adminExec}${adminBreakdown}${adminQuick}${adminFounder}${adminAdvisory}${adminAnswers}
          <p style="color:#888;font-size:12px;margin-top:16px;">Saved to ${stored ? 'D1' : 'nothing (D1 unavailable)'}. Automated alert from ahoosh.ai/assess.</p>
        </div>`;

        await sendResend(env, {
          sender: { email: env.MAIL_SENDER || 'contact@ahoosh.ai', name: 'AHoosh Assessments' },
          to: [{ email: adminTo }], replyTo: { email }, subject: `New lead: ${name || email} — ${testTitle || track || 'assessment'} (${score != null ? score + '/100' : 'n/a'})`,
          html: adminHtml, tag: 'admin alert',
        });
      })());
    }

    return reply({ ok: true, captured, stored, status: 'captured' });
  } catch (e) {
    console.error('[email-gate] error:', e);
    return reply({ ok: true, captured: false, stored, status: 'mail_error' });
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

// Send one transactional email through Resend.
// Mirrors the resendSend() helper already proven in functions/api/contact.js,
// which has been sending from contact@ahoosh.ai in production.
// Returns true/false so a failure is visible instead of swallowed.
async function sendResend(env, { sender, to, replyTo, subject, html, tag, attachment, unsubUrl }) {
  try {
    const from = sender && sender.name ? `${sender.name} <${sender.email}>` : (sender && sender.email);
    const payload = {
      from,
      to: (to || []).map((t) => (typeof t === 'string' ? t : t && t.email)).filter(Boolean),
      subject,
      html,
    };
    if (replyTo) payload.reply_to = typeof replyTo === 'string' ? replyTo : replyTo.email;
    // RFC 8058 one-click unsubscribe — Resend passes custom headers through.
    if (unsubUrl) {
      payload.headers = {
        'List-Unsubscribe': `<${unsubUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      };
    }
    if (attachment) payload.attachments = attachment;

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (r.status >= 300) {
      console.error(`[email-gate] ${tag} failed`, r.status, await r.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[email-gate] ${tag} error`, e);
    return false;
  }
}

// Read a static asset from Pages' own asset store and return it as a Resend
// attachment (base64). Replaces "let the mail provider fetch this URL".
//
// WHY — this closes three separate failure modes at once:
//   1. BUG-5 (2026-07-15): the URL was built from SITE. SITE pointed at an
//      origin without the file, the site answered 200 + homepage, and Brevo
//      mailed the 407KB HOMEPAGE to a recipient renamed .pdf. env.ASSETS takes
//      no origin, so SITE cannot be wrong. The bug is structurally impossible.
//   2. THE STAGING GATEWAY (2026-07-17): functions/_middleware.js locks every
//      non-production host behind basic auth. A plain fetch() of
//      staging.ahoosh.ai/downloads/... returns 401 "Authentication required."
//      (verified). env.ASSETS reads beneath the Functions router, so the
//      middleware is not in its path.
//   3. EDGE CACHE: no HTTP request means no stale cached copy.
//
// env.ASSETS.fetch() is documented for the /functions directory mode and takes
// "a Request object, URL string, or URL object" (Cloudflare Pages API
// reference, read 2026-07-17). It still runs _headers and _redirects rules.
//
// The %PDF magic-byte check stays as belt-and-braces: ~4 lines, and it turns a
// silent-garbage failure into a loud one on a path that takes money.
async function fetchAsset(env, requestUrl, path, filename) {
  try {
    if (!env.ASSETS) { console.error('[attach] no ASSETS binding'); return null; }
    const r = await env.ASSETS.fetch(new URL(path, requestUrl));
    if (!r.ok) { console.error('[attach] ASSETS', r.status, path); return null; }
    const buf = await r.arrayBuffer();
    const h = new Uint8Array(buf.slice(0, 4));
    // "%PDF" = 0x25 0x50 0x44 0x46
    if (!(h[0] === 0x25 && h[1] === 0x50 && h[2] === 0x44 && h[3] === 0x46)) {
      console.error('[attach] NOT a PDF —', buf.byteLength, 'bytes from', path);
      return null;
    }
    let bin = '';
    const bytes = new Uint8Array(buf);
    // chunked: String.fromCharCode.apply overflows the stack on a big array
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return [{ content: btoa(bin), filename }];
  } catch (e) {
    console.error('[attach] error', e);
    return null;
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

export async function onRequestOptions(context) {
  return preflight(context.request);
}
