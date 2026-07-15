// Shared request guards for the public API functions.
//
// Files under functions/ that start with "_" are NOT routed by Cloudflare Pages,
// so this is a private helper module, not an endpoint.
//
// Why this exists: /api/analyze, /api/business-qa, /api/email-gate and /api/report
// were reachable by anyone on the internet with `Access-Control-Allow-Origin: *`.
// email-gate in particular would send mail from contact@ahoosh.ai to any address
// a caller supplied. These helpers lock the endpoints to our own pages.
//
// NOTE: an Origin/Referer check stops cross-site abuse and casual scripting. It is
// NOT proof against a determined attacker forging headers with curl. The durable
// answer for that is a Cloudflare WAF rate-limiting rule (dashboard → Security →
// WAF → Rate limiting rules) and/or a Turnstile widget on the assess gate.

const ALLOWED_ORIGINS = ['https://ahoosh.ai', 'https://www.ahoosh.ai'];

/** CORS headers locked to our own origins (never "*"). */
export function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allow,
    Vary: 'Origin',
  };
}

/**
 * True when the request plausibly came from a browser on one of our pages.
 * Browsers send Origin on cross-origin AND same-origin POSTs; Referer is the
 * fallback for the rare client that omits Origin.
 */
export function fromOurSite(request) {
  const origin = request.headers.get('Origin');
  if (origin) return ALLOWED_ORIGINS.includes(origin);
  const referer = request.headers.get('Referer') || '';
  if (referer) return ALLOWED_ORIGINS.some((o) => referer === o || referer.startsWith(o + '/'));
  return false; // no Origin and no Referer — not a browser on our site
}

/** Standard 403 for a request that did not come from our pages. */
export function denyForeign(request) {
  return new Response(JSON.stringify({ ok: false, error: 'forbidden_origin' }), {
    status: 403,
    headers: corsHeaders(request),
  });
}

/** Preflight response for the locked origins. */
export function preflight(request) {
  return new Response(null, {
    headers: {
      ...corsHeaders(request),
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}

/**
 * Verifies a Turnstile token when one is supplied AND TURNSTILE_SECRET is set.
 *
 * Deliberately permissive: returns true when no token is present, because the
 * assess pages do not render a Turnstile widget yet. Requiring a token here
 * today would reject every real visitor. Once the widget ships on the gate,
 * flip `required` to true at the call site.
 */
export async function turnstileOk(request, env, token, required = false) {
  const secret = env.TURNSTILE_SECRET;
  if (!secret) return true;              // not configured — nothing to enforce
  if (!token) return !required;          // no widget yet → don't lock real users out
  const verify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      secret,
      response: token,
      remoteip: request.headers.get('CF-Connecting-IP') || '',
    }),
  });
  const outcome = await verify.json().catch(() => ({ success: false }));
  return !!outcome.success;
}
