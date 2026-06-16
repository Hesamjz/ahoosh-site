// Boots the Hokm table: Google sign-in → join/create room → live WebSocket →
// render + voice. Loaded from HokmTable.astro.

import {
  createRoom,
  iceServers,
  renderSignIn,
  savedPass,
  savedProfile,
  type Profile,
} from "./auth";
import { connect, type Net } from "./net";
import { render, type RenderCtx } from "./render";
import { getStrings } from "./strings";
import { setupMusic } from "./audio";
import { createVoice, type VoiceManager } from "./voice";
import type { Card, PlayerView, Seat, ServerMsg, Suit } from "./types";

const WS_BASE =
  (import.meta.env.PUBLIC_HOKM_WS_BASE as string | undefined) ||
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;

const S = getStrings();

let net: Net | null = null;
let voice: VoiceManager | null = null;
let view: PlayerView | null = null;
let mySeat: Seat | null = null;
const speaking = new Set<Seat>();

function roomIdFromUrl(): string | null {
  return new URLSearchParams(location.search).get("room");
}

function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

function toast(text: string, kind: "info" | "error" = "info"): void {
  const t = $("hk-toast");
  const n = document.createElement("div");
  n.className = `hk-toast-item ${kind}`;
  n.textContent = text;
  t.appendChild(n);
  setTimeout(() => n.classList.add("show"), 10);
  setTimeout(() => {
    n.classList.remove("show");
    setTimeout(() => n.remove(), 300);
  }, 3200);
}

// ─── overlay (sign-in / create room) ─────────────────────────────────────────

function showOverlay(html: string): void {
  const o = $("hk-overlay");
  o.innerHTML = html;
  o.classList.add("show");
}
function hideOverlay(): void {
  $("hk-overlay").classList.remove("show");
}

async function showSignIn(errorCode?: string): Promise<void> {
  showOverlay(`
    <div class="hk-card-panel">
      <div class="hk-brand">${S.title}</div>
      <p class="hk-sub">${S.signInHint}</p>
      <div id="hk-gbtn" class="hk-gbtn"></div>
      ${errorCode === "not_allowed" ? `<p class="hk-err">${S.notAllowed}</p>` : ""}
      <p class="hk-rules">${S.rules}</p>
    </div>`);
  await renderSignIn(
    $("hk-gbtn"),
    () => routeAfterAuth(),
    (code) => {
      if (code === "no_client_id") {
        toast("Set PUBLIC_GOOGLE_CLIENT_ID to enable sign-in", "error");
      } else {
        showSignIn(code);
      }
    },
  );
}

function showCreateRoom(profile: Profile): void {
  showOverlay(`
    <div class="hk-card-panel">
      <div class="hk-brand">${S.title}</div>
      <p class="hk-sub">${profile.name}</p>
      <button id="hk-create" class="hk-btn primary big">${S.createRoom}</button>
    </div>`);
  $("hk-create").addEventListener("click", async () => {
    ($("hk-create") as HTMLButtonElement).disabled = true;
    $("hk-create").textContent = S.creating;
    try {
      const { joinUrl } = await createRoom();
      location.href = joinUrl;
    } catch {
      toast("Could not create room", "error");
      ($("hk-create") as HTMLButtonElement).disabled = false;
      $("hk-create").textContent = S.createRoom;
    }
  });
}

function routeAfterAuth(): void {
  const profile = savedProfile();
  if (!profile) return void showSignIn();
  const room = roomIdFromUrl();
  if (room) {
    hideOverlay();
    joinRoom(room);
  } else {
    showCreateRoom(profile);
  }
}

// ─── room connection ─────────────────────────────────────────────────────────

async function joinRoom(roomId: string): Promise<void> {
  const pass = savedPass();
  if (!pass) return void showSignIn();

  const url = `${WS_BASE}/api/hokm/room/${roomId}?token=${encodeURIComponent(pass)}`;
  $("hk-status").textContent = S.connecting;

  // Pre-build the voice manager (mic only activates when the user opts in).
  const servers = await iceServers();
  voice = createVoice(
    // mySeat may not be known yet; voice.connectTo is gated until we are seated.
    (mySeat ?? 0) as Seat,
    servers,
    (to, kind, data) => net?.send({ t: "rtc", to, kind, data }),
    (seat, isSpeaking) => {
      if (isSpeaking) speaking.add(seat);
      else speaking.delete(seat);
      if (view) renderTable();
    },
  );

  net = connect(url, {
    onOpen: () => {
      $("hk-status").textContent = "";
    },
    onClose: () => {
      $("hk-status").textContent = S.reconnecting;
    },
    onMessage: handleMessage,
  });

  setupShareBar(roomId);
}

function handleMessage(msg: ServerMsg): void {
  switch (msg.t) {
    case "state":
      view = msg.view;
      mySeat = msg.view.you.seat;
      renderTable();
      reconcileVoice();
      break;
    case "event":
      handleEvent(msg.event);
      break;
    case "error":
      toast(msg.msg, "error");
      break;
    case "rtc":
      if (voice?.active()) {
        voice.handleSignal(msg.from, msg.kind, msg.data);
      }
      break;
    case "chat":
      // (chat UI is out of scope for v1; voice is the main channel)
      break;
  }
}

function handleEvent(e: import("./types").GameEvent): void {
  switch (e.e) {
    case "hakem_chosen": {
      const name = view?.seats[e.seat].name ?? "";
      toast(`${S.hakem}: ${name}`);
      break;
    }
    case "hand_over":
      if (e.kot) toast(S.kot);
      break;
    case "match_over":
      toast(S.matchOver(""));
      break;
    case "peer_left":
      break;
  }
}

// ─── voice wiring ────────────────────────────────────────────────────────────

function reconcileVoice(): void {
  if (!voice || !view || mySeat === null) return;
  if (!voice.active()) return;
  for (const sv of view.seats) {
    if (sv.seat === mySeat) continue;
    if (sv.connected && sv.name) voice.connectTo(sv.seat);
    else voice.drop(sv.seat);
  }
}

function setupMic(): void {
  const btn = $("hk-mic") as HTMLButtonElement;
  function paint() {
    const active = voice?.active() && !voice.muted();
    btn.classList.toggle("on", !!active);
    btn.querySelector(".hk-mic-state")!.textContent = !voice?.active()
      ? S.mic
      : voice.muted()
        ? S.micOff
        : S.micOn;
  }
  btn.addEventListener("click", async () => {
    if (!voice) return;
    if (!voice.active()) {
      btn.disabled = true;
      try {
        await voice.start();
        voice.setMuted(false);
        reconcileVoice();
      } catch {
        toast("Microphone permission was blocked", "error");
        btn.disabled = false;
        return;
      }
      btn.disabled = false;
    } else {
      voice.setMuted(!voice.muted());
    }
    paint();
  });
  paint();
}

// ─── share bar ───────────────────────────────────────────────────────────────

function setupShareBar(roomId: string): void {
  const url = `${location.origin}${location.pathname}?room=${roomId}`;
  const btn = $("hk-share") as HTMLButtonElement;
  btn.hidden = false;
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(url);
      btn.textContent = S.copied;
      setTimeout(() => (btn.textContent = S.copyLink), 1500);
    } catch {
      toast(url);
    }
  });
}

// ─── render ──────────────────────────────────────────────────────────────────

function renderTable(): void {
  if (!view) return;
  const ctx: RenderCtx = {
    mySeat,
    strings: S,
    speaking,
    onTakeSeat: (seat) => net?.send({ t: "take_seat", seat }),
    onReady: () => net?.send({ t: "ready" }),
    onChooseTrump: (suit: Suit) => net?.send({ t: "choose_trump", suit }),
    onPlayCard: (card: Card) => net?.send({ t: "play_card", card }),
    onNextHand: () => net?.send({ t: "next_hand" }),
  };
  render(view, ctx);
}

// ─── boot ────────────────────────────────────────────────────────────────────

export function boot(): void {
  setupMusic($("hk-music") as HTMLButtonElement);
  setupMic();
  if (savedPass() && savedProfile()) {
    routeAfterAuth();
  } else {
    showSignIn();
  }
}
