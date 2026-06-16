// Integration smoke test: drive 4 WebSocket players through a full hand setup
// against a locally running `wrangler dev`. Node 22 has a global WebSocket.
//
//   Terminal A:  npx wrangler dev --port 8787
//   Terminal B:  node test/ws-smoke.mjs
//
// Exits non-zero on the first failed assertion.

import { createHmac } from "node:crypto";

const SECRET = "devsecret123";
const PORT = process.env.PORT || 8787;
// Unique room per run so a previous run's persisted DO state never interferes.
const ROOM = `SMOKE${Date.now().toString(36).toUpperCase()}`;

function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function mintPass(sub, name) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      sub,
      email: `${sub}@example.com`,
      name,
      picture: null,
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  );
  const data = `${header}.${payload}`;
  const sig = b64url(createHmac("sha256", SECRET).update(data).digest());
  return `${data}.${sig}`;
}

function assert(cond, msg) {
  if (!cond) {
    console.error("✗ FAIL:", msg);
    process.exit(1);
  }
  console.log("✓", msg);
}

class Player {
  constructor(seat, sub, name) {
    this.seat = seat;
    this.view = null;
    const url = `ws://localhost:${PORT}/api/hokm/room/${ROOM}?token=${mintPass(
      sub,
      name,
    )}`;
    this.ws = new WebSocket(url);
    this.ready = new Promise((res) => (this._open = res));
    this.ws.addEventListener("open", () => this._open());
    this.ws.addEventListener("message", (ev) => {
      const m = JSON.parse(ev.data);
      if (m.t === "state") this.view = m.view;
    });
  }
  send(msg) {
    this.ws.send(JSON.stringify(msg));
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const players = [
    new Player(0, "u0", "Ali"),
    new Player(1, "u1", "Sara"),
    new Player(2, "u2", "Reza"),
    new Player(3, "u3", "Mina"),
  ];
  await Promise.all(players.map((p) => p.ready));
  await wait(500);

  // Everyone sits.
  for (const p of players) p.send({ t: "take_seat", seat: p.seat });
  await wait(500);
  assert(
    players[0].view?.seats.filter((s) => s.name).length === 4,
    "all four seats occupied",
  );

  // Everyone readies → match starts, a Hakem is chosen.
  for (const p of players) p.send({ t: "ready" });
  await wait(600);
  const v = players[0].view;
  assert(v.phase === "trump_select", "phase is trump_select after all ready");
  assert(v.hakem !== null, "a Hakem was chosen");
  const hakemSeat = v.hakem;
  assert(
    v.seats[hakemSeat].cardCount === 5,
    "Hakem holds 5 cards before trump",
  );

  // Card redaction: each player only sees their own hand.
  for (const p of players) {
    assert(
      Array.isArray(p.view.you.hand),
      `player ${p.seat} sees own hand array`,
    );
    if (p.seat === hakemSeat) {
      assert(p.view.you.hand.length === 5, "Hakem's own view has 5 cards");
    }
  }

  // Hakem chooses trump → full deal of 13 each.
  players[hakemSeat].send({ t: "choose_trump", suit: "H" });
  await wait(600);
  const v2 = players[0].view;
  assert(v2.phase === "trick_play", "phase is trick_play after trump");
  assert(v2.trump === "H", "trump is hearts");
  assert(
    v2.seats.every((s) => s.cardCount === 13),
    "everyone has 13 cards",
  );
  assert(
    players[hakemSeat].view.you.hand.length === 13,
    "Hakem's own hand is 13",
  );

  // The player to move plays their first legal card.
  const turn = v2.turn;
  const mover = players[turn];
  const card = mover.view.you.hand[0];
  mover.send({ t: "play_card", card });
  await wait(500);
  assert(
    players[0].view.currentTrick.some((p) => p.card === card),
    "played card appears in everyone's currentTrick",
  );
  assert(
    players[turn].view.you.hand.length === 12,
    "mover's hand dropped to 12",
  );

  // Reject an out-of-turn play (silently ignored → no state change crash).
  const wrong = players[(turn + 2) % 4];
  wrong.send({ t: "play_card", card: wrong.view.you.hand[0] });
  await wait(500);
  assert(
    players[0].view.currentTrick.length === 1,
    "out-of-turn play was rejected (trick still has 1 card)",
  );

  console.log("\n🎉 All smoke assertions passed.");
  for (const p of players) p.ws.close();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
