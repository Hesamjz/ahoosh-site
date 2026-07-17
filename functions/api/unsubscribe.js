// One-click unsubscribe — /api/unsubscribe?e=<email>&t=<token>
//
// Why this exists: /snapshot promises "Unsubscribe any time with one click —
// that's the whole deal", and every capture is added to a Brevo marketing list.
// Before this, the promise had nothing behind it (staging test 2026-07-15 found
// zero unsubscribe links in the delivered email). This honours the promise.
//
// Not origin-guarded on purpose: the reader clicks this from their inbox, and
// mailbox providers POST it themselves (RFC 8058). The token is what protects it —
// an HMAC of the address, so nobody can unsubscribe a stranger by editing the URL.
//
// GET  -> unsubscribe + friendly confirmation page (reader clicked the link)
// POST -> unsubscribe, 200, no body (Gmail/Outlook one-click)

async function expectedToken(env, email) {
  // Signer (email-gate.js) and verifier (here) MUST obey the same rule. The old fallback
  // chain was removed from the signer but left here, and its last link was a hard-coded
  // string sitting in this PUBLIC repo — any token signed with it is forgeable by anyone
  // who can read the source, which would let a stranger unsubscribe any address. Silently
  // signing with a public string is worse than not signing at all: it looks secure.
  // Fail loudly instead of verifying with a guessable key.
  const secret = env.BACKEND_SECRET;
  if (!secret) throw new Error('BACKEND_SECRET missing — refusing to verify an unsubscribe token with a fallback key');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(email.toLowerCase()));
  return [...new Uint8Array(sig)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time-ish compare so the token can't be probed byte by byte. */
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Suppression record in D1 — the source of truth.
 *
 * The unsubscribe list has to outlive the mail provider. While the reader's
 * "unsubscribed" state lived only in Brevo, removing BREVO_API_KEY would have made every
 * unsubscribe link answer "That link is not valid" — the exact complaint class that got the
 * marketing channel suspended. D1 fixes that: the record is ours.
 *
 * No migration needed — assess_sessions and these columns are already in daily use by
 * email-gate.js's email_capture insert.
 */
async function suppress(env, email, ip) {
  if (!env.ASSESS_DB) return false;
  try {
    await env.ASSESS_DB.prepare(
      `INSERT INTO assess_sessions (id, email, assessments, report, created_at, ip)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(
        crypto.randomUUID(),
        email,
        JSON.stringify({ kind: 'unsubscribe', source: 'one-click' }),
        null,
        new Date().toISOString(),
        ip || null
      )
      .run();
    return true;
  } catch (e) {
    console.error('[unsubscribe] D1 suppression write failed:', e);
    return false;
  }
}

/** Brevo blocklist — best effort ONLY, while the account still exists. Never decides the answer. */
async function brevoBlocklist(env, email) {
  if (!env.BREVO_API_KEY) return false;
  try {
    const r = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'api-key': env.BREVO_API_KEY, accept: 'application/json' },
      body: JSON.stringify({ emailBlacklisted: true }),
    });
    // 204 = done. 404 = never in the list, which is still "not subscribed" for the reader.
    if (r.status >= 300 && r.status !== 404) {
      console.error('[unsubscribe] Brevo said', r.status, await r.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (e) {
    console.error('[unsubscribe] Brevo blocklist failed:', e);
    return false;
  }
}

async function unsubscribe(env, email, ip) {
  // D1 first — the record that survives the provider.
  const d1 = await suppress(env, email, ip);
  // Brevo second — belt and braces while the account is still there. BREVO_API_KEY can now
  // be removed from the env without breaking a single unsubscribe link.
  const brevo = await brevoBlocklist(env, email);
  return d1 || brevo;
}

const PAGE = (ok, email) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${ok ? 'Unsubscribed' : 'Link not valid'} · AHoosh</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#03142E;color:#F0F2F5;font-family:Georgia,serif;padding:2rem;">
<div style="max-width:520px;text-align:center;">
  <div style="color:#D7A13D;letter-spacing:3px;font-size:11px;text-transform:uppercase;">AHoosh</div>
  <h1 style="font-size:22px;margin:12px 0 10px;">${ok ? 'Done — you are unsubscribed' : 'That link is not valid'}</h1>
  <p style="color:#C8D4E0;font-size:15px;line-height:1.6;">${ok
    ? `We will not email <b style="color:#F0F2F5;">${email}</b> again. Anything you already downloaded is yours to keep.`
    : 'The link may be incomplete. Reply to any email from us and we will take you off the list by hand.'}</p>
  <p style="margin-top:22px;"><a href="https://ahoosh.ai" style="color:#D7A13D;text-decoration:none;font-weight:700;">ahoosh.ai &rarr;</a></p>
</div></body></html>`;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function handle(request, env) {
  const url = new URL(request.url);
  const email = String(url.searchParams.get('e') || '').trim().toLowerCase();
  const token = String(url.searchParams.get('t') || '').trim();
  if (!EMAIL_RE.test(email) || !token) return { ok: false, email };
  if (!safeEqual(token, await expectedToken(env, email))) return { ok: false, email };
  return { ok: await unsubscribe(env, email, request.headers.get('CF-Connecting-IP')), email };
}

export async function onRequestGet(context) {
  const { ok, email } = await handle(context.request, context.env);
  return new Response(PAGE(ok, email), {
    status: ok ? 200 : 400,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// Mailbox providers fire this without the reader ever opening a page.
export async function onRequestPost(context) {
  const { ok } = await handle(context.request, context.env);
  return new Response(null, { status: ok ? 200 : 400 });
}
