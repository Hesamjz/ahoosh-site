// Synthesised Persian-style ambient drone using Web Audio API.
// No audio files needed. Works immediately in any modern browser.
// The drone uses tanpura-style harmonics (root + fifth + octave) with a
// minor third for a darker, Eastern colour. A slow LFO adds subtle breathing.
// User preference persists in localStorage.

const KEY = "hokm_music";

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let built = false;
let playing = false;

// ─── drone builder ────────────────────────────────────────────────────────────

function buildDrone(ctx: AudioContext): void {
  if (built) return;
  built = true;

  masterGain = ctx.createGain();
  masterGain.gain.value = 0; // start silent; fade in on play
  masterGain.connect(ctx.destination);

  // Tanpura-style notes: C2, G2, C3, Eb3, G3
  // The Eb (minor third) gives a Persian/Dorian flavour.
  const notes = [65.41, 98.0, 130.81, 155.56, 196.0];
  const gains = [0.18, 0.12, 0.14, 0.08, 0.08];
  const types: OscillatorType[] = ["sawtooth", "sine", "sine", "sine", "triangle"];

  for (let i = 0; i < notes.length; i++) {
    const osc = ctx.createOscillator();
    osc.type = types[i];
    osc.frequency.value = notes[i];
    // Slight detune per voice for chorus warmth
    osc.detune.value = (i % 2 === 0 ? 1 : -1) * i * 0.4;

    const gain = ctx.createGain();
    gain.gain.value = gains[i];

    // Very slow LFO (unique per oscillator) for organic breathing
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.04 + i * 0.011; // 25–40 s cycle
    const lfoAmp = ctx.createGain();
    lfoAmp.gain.value = gains[i] * 0.25; // max 25 % amplitude swing
    lfo.connect(lfoAmp);
    lfoAmp.connect(gain.gain);
    lfo.start();

    // Light low-pass filter to keep highs soft
    const lpf = ctx.createBiquadFilter();
    lpf.type = "lowpass";
    lpf.frequency.value = 900;
    lpf.Q.value = 0.7;

    osc.connect(lpf);
    lpf.connect(gain);
    gain.connect(masterGain);
    osc.start();
  }

  // Master breath LFO (very slow, ~30 s)
  const breath = ctx.createOscillator();
  breath.frequency.value = 0.033;
  const breathAmp = ctx.createGain();
  breathAmp.gain.value = 0.04;
  breath.connect(breathAmp);
  breathAmp.connect(masterGain.gain);
  breath.start();
}

// ─── public API ───────────────────────────────────────────────────────────────

export function setupMusic(btn: HTMLButtonElement): void {
  function paint(on: boolean) {
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-pressed", String(on));
  }

  btn.addEventListener("click", async () => {
    // AudioContext must be created / resumed on a user gesture
    if (!audioCtx) {
      audioCtx = new AudioContext();
    }
    if (audioCtx.state === "suspended") {
      await audioCtx.resume();
    }
    buildDrone(audioCtx);

    if (!playing) {
      masterGain!.gain.cancelScheduledValues(audioCtx.currentTime);
      masterGain!.gain.setTargetAtTime(0.38, audioCtx.currentTime, 1.8);
      playing = true;
      localStorage.setItem(KEY, "on");
      paint(true);
    } else {
      masterGain!.gain.cancelScheduledValues(audioCtx.currentTime);
      masterGain!.gain.setTargetAtTime(0, audioCtx.currentTime, 0.6);
      playing = false;
      localStorage.setItem(KEY, "off");
      paint(false);
    }
  });

  // Reflect saved preference (but don't auto-play — browser policy requires a gesture)
  paint(localStorage.getItem(KEY) === "on");
}
