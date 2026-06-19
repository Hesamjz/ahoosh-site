/**
 * homepage-scroll.ts — AHoosh.ai landing scroll motion
 *
 * Smooth, scroll-driven motion (pointer interactions live in interactions.ts):
 *  - Hero entrance timeline (load) with SplitText.
 *  - Fade-up reveals (batched) for content blocks + function cards.
 *  - mont-fort-style "card → fullscreen" panels: a sticky full-bleed media whose
 *    clip-path insets open from a rounded card to fullscreen on scroll (clip-path
 *    is GPU-composited, so it's buttery — no pinning, no layout thrash, no jumps).
 *
 * Entrance uses gsap.from() so content stays visible without JS.
 */

import { gsap, ScrollTrigger, SplitText, prefersReducedMotion } from '../3d/core/gsap-config';

export function initHomepageScroll(): void {
  if (prefersReducedMotion) return;

  // ── Hero entrance ────────────────────────────────────────────────────────────
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

  // ── Fade-up reveals (batched, smooth, no pin) ───────────────────────────────
  ScrollTrigger.batch('.reveal', {
    start: 'top 85%',
    onEnter: (els) => gsap.from(els, { y: 40, opacity: 0, duration: 0.7, ease: 'power3.out', stagger: 0.08, overwrite: true }),
  });
  ScrollTrigger.batch('.fn-card', {
    start: 'top 82%',
    onEnter: (els) => gsap.from(els, { y: 50, opacity: 0, scale: 0.96, duration: 0.6, ease: 'power3.out', stagger: 0.09, overwrite: true }),
  });

  // ── mont-fort: card → fullscreen on scroll (clip-path scrub) ────────────────
  gsap.utils.toArray<HTMLElement>('.fs-panel').forEach((panel) => {
    const media = panel.querySelector<HTMLElement>('.fs-panel-media');
    const content = panel.querySelector<HTMLElement>('.fs-panel-content');
    if (media) {
      // Opens from a centered rounded card to a full-bleed panel as it scrolls up.
      gsap.fromTo(
        media,
        { clipPath: 'inset(14% 16% round 28px)' },
        {
          clipPath: 'inset(0% 0% round 0px)',
          ease: 'none',
          scrollTrigger: { trigger: panel, start: 'top bottom', end: 'top top', scrub: 1 },
        }
      );
      // Subtle media scale for depth ("living in the background")
      gsap.fromTo(
        media,
        { scale: 1.12 },
        { scale: 1, ease: 'none', scrollTrigger: { trigger: panel, start: 'top bottom', end: 'bottom top', scrub: 1.2 } }
      );
    }
    if (content) {
      gsap.from(content.children, {
        y: 40, opacity: 0, duration: 0.8, ease: 'power3.out', stagger: 0.12,
        scrollTrigger: { trigger: panel, start: 'top 55%' },
      });
    }
  });

  // ── CTA headline splittext ──────────────────────────────────────────────────
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
