/**
 * gsap-config.ts — AHoosh.ai GSAP Global Configuration
 * Part I §1.2 + §1.6 of AHoosh_3D_Interaction_Spec.docx v1.0 (2026-06-18)
 *
 * Registers plugins, sets global defaults, and applies the reduced-motion
 * policy from §1.6 (globalTimeline.timeScale = 0 when prefers-reduced-motion).
 *
 * Import this module ONCE — in BaseLayout.astro's client script — before any
 * page-level animation code runs.
 */

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollSmoother } from 'gsap/ScrollSmoother';
import { SplitText } from 'gsap/SplitText';

// ── Plugin registration (§1.2) ────────────────────────────────────────────

gsap.registerPlugin(ScrollTrigger, ScrollSmoother, SplitText);

// ── Global config (§1.2) ──────────────────────────────────────────────────

gsap.config({
  nullTargetWarn: false,
  trialWarn: false,
});

// ── Reduced-motion policy (§1.6) ─────────────────────────────────────────

const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Set globalTimeline timeScale to 0 when reduced-motion is active (§1.6).
 * Three.js side is handled separately in SceneManager.disableScrollAnimation().
 */
gsap.globalTimeline.timeScale(prefersReducedMotion ? 0 : 1);

// Re-check on system preference change (user may toggle mid-session)
if (typeof window !== 'undefined') {
  window
    .matchMedia('(prefers-reduced-motion: reduce)')
    .addEventListener('change', (e) => {
      gsap.globalTimeline.timeScale(e.matches ? 0 : 1);
    });
}

// ── ScrollTrigger refresh hooks (§6.2) ────────────────────────────────────

if (typeof document !== 'undefined') {
  // Refresh after all fonts are loaded
  document.fonts.ready.then(() => ScrollTrigger.refresh());

  // Refresh on resize — debounced 150ms
  let _resizeTimer: ReturnType<typeof setTimeout>;
  window.addEventListener('resize', () => {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => ScrollTrigger.refresh(), 150);
  });
}

// ── Exports ───────────────────────────────────────────────────────────────

export { gsap, ScrollTrigger, ScrollSmoother, SplitText };
export { prefersReducedMotion };

/**
 * killPageTriggers — call before Astro view-transition navigation to clean
 * up all ScrollTrigger instances on the outgoing page (§6.2).
 */
export function killPageTriggers(): void {
  ScrollTrigger.getAll().forEach((t) => t.kill());
}
