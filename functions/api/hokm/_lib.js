// Shared helpers for the Hokm auth Pages Functions: base64url, HS256 JWT
// sign/verify (room pass), and Google ID-token verification against Google's
// JWKS. Zero dependencies — Web Crypto only. Files starting with "_" are not
// routed by Pages, but can be imported.

const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64urlEncode(bytes) {
  let bin = "";
  const b = new Uint8Array(bytes);
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlToBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlJson(obj) {
  return b64urlEncode(enc.encode(JSON.stringify(obj)));
}

// ─── Room pass (HS256) ───────────────────────────────────────────────────────

export async function signRoomPass(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const data = `${b64urlJson(header)}.${b64urlJson(payload)}`;
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return `${data}.${b64urlEncode(sig)}`;
}

export async function verifyRoomPass(token, secret) {
  try {
    const [h, p, sig] = token.split(".");
    if (!h || !p || !sig) return null;
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const expected = await crypto.subtle.sign(
      "HMAC",
      key,
      enc.encode(`${h}.${p}`),
    );
    if (b64urlEncode(expected) !== sig) return null;
    const payload = JSON.parse(dec.decode(b64urlToBytes(p)));
    if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// ─── Google ID token verification ────────────────────────────────────────────

let jwksCache = { keys: null, exp: 0 };

async function googleJwks() {
  if (jwksCache.keys && jwksCache.exp > Date.now()) return jwksCache.keys;
  const res = await fetch("https://www.googleapis.com/oauth2/v3/certs");
  const body = await res.json();
  // Respect cache-control max-age if present, else 1h.
  const cc = res.headers.get("cache-control") || "";
  const m = cc.match(/max-age=(\d+)/);
  const ttl = m ? parseInt(m[1], 10) * 1000 : 3600_000;
  jwksCache = { keys: body.keys, exp: Date.now() + ttl };
  return body.keys;
}

// Returns the decoded payload if the ID token is valid for `clientId`, else null.
export async function verifyGoogleIdToken(idToken, clientId) {
  try {
    const [h, p, sig] = idToken.split(".");
    if (!h || !p || !sig) return null;
    const header = JSON.parse(dec.decode(b64urlToBytes(h)));
    const payload = JSON.parse(dec.decode(b64urlToBytes(p)));

    const keys = await googleJwks();
    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) return null;

    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const ok = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      b64urlToBytes(sig),
      enc.encode(`${h}.${p}`),
    );
    if (!ok) return null;

    const iss = payload.iss;
    if (iss !== "accounts.google.com" && iss !== "https://accounts.google.com") {
      return null;
    }
    if (payload.aud !== clientId) return null;
    if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// Is this email allowed in? HOKM_ALLOWLIST is a comma-separated list; "*" or
// unset means "any Google account" (handy on day one — tighten later).
export function emailAllowed(email, allowlist) {
  if (!allowlist || allowlist.trim() === "" || allowlist.trim() === "*") {
    return true;
  }
  const set = allowlist
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return set.includes((email || "").toLowerCase());
}

export function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
