// Boots the Hokm table: name entry → join/create room → live WebSocket →
// render + voice. Loaded from HokmTable.astro.

import {
  createRoom,
  iceServers,
  nameJoin,
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

function showNameEntry(errorMsg?: string): void {
  showOverlay(`
    <div class="hk-card-panel">
      <div class="hk-brand">${S.title}</div>
      <p class="hk-sub">${S.signInHint}</p>
      <input id="hk-name-input" type="text" class="hk-input"
        placeholder="${S.namePlaceholder}" maxlength="20" dir="auto"
        autocomplete="nickname" spellcheck="false" />
      ${errorMsg ? `<p class="hk-err">${errorMsg}</p>` : ""}
      <button id="hk-name-btn" class="hk-btn primary big" style="margin-top:14px;width:100%">${S.joinGame}</button>
      <p class="hk-rules">${S.rules}</p>
    </div>`);

  const input = $("hk-name-input") as HTMLInputElement;
  const btn = $("hk-name-btn") as HTMLButtonElement;
  setTimeout(() => input?.focus(), 60);

  async function submit() {
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    btn.disabled = true;
    btn.textContent = "…";
    try {
      await nameJoin(name);
      routeAfterAuth();
    } catch {
      btn.disabled = false;
      btn.textContent = S.joinGame;
      showNameEntry(S.joinError);
    }
  }

  btn.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
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
  if (!profile) return void showNameEntry();
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
  if (!pass) return void showNameEntry();

  const url = `${WS_BASE}/api/hokm/room/${roomId}?token=${encodeURIComponent(pass)}`;
  $("hk-status").textContent = S.connecting;

  // Pre-build the voice manager (mic only activates when the user opts in).
  // mySeat is unknown here; we pass a getter so voice.ts always uses the
  // current value (set when the first "state" message arrives).
  const servers = await iceServers();
  voice = createVoice(
    () => mySeat ?? 0,
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
      // Always handle signals even if mic not active yet — needed to RECEIVE
      // audio from players who already started their mics.
      voice?.handleSignal(msg.from, msg.kind, msg.data);
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
  // Pre-connect peers even before mic is active so we can receive audio
  // immediately when the other side starts speaking. Tracks are added/removed
  // reactively inside voice.ts when start() is later called.
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

function setupSpeaker(): void {
  const btn = $("hk-speaker") as HTMLButtonElement;
  let speakerOn = true;
  btn.addEventListener("click", () => {
    speakerOn = !speakerOn;
    btn.classList.toggle("on", speakerOn);
    btn.setAttribute("aria-pressed", String(speakerOn));
    if (speakerOn) {
      // forcePlay() resumes all peer audio elements on user gesture.
      // Critical on iOS where autoplay is blocked until explicit interaction.
      voice?.forcePlay();
    }
  });
  btn.classList.add("on");
}

export function boot(): void {
  setupMusic($("hk-music") as HTMLButtonElement);
  setupMic();
  setupSpeaker();
  if (savedPass() && savedProfile()) {
    routeAfterAuth();
  } else {
    showNameEntry();
  }
}
