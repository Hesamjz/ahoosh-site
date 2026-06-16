# Hokm (حکم) — online card game

A private, real-time **Hokm** table for 4 players: Google sign-in, a Persian-home
table with optional background music, and **voice chat** over WebRTC.

- **Game server:** this Worker — one **Durable Object** (`HokmRoom`) per table,
  holding the authoritative shuffled deck and the live WebSocket connections.
- **Auth + room create:** Pages Functions in `functions/api/hokm/`.
- **Table UI:** Astro pages `/hokm` and `/fa/hokm` + modules in `src/scripts/hokm/`.

The server is authoritative for cards — each player is only ever sent **their own**
hand, so the game can't be cheated by inspecting network traffic.

## How a game works

1. You sign in with Google and **Create a table** → you get a link.
2. You share the link with 3 friends. Each opens it, signs in with Google, and sits.
3. Everyone clicks **Ready** → a Hakem is chosen, picks trump, cards are dealt.
4. Play tricks (follow suit, trump wins). First team to 7 tricks wins the hand;
   first team to 7 hands wins the match. A shutout is a **Kot** (worth 2).
5. Click 🎙️ to join voice chat; 🎵 toggles music.

## Layout

```
workers/hokm-room/          # this Worker + the HokmRoom Durable Object
  src/index.ts              # router: /api/hokm/room/:id → DO
  src/room.ts               # DO: WS hibernation, state, broadcast, RTC relay
  src/auth.ts               # verify the room-pass JWT at the handshake
  src/game/                 # pure engine: deck, hokm state machine, scoring
  test/engine.test.ts       # vitest unit tests (run: npm test)
  test/ws-smoke.mjs         # 4-player integration test against wrangler dev
functions/api/hokm/         # google-verify.js, create.js, turn-credentials.js
src/pages/hokm.astro        # English table   (/hokm)
src/pages/fa/hokm.astro     # Persian table    (/fa/hokm)  ← primary, RTL
src/scripts/hokm/           # client: net, auth, render, cards, voice, audio
public/hokm/                # CREDITS + drop ambient.mp3 here for music
```

## One-time setup

### 1. Google OAuth client id

In [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services →
Credentials → **Create OAuth client ID** → type **Web application**:

- **Authorized JavaScript origins:** `https://ahoosh.ai` and `http://localhost:4321`
- No redirect URI needed (Google Identity Services token flow).

Copy the **Client ID** (looks like `xxxx.apps.googleusercontent.com`).

### 2. Secrets & vars

**The Worker** (`workers/hokm-room/`):
```bash
npx wrangler secret put HOKM_JWT_SECRET        # any long random string
# set GOOGLE_CLIENT_ID in wrangler.jsonc → vars (replace the placeholder)
```

**Cloudflare Pages** (Dashboard → your Pages project → Settings → Env vars):
- `GOOGLE_CLIENT_ID`  — the same client id
- `HOKM_JWT_SECRET`   — the **same** secret as the Worker (must match)
- `HOKM_ALLOWLIST`    — comma-separated allowed emails. `*` or unset = anyone.
- `PUBLIC_GOOGLE_CLIENT_ID` — the client id again (the client build reads this)
- *(optional, for reliable voice)* `TURN_KEY_ID`, `TURN_KEY_API_TOKEN` from
  [Cloudflare Realtime TURN](https://developers.cloudflare.com/realtime/turn/)

For local dev, copy `.env.example` → `.env` and fill `PUBLIC_GOOGLE_CLIENT_ID`
and `PUBLIC_HOKM_WS_BASE=ws://localhost:8787`. The Worker reads `.dev.vars`
(already created with a dev `HOKM_JWT_SECRET`).

## Local dev

```bash
# terminal 1 — the game server (Durable Object)
cd workers/hokm-room && npx wrangler dev --port 8787

# terminal 2 — the site (Astro + Pages Functions)
npm run dev            # http://localhost:4321/fa/hokm
```

Open `http://localhost:4321/fa/hokm` in 4 browser windows/profiles to test.

### Tests

```bash
cd workers/hokm-room
npm test                       # pure engine unit tests (no server needed)
# integration: start `wrangler dev --port 8787` first, then:
node test/ws-smoke.mjs         # drives 4 players through a full hand setup
```

## Deploy

```bash
# 1) the game-server Worker (its own project, like markets-fetcher)
cd workers/hokm-room && npx wrangler deploy
#    first time, smoke-test on the workers.dev URL; the route in wrangler.jsonc
#    pins it to ahoosh.ai/api/hokm/room/*

# 2) the site + Pages Functions deploy the normal way (your existing flow)
```

## House rules you can tweak

`src/game/types.ts → DEFAULT_CONFIG`: `tricksToWin` (7), `handsToWin` (7),
`kotMode` (`simple` = Kot worth 2; `hakem` = Kot of the Hakem's team worth 3).
