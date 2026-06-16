// Core Hokm types — shared by the engine, the Durable Object, and (a copy of
// the message types) the browser client.

export type Suit = "S" | "H" | "D" | "C"; // ♠ ♥ ♦ ♣
export type Rank =
  | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
  | "T" | "J" | "Q" | "K" | "A";

// A card is a 2-char code: rank + suit, e.g. "AS" = Ace of Spades, "TD" = 10♦.
export type Card = `${Rank}${Suit}`;

export type Seat = 0 | 1 | 2 | 3;
export type Team = "A" | "B"; // A = seats {0,2}, B = seats {1,3} (partners across)

export type Phase =
  | "lobby" // waiting for 4 players to sit + ready
  | "hakem_select" // dealing face-up to find the first Hakem (first hand only)
  | "trump_select" // Hakem has 5 cards, chooses the trump (hokm) suit
  | "trick_play" // 13 tricks are played out
  | "hand_scoring" // a hand just ended, showing the result
  | "match_end"; // a team reached the hands-to-win target

// One seat at the table. `userId` ties a person to a seat across reconnects.
export interface PlayerSlot {
  userId: string | null;
  name: string | null;
  picture: string | null;
  connected: boolean;
  ready: boolean;
}

export interface MatchConfig {
  tricksToWin: number; // tricks to win a single hand (default 7 of 13)
  handsToWin: number; // hands to win the whole match (default 7)
  // 'simple'  → a Kot (opponents take 0 tricks) is worth 2 hands.
  // 'hakem'   → as 'simple', but if the Hakem's team is Kot'd it is worth 3.
  kotMode: "simple" | "hakem";
}

// The full, authoritative game state. Lives only inside the Durable Object.
// Each player receives a redacted view (see viewFor in hokm.ts).
export interface GameState {
  phase: Phase;
  seats: PlayerSlot[]; // length 4
  hands: Record<Seat, Card[]>; // full hands — server-only, never broadcast whole
  hakem: Seat | null;
  trump: Suit | null;
  turn: Seat | null; // whose turn to act
  leadSuit: Suit | null; // suit led in the current trick
  currentTrick: { seat: Seat; card: Card }[];
  trickCounts: Record<Team, number>; // tricks won in the current hand
  handScores: Record<Team, number>; // hands won in the match
  hakemReveal: { seat: Seat; card: Card }[]; // cards turned up to find the Hakem
  lastTrick: { plays: { seat: Seat; card: Card }[]; winner: Seat } | null;
  lastHand: { winner: Team; kot: boolean; points: number } | null;
  matchWinner: Team | null;
  deck: Card[]; // remaining undealt cards (server-only)
  config: MatchConfig;
}

// ─── Message protocol (WebSocket JSON) ───────────────────────────────────────

export type ClientMsg =
  | { t: "hello" }
  | { t: "take_seat"; seat: Seat }
  | { t: "ready" }
  | { t: "choose_trump"; suit: Suit }
  | { t: "play_card"; card: Card }
  | { t: "next_hand" }
  | { t: "chat"; text: string }
  // WebRTC voice signaling — relayed to one peer seat:
  | { t: "rtc"; kind: "offer" | "answer" | "ice"; to: Seat; data: unknown }
  | { t: "ping" };

// A player's redacted view of the table.
export interface PlayerView {
  phase: Phase;
  you: { seat: Seat | null; hand: Card[] };
  seats: {
    seat: Seat;
    name: string | null;
    picture: string | null;
    connected: boolean;
    ready: boolean;
    cardCount: number;
  }[];
  hakem: Seat | null;
  trump: Suit | null;
  turn: Seat | null;
  leadSuit: Suit | null;
  currentTrick: { seat: Seat; card: Card }[];
  trickCounts: Record<Team, number>;
  handScores: Record<Team, number>;
  hakemReveal: { seat: Seat; card: Card }[];
  lastTrick: { plays: { seat: Seat; card: Card }[]; winner: Seat } | null;
  lastHand: { winner: Team; kot: boolean; points: number } | null;
  matchWinner: Team | null;
  config: MatchConfig;
}

export type ServerMsg =
  | { t: "state"; view: PlayerView }
  | { t: "event"; event: GameEvent }
  | { t: "chat"; seat: Seat; name: string | null; text: string }
  | { t: "rtc"; kind: "offer" | "answer" | "ice"; from: Seat; data: unknown }
  | { t: "error"; code: string; msg: string }
  | { t: "pong" };

// Discrete things that happened — clients use these to drive animations/sounds.
export type GameEvent =
  | { e: "seated"; seat: Seat; name: string | null }
  | { e: "hakem_chosen"; seat: Seat; reveal: { seat: Seat; card: Card }[] }
  | { e: "trump_chosen"; suit: Suit; hakem: Seat }
  | { e: "dealt" }
  | { e: "card_played"; seat: Seat; card: Card }
  | { e: "trick_won"; seat: Seat; team: Team }
  | { e: "hand_over"; winner: Team; kot: boolean; points: number }
  | { e: "match_over"; winner: Team }
  | { e: "peer_joined"; seat: Seat }
  | { e: "peer_left"; seat: Seat };

// Thrown by the engine on an illegal action; the DO turns it into an error msg.
export class GameError extends Error {
  constructor(public code: string, msg: string) {
    super(msg);
  }
}

export const DEFAULT_CONFIG: MatchConfig = {
  tricksToWin: 7,
  handsToWin: 7,
  kotMode: "simple",
};
