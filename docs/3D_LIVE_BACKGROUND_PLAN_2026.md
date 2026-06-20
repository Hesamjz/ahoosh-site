# AHoosh.ai — Lusion-Grade Live Background: Design & Build Plan (2026)

**Owner:** Frontend_Lead · **Date:** 2026-06-20 · **Branch:** `feature/3d-phase2`
**Decision set (locked with Hesam):** Abstract WebGL field (Lusion-style) · all main pages · asset-first, then localhost → staging → next · use every tool (Three + GSAP + Lenis, Motion, 21st.dev, ui-ux-pro-max) + author our own prompt library.

---

## 0. TL;DR — what this actually is

This is **not** a from-scratch build. The repo already contains a serious Lusion-style foundation:

- Full **GSAP** suite installed and free (ScrollTrigger, ScrollSmoother, SplitText, Flip, Draggable, DrawSVG, CustomEase…).
- **Lenis** smooth scroll wired into the GSAP ticker globally (`src/3d/core/lenis-setup.ts`).
- **Three.js** singleton renderer with EffectComposer + UnrealBloom (`src/3d/core/SceneManager.ts`) — one renderer, scenes swapped per route, disposed on change.
- **Three working shader backgrounds** already mouse-reactive + scroll-evolving with particle layers and low-end degradation (`src/3d/scenes/SceneHomepage.ts`): molten gold ink, data nebula, fintech grid.
- A global `#canvas-3d` island in `BaseLayout.astro` mounted `client:idle` with WebGL + reduced-motion guards.
- `CustomCursor.astro` (magnetic cursor) and `PageTransition.astro` already prototyped.

**So the work is: elevate → standardize → add true directional parallax → make it persistent across all pages → choreograph content reveals → upgrade assets → harden to the perf budget.** That framing protects the runway: we ship visible polish in days, not weeks.

The one thing Hesam specifically described — *"the background picture moves up / left as I scroll, and reacts to the mouse"* — is a direct, small extension of the existing shaders (add a directional parallax offset uniform) plus an optional Mont-Fort-style image-parallax layer.

---

## 1. Target experience (concrete definition)

A persistent, full-viewport **living WebGL field** behind every main page that:

1. **Drifts up + left and morphs on scroll** — the field's sample coordinates translate (true parallax) *and* the existing `uScroll` evolution intensifies. (Hesam's core ask.)
2. **Pulls toward the cursor** — lerped mouse parallax (already present, we centralize + strengthen).
3. **Changes "look" per page** — each route gets a palette/variant (markets = grid, about = nebula, services = gold ink…), cross-fading on navigation.
4. **Persists across navigation** — no reload flash; the canvas survives page changes via Astro View Transitions + `transition:persist`.
5. **Choreographs content** — GSAP ScrollTrigger reveals, kinetic headings (SplitText), scale-to-fullscreen panels, magnetic cursor.
6. **(Optional, Mont-Fort flavor)** real brand imagery on content sections with depth parallax.

Reference distillation: **Lusion** = abstract WebGL that morphs on scroll + mouse (Awwwards SOTM); **Mont-Fort** = buttery Lenis scroll + image reveals + horizontal sections. We borrow Lusion's field behavior (primary) and Mont-Fort's image-parallax + reveal cadence (accent).

---

## 2. Asset inventory (everything we need)

| # | Asset | Need | Source / How | Status |
|---|-------|------|--------------|--------|
| A | GLSL shader "looks" (per-page palettes) | Core field | Already have 3; extend to parametric set | ✅ exists, extend |
| B | Film-grain / noise overlay PNG | Premium texture over field | Generate (Adobe/Firefly) → Cloudinary, ~30–60KB tileable | ➕ add |
| C | Soft particle sprite | Sparkle layer | Currently procedural in shader — keep | ✅ ok |
| D | Gold gradient ramp (LUT) | Consistent gold tone | Generate small PNG or in-shader constants | optional |
| E | HDRI / env map (.hdr) | Only if we add a reflective 3D focal object | poly haven style, 1–2K, later phase | ⏳ later |
| F | Hero / section imagery (brand) | Mont-Fort image parallax + per-page accents | Curate or generate (on-brand navy/gold, AI/markets/B2B/Belgrade) → **Cloudinary** AVIF/WebP + responsive srcset | ➕ needs Hesam direction |
| G | Self-hosted fonts (woff2) | Perf: kill render-blocking Google Fonts | **Montserrat** (head) + **Inter** (body); **drop Vazirmatn** (English-only now) | ➕ add |
| H | Lucide SVG icons | No-emoji rule (ui-ux-pro-max §4) | lucide.dev, inline SVG | as needed |
| I | Brand logo SVG | Crisp scaling | Have PNGs (`public/assets/logo*`); want SVG | ➕ nice-to-have |
| J | Focal 3D mark (.glb) | Optional hero centerpiece (gold abstract / "ahoosh" mark) | Model later (Blender/Spline) | ⏳ later |

**Asset notes / flags:**
- Fonts today load from `fonts.googleapis.com` (render-blocking → hurts LCP <1s target). Switching to self-hosted woff2 + `font-display:swap` is a quick CWV win and removes the now-pointless Persian font.
- For imagery we already have a **Cloudinary** connector — it becomes our optimize/deliver pipeline (AVIF, responsive, lazy below the fold).

---

## 3. Tooling inventory (roles + decisions)

| Tool | Role | Status / Decision |
|------|------|-------------------|
| **Three.js** | WebGL field, postprocessing (Bloom) | ✅ installed, in use |
| **GSAP** (full) | ScrollTrigger (scrub), SplitText (kinetic type), Flip (shared-element transitions) | ✅ installed (free since 2025) — **primary animation engine** |
| **Lenis** | Smooth scroll feeding ScrollTrigger | ✅ wired. *Pick Lenis as the smoother; do **not** also run GSAP ScrollSmoother — they overlap.* |
| **Motion (motion.dev)** | DOM micro-interactions where its API is cleaner; ~5KB lighter than GSAP per-feature | ➕ **add, scoped only** to small DOM variants; avoid duplicating GSAP. Document bundle cost. |
| **21st.dev** | Borrow animated section patterns (bento, marquee, feature reveals, pricing) | 🔗 **source** — adapt React/Tailwind → Astro + our tokens + a11y |
| **ui-ux-pro-max** (local skill) | Generate design system (color/type/spacing/effects) + pre-delivery a11y/perf checklist | ✅ installed — run its `--design-system` script in Phase 1 |
| **Cloudinary** | Image pipeline (AVIF/WebP, responsive, transforms) | ✅ connector — all imagery flows through it |
| **Figma** | Section mockups / handoff if needed | ✅ connector |
| **Adobe (Firefly/Express)** | Generate + clean background imagery / grain | ✅ connector |
| **Astro View Transitions** (`ClientRouter` + `transition:persist`) | Persist canvas across page nav (lighter than Barba.js) | ➕ enable — key to "all pages, one living field" |

> Codrops shipped a Feb-2026 build on our *exact* stack (Astro + Three + GSAP) — confirms the architecture is current and proven.

---

## 4. Code architecture (reuse + build)

**Reuse as-is:** `SceneManager`, `lenis-setup`, `gsap-config`, `SceneHomepage`, `SceneAbout`, `CustomCursor`, `PageTransition`.

**Build / extend:**

1. `src/3d/core/Parallax.ts` — single source of lerped scroll + mouse + **directional parallax offset (up/left)**; scenes subscribe instead of each adding its own listeners.
2. **Shader extension** — add `uParallax` (translate sample coords up/left by scroll) + per-page palette params.
3. `src/3d/scenes/createFieldScene.ts` — **one parametric scene** taking a per-route config (palette, variant, intensity) instead of N near-duplicate files. Keeps bundle lean.
4. `src/3d/core/PerfGovernor.ts` — DPR cap (≤2), FPS monitor → auto-drop octaves/particles, **pause render when tab hidden or canvas offscreen** (IntersectionObserver), reduced-motion / save-data / coarse-pointer downgrades, **60% mobile particle cut** (locked target).
5. `src/scripts/reveal.ts` — reusable, data-attribute-driven GSAP reveal + SplitText kinetic-type helpers for content sections.
6. **BaseLayout wiring** — canvas gets `transition:persist`; enable `ClientRouter`; central route→scene-config map (remove per-page mount duplication).
7. `src/3d/core/ScenePreloader.ts` — warm shader compile + fade-in to avoid first-paint jank.

---

## 5. Our own prompt library (`docs/prompts/`)

Reusable prompts we author so we can spin new looks/components fast and consistently (later packageable as a Cowork skill):

| File | Generates |
|------|-----------|
| `shader-look.prompt.md` | A new brand-correct GLSL background "look" with an octave/particle budget + mobile fallback |
| `section-reveal.prompt.md` | A GSAP ScrollTrigger reveal/kinetic-type block for a given section's HTML |
| `component-adapt.prompt.md` | Convert a 21st.dev React/Tailwind component → Astro + our tokens + WCAG 2.2 |
| `asset-image.prompt.md` | Text-to-image prompt for on-brand abstract imagery (navy/gold, AI/markets/B2B) + Cloudinary delivery spec |
| `perf-audit.prompt.md` | Audit a new scene/page against the locked perf budget before staging |

---

## 6. Performance & accessibility guardrails (non-negotiable)

Locked budget: **mobile Lighthouse ≥75 · LCP <1s · CLS <0.1 · Three.js `client:idle` · 60% mobile particle reduction.** Plus:

- Canvas is **never** the LCP element — text/content paints first; canvas fades in after `idle`.
- DPR capped at 2; renderer paused offscreen / tab-hidden.
- Single renderer + dispose-on-route (already enforced by SceneManager).
- `prefers-reduced-motion` → field frozen / hidden (already enforced).
- Self-hosted fonts (`font-display:swap`); imagery AVIF + lazy below fold; reserve dimensions (CLS).
- **WCAG 2.2 AA**: contrast over the field (gold/silver on navy already ≥4.5:1 — verify per page), focus rings preserved, keyboard nav intact, no info by motion alone.

---

## 7. Phased rollout (gated: localhost → staging → next)

Every phase ships a **Self-Verifying Deliverable**: build green + before/after screenshots + Lighthouse delta + a11y note. Nothing goes live without QA_Lead sign-off + Hesam approval (and a backup per Rule #1).

| Phase | On localhost | Gate → staging |
|-------|--------------|----------------|
| **0. Analysis** (this doc) | Plan + asset list + design-system run + prompt library | Hesam approves direction |
| **1. Foundation** | `Parallax.ts` + `PerfGovernor.ts` + parametric scene + **true up/left scroll parallax**; verify on homepage; build green; Lighthouse | review on staging |
| **2. Persistence** | Astro `ClientRouter` + `transition:persist`; route→look map; wire about/services/consulting/contact/markets | review on staging |
| **3. Choreography** | `reveal.ts`, SplitText headings, section reveals, magnetic-cursor polish, optional image-parallax accents | review on staging |
| **4. Asset upgrade** | Self-host fonts, grain overlay, per-page imagery via Cloudinary, optional hero GLB/envmap | review on staging |
| **5. Hardening** | Perf pass (mobile LH ≥75, LCP<1s, CLS<0.1) + a11y audit + QA sign-off | **live** w/ Hesam approval |

---

## 8. Open decisions for Hesam

1. **Per-page "look" mapping** — proposed default: home = fintech grid, markets = grid, about = data nebula, services/consulting = molten gold, contact = nebula. OK or adjust?
2. **Imagery** — give a visual direction, or shall I generate on-brand options via the prompt library → Cloudinary for your pick?
3. **Fonts** — confirm dropping Vazirmatn and self-hosting Montserrat + Inter (perf win).
4. **Motion dep** — add it (small bundle cost) for DOM micro-interactions, or stay GSAP-only and keep the bundle lean?

---

*Next action on approval: start Phase 1 on localhost (foundation refactor + true directional parallax), then push to staging for review.*
