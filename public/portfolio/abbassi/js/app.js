/* ABBASSI — scroll-driven jewellery site (v2, smoother transitions)
   - Hero: ring on one side, ABBASSI on the other. No auto-motion — rotates on scroll + drag.
   - Showcase: each piece slides UP into view and plays its rotation. Transitions use an
               ease-in-out slide + soft edge fade so pieces glide instead of jumping.
*/

const N = 96;
const ORDER = ['ring', 'earrings', 'necklace', 'bracelet'];
const BG = '#ffffff';
const isMobile = () => window.matchMedia('(max-width:768px)').matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = e => e * e * (3 - 2 * e);          // smoothstep (ease-in-out)

const frames = { ring: [], earrings: [], necklace: [], bracelet: [] };
const pad = n => String(n).padStart(3, '0');
const url = (key, i) => `frames/${key}/f_${pad(i + 1)}.webp`;

/* ---------- Preload ---------- */
let loadedCount = 0;
const total = ORDER.length * N;
const bar = document.getElementById('loader-bar');
const pct = document.getElementById('loader-percent');
const loader = document.getElementById('loader');

function bump() {
  loadedCount++;
  const p = Math.round((loadedCount / total) * 100);
  bar.style.width = p + '%';
  pct.textContent = p + '%';
}
function loadKey(key) {
  const jobs = [];
  for (let i = 0; i < N; i++) {
    jobs.push(new Promise(res => {
      const img = new Image();
      img.onload = () => { bump(); res(); };
      img.onerror = () => { bump(); res(); };
      img.src = url(key, i);
      frames[key][i] = img;
    }));
  }
  return Promise.all(jobs);
}
loadKey('ring').then(() => {
  startHero();
  return Promise.all([loadKey('earrings'), loadKey('necklace'), loadKey('bracelet')]);
}).then(() => {
  loader.classList.add('hidden');
  initShowcase();
});

/* ---------- Draw helper ---------- */
function sizeCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'low';   // fast resampling — 'high' made drag/scroll heavy
  return ctx;
}
function drawFit(ctx, cw, ch, img, scaleFactor, cxFrac, yFrac, alpha) {
  if (!img || !img.naturalWidth || alpha <= 0) return;
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const scale = Math.min(cw / iw, ch / ih) * scaleFactor;
  const dw = iw * scale, dh = ih * scale;
  const dx = cw * cxFrac - dw / 2;
  const dy = (ch - dh) / 2 + yFrac * ch;
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.globalAlpha = 1;
}

/* ---------- Hero ---------- */
function startHero() {
  const canvas = document.getElementById('hero-canvas');
  let ctx = sizeCanvas(canvas);
  const hint = document.querySelector('.drag-hint');

  const HERO_SPINS = 1.25;          // rotations across one viewport of scroll
  let dragOffset = 0, vel = 0, dragging = false, lastX = 0, needsDraw = true, lastScroll = -1;
  const scrollFrame = () => (window.scrollY / window.innerHeight) * N * HERO_SPINS;
  const heroVisible = () => window.scrollY < window.innerHeight;   // only redraw while on screen

  function draw() {
    const raw = scrollFrame() + dragOffset;   // rotate on scroll + drag
    const idx = ((Math.round(raw) % N) + N) % N;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const cx = isMobile() ? 0.5 : 0.72;
    const scale = isMobile() ? 1.0 : 0.92;
    const yF = isMobile() ? 0.2 : 0;              // push ring below the title on phones
    drawFit(ctx, canvas.width, canvas.height, frames.ring[idx], scale, cx, yF, 1);
  }
  function loop() {
    const sy = window.scrollY;
    if (sy !== lastScroll && heroVisible()) { lastScroll = sy; needsDraw = true; }
    if (dragging) needsDraw = true;
    else if (Math.abs(vel) > 0.02) { dragOffset += vel; vel *= 0.92; needsDraw = true; }
    if (needsDraw) { draw(); needsDraw = false; }
    requestAnimationFrame(loop);
  }
  const fpp = () => N / (canvas.clientWidth * 0.9);
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    dragging = true; lastX = e.clientX; vel = 0;
    canvas.classList.add('grabbing'); hint.classList.add('gone');
  });
  canvas.addEventListener('pointermove', e => {
    if (!dragging) return;
    const df = -(e.clientX - lastX) * fpp();
    dragOffset += df; vel = df; lastX = e.clientX; needsDraw = true;
  });
  const end = () => { dragging = false; canvas.classList.remove('grabbing'); };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  window.addEventListener('resize', () => { ctx = sizeCanvas(canvas); needsDraw = true; });
  draw();
  requestAnimationFrame(loop);
}

/* ---------- Showcase ---------- */
function initShowcase() {
  const stage = document.getElementById('stage');
  const scrollContainer = document.getElementById('scroll-container');
  const capEls = Array.from(document.querySelectorAll('.caption'));
  let ctx = sizeCanvas(stage);

  // Full collection in the showcase (ring's glitchy first frame is fixed).
  const SHOWCASE = ['ring', 'earrings', 'necklace', 'bracelet'];
  const PER = 1 / SHOWCASE.length;
  const ENTER = 0.34;                 // transition window
  const DIST = 1.15;                  // full-viewport travel so the whole slide leaves together
  const SCALE_SIDE = 0.70;
  let lastP = -1;

  const sideOf = i => (i % 2 === 0 ? 'right' : 'left');
  const cxOf = i => isMobile() ? 0.5 : (sideOf(i) === 'right' ? 0.68 : 0.32);
  const scaleOf = () => isMobile() ? 0.92 : SCALE_SIDE;

  // product (canvas) and caption move by the SAME distance so the whole slide travels as one
  function drawPiece(i, frameIdx, yFrac) {
    drawFit(ctx, stage.width, stage.height, frames[SHOWCASE[i]][frameIdx], scaleOf(), cxOf(i), yFrac, 1);
  }
  function setCaption(el, yFrac) {
    el.style.setProperty('--slide', (yFrac * window.innerHeight).toFixed(1) + 'px');
    el.style.opacity = 1;
  }
  function hideCaptionsExcept(indices) {
    capEls.forEach(el => { if (!indices.includes(+el.dataset.piece)) el.style.opacity = 0; });
  }

  function render(p) {
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, stage.width, stage.height);

    const i = clamp(Math.floor(p / PER), 0, SHOWCASE.length - 1);
    const t = clamp((p - i * PER) / PER, 0, 1);

    if (t < ENTER) {
      const e = smooth(t / ENTER);
      const yIn = (1 - e) * DIST;
      drawPiece(i, 0, yIn);              // incoming slide (piece + text) rises from below
      setCaption(capEls[i], yIn);
      if (i > 0) {
        const yOut = -e * DIST;
        drawPiece(i - 1, N - 1, yOut);   // outgoing slide travels up and off together
        setCaption(capEls[i - 1], yOut);
        hideCaptionsExcept([i, i - 1]);
      } else {
        hideCaptionsExcept([i]);
      }
    } else {
      const rt = (t - ENTER) / (1 - ENTER);
      const fr = Math.min(N - 1, Math.floor(rt * (N - 1)));
      drawPiece(i, fr, 0);              // centered: piece plays its rotation, text steady
      setCaption(capEls[i], 0);
      hideCaptionsExcept([i]);
    }

    let vis = 1;
    if (p < 0.02) vis = p / 0.02;
    else if (p > 0.98) vis = 1 - (p - 0.98) / 0.02;
    stage.style.opacity = clamp(vis, 0, 1);
  }

  const lenis = new Lenis({
    duration: 1.2,
    easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true
  });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(time => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  ScrollTrigger.create({
    trigger: scrollContainer,
    start: 'top top',
    end: 'bottom bottom',
    scrub: 0.4,                        // light smoothing — responsive, not heavy
    onUpdate: self => {
      const p = self.progress;
      if (p !== lastP) { lastP = p; requestAnimationFrame(() => render(p)); }
    }
  });

  window.addEventListener('resize', () => {
    ctx = sizeCanvas(stage);
    render(lastP < 0 ? 0 : lastP);
    ScrollTrigger.refresh();
  });
  render(0);
}
