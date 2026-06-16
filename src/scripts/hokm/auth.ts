// Google sign-in (Google Identity Services) + room-pass exchange + room create.

declare global {
  interface Window {
    google?: any;
  }
}

const CLIENT_ID =
  (import.meta.env.PUBLIC_GOOGLE_CLIENT_ID as string | undefined) || "";

export interface Profile {
  name: string;
  picture: string | null;
  email: string;
}

const PASS_KEY = "hokm_pass";
const PROFILE_KEY = "hokm_profile";

export function savedPass(): string | null {
  return sessionStorage.getItem(PASS_KEY);
}

export function savedProfile(): Profile | null {
  const raw = sessionStorage.getItem(PROFILE_KEY);
  return raw ? (JSON.parse(raw) as Profile) : null;
}

function store(pass: string, profile: Profile): void {
  sessionStorage.setItem(PASS_KEY, pass);
  sessionStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function signOut(): void {
  sessionStorage.removeItem(PASS_KEY);
  sessionStorage.removeItem(PROFILE_KEY);
}

function loadGsi(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Google sign-in"));
    document.head.appendChild(s);
  });
}

// Render the "Sign in with Google" button into `el`. On success, the pass +
// profile are stored and `onSuccess` fires. `onError(code)` covers a rejected
// account (e.g. not on the allowlist).
export async function renderSignIn(
  el: HTMLElement,
  onSuccess: (profile: Profile) => void,
  onError: (code: string) => void,
): Promise<void> {
  if (!CLIENT_ID) {
    onError("no_client_id");
    return;
  }
  await loadGsi();
  window.google.accounts.id.initialize({
    client_id: CLIENT_ID,
    callback: async (resp: { credential: string }) => {
      try {
        const r = await fetch("/api/hokm/google-verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ credential: resp.credential }),
        });
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          onError(body.error || `http_${r.status}`);
          return;
        }
        const { token, profile } = await r.json();
        store(token, profile);
        onSuccess(profile);
      } catch {
        onError("network");
      }
    },
  });
  window.google.accounts.id.renderButton(el, {
    theme: "filled_black",
    size: "large",
    shape: "pill",
    text: "signin_with",
    width: 260,
  });
}

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
    /* fall through */
  }
  return [{ urls: "stun:stun.l.google.com:19302" }];
}
