// 52-card deck model + shuffle. The server is the only authority over card
// order, so the shuffle uses a crypto-secure RNG in production. Tests inject a
// seeded RNG so deals are reproducible.

import type { Card, Rank, Suit } from "./types";

export const SUITS: Suit[] = ["S", "H", "D", "C"];
export const RANKS: Rank[] = [
  "2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A",
];

export function suitOf(card: Card): Suit {
  return card[1] as Suit;
}

export function rankOf(card: Card): Rank {
  return card[0] as Rank;
}

// Higher index = stronger card. "2" → 0 … "A" → 12.
export function rankValue(card: Card): number {
  return RANKS.indexOf(rankOf(card));
}

export function freshDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) {
    for (const r of RANKS) {
      deck.push(`${r}${s}` as Card);
    }
  }
  return deck;
}

// A random source returning a float in [0, 1).
export type Rng = () => number;

// Production RNG — backed by crypto.getRandomValues, available in Workers.
export const cryptoRng: Rng = () => {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 0x1_0000_0000;
};

// Deterministic RNG for tests (mulberry32). Same seed → same sequence.
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// In-place Fisher–Yates on a copy. Never mutates the input.
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
