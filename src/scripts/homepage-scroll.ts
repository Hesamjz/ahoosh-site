/**
 * homepage-scroll.ts — AHoosh.ai landing motion (no-blocks, integrated redesign)
 *
 * Content floats in/out over the living background — no card "blocks":
 *  - Hero entrance (SplitText by WORDS so words never break mid-word).
 *  - Generic float-in: any [data-reveal] eases in from data-from (left/right/up).
 *  - Articles: real hero IMAGES cross-fade one→next while sticky (CSS-transition
 *    class toggle = smooth). Images get a 3D tilt via interactions.ts [data-tilt].
 *  - Markets: heading floats in; markets-live.ts draws the live chart visual.
 */

import { gsap, ScrollTrigger, SplitText, prefersReducedMotion } from '../3d/core/gsap-config';

export function initHomepageScroll(): void {
  if (prefersReducedMotion) {
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
    const split = new SplitText(heroH1, { type: 'words,chars', wordsClass: 'st-word' });
    tl.from(split.chars, { y: 30, opacity: 0, duration: 0.6, stagger: 0.016 }, 0.2);
  }
  tl.from('.hero-subline', { y: 30, opacity: 0, duration: 0.7 }, 0.55)
    .from('.hero-cta > *', { y: 20, opacity: 0, duration: 0.5, stagger: 0.1, ease: 'back.out(1.6)' }, 0.75);

  // ── Generic float-in (no blocks — text/visuals drift in from a side) ────────
  gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((el) => {
    const from = el.dataset.from || 'up';
    const dist = parseFloat(el.dataset.dist || '60');
    const v: gsap.TweenVars = { opacity: 0, duration: 0.9, ease: 'power3.out' };
    if (from === 'left') v.x = -dist;
    else if (from === 'right') v.x = dist;
    else if (from === 'down') v.y = -dist;
    else v.y = dist;
    gsap.from(el, { ...v, scrollTrigger: { trigger: el, start: 'top 85%' } });
  });

  // ── Articles — real hero images cross-fade while sticky ─────────────────────
  const artStage = document.querySelector<HTMLElement>('.stage-articles');
  if (artStage) {
    const slides = gsap.utils.toArray<HTMLElement>('.article-slide', artStage);
    const dots = gsap.utils.toArray<HTMLElement>('.stage-dot', artStage);
    const n = slides.length;
    if (n) {
      let cur = -1;
      const setActive = (idx: number) => {
        if (idx === cur) return;
        cur = idx;
        slides.forEach((s, i) => s.classList.toggle('active', i === idx));
        dots.forEach((d, i) => d.classList.toggle('on', i === idx));
      };
      setActive(0);
      ScrollTrigger.create({
        trigger: artStage, start: 'top top', end: 'bottom bottom',
        onUpdate: (self) => setActive(Math.min(n - 1, Math.floor(self.progress * n * 0.999))),
      });
    }
  }

  // ── Markets — heading float-in (markets-live.ts handles the live chart) ─────
  const mktStage = document.querySelector<HTMLElement>('.stage-markets');
  if (mktStage) {
    gsap.from(mktStage.querySelectorAll('.stage-eyebrow, .stage-heading'), {
      y: 30, opacity: 0, duration: 0.8, ease: 'power3.out', stagger: 0.12,
      scrollTrigger: { trigger: mktStage, start: 'top 65%' },
    });
  }

  // ── CTA headline splittext ──────────────────────────────────────────────────
  const ctaH2 = document.querySelector<HTMLElement>('.cta-h2');
  if (ctaH2) {
    const cs = new SplitText(ctaH2, { type: 'words,chars', wordsClass: 'st-word' });
    gsap.from(cs.chars, {
      y: 24, opacity: 0, duration: 0.6, ease: 'power3.out', stagger: 0.02,
      scrollTrigger: { trigger: ctaH2, start: 'top 80%' },
    });
  }

  ScrollTrigger.refresh();
}
