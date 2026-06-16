// Render playing cards as styled DOM nodes (no image assets). Suits use Unicode
// pips; reds are hearts/diamonds.

import type { Card, Suit } from "./types";

const SUIT_SYMBOL: Record<Suit, string> = {
  S: "♠",
  H: "♥",
  D: "♦",
  C: "♣",
};

const RANK_LABEL: Record<string, string> = {
  T: "10",
  J: "J",
  Q: "Q",
  K: "K",
  A: "A",
};

export function suitOf(card: Card): Suit {
  return card[1] as Suit;
}

export function suitSymbol(s: Suit): string {
  return SUIT_SYMBOL[s];
}

export function isRed(s: Suit): boolean {
  return s === "H" || s === "D";
}

export function rankLabel(card: Card): string {
  const r = card[0];
  return RANK_LABEL[r] ?? r;
}

// A face-up card. `playable` adds the interactive styling/handler.
export function cardEl(
  card: Card,
  opts: { playable?: boolean; onClick?: (c: Card) => void; small?: boolean } = {},
): HTMLElement {
  const s = suitOf(card);
  const el = document.createElement("button");
  el.type = "button";
  el.className = `hk-card${isRed(s) ? " red" : ""}${opts.small ? " sm" : ""}${
    opts.playable ? " playable" : ""
  }`;
  el.dataset.card = card;
  el.disabled = !opts.playable;
  el.innerHTML = `
    <span class="hk-corner tl">${rankLabel(card)}<br>${suitSymbol(s)}</span>
    <span class="hk-pip">${suitSymbol(s)}</span>
    <span class="hk-corner br">${rankLabel(card)}<br>${suitSymbol(s)}</span>`;
  if (opts.playable && opts.onClick) {
    el.addEventListener("click", () => opts.onClick!(card));
  }
  return el;
}

// A face-down card back.
export function cardBack(small = false): HTMLElement {
  const el = document.createElement("div");
  el.className = `hk-card back${small ? " sm" : ""}`;
  el.innerHTML = `<span class="hk-back-motif">۞</span>`;
  return el;
}
