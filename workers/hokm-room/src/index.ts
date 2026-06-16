// Router Worker. Upgrades /api/hokm/room/:id WebSocket connections and forwards
// them to the matching HokmRoom Durable Object (one instance per room id).

import { HokmRoom } from "./room";

export interface Env {
  HOKM_ROOM: DurableObjectNamespace;
  HOKM_JWT_SECRET: string;
  GOOGLE_CLIENT_ID: string;
}

export { HokmRoom };

const ROOM_RE = /^\/api\/hokm\/room\/([A-Za-z0-9_-]{4,32})$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/hokm/health" || url.pathname === "/health") {
      return json({ ok: true });
    }

    const m = url.pathname.match(ROOM_RE);
    if (m) {
      const roomId = m[1];
      const id = env.HOKM_ROOM.idFromName(roomId);
      const stub = env.HOKM_ROOM.get(id);
      return stub.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
