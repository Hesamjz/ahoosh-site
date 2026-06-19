/**
 * homepage-scroll.ts — AHoosh.ai landing scroll motion (living-stages redesign)
 *
 * mont-fort/capital feel: the particle field is one continuous background; content
 * "stages" sit over it (transparent) and play REAL content as you scroll:
 *   - Articles stage: latest posts cross-fade one→next while the stage is sticky.
 *     (Cross-fade is a CSS transition toggled by an .active class — cheap + smooth,
 *      no per-frame tweening, so there's no "stop/jump".)
 *   - Markets stage: live tiles (filled by markets-live.ts) reveal and keep ticking.
 * Hero entrance + card reveals as before. Pointer magnetism lives in interactions.ts.
 */

import { gsap, ScrollTrigger, SplitText, prefersReducedMotion } from '../3d/core/gsap-config';

export function initHomepageScroll(): void {
  if (prefersReducedMotion) {
    // Make sure article slides are all visible if motion is off.
    document.querySelectorAll('.article-slide').forEach((s) => s.classList.add('active'));
    return;
  }

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

  // ── Fade-up reveals (batched) ───────────────────────────────────────────────
  ScrollTrigger.batch('.reveal', {
    start: 'top 85%',
    onEnter: (els) => gsap.from(els, { y: 40, opacity: 0, duration: 0.7, ease: 'power3.out', stagger: 0.08, overwrite: true }),
  });
  ScrollTrigger.batch('.fn-card', {
    start: 'top 82%',
    onEnter: (els) => gsap.from(els, { y: 50, opacity: 0, scale: 0.96, duration: 0.6, ease: 'power3.out', stagger: 0.09, overwrite: true }),
  });

  // ── Articles stage — cross-fade through real posts while sticky ─────────────
  const artStage = document.querySelector<HTMLElement>('.stage-articles');
  if (artStage) {
    const slides = gsap.utils.toArray<HTMLElement>('.article-slide', artStage);
    const dots = gsap.utils.toArray<HTMLElement>('.stage-dot', artStage);
    const n = slides.length;
    if (n) {
      let current = -1;
      const setActive = (idx: number) => {
        if (idx === current) return;
        current = idx;
        slides.forEach((s, i) => s.classList.toggle('active', i === idx));
        dots.forEach((d, i) => d.classList.toggle('on', i === idx));
      };
      setActive(0);
      ScrollTrigger.create({
        trigger: artStage,
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: (self) => setActive(Math.min(n - 1, Math.floor(self.progress * n * 0.999))),
      });
      // Eyebrow fades in once
      gsap.from(artStage.querySelector('.stage-eyebrow'), {
        y: 20, opacity: 0, duration: 0.6, ease: 'power3.out',
        scrollTrigger: { trigger: artStage, start: 'top 70%' },
      });
    }
  }

  // ── Markets stage — reveal; markets-live.ts keeps the numbers ticking ───────
  const mktStage = document.querySelector<HTMLElement>('.stage-markets');
  if (mktStage) {
    gsap.from(mktStage.querySelectorAll('.stage-eyebrow, .stage-heading, .stage-cta'), {
      y: 30, opacity: 0, duration: 0.7, ease: 'power3.out', stagger: 0.12,
      scrollTrigger: { trigger: mktStage, start: 'top 60%' },
    });
    ScrollTrigger.batch('#mkt-live .mkt-tile', {
      start: 'top 85%',
      onEnter: (els) => gsap.from(els, { y: 30, opacity: 0, scale: 0.95, duration: 0.6, ease: 'power3.out', stagger: 0.06, overwrite: true }),
    });
  }

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
