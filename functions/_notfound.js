// Shared hard-404 responder for retired routes (/markets, /fa, /fa/*).
// Underscore prefix => not routed by Cloudflare Pages; imported by the
// route files below. Returns a real 404 status with a branded page so the
// global soft-404 (homepage served for unknown paths) no longer applies here.

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>404 — Not found · AHoosh</title>
<style>
  :root { color-scheme: light dark; }
  html,body { height:100%; margin:0; }
  body {
    display:flex; align-items:center; justify-content:center;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background:#0b0f14; color:#e8edf2; text-align:center; padding:2rem;
  }
  .wrap { max-width:32rem; }
  .code { font-size:3.5rem; font-weight:700; letter-spacing:.02em; margin:0 0 .25rem; color:#c8a04a; }
  h1 { font-size:1.25rem; font-weight:600; margin:0 0 .75rem; }
  p { opacity:.75; line-height:1.6; margin:0 0 1.5rem; }
  a { display:inline-block; padding:.65rem 1.25rem; border-radius:.5rem;
      background:#c8a04a; color:#0b0f14; font-weight:600; text-decoration:none; }
  a:hover { background:#d8b25c; }
</style>
</head>
<body>
  <div class="wrap">
    <p class="code">404</p>
    <h1>This page no longer exists</h1>
    <p>The page you’re looking for has been retired. Head back to the homepage to find what you need.</p>
    <a href="https://ahoosh.ai/">Go to AHoosh home</a>
  </div>
</body>
</html>`;

export function gone() {
  return new Response(HTML, {
    status: 404,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=3600',
      'x-content-type-options': 'nosniff',
    },
  });
}

// If ever routed directly, respond 404 too.
export const onRequest = () => gone();
