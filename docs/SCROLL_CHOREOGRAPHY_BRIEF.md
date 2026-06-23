# AHoosh Homepage — Scroll Choreography Brief (next build)

Locked 2026-06-20. Hero orb is DONE (high-res 457-dot logo vortex, twinkle + hover + tilt + drift, contained 460px, verified at real desktop size). This brief covers the NEXT phase: the scroll-driven story.

## Vision (Hesam, verbatim intent)
Every scroll reveals ONE full-screen scene. Smooth, with clear "frames". No jumps, no lag.

### Sequence
1. **Hero** — orb + "AI, Market Data & Research / Clear Enough to Act On" (done).
2. **Four Layers, One Practice** — the 4 layers each open as their OWN full-screen frame with real detail + context, revealed one per scroll (4 frames in a row):
   1. Market Intelligence
   2. AI-Assisted Research
   3. Consulting
   4. Content & Education
   - Each frame = full viewport, rich content. WRITE context copy where missing (Writing Voice Protocol — no banned words).
3. **Market → Research/Articles sweep** — Market panel sweeps LEFT, Research/Articles flies in. MUST be buttery smooth. Current version JUMPS/LAGS — replace it.

## Smoothness plan (the core ask)
- Add **Lenis** smooth-scroll (rAF-driven, eased) site-wide.
- Drive frame reveals + the horizontal sweep with **GSAP ScrollTrigger `scrub`** on a **pinned** section (no scroll-linked layout reads each frame; transform/opacity only).
- Transform-only animations, `will-change`, no width/height/top animation (avoid reflow jank).
- Respect `prefers-reduced-motion`; keep mobile Lighthouse ≥75, LCP <1s, CLS <0.1 (perf budget).
- Optionally scroll-snap the 4 full-screen frames (snap each to viewport) for the "one scene per scroll" feel.

## Skills / tools to use
- senior-frontend (Astro + GSAP/Lenis impl), ui-design-system, ux-researcher-designer (UI/UX), accessibility-audit, performance-budget/performance-profiler.
- Motion: GSAP ScrollTrigger + Lenis.
- Visuals: generate on-brand navy/gold abstract images + short loop videos per frame (Adobe/image+video gen tools available in session); "video-to-website" treatment for any motion backgrounds.

## Background decision (2026-06-20)
Home page keeps the **Warped-Ore WebGL shader** background (moving). The generated
**Google Flow video** ("molten gold liquid light", navy/gold) is SAVED for use on
OTHER pages — web-optimized at `public/media/bg-video.mp4` + `.webm` + `bg-poster.jpg`;
full-res original at `Hesam_Workspace/Molten_gold_liquid_light_202606202237.mp4`.
To use the video bg on a page: add `<video class="bg-video" autoplay muted loop playsinline>`
+ `.bg-tint` overlay and hide the shader (pattern was prototyped then reverted on home).

## Status
- Mockup source of truth: `outputs/AHoosh_Home_1_Cinematic3D.html` (orb + bones). Current cinematic chapter transition (#news section) is the janky one to replace.
- Lane: Frontend_Lead on `feature/3d-phase2`. Build approved design into `src/pages/index.astro` after sign-off. Backup before any staging/live change.
