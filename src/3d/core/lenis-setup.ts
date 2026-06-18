/**
 * lenis-setup.ts — AHoosh.ai Smooth Scroll Bootstrap
 * Part I §1.2 of AHoosh_3D_Interaction_Spec.docx v1.0 (2026-06-18)
 *
 * Lenis lerp: 0.08 (Apple-like smooth — increase to 0.15 for snappier feel).
 * Wires Lenis scroll events into GSAP's ticker so ScrollTrigger stays in sync.
 *
 * Call initLenis() once after gsap-config.ts is loaded.
 * Returns the Lenis instance so callers can scrollTo / destroy.
 *
 * Note: syncTouch: false on iOS to prevent double-smoothing (§3.2).
 */

import Lenis from '@studio-freight/lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

let _lenis: Lenis | null = null;

export function initLenis(): Lenis {
  if (_lenis) return _lenis; // idempotent

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  _lenis = new Lenis({
    lerp: 0.08,
    smoothWheel: true,
    syncTouch: false,    // iOS: use native momentum, don't double-smooth (§3.2)
    // On iOS Safari we rely on native scroll piped through the scroll event below
  });

  // Wire Lenis scroll → ScrollTrigger.update (§1.2)
  _lenis.on('scroll', ScrollTrigger.update);

  // Wire Lenis raf → gsap.ticker so GSAP drives the loop (§1.2)
  gsap.ticker.add((time) => {
    _lenis!.raf(time * 1000);
  });

  // Disable GSAP's own lag smoothing so it doesn't fight Lenis (§1.2)
  gsap.ticker.lagSmoothing(0);

  return _lenis;
}

/** Get the Lenis instance (null if not yet initialised) */
export function getLenis(): Lenis | null {
  return _lenis;
}

/** Smooth-scroll to a target (element, CSS selector, or Y offset) */
export function lenisScrollTo(
  target: string | HTMLElement | number,
  options?: Parameters<Lenis['scrollTo']>[1]
): void {
  _lenis?.scrollTo(target, options);
}

/** Tear down Lenis — call on full page unload if needed */
export function destroyLenis(): void {
  if (_lenis) {
    _lenis.destroy();
    _lenis = null;
  }
}
