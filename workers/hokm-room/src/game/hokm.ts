// The Hokm state machine. Every function here is pure of I/O — it validates an
// action, mutates the single authoritative GameState, and returns the events it
// produced. The Durable Object owns the one GameState object and persists it
// after each call. Illegal actions throw GameError.

import {
  type Card,
  type GameEvent,
  GameError,
  type GameState,
  type MatchConfig,
  type PlayerView,
  type Seat,
  type Suit,
  DEFAULT_CONFIG,
} from "./types";
import { freshDeck, rankOf, shuffle, suitOf, type Rng } from "./deck";
import { scoreHand, teamOf, trickWinner } from "./scoring";

const SEATS: Seat[] = [0, 1, 2, 3];

export function createGame(config: MatchConfig = DEFAULT_CONFIG): GameState {
  return {
    phase: "lobby",
    seats: SEATS.map(() => ({
      userId: null,
      name: null,
      picture: null,
      connected: false,
      ready: false,
    })),
    hands: { 0: [], 1: [], 2: [], 3: [] },
    hakem: null,
    trump: null,
    turn: null,
    leadSuit: null,
    currentTrick: [],
    trickCounts: { A: 0, B: 0 },
    handScores: { A: 0, B: 0 },
    hakemReveal: [],
    lastTrick: null,
    lastHand: null,
    matchWinner: null,
    deck: [],
    config,
  };
}

export interface SeatIdentity {
  userId: string;
  name: string | null;
  picture: string | null;
}

// Claim (or reclaim, on reconnect) a seat. Returns the seat actually taken.
export function takeSeat(
  state: GameState,
  seat: Seat,
  who: SeatIdentity,
): GameEvent[] {
  if (state.phase !== "lobby") {
    throw new GameError("not_lobby", "The match has already started.");
  }
  const slot = state.seats[seat];
  if (slot.userId && slot.userId !== who.userId) {
    throw new GameError("seat_taken", "That seat is taken.");
  }
  // If this user already sits elsewhere, vacate that seat first.
  for (const s of SEATS) {
    if (s !== seat && state.seats[s].userId === who.userId) {
      state.seats[s] = {
        userId: null,
        name: null,
        picture: null,
        connected: false,
        ready: false,
      };
    }
  }
  state.seats[seat] = {
    userId: who.userId,
    name: who.name,
    picture: who.picture,
    connected: true,
    ready: false,
  };
  return [{ e: "seated", seat, name: who.name }];
}

function allSeatedAndReady(state: GameState): boolean {
  return state.seats.every((s) => s.userId && s.ready);
}

export function setReady(state: GameState, seat: Seat, rng: Rng): GameEvent[] {
  if (state.phase !== "lobby") {
    throw new GameError("not_lobby", "The match has already started.");
  }
  if (!state.seats[seat].userId) {
    throw new GameError("not_seated", "Take a seat first.");
  }
  state.seats[seat].ready = true;
  if (allSeatedAndReady(state)) return startMatch(state, rng);
  return [];
}

// First hand of a match: find the Hakem by dealing cards face-up until the
// first Ace, then deal the Hakem five cards and move to trump selection.
export function startMatch(state: GameState, rng: Rng): GameEvent[] {
  const reveal: { seat: Seat; card: Card }[] = [];
  const deck = shuffle(freshDeck(), rng);
  const start = Math.floor(rng() * 4) as Seat;
  let hakem: Seat | null = null;
  let i = 0;
  while (i < deck.length) {
    const seat = ((start + i) % 4) as Seat;
    const card = deck[i];
    reveal.push({ seat, card });
    if (rankOf(card) === "A") {
      hakem = seat;
      break;
    }
    i++;
  }
  state.hakem = hakem ?? start;
  state.hakemReveal = reveal;
  const events: GameEvent[] = [
    { e: "hakem_chosen", seat: state.hakem, reveal },
  ];
  dealFiveToHakem(state, rng);
  return events;
}

// Shuffle a fresh deck, give the Hakem the first five, stash the rest, and wait
// for the Hakem to call trump. Used at the start of every hand.
function dealFiveToHakem(state: GameState, rng: Rng): void {
  const hakem = state.hakem!;
  const deck = shuffle(freshDeck(), rng);
  state.hands = { 0: [], 1: [], 2: [], 3: [] };
  state.hands[hakem] = deck.slice(0, 5);
  state.deck = deck.slice(5);
  state.trump = null;
  state.leadSuit = null;
  state.currentTrick = [];
  state.lastTrick = null;
  state.trickCounts = { A: 0, B: 0 };
  state.phase = "trump_select";
  state.turn = hakem;
}

export function chooseTrump(
  state: GameState,
  seat: Seat,
  suit: Suit,
): GameEvent[] {
  if (state.phase !== "trump_select") {
    throw new GameError("bad_phase", "Not time to choose trump.");
  }
  if (seat !== state.hakem) {
    throw new GameError("not_hakem", "Only the Hakem chooses trump.");
  }
  state.trump = suit;
  // Deal the rest: Hakem gets 8 more (to 13), everyone else gets 13.
  const hakem = state.hakem!;
  let k = 0;
  state.hands[hakem].push(...state.deck.slice(k, k + 8));
  k += 8;
  for (const s of SEATS) {
    if (s === hakem) continue;
    state.hands[s] = state.deck.slice(k, k + 13);
    k += 13;
  }
  state.deck = [];
  state.phase = "trick_play";
  state.turn = hakem; // Hakem leads the first trick
  state.leadSuit = null;
  state.currentTrick = [];
  return [
    { e: "trump_chosen", suit, hakem },
    { e: "dealt" },
  ];
}

export function playCard(
  state: GameState,
  seat: Seat,
  card: Card,
): GameEvent[] {
  if (state.phase !== "trick_play") {
    throw new GameError("bad_phase", "No trick in progress.");
  }
  if (seat !== state.turn) {
    throw new GameError("not_your_turn", "It is not your turn.");
  }
  const hand = state.hands[seat];
  if (!hand.includes(card)) {
    throw new GameError("not_your_card", "You do not hold that card.");
  }
  // Follow-suit: if a suit was led and you hold it, you must play it.
  if (state.currentTrick.length > 0 && state.leadSuit) {
    const holdsLead = hand.some((c) => suitOf(c) === state.leadSuit);
    if (holdsLead && suitOf(card) !== state.leadSuit) {
      throw new GameError("must_follow", "You must follow suit.");
    }
  }

  // Commit the play.
  state.hands[seat] = hand.filter((c) => c !== card);
  if (state.currentTrick.length === 0) state.leadSuit = suitOf(card);
  state.currentTrick.push({ seat, card });
  const events: GameEvent[] = [{ e: "card_played", seat, card }];

  if (state.currentTrick.length < 4) {
    state.turn = ((seat + 1) % 4) as Seat;
    return events;
  }

  // Trick complete — resolve it.
  const winner = trickWinner(state.currentTrick, state.leadSuit!, state.trump);
  const team = teamOf(winner);
  state.trickCounts[team]++;
  state.lastTrick = { plays: state.currentTrick.slice(), winner };
  state.currentTrick = [];
  state.leadSuit = null;
  state.turn = winner;
  events.push({ e: "trick_won", seat: winner, team });

  if (state.trickCounts[team] >= state.config.tricksToWin) {
    events.push(...endHand(state));
  }
  return events;
}

function endHand(state: GameState): GameEvent[] {
  const hakemTeam = teamOf(state.hakem!);
  const result = scoreHand(state.trickCounts, hakemTeam, state.config);
  state.handScores[result.winner] += result.points;
  state.lastHand = result;
  state.phase = "hand_scoring";
  state.turn = null;
  const events: GameEvent[] = [
    {
      e: "hand_over",
      winner: result.winner,
      kot: result.kot,
      points: result.points,
    },
  ];

  if (state.handScores[result.winner] >= state.config.handsToWin) {
    state.matchWinner = result.winner;
    state.phase = "match_end";
    events.push({ e: "match_over", winner: result.winner });
  } else {
    // Hakem stays if their team won the hand, otherwise it passes on.
    if (result.winner !== hakemTeam) {
      state.hakem = ((state.hakem! + 1) % 4) as Seat;
    }
  }
  return events;
}

// Deal the next hand once players have acknowledged the scoreboard.
export function nextHand(state: GameState, rng: Rng): GameEvent[] {
  if (state.phase !== "hand_scoring") {
    throw new GameError("bad_phase", "No hand to advance.");
  }
  if (state.matchWinner) {
    throw new GameError("match_over", "The match is over.");
  }
  state.hakemReveal = [];
  dealFiveToHakem(state, rng);
  return [];
}

// ─── Redaction: each player only ever sees their own hand ────────────────────

export function viewFor(state: GameState, seat: Seat | null): PlayerView {
  return {
    phase: state.phase,
    you: {
      seat,
      hand: seat !== null ? state.hands[seat].slice() : [],
    },
    seats: SEATS.map((s) => ({
      seat: s,
      name: state.seats[s].name,
      picture: state.seats[s].picture,
      connected: state.seats[s].connected,
      ready: state.seats[s].ready,
      cardCount: state.hands[s].length,
    })),
    hakem: state.hakem,
    trump: state.trump,
    turn: state.turn,
    leadSuit: state.leadSuit,
    currentTrick: state.currentTrick.slice(),
    trickCounts: { ...state.trickCounts },
    handScores: { ...state.handScores },
    hakemReveal: state.hakemReveal.slice(),
    lastTrick: state.lastTrick,
    lastHand: state.lastHand,
    matchWinner: state.matchWinner,
    config: state.config,
  };
}
