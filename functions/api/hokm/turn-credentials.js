// Cloudflare Pages Function — GET /api/hokm/turn-credentials
// Returns ICE servers for WebRTC voice. Always includes a public STUN server;
// if Cloudflare Realtime TURN is configured, adds short-lived TURN credentials
// (needed when players are behind strict/symmetric NATs).
//
// Env vars (optional — without them you still get STUN-only):
//   TURN_KEY_ID         — Cloudflare Realtime TURN key id
//   TURN_KEY_API_TOKEN  — API token for that key (secret)

import { jsonResponse, verifyRoomPass } from "./_lib.js";

const STUN = { urls: "stun:stun.l.google.com:19302" };
// Free public TURN relay — works across carrier-grade NAT (mobile data).
// openrelay.metered.ca is a stable free-tier TURN service, no API key needed.
const PUBLIC_TURN = {
  urls: [
    "turn:openrelay.metered.ca:80",
    "turn:openrelay.metered.ca:443",
    "turn:openrelay.metered.ca:443?transport=tcp",
  ],
  username: "openrelayproject",
  credential: "openrelayproject",
};
const TTL_SECONDS = 12 * 60 * 60;

export async function onRequest({ request, env }) {
  // Require a valid room pass so we don't hand out TURN minutes to the world.
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const pass = await verifyRoomPass(token, env.HOKM_JWT_SECRET);
  if (!pass) return jsonResponse({ error: "unauthorized" }, 401);

  // Always include STUN + public TURN so mobile users behind CGNAT can connect.
  const iceServers = [STUN, PUBLIC_TURN];

  if (env.TURN_KEY_ID && env.TURN_KEY_API_TOKEN) {
    try {
      const res = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ ttl: TTL_SECONDS }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        if (data.iceServers) iceServers.push(data.iceServers);
      }
    } catch {
      /* fall back to STUN-only */
    }
  }

  return jsonResponse({ iceServers });
}
