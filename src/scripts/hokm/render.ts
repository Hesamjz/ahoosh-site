// Renders a PlayerView into the table DOM. Seats are placed relative to "you":
// you sit at the bottom, your partner across the top, opponents left and right.

import { cardBack, cardEl, isRed, suitOf, suitSymbol } from "./cards";
import type { Card, PlayerView, Seat, Suit } from "./types";
import type { Strings } from "./strings";

export interface RenderCtx {
  mySeat: Seat | null;
  strings: Strings;
  speaking: Set<Seat>;
  onTakeSeat: (seat: Seat) => void;
  onReady: () => void;
  onChooseTrump: (suit: Suit) => void;
  onPlayCard: (card: Card) => void;
  onNextHand: () => void;
}

type Pos = "bottom" | "right" | "top" | "left";

// Where does an absolute seat sit on this player's screen?
function posOf(seat: Seat, mySeat: Seat | null): Pos {
  const base = mySeat ?? 0;
  const rel = (((seat - base) % 4) + 4) % 4;
  return (["bottom", "right", "top", "left"] as Pos[])[rel];
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  html?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (html !== undefined) node.innerHTML = html;
  return node;
}

const SUITS: Suit[] = ["S", "H", "D", "C"];

// Which of my cards are legal to play right now (for UX; server re-validates).
function legalCards(view: PlayerView): Set<Card> {
  const hand = view.you.hand;
  if (view.phase !== "trick_play" || view.turn !== view.you.seat) {
    return new Set();
  }
  if (view.currentTrick.length > 0 && view.leadSuit) {
    const follow = hand.filter((c) => suitOf(c) === view.leadSuit);
    if (follow.length) return new Set(follow);
  }
  return new Set(hand);
}

export function render(view: PlayerView, ctx: RenderCtx): void {
  renderScorebar(view, ctx);
  renderSeats(view, ctx);
  renderCenter(view, ctx);
  renderTrickPiles(view, ctx);
  renderHand(view, ctx);
  renderActionBar(view, ctx);
}

function trumpBadge(trump: Suit | null): string {
  if (!trump) return "";
  return `<span class="hk-suit ${isRed(trump) ? "red" : ""}">${suitSymbol(trump)}</span>`;
}

function renderScorebar(view: PlayerView, ctx: RenderCtx): void {
  const S = ctx.strings;
  const bar = document.getElementById("hk-scorebar")!;
  const myTeam = ctx.mySeat === null ? "A" : ctx.mySeat % 2 === 0 ? "A" : "B";
  const us = view.handScores[myTeam];
  const them = view.handScores[myTeam === "A" ? "B" : "A"];
  bar.innerHTML = `
    <div class="hk-score">
      <span class="hk-score-label">${S.teamA}</span>
      <span class="hk-score-num">${us}</span>
    </div>
    <div class="hk-score-mid">
      ${view.trump ? `<span class="hk-trump">${S.trumpIs} ${trumpBadge(view.trump)}</span>` : `<span class="hk-logo">${S.title}</span>`}
    </div>
    <div class="hk-score">
      <span class="hk-score-num">${them}</span>
      <span class="hk-score-label">${S.teamB}</span>
    </div>`;
}

function renderSeats(view: PlayerView, ctx: RenderCtx): void {
  const S = ctx.strings;
  for (const sv of view.seats) {
    const pos = posOf(sv.seat, ctx.mySeat);
    const slot = document.querySelector<HTMLElement>(
      `.hk-seat[data-pos="${pos}"]`,
    );
    if (!slot) continue;

    const occupied = !!sv.name;
    const isMe = sv.seat === ctx.mySeat;
    const isTurn = view.turn === sv.seat;
    const isHakem = view.hakem === sv.seat;
    const speaking = ctx.speaking.has(sv.seat);

    slot.className = `hk-seat${isTurn ? " turn" : ""}${speaking ? " speaking" : ""}`;
    slot.dataset.pos = pos;
    slot.innerHTML = "";

    const avatar = el("div", "hk-avatar");
    if (sv.picture) {
      const img = el("img");
      img.src = sv.picture;
      img.alt = "";
      avatar.appendChild(img);
    } else {
      avatar.textContent = occupied ? (sv.name![0] || "?").toUpperCase() : "+";
    }
    if (!sv.connected && occupied) avatar.classList.add("offline");

    const label = el(
      "div",
      "hk-name",
      occupied
        ? `${sv.name}${isMe ? ` (${S.you})` : ""}`
        : `<span class="hk-empty">${S.empty}</span>`,
    );

    const badges = el("div", "hk-badges");
    if (isHakem) badges.appendChild(el("span", "hk-badge gold", S.hakem));
    if (occupied && sv.ready && view.phase === "lobby") {
      badges.appendChild(el("span", "hk-badge", "✓"));
    }

    slot.append(avatar, label, badges);

    // Opponents/partner: show a fan of card backs sized to their hand.
    if (!isMe && sv.cardCount > 0) {
      const backs = el("div", "hk-backs");
      const n = Math.min(sv.cardCount, 13);
      for (let i = 0; i < n; i++) backs.appendChild(cardBack(true));
      slot.appendChild(backs);
    }

    // Empty seat in lobby → clickable to sit (if I'm signed in and not seated).
    if (!occupied && view.phase === "lobby" && ctx.mySeat === null) {
      const btn = el("button", "hk-sit", ctx.strings.takeSeat);
      btn.addEventListener("click", () => ctx.onTakeSeat(sv.seat));
      slot.appendChild(btn);
    }
  }
}

function renderCenter(view: PlayerView, ctx: RenderCtx): void {
  const center = document.getElementById("hk-center")!;
  center.innerHTML = "";

  // Show the in-progress trick, each card near its player's edge.
  const plays = view.currentTrick.length
    ? view.currentTrick
    : view.lastTrick?.plays ?? [];
  for (const p of plays) {
    const pos = posOf(p.seat, ctx.mySeat);
    const wrap = el("div", `hk-played ${pos}`);
    wrap.appendChild(cardEl(p.card));
    center.appendChild(wrap);
  }
}

function renderTrickPiles(view: PlayerView, ctx: RenderCtx): void {
  const usEl   = document.getElementById("hk-tricks-us")!;
  const themEl = document.getElementById("hk-tricks-them")!;

  const inPlay = view.phase === "trick_play" || view.phase === "hand_scoring";
  if (!inPlay || (view.trickCounts.A === 0 && view.trickCounts.B === 0)) {
    usEl.hidden = true;
    themEl.hidden = true;
    return;
  }

  const myTeam   = ctx.mySeat !== null ? (ctx.mySeat % 2 === 0 ? "A" : "B") : "A";
  const themTeam = myTeam === "A" ? "B" : "A";

  function fillPile(pileEl: HTMLElement, count: number, label: string): void {
    pileEl.innerHTML = "";
    pileEl.hidden = count === 0;
    if (count === 0) return;
    // Stack of up to 5 card backs, offset so you can see the depth
    const stack = el("div", "hk-trick-stack");
    const show = Math.min(count, 5);
    for (let i = 0; i < show; i++) {
      const b = cardBack(true);
      b.style.top  = `${(show - 1 - i) * 2}px`;
      b.style.left = `${(show - 1 - i) * 1}px`;
      stack.appendChild(b);
    }
    pileEl.appendChild(stack);
    pileEl.appendChild(el("span", "hk-trick-count", `${count}`));
    pileEl.appendChild(el("span", "hk-trick-label", label));
  }

  const S = ctx.strings;
  fillPile(usEl,   view.trickCounts[myTeam],   S.teamA);
  fillPile(themEl, view.trickCounts[themTeam], S.teamB);
}

function renderHand(view: PlayerView, ctx: RenderCtx): void {
  const hand = document.getElementById("hk-hand")!;
  hand.innerHTML = "";
  if (ctx.mySeat === null) return;

  const legal = legalCards(view);
  // Sort by suit then rank for a tidy fan.
  const order = "SHDC";
  const ranks = "23456789TJQKA";
  const sorted = view.you.hand.slice().sort((a, b) => {
    const sa = order.indexOf(a[1]);
    const sb = order.indexOf(b[1]);
    if (sa !== sb) return sa - sb;
    return ranks.indexOf(a[0]) - ranks.indexOf(b[0]);
  });

  for (const c of sorted) {
    const playable = legal.has(c);
    hand.appendChild(
      cardEl(c, { playable, onClick: ctx.onPlayCard }),
    );
  }
}

function renderActionBar(view: PlayerView, ctx: RenderCtx): void {
  const S = ctx.strings;
  const bar = document.getElementById("hk-actionbar")!;
  bar.innerHTML = "";

  if (ctx.mySeat === null) {
    bar.innerHTML = `<span class="hk-msg">${S.spectating}</span>`;
    return;
  }
  const me = view.seats[ctx.mySeat];

  if (view.phase === "lobby") {
    if (!me.ready) {
      const btn = el("button", "hk-btn primary", S.ready);
      btn.addEventListener("click", ctx.onReady);
      bar.appendChild(btn);
    } else {
      bar.innerHTML = `<span class="hk-msg">${S.waitingReady}</span>`;
    }
    return;
  }

  if (view.phase === "trump_select") {
    if (view.hakem === ctx.mySeat) {
      const wrap = el("div", "hk-trump-pick");
      wrap.appendChild(el("span", "hk-msg", `${S.youAreHakem} — ${S.chooseTrump}`));
      const row = el("div", "hk-suit-row");
      for (const s of SUITS) {
        const b = el(
          "button",
          `hk-suit-btn ${isRed(s) ? "red" : ""}`,
          suitSymbol(s),
        );
        b.addEventListener("click", () => ctx.onChooseTrump(s));
        row.appendChild(b);
      }
      wrap.appendChild(row);
      bar.appendChild(wrap);
    } else {
      const hakemName = view.seats[view.hakem ?? 0].name ?? "";
      bar.innerHTML = `<span class="hk-msg">${S.hakemChoosing(hakemName)}</span>`;
    }
    return;
  }

  if (view.phase === "trick_play") {
    if (view.turn === ctx.mySeat) {
      bar.innerHTML = `<span class="hk-msg turn">${S.yourTurn}</span>`;
    } else {
      const who = view.seats[view.turn ?? 0].name ?? "";
      bar.innerHTML = `<span class="hk-msg">${S.waitingFor(who)}</span>`;
    }
    return;
  }

  if (view.phase === "hand_scoring" && view.lastHand) {
    const teamName =
      (view.lastHand.winner === "A") === (ctx.mySeat % 2 === 0)
        ? S.teamA
        : S.teamB;
    const wrap = el("div", "hk-result");
    wrap.appendChild(
      el(
        "span",
        "hk-msg big",
        `${S.wonHand(teamName)}${view.lastHand.kot ? ` · ${S.kot}` : ""}`,
      ),
    );
    const btn = el("button", "hk-btn primary", S.nextHand);
    btn.addEventListener("click", ctx.onNextHand);
    wrap.appendChild(btn);
    bar.appendChild(wrap);
    return;
  }

  if (view.phase === "match_end" && view.matchWinner) {
    const teamName =
      (view.matchWinner === "A") === (ctx.mySeat % 2 === 0) ? S.teamA : S.teamB;
    bar.innerHTML = `<span class="hk-msg big gold">${S.matchOver(teamName)}</span>`;
    return;
  }
}
