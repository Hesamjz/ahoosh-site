// WebSocket client for the game room: typed send, auto-reconnect with backoff,
// and a heartbeat ping. The room JWT travels in the URL query.

import type { ClientMsg, ServerMsg } from "./types";

export interface NetHandlers {
  onMessage: (msg: ServerMsg) => void;
  onOpen: () => void;
  onClose: () => void;
}

export interface Net {
  send: (msg: ClientMsg) => void;
  close: () => void;
}

export function connect(url: string, handlers: NetHandlers): Net {
  let ws: WebSocket | null = null;
  let closed = false;
  let backoff = 500;
  let pingTimer: number | undefined;

  function open() {
    ws = new WebSocket(url);

    ws.addEventListener("open", () => {
      backoff = 500;
      handlers.onOpen();
      ws?.send(JSON.stringify({ t: "hello" } satisfies ClientMsg));
      pingTimer = window.setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ t: "ping" } satisfies ClientMsg));
        }
      }, 25_000);
    });

    ws.addEventListener("message", (ev) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(ev.data as string) as ServerMsg;
      } catch {
        return;
      }
      handlers.onMessage(msg);
    });

    ws.addEventListener("close", () => {
      window.clearInterval(pingTimer);
      handlers.onClose();
      if (!closed) {
        setTimeout(open, backoff);
        backoff = Math.min(backoff * 2, 8000);
      }
    });

    ws.addEventListener("error", () => ws?.close());
  }

  open();

  return {
    send(msg: ClientMsg) {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    },
    close() {
      closed = true;
      window.clearInterval(pingTimer);
      ws?.close();
    },
  };
}
