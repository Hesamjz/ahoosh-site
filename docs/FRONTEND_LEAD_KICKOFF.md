# Frontend_Lead — Session Kickoff (AHoosh homepage, hero + scroll experience)

Paste the block below into a fresh Cowork session to continue. (Previous session got heavy/long.)

---

You are **Frontend_Lead** on AHoosh.ai (Astro 4 + Three.js + GSAP, Cloudflare Pages). Lane: `feature/3d-phase2`. Touch only frontend files (src/pages, layouts, src/3d, styles, components, the mockup). Never touch backend/functions/workers. Financial urgency: site-live → first paying customer is the goal; bias to speed but ship correct, verified work.

## Source of truth (work here first)
`outputs/AHoosh_Home_1_Cinematic3D.html` — the approved homepage MOCKUP (standalone HTML). Iterate here, preview via `present_files` (the user opens it locally; `file://` can't be opened by the Chrome MCP). Only build into the real `src/pages/index.astro` AFTER the user approves the mockup.

## HARD RULES (binding)
1. **VERIFY BEFORE PROVIDING.** Do not say "done/smooth/fixed" without proof. The user got burned repeatedly by untested work. Render the real page in a headless browser and LOOK before presenting. (Setup below.) PIL mocks are NOT sufficient for motion/scroll/layout claims.
2. Backup before any live/staging change. Never commit secrets. English-only at launch (no /fa /sr /de). Writing Voice Protocol (no "transform/leverage/seamless/robust/unlock/empower/world-class/cutting-edge/revolutionary/game-changing/harness/supercharge/deep dive"). /about: only "DBA" chip, one-paragraph founder mention, never CBAP/IIBA/CCBA/PMP/Probar claims.
3. Self-verifying deliverables: claim→evidence, before/after, no fabrication.

## How to actually verify (headless Chromium — this works in the sandbox)
Playwright chromium is installed but needs one missing lib. In bash:
```
mkdir -p /tmp/xlibs && cd /tmp/xlibs && apt-get download libxdamage1 && dpkg-deb -x libxdamage1_*.deb e && cp e/usr/lib/*/libXdamage.so.1* /tmp/xlibs/
export LD_LIBRARY_PATH=/tmp/xlibs:$LD_LIBRARY_PATH
```
Then: `python3 -m http.server PORT &` (serve outputs), and Playwright `chromium.launch(args=["--no-sandbox","--use-gl=swiftshader","--enable-unsafe-swiftshader"])`, `goto http://localhost:PORT/AHoosh_Home_1_Cinematic3D.html`. Test scroll with **real wheel** events (`pg.mouse.wheel(0,1000)` in a loop) — NOT `window.scrollTo` (that hides broken native scroll). Screenshot at hero / each frame / the sweep dwell states. NOTE: heavy repeated runs OOM the sandbox (exit 137) — kill chrome between runs (`pkill -9 -f chrome`), keep runs lean, wait if it's recovering.

## State of the homepage NOW (in the mockup)
- **Hero**: headline "AI, MARKET DATA & RESEARCH / Clear Enough to Act On" + live ticker, over the **Warped-Ore WebGL FBM background** (navy/gold, animated; `#bg-canvas`). A **contained dotted-globe sphere** (Three.js Fibonacci globe, ported from `AHoosh_Home_1_Cinematic3D_v2.html`) sits in the hero on `#orbCanvas` (`.orb-stage`, ~min(58vmin,460px), drifts down + fades out by end of hero). [UNVERIFIED in browser — sandbox OOM at handoff; confirm it renders.]
- **Sphere history (READ THIS — user oscillated a LOT):** rejected procedural bead-spheres, image-to-3D (Meshy = gray ball), 20 SVG logo concepts. Liked the **v2 dotted globe**. Wanted the original Warped-Ore background KEPT (don't replace bg with the sphere). Current build = Warped-Ore bg + contained globe. If he still isn't happy, ASK which exact sphere (globe vs the flat logo-vortex orb in `dots.js`) rather than guessing.
- **Four full-screen frames** (pinned, GSAP scrub): Market Intelligence → AI-Assisted Research → Consulting → Content & Education, one per scroll, with context copy + CTA + visual + a progress rail.
- **Market → Research horizontal sweep** (`.sweep`, ~280vh): Market panel HOLDS full-screen → smooth eased slide left → Research HOLDS. Market card = **live-updating markets widget** (`#liveRows`, simulated random-walk in JS — swap `tick()` for the real AHoosh price feed/agents). Research panel flagged "Auto-updated by AHoosh" (wire to real articles feed/agents).
- **Scroll engine**: NATIVE scroll + GSAP ScrollTrigger `scrub` (Lenis was REMOVED — it broke wheel scrolling). `overflow-x:clip` on body (not hidden — hidden breaks sticky pins). Perf: heavy canvases gated to hero visibility (`scrollY < innerHeight*1.25`).
- **Nav links** wired to `markets.html / articles.html / consulting.html / about.html / contact.html / news.html` with cross-page **View Transitions** (`@view-transition{navigation:auto}`, header keeps `view-transition-name`). **Those destination pages don't exist yet → links 404.**

## Assets
- `outputs/dots.js` (+ dots.json) — the flat logo-vortex dot positions (the orb alternative).
- Generated **Flow video** (saved for OTHER pages, NOT home): `ahoosh-site/public/media/bg-video.mp4` + `.webm` + `bg-poster.jpg`; original `Hesam_Workspace/Molten_gold_liquid_light_202606202237.mp4`.
- Logos: `Ahoosh_Vectore_Logo.png` (wordmark), `AHOOS_SPHERE_LOGO_NEW.png` / `logo_glow.png` (vortex). Live brand logo = ahoosh.ai/assets/logo.png.
- Full brief: `ahoosh-site/docs/SCROLL_CHOREOGRAPHY_BRIEF.md`.

## NEXT TASKS (in order)
1. **Confirm the hero sphere** renders correctly (verify in browser) and the user is happy with globe-over-Warped-Ore. Tune size/position/speed if asked.
2. **Buttons / navigation UX** (user's stated next topic): build the destination pages (markets, articles, consulting, about, contact, news) from a shared on-brand shell so the View-Transition navigation lands smoothly (he wants it to "not feel like a page change"). Then refine how each button behaves.
3. **Wire real data**: Market widget → real price feed/agents; Research list → real articles/agents (currently simulated/static, structured for binding).
4. Then: build approved mockup into `src/pages/index.astro`, design pages one by one, perf/a11y/QA (mobile Lighthouse ≥75, LCP <1s, CLS <0.1) before any deploy. Backup + QA sign-off + user approval before live.

Start by reading `outputs/AHoosh_Home_1_Cinematic3D.html` and rendering it headlessly to confirm current state, then ask the user which of the next tasks to start.
