// Cloudflare Pages Function — POST /api/hokm/create
// Header:  Authorization: Bearer <room-pass>   (or body { token })
// Returns: { roomId, joinUrl } — the host shares joinUrl with friends.
// Rooms are stateless: the Durable Object is created lazily on first connect,
// so creating one is just minting an id.

import { jsonResponse, verifyRoomPass } from "./_lib.js";

const ORIGIN = "https://ahoosh.ai";
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no confusable chars

function roomId(len = 6) {
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[buf[i] % ALPHABET.length];
  return out;
}

export async function onRequestPost({ request, env }) {
  let token = "";
  const auth = request.headers.get("Authorization") || "";
  if (auth.startsWith("Bearer ")) token = auth.slice(7);
  if (!token) {
    try {
      const body = await request.json();
      token = body?.token || "";
    } catch {
      /* ignore */
    }
  }

  const pass = await verifyRoomPass(token, env.HOKM_JWT_SECRET);
  if (!pass) return jsonResponse({ error: "unauthorized" }, 401);

  const id = roomId();
  return jsonResponse({
    roomId: id,
    joinUrl: `${ORIGIN}/fa/hokm?room=${id}`,
  });
}
