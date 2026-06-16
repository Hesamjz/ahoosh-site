// Client-side copy of the wire protocol. Kept in sync with the worker's
// game/types.ts by hand (only a handful of shapes).

export type Suit = "S" | "H" | "D" | "C";
export type Card = string; // "AS", "TD", …
export type Seat = 0 | 1 | 2 | 3;
export type Team = "A" | "B";
export type Phase =
  | "lobby"
  | "hakem_select"
  | "trump_select"
  | "trick_play"
  | "hand_scoring"
  | "match_end";

export interface SeatView {
  seat: Seat;
  name: string | null;
  picture: string | null;
  connected: boolean;
  ready: boolean;
  cardCount: number;
}

export interface PlayerView {
  phase: Phase;
  you: { seat: Seat | null; hand: Card[] };
  seats: SeatView[];
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
  config: { tricksToWin: number; handsToWin: number; kotMode: string };
}

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

export type ServerMsg =
  | { t: "state"; view: PlayerView }
  | { t: "event"; event: GameEvent }
  | { t: "chat"; seat: Seat; name: string | null; text: string }
  | { t: "rtc"; kind: "offer" | "answer" | "ice"; from: Seat; data: unknown }
  | { t: "error"; code: string; msg: string }
  | { t: "pong" };

export type ClientMsg =
  | { t: "hello" }
  | { t: "take_seat"; seat: Seat }
  | { t: "ready" }
  | { t: "choose_trump"; suit: Suit }
  | { t: "play_card"; card: Card }
  | { t: "next_hand" }
  | { t: "chat"; text: string }
  | { t: "rtc"; kind: "offer" | "answer" | "ice"; to: Seat; data: unknown }
  | { t: "ping" };
