import { describe, it, expect } from "vitest";
import { freshDeck, seededRng, suitOf } from "../src/game/deck";
import { scoreHand, teamOf, trickWinner } from "../src/game/scoring";
import {
  chooseTrump,
  createGame,
  nextHand,
  playCard,
  setReady,
  takeSeat,
} from "../src/game/hokm";
import type { Card, GameState, Seat, Suit } from "../src/game/types";
import { DEFAULT_CONFIG } from "../src/game/types";

function seatFour(state: GameState): void {
  for (const s of [0, 1, 2, 3] as Seat[]) {
    takeSeat(state, s, {
      userId: `u${s}`,
      name: `P${s}`,
      picture: null,
    });
  }
}

// Drive a hand to completion by always playing the first legal card for the
// player to move. Returns the events from the final action.
function playOutHand(state: GameState): void {
  let guard = 0;
  while (state.phase === "trick_play" && guard++ < 60) {
    const seat = state.turn!;
    const hand = state.hands[seat];
    let legal = hand;
    if (state.currentTrick.length > 0 && state.leadSuit) {
      const follow = hand.filter((c) => suitOf(c) === state.leadSuit);
      if (follow.length) legal = follow;
    }
    playCard(state, seat, legal[0]);
  }
}

describe("deck", () => {
  it("has 52 unique cards", () => {
    const d = freshDeck();
    expect(d).toHaveLength(52);
    expect(new Set(d).size).toBe(52);
  });
});

describe("trickWinner", () => {
  it("highest of led suit wins when no trump played", () => {
    const plays = [
      { seat: 0 as Seat, card: "7H" as Card },
      { seat: 1 as Seat, card: "KH" as Card },
      { seat: 2 as Seat, card: "2H" as Card },
      { seat: 3 as Seat, card: "9C" as Card }, // off-suit, not trump
    ];
    expect(trickWinner(plays, "H", "S")).toBe(1);
  });

  it("any trump beats the highest led-suit card", () => {
    const plays = [
      { seat: 0 as Seat, card: "AH" as Card },
      { seat: 1 as Seat, card: "2S" as Card }, // low trump
      { seat: 2 as Seat, card: "KH" as Card },
      { seat: 3 as Seat, card: "QH" as Card },
    ];
    expect(trickWinner(plays, "H", "S")).toBe(1);
  });

  it("highest trump wins when several are played", () => {
    const plays = [
      { seat: 0 as Seat, card: "2S" as Card },
      { seat: 1 as Seat, card: "AS" as Card },
      { seat: 2 as Seat, card: "KS" as Card },
      { seat: 3 as Seat, card: "5H" as Card },
    ];
    expect(trickWinner(plays, "S", "S")).toBe(1);
  });
});

describe("scoreHand", () => {
  it("ordinary win is worth one hand", () => {
    const r = scoreHand({ A: 7, B: 6 }, "A", DEFAULT_CONFIG);
    expect(r).toEqual({ winner: "A", kot: false, points: 1 });
  });

  it("a Kot (opponents take zero) is worth two", () => {
    const r = scoreHand({ A: 13, B: 0 }, "A", DEFAULT_CONFIG);
    expect(r).toEqual({ winner: "A", kot: true, points: 2 });
  });

  it("Kot-e Hakem is worth three in hakem mode", () => {
    // Hakem is team B but team A took all 13 → B (the Hakem's team) is Kot'd.
    const r = scoreHand({ A: 13, B: 0 }, "B", { ...DEFAULT_CONFIG, kotMode: "hakem" });
    expect(r).toEqual({ winner: "A", kot: true, points: 3 });
  });
});

describe("game flow", () => {
  it("seats four players, picks a Hakem, and deals five to them", () => {
    const state = createGame();
    seatFour(state);
    const rng = seededRng(42);
    for (const s of [0, 1, 2, 3] as Seat[]) setReady(state, s, rng);

    expect(state.phase).toBe("trump_select");
    expect(state.hakem).not.toBeNull();
    expect(state.hands[state.hakem!]).toHaveLength(5);
    // Non-hakem seats have no cards until trump is chosen.
    for (const s of [0, 1, 2, 3] as Seat[]) {
      if (s !== state.hakem) expect(state.hands[s]).toHaveLength(0);
    }
  });

  it("dealing after trump gives everyone 13 cards", () => {
    const state = createGame();
    seatFour(state);
    const rng = seededRng(7);
    for (const s of [0, 1, 2, 3] as Seat[]) setReady(state, s, rng);

    chooseTrump(state, state.hakem!, "H");
    expect(state.phase).toBe("trick_play");
    expect(state.trump).toBe("H");
    for (const s of [0, 1, 2, 3] as Seat[]) {
      expect(state.hands[s]).toHaveLength(13);
    }
    expect(state.turn).toBe(state.hakem); // Hakem leads
  });

  it("rejects choosing trump from a non-Hakem", () => {
    const state = createGame();
    seatFour(state);
    const rng = seededRng(1);
    for (const s of [0, 1, 2, 3] as Seat[]) setReady(state, s, rng);
    const notHakem = (((state.hakem! + 1) % 4) as Seat);
    expect(() => chooseTrump(state, notHakem, "S")).toThrow(/Hakem/);
  });

  it("enforces follow-suit", () => {
    const state = createGame();
    seatFour(state);
    const rng = seededRng(3);
    for (const s of [0, 1, 2, 3] as Seat[]) setReady(state, s, rng);
    chooseTrump(state, state.hakem!, "S");

    const leader = state.turn!;
    const lead = state.hands[leader][0];
    playCard(state, leader, lead);
    const led = suitOf(lead);

    const next = state.turn!;
    const offSuit = state.hands[next].find((c) => suitOf(c) !== led);
    const hasLed = state.hands[next].some((c) => suitOf(c) === led);
    if (hasLed && offSuit) {
      expect(() => playCard(state, next, offSuit)).toThrow(/follow/i);
    }
  });

  it("rejects playing out of turn", () => {
    const state = createGame();
    seatFour(state);
    const rng = seededRng(9);
    for (const s of [0, 1, 2, 3] as Seat[]) setReady(state, s, rng);
    chooseTrump(state, state.hakem!, "C");
    const wrong = (((state.turn! + 1) % 4) as Seat);
    expect(() => playCard(state, wrong, state.hands[wrong][0])).toThrow(/turn/i);
  });

  it("plays a full hand to a result and advances to scoring", () => {
    const state = createGame();
    seatFour(state);
    const rng = seededRng(123);
    for (const s of [0, 1, 2, 3] as Seat[]) setReady(state, s, rng);
    chooseTrump(state, state.hakem!, "S");
    playOutHand(state);

    expect(state.phase).toBe("hand_scoring");
    expect(state.lastHand).not.toBeNull();
    const total = state.trickCounts.A + state.trickCounts.B;
    expect(total).toBeGreaterThanOrEqual(state.config.tricksToWin);
    const winnerScore = state.handScores[state.lastHand!.winner];
    expect(winnerScore).toBe(state.lastHand!.points);
  });

  it("advances to a new hand with five dealt to the Hakem", () => {
    const state = createGame();
    seatFour(state);
    const rng = seededRng(555);
    for (const s of [0, 1, 2, 3] as Seat[]) setReady(state, s, rng);
    chooseTrump(state, state.hakem!, "D");
    playOutHand(state);
    if (!state.matchWinner) {
      nextHand(state, rng);
      expect(state.phase).toBe("trump_select");
      expect(state.hands[state.hakem!]).toHaveLength(5);
    }
  });
});

describe("teamOf", () => {
  it("pairs partners across the table", () => {
    expect(teamOf(0)).toBe("A");
    expect(teamOf(2)).toBe("A");
    expect(teamOf(1)).toBe("B");
    expect(teamOf(3)).toBe("B");
  });
});
