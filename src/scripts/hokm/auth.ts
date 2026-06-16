// Name-only auth — no Google. Player types a display name, the server mints a
// 7-day JWT. A stable userId (hex) is kept in localStorage so the player can
// reclaim their seat after a page refresh even when sessionStorage is cleared.

export interface Profile {
  name: string;
}

const PASS_KEY = "hokm_pass";
const PROFILE_KEY = "hokm_profile";
const USER_ID_KEY = "hokm_uid";

// ─── local helpers ────────────────────────────────────────────────────────────

function getStoredUserId(): string | null {
  try {
    return localStorage.getItem(USER_ID_KEY);
  } catch {
    return null;
  }
}

// ─── public API ───────────────────────────────────────────────────────────────

export function savedPass(): string | null {
  try {
    return sessionStorage.getItem(PASS_KEY);
  } catch {
    return null;
  }
}

export function savedProfile(): Profile | null {
  try {
    const raw = sessionStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

export function signOut(): void {
  try {
    sessionStorage.removeItem(PASS_KEY);
    sessionStorage.removeItem(PROFILE_KEY);
  } catch {
    /* ignore */
  }
}

/** Submit the player's chosen name and get back a signed room-pass JWT. */
export async function nameJoin(name: string): Promise<Profile> {
  const storedUid = getStoredUserId();
  const body: { name: string; userId?: string } = { name };
  if (storedUid) body.userId = storedUid;

  const r = await fetch("/api/hokm/name-join", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({})) as Record<string, string>;
    throw new Error(err.error ?? `http_${r.status}`);
  }
  const { token, userId } = (await r.json()) as {
    token: string;
    userId: string;
  };

  // Persist stable userId across sessions
  try {
    localStorage.setItem(USER_ID_KEY, userId);
  } catch {
    /* private-browse / quota */
  }

  const profile: Profile = { name };
  try {
    sessionStorage.setItem(PASS_KEY, token);
    sessionStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    /* ignore */
  }
  return profile;
}

// ─── room ops (unchanged API surface) ────────────────────────────────────────

export async function createRoom(): Promise<{
  roomId: string;
  joinUrl: string;
}> {
  const pass = savedPass();
  const r = await fetch("/api/hokm/create", {
    method: "POST",
    headers: { Authorization: `Bearer ${pass}` },
  });
  if (!r.ok) throw new Error("create_failed");
  return r.json();
}

export async function iceServers(): Promise<RTCIceServer[]> {
  const pass = savedPass();
  try {
    const r = await fetch("/api/hokm/turn-credentials", {
      headers: { Authorization: `Bearer ${pass}` },
    });
    if (r.ok) {
      const { iceServers } = await r.json();
      return iceServers;
    }
  } catch {
    /* fall through to STUN */
  }
  return [{ urls: "stun:stun.l.google.com:19302" }];
}
