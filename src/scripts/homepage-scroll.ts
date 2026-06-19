/**
 * homepage-scroll.ts — AHoosh.ai landing-page motion (REDESIGN 2026-06-19)
 *
 * Smooth, "live" but jank-free: entrance timeline on load, then gentle fade-up
 * reveals as blocks enter the viewport (NO pinning, NO scroll-scrubbed 3D — those
 * caused the scroll "jumpers"). Entrance uses gsap.from() so content stays visible
 * without JS. High-contrast hover lift on the function / teaser cards.
 */

import { gsap, ScrollTrigger, SplitText, prefersReducedMotion } from '../3d/core/gsap-config';

export function initHomepageScroll(): void {
  if (prefersReducedMotion) return;

  // ── Hero entrance (on load) ─────────────────────────────────────────────────
  const heroH1 = document.querySelector<HTMLElement>('.hero-h1');
  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
  tl.from('.hero-eyebrow', { y: 24, opacity: 0, duration: 0.6 }, 0)
    .from('.hero-sphere', { scale: 0.7, opacity: 0, duration: 1.1, ease: 'power2.out' }, 0)
    .from('.hero-h1', { y: 50, opacity: 0, duration: 0.9 }, 0.15);
  if (heroH1) {
    const split = new SplitText(heroH1, { type: 'words,chars' });
    tl.from(split.chars, { y: 30, opacity: 0, duration: 0.6, stagger: 0.018 }, 0.2);
  }
  tl.from('.hero-subline', { y: 30, opacity: 0, duration: 0.7 }, 0.55)
    .from('.hero-cta > *', { y: 20, opacity: 0, duration: 0.5, stagger: 0.1, ease: 'back.out(1.6)' }, 0.75);

  // ── Fade-up reveals for every block (batched, smooth, no pin) ────────────────
  ScrollTrigger.batch('.reveal', {
    start: 'top 85%',
    onEnter: (els) =>
      gsap.from(els, {
        y: 40, opacity: 0, duration: 0.7, ease: 'power3.out', stagger: 0.08, overwrite: true,
      }),
  });

  // Function cards — staggered, slightly springy
  ScrollTrigger.batch('.fn-card', {
    start: 'top 82%',
    onEnter: (els) =>
      gsap.from(els, {
        y: 50, opacity: 0, scale: 0.96, duration: 0.6, ease: 'power3.out', stagger: 0.09, overwrite: true,
      }),
  });

  // ── Hover lift + gold glow on cards (high contrast, "live") ─────────────────
  document.querySelectorAll<HTMLElement>('.fn-card, .teaser-card').forEach((card) => {
    const arrow = card.querySelector<HTMLElement>('.arrow');
    card.addEventListener('mouseenter', () => {
      gsap.to(card, { y: -6, duration: 0.3, ease: 'power2.out', boxShadow: '0 24px 60px rgba(224,169,63,0.22)', borderColor: 'rgba(224,169,63,0.55)' });
      if (arrow) gsap.to(arrow, { x: 6, opacity: 1, duration: 0.25 });
    });
    card.addEventListener('mouseleave', () => {
      gsap.to(card, { y: 0, duration: 0.3, ease: 'power2.out', boxShadow: '0 8px 28px rgba(0,0,0,0.35)', borderColor: 'rgba(224,169,63,0.18)' });
      if (arrow) gsap.to(arrow, { x: 0, opacity: 0.7, duration: 0.25 });
    });
  });

  // CTA headline splittext
  const ctaH2 = document.querySelector<HTMLElement>('.cta-h2');
  if (ctaH2) {
    const cs = new SplitText(ctaH2, { type: 'chars' });
    gsap.from(cs.chars, {
      y: 24, opacity: 0, duration: 0.6, ease: 'power3.out', stagger: 0.02,
      scrollTrigger: { trigger: ctaH2, start: 'top 80%' },
    });
  }

  ScrollTrigger.refresh();
}
