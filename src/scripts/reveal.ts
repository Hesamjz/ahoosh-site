/**
 * reveal.ts — AHoosh.ai reusable scroll choreography (GSAP, no framer-motion).
 *
 * Ports two 21st.dev patterns into our stack:
 *   - [data-reveal]       fade + slide-up on enter (staggered via data-reveal-delay)
 *   - [data-tilt-reveal]  ContainerScroll port — element rotates from tilted → flat,
 *                         scales up and lifts as it scrolls through view (scrubbed)
 *
 * Both respect prefers-reduced-motion (content shown immediately, no motion).
 * Driven by ScrollTrigger, which is already synced to Lenis in gsap-config.
 *
 * Usage in a page script: import { initReveals } from '../scripts/reveal'; initReveals();
 * Then tag markup: <section data-reveal> … </section>  /  <div data-tilt-reveal> … </div>
 */

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function initReveals(root: ParentNode = document): void {
  if (typeof window === 'undefined') return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    root.querySelectorAll<HTMLElement>('[data-reveal],[data-tilt-reveal]').forEach((el) => {
      el.style.opacity = '1';
      el.style.transform = 'none';
    });
    return;
  }

  // ── fade + slide-up ───────────────────────────────────────────────────────
  root.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
    const delay = parseFloat(el.dataset.revealDelay ?? '0');
    gsap.fromTo(
      el,
      { autoAlpha: 0, y: 40 },
      {
        autoAlpha: 1,
        y: 0,
        duration: 0.9,
        ease: 'power3.out',
        delay,
        scrollTrigger: { trigger: el, start: 'top 85%', toggleActions: 'play none none none' },
      }
    );
  });

  // ── tilt-reveal (ContainerScroll port) ────────────────────────────────────
  root.querySelectorAll<HTMLElement>('[data-tilt-reveal]').forEach((el) => {
    el.style.transformPerspective = '1000px';
    el.style.transformStyle = 'preserve-3d';
    gsap.fromTo(
      el,
      { rotateX: 18, scale: 0.94, y: 60, transformOrigin: '50% 0%' },
      {
        rotateX: 0,
        scale: 1,
        y: 0,
        ease: 'none',
        scrollTrigger: { trigger: el, start: 'top 90%', end: 'top 35%', scrub: true },
      }
    );
  });
}
