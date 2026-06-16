// Cloudflare Pages Function — POST /api/hokm/google-verify
// Body: { credential: "<google-id-token>" }
// Verifies the Google sign-in, checks the email allowlist, and returns a
// short-lived room-pass JWT the browser uses to open the game WebSocket.
//
// Env vars (Cloudflare Pages → Settings → Environment variables):
//   GOOGLE_CLIENT_ID  — the OAuth Web client id (also public on the client)
//   HOKM_JWT_SECRET   — secret shared with the hokm-room Worker
//   HOKM_ALLOWLIST    — comma-separated allowed emails ("*"/unset = anyone)

import {
  emailAllowed,
  jsonResponse,
  signRoomPass,
  verifyGoogleIdToken,
} from "./_lib.js";

const PASS_TTL_SECONDS = 6 * 60 * 60; // 6 hours

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "bad_request" }, 400);
  }

  const credential = body?.credential;
  if (!credential) return jsonResponse({ error: "missing_credential" }, 400);

  const payload = await verifyGoogleIdToken(credential, env.GOOGLE_CLIENT_ID);
  if (!payload) return jsonResponse({ error: "invalid_token" }, 401);

  if (!emailAllowed(payload.email, env.HOKM_ALLOWLIST)) {
    return jsonResponse({ error: "not_allowed" }, 403);
  }

  const now = Math.floor(Date.now() / 1000);
  const pass = await signRoomPass(
    {
      sub: payload.sub,
      email: payload.email,
      name: payload.name ?? null,
      picture: payload.picture ?? null,
      iat: now,
      exp: now + PASS_TTL_SECONDS,
    },
    env.HOKM_JWT_SECRET,
  );

  return jsonResponse({
    token: pass,
    profile: {
      name: payload.name ?? payload.email,
      picture: payload.picture ?? null,
      email: payload.email,
    },
  });
}
