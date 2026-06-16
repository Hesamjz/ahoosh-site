// Music player — streams "60 Minutes of Persian Tar Music" from YouTube
// (video ID: Lz0w_v7fQ8s) via the IFrame API hidden off-screen.
// First click loads + plays; subsequent clicks truly pause/resume (no fade trick).
// Preference persists in localStorage.

const KEY = "hokm_music";
const VIDEO_ID = "Lz0w_v7fQ8s"; // 60 Minutes of Persian Tar Music

let player: any = null;
let playerReady = false;
let wantPlay = false;

function initPlayer(): void {
  if (player) return;
  const el = document.createElement("div");
  el.id = "hk-yt";
  el.style.cssText = "position:fixed;left:-9999px;width:1px;height:1px;pointer-events:none";
  document.body.appendChild(el);

  player = new (window as any).YT.Player("hk-yt", {
    videoId: VIDEO_ID,
    playerVars: {
      autoplay: 0,
      controls: 0,
      disablekb: 1,
      loop: 1,
      playlist: VIDEO_ID, // loop requires playlist param
      playsinline: 1,
      rel: 0,
    },
    events: {
      onReady: () => {
        playerReady = true;
        player.setVolume(50);
        if (wantPlay) player.playVideo();
      },
    },
  });
}

function ensureYT(cb: () => void): void {
  if ((window as any).YT?.Player) {
    cb();
    return;
  }
  // Chain onto any existing ready callback
  const prev = (window as any).onYouTubeIframeAPIReady;
  (window as any).onYouTubeIframeAPIReady = () => {
    prev?.();
    cb();
  };
  if (!document.getElementById("yt-script")) {
    const s = document.createElement("script");
    s.id = "yt-script";
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  }
}

export function setupMusic(btn: HTMLButtonElement): void {
  let playing = false;

  function paint(on: boolean): void {
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-pressed", String(on));
  }

  btn.addEventListener("click", () => {
    playing = !playing;
    wantPlay = playing;

    if (playing) {
      if (!player) {
        ensureYT(initPlayer); // first click: load API + create player
      } else if (playerReady) {
        player.playVideo();   // already loaded: resume
      }
      localStorage.setItem(KEY, "on");
    } else {
      if (playerReady) player.pauseVideo(); // real pause, not volume fade
      localStorage.setItem(KEY, "off");
    }

    paint(playing);
  });

  paint(false); // always start as off — autoplay blocked by browsers anyway
}
