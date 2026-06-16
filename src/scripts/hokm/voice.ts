// WebRTC voice — a small full-mesh among the seated players. Signaling
// (offer/answer/ICE) is relayed through the game WebSocket by the caller.
// Uses the "perfect negotiation" pattern so simultaneous offers don't deadlock.
// Audio never touches the server.

import type { Seat } from "./types";

type SendSignal = (
  to: Seat,
  kind: "offer" | "answer" | "ice",
  data: unknown,
) => void;

interface Peer {
  pc: RTCPeerConnection;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  audio: HTMLAudioElement;
}

export interface VoiceManager {
  start(): Promise<void>;
  active(): boolean;
  connectTo(seat: Seat): void;
  drop(seat: Seat): void;
  handleSignal(from: Seat, kind: string, data: any): Promise<void>;
  setMuted(muted: boolean): void;
  muted(): boolean;
}

export function createVoice(
  getSeat: () => Seat,   // getter — mySeat may not be known at creation time
  iceServers: RTCIceServer[],
  send: SendSignal,
  onSpeaking: (seat: Seat, speaking: boolean) => void,
): VoiceManager {
  const peers = new Map<Seat, Peer>();
  let localStream: MediaStream | null = null;
  let isMuted = false;
  let started = false;

  function makePeer(seat: Seat): Peer {
    const pc = new RTCPeerConnection({ iceServers });
    const audio = document.createElement("audio");
    audio.autoplay = true;
    (audio as any).playsInline = true;
    document.body.appendChild(audio);

    const mySeat = getSeat();
    const peer: Peer = {
      pc,
      polite: mySeat > seat, // higher seat yields on collision
      makingOffer: false,
      ignoreOffer: false,
      audio,
    };

    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        send(seat, "offer", pc.localDescription);
      } catch {
        /* ignore */
      } finally {
        peer.makingOffer = false;
      }
    };
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) send(seat, "ice", candidate);
    };
    pc.ontrack = ({ streams }) => {
      audio.srcObject = streams[0];
      meter(streams[0], seat);
    };
    if (localStream) {
      for (const t of localStream.getTracks()) pc.addTrack(t, localStream);
    }
    peers.set(seat, peer);
    return peer;
  }

  function ensurePeer(seat: Seat): Peer {
    return peers.get(seat) ?? makePeer(seat);
  }

  // Lightweight speaking indicator via Web Audio level metering.
  function meter(stream: MediaStream, seat: Seat) {
    try {
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let speaking = false;
      const tick = () => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (const v of data) sum += v;
        const level = sum / data.length;
        const now = level > 12;
        if (now !== speaking) {
          speaking = now;
          onSpeaking(seat, now);
        }
        requestAnimationFrame(tick);
      };
      tick();
    } catch {
      /* metering is optional */
    }
  }

  return {
    async start() {
      if (started) return;
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      started = true;
      // Add tracks to any peers created while we were still a listener.
      for (const { pc } of peers.values()) {
        for (const t of localStream.getTracks()) pc.addTrack(t, localStream);
      }
    },
    active() {
      return started;
    },
    connectTo(seat: Seat) {
      if (seat === getSeat()) return;
      ensurePeer(seat);
    },
    drop(seat: Seat) {
      const p = peers.get(seat);
      if (!p) return;
      p.pc.close();
      p.audio.remove();
      peers.delete(seat);
    },
    async handleSignal(from: Seat, kind: string, data: any) {
      const peer = ensurePeer(from);
      const pc = peer.pc;
      try {
        if (kind === "ice") {
          try {
            await pc.addIceCandidate(data);
          } catch {
            if (!peer.ignoreOffer) throw new Error("ice");
          }
          return;
        }
        // offer / answer description
        const desc = data as RTCSessionDescriptionInit;
        const collision =
          desc.type === "offer" &&
          (peer.makingOffer || pc.signalingState !== "stable");
        peer.ignoreOffer = !peer.polite && collision;
        if (peer.ignoreOffer) return;
        await pc.setRemoteDescription(desc);
        if (desc.type === "offer") {
          await pc.setLocalDescription();
          send(from, "answer", pc.localDescription);
        }
      } catch {
        /* ignore transient negotiation errors */
      }
    },
    setMuted(muted: boolean) {
      isMuted = muted;
      localStream?.getAudioTracks().forEach((t) => (t.enabled = !muted));
    },
    muted() {
      return isMuted;
    },
  };
}
