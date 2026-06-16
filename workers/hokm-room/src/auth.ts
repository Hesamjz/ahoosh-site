// Verify the room-pass JWT (HS256) that the Pages Function minted after a
// successful Google sign-in. The WebSocket handshake is the real trust
// boundary, so the Durable Object re-checks the pass here.

export interface RoomPass {
  sub: string; // Google subject id — the stable per-user id
  email: string;
  name: string | null;
  picture: string | null;
  exp: number; // unix seconds
}

function b64urlToBytes(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64url(bytes: ArrayBuffer): string {
  const b = new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function verifyRoomPass(
  token: string,
  secret: string,
): Promise<RoomPass | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [h, p, sig] = parts;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const expected = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${h}.${p}`),
    );
    // Constant-time-ish compare via fixed-length base64url strings.
    if (bytesToB64url(expected) !== sig) return null;

    const payload = JSON.parse(
      new TextDecoder().decode(b64urlToBytes(p)),
    ) as RoomPass;
    if (!payload.sub || !payload.exp) return null;
    if (payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
