// functions/api/_guard.js
// Shared request-guard helpers for the public API endpoints.
// Files starting with "_" are NOT routed by Pages but can be imported.
//
// Goals:
//   - Block cross-site abuse of money-spending endpoints (AI, email, CRM, DB)
//     by requiring the request to originate from one of our own origins.
//   - Replace wildcard CORS ("*") with an origin-aware allowlist.
//   - Provide an HTML-escape helper for values interpolated into emails/HTML.
//
// NOTE: Origin/Referer checks stop browser-based cross-site calls and naive
// bots, but a determined attacker can spoof headers with curl. The durable
// backstop is the Cloudflare rate-limiting rule on /api/* (configured in the
// dashboard). These two layers together are the fix.

const ALLOWED_ORIGINS = new Set([
  "https://ahoosh.ai",
  "https://www.ahoosh.ai",
]);

// Accept our apex/www plus any Cloudflare Pages preview deployment for this
// project (e.g. https://183210cc.ahoosh-site.pages.dev) so previews keep working.
export function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const host = new URL(origin).host;
    return host === "ahoosh-site.pages.dev" || host.endsWith(".ahoosh-site.pages.dev");
  } catch {
    return false;
  }
}

// True if the request came from one of our own pages. Uses Origin (sent by
// browsers on POST/CORS) and falls back to Referer.
export function isSameOrigin(request) {
  const origin = request.headers.get("Origin");
  if (origin) return isAllowedOrigin(origin);
  const referer = request.headers.get("Referer");
  if (referer) {
    try {
      return isAllowedOrigin(new URL(referer).origin);
    } catch {
      return false;
    }
  }
  // No Origin and no Referer → almost always a scripted/cross-site call.
  return false;
}

// CORS headers that echo the caller's origin only when it is allowed,
// otherwise fall back to the canonical origin. Never "*".
export function corsHeaders(request, methods = "POST, OPTIONS") {
  const origin = request.headers.get("Origin");
  const allow = isAllowedOrigin(origin) ? origin : "https://ahoosh.ai";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

// Standard preflight response for an endpoint.
export function preflight(request, methods = "POST, OPTIONS") {
  return new Response(null, { headers: { ...corsHeaders(request, methods), "Access-Control-Max-Age": "86400" } });
}

// 403 for blocked cross-origin / scripted calls.
export function forbidden(request) {
  return new Response(JSON.stringify({ error: "forbidden" }), {
    status: 403,
    headers: { "Content-Type": "application/json", ...corsHeaders(request) },
  });
}

// Escape a value for safe interpolation into an HTML string (emails, etc.).
export function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Reasonable single-address email format check.
export function isValidEmail(email) {
  if (typeof email !== "string") return false;
  const e = email.trim();
  if (e.length < 5 || e.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}
