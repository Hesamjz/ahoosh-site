// Cloudflare Pages Function — POST /api/email-gate
// Captures email from the Assess Hub PDF gate.
// Fire-and-forget: always returns {ok:true} so the PDF download is never blocked.
//
// Required env vars (set in Cloudflare Pages → Settings → Environment Variables):
//   BREVO_API_KEY  — Brevo (Sendinblue) API key for contact creation
//   BREVO_LIST_ID  — numeric list ID to add contacts to (optional, defaults to no list)
//
// Without BREVO_API_KEY the function still returns ok:true (PDF unlocks, no CRM capture).

import { corsHeaders, isSameOrigin, forbidden, preflight } from './_guard.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  // Block cross-site / scripted abuse (this writes to the Brevo CRM).
  if (!isSameOrigin(request)) return forbidden(request);

  const headers = {
    'Content-Type': 'application/json',
    ...corsHeaders(request),
  };

  let email = '';
  let source = 'assess_report_pdf';

  try {
    const body = await request.json();
    email  = (body.email  || '').trim().toLowerCase();
    source = (body.source || source);
  } catch {
    return new Response(JSON.stringify({ ok: true, captured: false, reason: 'parse_error' }), { headers });
  }

  // Basic email validation
  if (!email || !email.includes('@') || email.length < 5) {
    return new Response(JSON.stringify({ ok: true, captured: false, reason: 'invalid_email' }), { headers });
  }

  // If no Brevo key set, return ok without capture
  if (!env.BREVO_API_KEY) {
    return new Response(JSON.stringify({ ok: true, captured: false, reason: 'no_brevo_key' }), { headers });
  }

  // Upsert contact in Brevo
  try {
    const contactBody = {
      email,
      attributes: {
        SOURCE: source,
        ASSESS_DATE: new Date().toISOString().split('T')[0],
      },
      updateEnabled: true,  // update if already exists
    };

    // Add to list if configured
    if (env.BREVO_LIST_ID) {
      contactBody.listIds = [parseInt(env.BREVO_LIST_ID, 10)];
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
    return new Response(JSON.stringify({ ok: true, captured }), { headers });

  } catch (e) {
    // Never block the PDF on a Brevo error
    return new Response(JSON.stringify({ ok: true, captured: false, reason: 'brevo_error' }), { headers });
  }
}

export async function onRequestOptions({ request }) {
  return preflight(request);
}
