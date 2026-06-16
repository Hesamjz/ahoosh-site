// Pure scoring helpers: who wins a trick, and how a finished hand scores
// (including Kot / shutout rules).

import type { Card, MatchConfig, Seat, Suit, Team } from "./types";
import { rankValue, suitOf } from "./deck";

export function teamOf(seat: Seat): Team {
  return seat % 2 === 0 ? "A" : "B"; // {0,2}=A, {1,3}=B
}

// Winner of a completed (or partial) trick. Trump beats any off-suit; otherwise
// the highest card of the led suit wins. `leadSuit` is the suit of the first
// card played in the trick.
export function trickWinner(
  plays: { seat: Seat; card: Card }[],
  leadSuit: Suit,
  trump: Suit | null,
): Seat {
  const trumps = trump ? plays.filter((p) => suitOf(p.card) === trump) : [];
  const contenders = trumps.length
    ? trumps
    : plays.filter((p) => suitOf(p.card) === leadSuit);
  let best = contenders[0];
  for (const p of contenders) {
    if (rankValue(p.card) > rankValue(best.card)) best = p;
  }
  return best.seat;
}

export interface HandResult {
  winner: Team;
  kot: boolean; // losing team took zero tricks
  points: number; // hands credited to the winner
}

// Score a finished hand. `hakemTeam` matters only for kotMode "hakem".
export function scoreHand(
  trickCounts: Record<Team, number>,
  hakemTeam: Team,
  config: MatchConfig,
): HandResult {
  const winner: Team = trickCounts.A >= config.tricksToWin ? "A" : "B";
  const loser: Team = winner === "A" ? "B" : "A";
  const kot = trickCounts[loser] === 0;

  let points = 1;
  if (kot) {
    // The Hakem's team being shut out is the worse insult ("Kot-e Hakem").
    points = config.kotMode === "hakem" && loser === hakemTeam ? 3 : 2;
  }
  return { winner, kot, points };
}
