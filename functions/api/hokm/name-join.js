// POST /api/hokm/name-join
// Body: { name: string, userId?: string }
// Returns: { token: string, userId: string }
//
// Open (no allowlist) — the caller supplies a stable userId from localStorage
// so they can reclaim their seat after a page refresh. If absent or malformed
// the server mints a fresh one.

import { signRoomPass, jsonResponse } from "./_lib.js";

function generateUserId() {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function onRequestPost({ request, env }) {
  let name = "";
  let clientUserId = "";
  try {
    const body = await request.json();
    name = String(body.name ?? "").trim().slice(0, 20);
    clientUserId = String(body.userId ?? "").slice(0, 64);
  } catch {
    /* ignore malformed body */
  }

  if (!name) return jsonResponse({ error: "name_required" }, 400);

  // Accept the client's stored userId only if it looks like our hex format.
  const userId = /^[0-9a-f]{32,64}$/.test(clientUserId)
    ? clientUserId
    : generateUserId();

  const token = await signRoomPass(
    {
      userId,
      name,
      exp: Math.floor(Date.now() / 1000) + 86400 * 7, // 7-day session
    },
    env.HOKM_JWT_SECRET,
  );

  return jsonResponse({ token, userId });
}
