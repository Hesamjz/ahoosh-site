// HokmRoom — one Durable Object per game table.
//
// Holds the single authoritative GameState, manages up to a handful of player
// WebSockets via the Hibernation API (so an idle table costs nothing), and
// relays WebRTC voice-signaling messages between seats. Every state change is
// persisted to ctx.storage so a hibernated or evicted room resumes intact.

import type { Env } from "./index";
import { verifyRoomPass, type RoomPass } from "./auth";
import {
  chooseTrump,
  createGame,
  nextHand,
  playCard,
  setReady,
  takeSeat,
  viewFor,
} from "./game/hokm";
import { cryptoRng } from "./game/deck";
import {
  type ClientMsg,
  type GameEvent,
  GameError,
  type GameState,
  type Seat,
  type ServerMsg,
} from "./game/types";

interface SocketMeta {
  userId: string;
  name: string | null;
  picture: string | null;
  seat: Seat | null;
}

export class HokmRoom implements DurableObject {
  private game!: GameState;

  constructor(
    private ctx: DurableObjectState,
    private env: Env,
  ) {
    this.ctx.blockConcurrencyWhile(async () => {
      const saved = await this.ctx.storage.get<GameState>("game");
      this.game = saved ?? createGame();
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const token = url.searchParams.get("token") ?? "";
    const pass = await verifyRoomPass(token, this.env.HOKM_JWT_SECRET);
    if (!pass) return new Response("Unauthorized", { status: 401 });

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    const meta: SocketMeta = {
      userId: pass.sub,
      name: pass.name ?? pass.email,
      picture: pass.picture,
      seat: this.reclaimSeat(pass),
    };
    server.serializeAttachment(meta);
    this.ctx.acceptWebSocket(server, [pass.sub]);

    // If they reclaimed a seat, mark it connected and let the table know.
    if (meta.seat !== null) {
      this.game.seats[meta.seat].connected = true;
      await this.persist();
      this.broadcast();
    } else {
      this.send(server, { t: "state", view: viewFor(this.game, null) });
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  // On reconnect, re-bind a user to the seat they already hold (if any).
  private reclaimSeat(pass: RoomPass): Seat | null {
    for (const s of [0, 1, 2, 3] as Seat[]) {
      if (this.game.seats[s].userId === pass.sub) return s;
    }
    return null;
  }

  async webSocketMessage(
    ws: WebSocket,
    raw: string | ArrayBuffer,
  ): Promise<void> {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(typeof raw === "string" ? raw : "") as ClientMsg;
    } catch {
      return;
    }
    const meta = ws.deserializeAttachment() as SocketMeta;

    try {
      let events: GameEvent[] = [];
      switch (msg.t) {
        case "hello":
          this.send(ws, { t: "state", view: viewFor(this.game, meta.seat) });
          return;

        case "ping":
          this.send(ws, { t: "pong" });
          return;

        case "take_seat": {
          events = takeSeat(this.game, msg.seat, {
            userId: meta.userId,
            name: meta.name,
            picture: meta.picture,
          });
          meta.seat = msg.seat;
          ws.serializeAttachment(meta);
          break;
        }

        case "ready":
          this.requireSeat(meta);
          events = setReady(this.game, meta.seat!, cryptoRng);
          break;

        case "choose_trump":
          this.requireSeat(meta);
          events = chooseTrump(this.game, meta.seat!, msg.suit);
          break;

        case "play_card":
          this.requireSeat(meta);
          events = playCard(this.game, meta.seat!, msg.card);
          break;

        case "next_hand":
          this.requireSeat(meta);
          events = nextHand(this.game, cryptoRng);
          break;

        case "chat":
          this.relayChat(meta, String(msg.text ?? "").slice(0, 300));
          return;

        case "rtc":
          this.relayRtc(meta, msg);
          return;
      }

      await this.persist();
      this.broadcastEvents(events);
      this.broadcast();
    } catch (err) {
      if (err instanceof GameError) {
        this.send(ws, { t: "error", code: err.code, msg: err.message });
      } else {
        this.send(ws, { t: "error", code: "internal", msg: "Server error" });
      }
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const meta = ws.deserializeAttachment() as SocketMeta;
    if (meta?.seat === null || meta?.seat === undefined) return;
    // Only mark the seat offline if this user has no other live socket.
    const stillHere = this.ctx
      .getWebSockets()
      .some(
        (s) =>
          s !== ws &&
          (s.deserializeAttachment() as SocketMeta)?.userId === meta.userId,
      );
    if (!stillHere) {
      this.game.seats[meta.seat].connected = false;
      await this.persist();
      this.broadcastEvents([{ e: "peer_left", seat: meta.seat }]);
      this.broadcast();
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  // ─── helpers ───────────────────────────────────────────────────────────────

  private requireSeat(meta: SocketMeta): void {
    if (meta.seat === null) {
      throw new GameError("not_seated", "Take a seat first.");
    }
  }

  private async persist(): Promise<void> {
    await this.ctx.storage.put("game", this.game);
  }

  private send(ws: WebSocket, msg: ServerMsg): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* socket gone */
    }
  }

  // Send each connected socket its own redacted view of the table.
  private broadcast(): void {
    for (const ws of this.ctx.getWebSockets()) {
      const meta = ws.deserializeAttachment() as SocketMeta;
      this.send(ws, { t: "state", view: viewFor(this.game, meta?.seat ?? null) });
    }
  }

  private broadcastEvents(events: GameEvent[]): void {
    if (!events.length) return;
    for (const ws of this.ctx.getWebSockets()) {
      for (const event of events) this.send(ws, { t: "event", event });
    }
  }

  private relayChat(meta: SocketMeta, text: string): void {
    if (!text) return;
    for (const ws of this.ctx.getWebSockets()) {
      this.send(ws, {
        t: "chat",
        seat: meta.seat ?? -1 as unknown as Seat,
        name: meta.name,
        text,
      });
    }
  }

  // Forward a WebRTC offer/answer/ICE to the one peer seat it targets.
  private relayRtc(
    meta: SocketMeta,
    msg: Extract<ClientMsg, { t: "rtc" }>,
  ): void {
    if (meta.seat === null) return;
    for (const ws of this.ctx.getWebSockets()) {
      const m = ws.deserializeAttachment() as SocketMeta;
      if (m?.seat === msg.to) {
        this.send(ws, {
          t: "rtc",
          kind: msg.kind,
          from: meta.seat,
          data: msg.data,
        });
      }
    }
  }
}
