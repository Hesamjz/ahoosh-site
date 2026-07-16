/**
 * BUG-7 — Lock every non-production hostname behind a username + password.
 *
 * WHY THIS EXISTS
 *   staging.ahoosh.ai was open to the whole internet, serving a working
 *   "BOOK & PAY — €149" button wired to the REAL Lemon Squeezy checkout
 *   (verified 2026-07-16). A stranger could have paid on a test site.
 *
 * THE MODEL — allowlist, not blocklist
 *   ahoosh.ai and www.ahoosh.ai  -> PUBLIC. This file does nothing at all.
 *   EVERYTHING else              -> must type a username + password.
 *
 *   "Everything else" deliberately includes staging.ahoosh.ai, ahoosh-site.pages.dev,
 *   and every random <hash>.ahoosh-site.pages.dev preview URL Cloudflare generates
 *   on each build. Those preview URLs are public too, and nobody was watching them.
 *
 *   An allowlist is used on purpose: a new preview hostname appears on every push.
 *   With a blocklist, each new one would be born public. With an allowlist, each
 *   new one is born locked. The failure direction matters more than the code size.
 *
 * WHERE THE PASSWORD LIVES
 *   Cloudflare -> Pages -> ahoosh-site -> Settings -> Variables and Secrets.
 *   Set STAGING_USER and STAGING_PASS on the PREVIEW scope. Hesam types them in
 *   himself. They are never in this repo, never in a script, never in a chat log.
 *
 * IF THE VARIABLES ARE MISSING
 *   Staging returns 503 with instructions. It does NOT fall back to public.
 *   A silent fall-open would recreate the exact bug this file is closing.
 *
 * OPTIONAL LOGIN PING (Telegram)
 *   If TELEGRAM_BOT_TOKEN and TELEGRAM_HESAM_CHAT_ID are set on Preview, the first
 *   successful login from a browser sends Hesam a message. A cookie suppresses the
 *   rest of that session, so it is ~1 ping per person per 12h, not one per click.
 *   If those variables are absent, nothing happens — no error, no delay.
 *   The ping runs via waitUntil inside try/catch: it can never block or break login.
 */

const PUBLIC_HOSTS = new Set(["ahoosh.ai", "www.ahoosh.ai"]);

const SESSION_COOKIE = "stg_seen";

/** Constant-time string compare — no early exit on first wrong character. */
function safeEqual(a, b) {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  // Length alone is not secret enough to branch on, so mix it into the result
  // instead of returning early.
  let diff = ab.length ^ bb.length;
  const n = Math.max(ab.length, bb.length);
  for (let i = 0; i < n; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

function parseBasic(header) {
  if (!header) return null;
  const [scheme, encoded] = header.split(" ");
  if (!encoded || scheme.toLowerCase() !== "basic") return null;
  let decoded;
  try {
    decoded = atob(encoded);
  } catch {
    return null;
  }
  const i = decoded.indexOf(":");
  if (i < 0) return null;
  // Only the FIRST colon splits — passwords may contain colons.
  return { user: decoded.slice(0, i), pass: decoded.slice(i + 1) };
}

function askForPassword() {
  return new Response("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="AHoosh staging", charset="UTF-8"',
      "Content-Type": "text/plain; charset=utf-8",
      // Never let a 401 or a logged-in page sit in any cache.
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

function notConfigured() {
  return new Response(
    "Staging is locked and no credentials are configured.\n\n" +
      "Cloudflare -> Pages -> ahoosh-site -> Settings -> Variables and Secrets\n" +
      "Add STAGING_USER and STAGING_PASS on the Preview scope, then redeploy.\n",
    {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    }
  );
}

async function pingTelegram(env, host, path) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chat = env.TELEGRAM_HESAM_CHAT_ID;
  if (!token || !chat) return; // not configured -> silently skip
  const text = `🔐 Someone signed in to ${host}\nPage: ${path}\nTime: ${new Date().toISOString()}`;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text }),
  });
}

export async function onRequest(context) {
  const { request, env, next, waitUntil } = context;
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();

  // ---- PRODUCTION: this file is a strict no-op. Nothing below runs. ----------
  if (PUBLIC_HOSTS.has(host)) return next();

  // ---- Everything else is locked. ------------------------------------------
  const user = env.STAGING_USER;
  const pass = env.STAGING_PASS;
  if (!user || !pass) return notConfigured();

  const creds = parseBasic(request.headers.get("Authorization"));
  if (!creds) return askForPassword();

  // Both compares always run — no short-circuit on the username.
  const okUser = safeEqual(creds.user, user);
  const okPass = safeEqual(creds.pass, pass);
  if (!(okUser && okPass)) return askForPassword();

  const seen = (request.headers.get("Cookie") || "").includes(`${SESSION_COOKIE}=1`);
  if (!seen && waitUntil) {
    waitUntil(pingTelegram(env, host, url.pathname).catch(() => {}));
  }

  const res = await next();
  const out = new Response(res.body, res);
  // Never let an authenticated page be cached by a shared cache.
  out.headers.set("Cache-Control", "no-store");
  out.headers.set("X-Robots-Tag", "noindex, nofollow");
  if (!seen) {
    out.headers.append(
      "Set-Cookie",
      `${SESSION_COOKIE}=1; Path=/; Max-Age=43200; HttpOnly; Secure; SameSite=Lax`
    );
  }
  return out;
}
