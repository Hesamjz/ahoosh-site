// Background-music toggle. Plays a looping ambient track if present at
// /hokm/audio/ambient.mp3. Defaults off (browser autoplay policy); the choice
// persists in localStorage. If the file is missing the button stays disabled.

const KEY = "hokm_music";

export function setupMusic(btn: HTMLButtonElement): void {
  const audio = new Audio("/hokm/audio/ambient.mp3");
  audio.loop = true;
  audio.volume = 0.4;
  let available = true;

  audio.addEventListener("error", () => {
    available = false;
    btn.disabled = true;
    btn.title = "Add /public/hokm/audio/ambient.mp3 to enable music";
  });

  function paint(on: boolean) {
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-pressed", String(on));
  }

  btn.addEventListener("click", async () => {
    if (!available) return;
    if (audio.paused) {
      try {
        await audio.play();
        localStorage.setItem(KEY, "on");
        paint(true);
      } catch {
        /* user gesture needed / blocked */
      }
    } else {
      audio.pause();
      localStorage.setItem(KEY, "off");
      paint(false);
    }
  });

  // Restore preference — but playback still needs a gesture, so just reflect it.
  paint(localStorage.getItem(KEY) === "on");
}
