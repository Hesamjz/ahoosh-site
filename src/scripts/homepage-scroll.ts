/**
 * homepage-scroll.ts — AHoosh.ai Homepage ScrollTrigger choreography
 * Part II → PAGE 1 (Segments A–G) of AHoosh_3D_Interaction_Spec.docx v1.0.
 *
 * Drives both the DOM and the Three.js controller exposed on
 * SceneManager.getInstance().scene.userData.home (null when WebGL is off — all
 * DOM animations still run). Entrance animations use gsap.from() so the natural
 * (CSS) state is the *visible* end-state: if JS never runs, content is visible.
 *
 * Call initHomepageScroll() once from the homepage island after the scene mounts.
 */

import { gsap, ScrollTrigger, SplitText, prefersReducedMotion } from '../3d/core/gsap-config';
import { SceneManager } from '../3d/core/SceneManager';
import type { HomeController } from '../3d/scenes/SceneHomepage';

function home(): HomeController | null {
  try {
    return (SceneManager.getInstance().scene.userData.home as HomeController) ?? null;
  } catch {
    return null;
  }
}

export function initHomepageScroll(): void {
  // Reduced motion (§1.6): leave the DOM in its natural visible state, do nothing.
  if (prefersReducedMotion) return;

  const h = home();

  // ── SEGMENT A — Hero entrance (on load) ─────────────────────────────────────
  const heroH1 = document.querySelector<HTMLElement>('.hero-h1');
  let heroSplit: SplitText | null = null;
  if (heroH1) heroSplit = new SplitText(heroH1, { type: 'chars' });

  const intro = gsap.timeline({ defaults: { ease: 'power4.out' } });
  intro
    .from('nav, #site-header', { y: -20, opacity: 0, duration: 0.6 }, 0)
    .from('.hero-eyebrow', { y: 30, opacity: 0, duration: 0.6 }, 0)
    .from('.hero-h1', { y: 60, opacity: 0, duration: 0.9 }, 0.15);
  if (heroSplit) {
    intro.from(heroSplit.chars, { y: 40, opacity: 0, duration: 0.7, stagger: 0.025 }, 0.2);
  }
  intro
    .from('.hero-subline', { y: 40, opacity: 0, duration: 0.7 }, 0.5)
    .from('.hero-cta', { scale: 0.85, opacity: 0, duration: 0.5, ease: 'back.out(1.7)' }, 0.8);

  // ── SEGMENT A — scrub-out as the user leaves the hero (10%→15%) ─────────────
  gsap.to('.hero-h1, .hero-subline', {
    opacity: 0,
    scrollTrigger: { trigger: '.s-hero', start: '8% top', end: '20% top', scrub: 1 },
  });
  gsap.to('.hero-cta', {
    opacity: 0,
    y: -20,
    scrollTrigger: { trigger: '.s-hero', start: '10% top', end: '20% top', scrub: 1 },
  });

  // 3D camera + orb tied to the hero scroll-out
  if (h) {
    gsap.to(h.camera.position, {
      z: 7.5,
      scrollTrigger: { trigger: '.s-hero', start: 'top top', end: 'bottom top', scrub: 1.5 },
    });
    gsap.to(h.heroOrb.scale, {
      x: 0, y: 0, z: 0,
      scrollTrigger: { trigger: '.s-services', start: 'top 80%', end: 'top 30%', scrub: 1 },
    });
    gsap.to(h.particleMat.uniforms.uOpacity, {
      value: 0.55,
      scrollTrigger: { trigger: '.s-hero', start: '5% top', end: 'bottom top', scrub: 1.5 },
    });
  }

  // ── SEGMENT B — Services preview (cards enter from right + 3D geos appear) ──
  gsap.from('.services-intro-text', {
    y: 50, opacity: 0, duration: 0.8, ease: 'power4.out',
    scrollTrigger: { trigger: '.s-services', start: 'top 70%' },
  });
  gsap.utils.toArray<HTMLElement>('.service-card').forEach((card, i) => {
    gsap.from(card, {
      x: 60 + i * 20, opacity: 0, duration: 0.7, ease: 'power4.out',
      scrollTrigger: { trigger: '.s-services', start: 'top 60%' },
      delay: i * 0.1,
    });
  });
  if (h) {
    (['strategy', 'digital', 'ai', 'web'] as const).forEach((k, i) => {
      gsap.to(h.serviceGeos[k].scale, {
        x: 1, y: 1, z: 1, duration: 0.9, ease: 'elastic.out(1,0.4)',
        scrollTrigger: { trigger: '.s-services', start: 'top 60%' },
        delay: i * 0.12,
      });
    });
    gsap.fromTo(h.camera.position, { x: 0 },
      { x: -1.2, scrollTrigger: { trigger: '.s-services', start: 'top bottom', end: 'bottom top', scrub: 2, onLeave: () => gsap.to(h.camera.position, { x: 0, duration: 1 }) } });
  }

  // ── SEGMENT C — Founder / philosophy (DNA helix + parallax photo) ──────────
  gsap.from('.founder-statement', {
    y: 60, opacity: 0, duration: 0.9, ease: 'power4.out',
    scrollTrigger: { trigger: '.s-founder', start: 'top 70%' },
  });
  gsap.from('.founder-photo', {
    scale: 0.92, opacity: 0, duration: 1, ease: 'circ.out',
    scrollTrigger: { trigger: '.s-founder', start: 'top 65%' },
  });
  gsap.to('.founder-photo', {
    y: -40,
    scrollTrigger: { trigger: '.s-founder', start: 'top bottom', end: 'bottom top', scrub: 2 },
  });
  const quote = document.querySelector<HTMLElement>('.quote-text');
  if (quote) {
    const qs = new SplitText(quote, { type: 'words' });
    gsap.from(qs.words, {
      y: 25, opacity: 0, duration: 0.6, ease: 'power4.out', stagger: 0.04,
      scrollTrigger: { trigger: quote, start: 'top 75%' },
    });
  }
  gsap.from('.founder-credentials', {
    x: 40, opacity: 0, duration: 0.7, ease: 'power4.out',
    scrollTrigger: { trigger: '.founder-credentials', start: 'top 80%' },
  });
  if (h) {
    gsap.fromTo(h.dnaHelix.scale, { x: 0, y: 0, z: 0 },
      { x: 1, y: 1, z: 1, duration: 1.2, ease: 'power4.out',
        scrollTrigger: { trigger: '.s-founder', start: 'top 70%' } });
    gsap.to(h.camera.position, {
      z: 9, scrollTrigger: { trigger: '.s-founder', start: 'top bottom', end: 'top top', scrub: 2 },
    });
  }

  // ── SEGMENT D — PINNED service showcase (cards highlight in sequence) ───────
  const showcase = document.querySelector<HTMLElement>('.services-showcase');
  if (showcase) {
    const order = ['strategy', 'digital', 'ai', 'web'] as const;
    const tl = gsap.timeline({
      scrollTrigger: { trigger: showcase, start: 'top top', end: '+=2400', pin: true, scrub: 1 },
    });
    if (h) tl.to(h.camera.position, { z: 6, y: 0.8, duration: 1 }, 0);
    order.forEach((k, i) => {
      const card = showcase.querySelector<HTMLElement>(`.svc-card--${k}`);
      const at = i;
      if (card) {
        tl.to(card, { scale: 1.04, zIndex: 10, duration: 0.4 }, at);
        tl.to(showcase.querySelectorAll(`.svc-card:not(.svc-card--${k})`), { opacity: 0.5, duration: 0.4 }, at);
        if (i > 0) {
          const prev = showcase.querySelector<HTMLElement>(`.svc-card--${order[i - 1]}`);
          if (prev) tl.to(prev, { scale: 1, duration: 0.4 }, at);
        }
      }
      if (h) tl.fromTo(h.serviceGeos[k].material as any,
        { emissiveIntensity: 0.2 }, { emissiveIntensity: 1.2, duration: 0.5 }, at);
    });
    if (h) tl.to([h.serviceGeos.strategy.scale, h.serviceGeos.digital.scale, h.serviceGeos.ai.scale, h.serviceGeos.web.scale],
      { x: 0, y: 0, z: 0, duration: 0.5 }, order.length);
  }

  // ── SEGMENT E — Stats / social proof (counters + constellation) ────────────
  gsap.utils.toArray<HTMLElement>('[data-counter]').forEach((el, i) => {
    const target = parseFloat(el.dataset.counter || '0');
    const suffix = el.dataset.suffix || '';
    const obj = { v: 0 };
    gsap.to(obj, {
      v: target, duration: 1.2, ease: 'power4.out', delay: i * 0.15,
      snap: { v: 1 },
      scrollTrigger: { trigger: '.s-stats', start: 'top 70%' },
      onUpdate: () => { el.textContent = Math.round(obj.v).toLocaleString() + suffix; },
    });
  });
  gsap.from('.testimonial-card', {
    y: 40, opacity: 0, duration: 0.8, ease: 'power4.out',
    scrollTrigger: { trigger: '.s-stats', start: 'top 60%' },
  });
  gsap.from('.logo-strip .logo', {
    y: 20, opacity: 0, duration: 0.6, ease: 'power4.out', stagger: 0.08,
    scrollTrigger: { trigger: '.logo-strip', start: 'top 85%' },
  });
  if (h) {
    gsap.to(h.constellation.mat, {
      opacity: 0.6,
      scrollTrigger: { trigger: '.s-stats', start: 'top 80%' },
    });
    gsap.fromTo(h.constellation.lines.scale, { x: 0.001, y: 0.001, z: 0.001 },
      { x: 1, y: 1, z: 1, scrollTrigger: { trigger: '.s-stats', start: 'top 80%', end: 'bottom center', scrub: 2 } });
    gsap.to(h.camera.position, {
      z: 8, scrollTrigger: { trigger: '.s-stats', start: 'top center', end: 'bottom top', scrub: 2 },
    });
  }

  // ── SEGMENT F — Final CTA (glow ring + particle energy) ─────────────────────
  gsap.from('.cta-eyebrow', {
    y: 30, opacity: 0, duration: 0.6, ease: 'power4.out',
    scrollTrigger: { trigger: '.s-cta', start: 'top 70%' },
  });
  const ctaH2 = document.querySelector<HTMLElement>('.cta-h2');
  if (ctaH2) {
    const cs = new SplitText(ctaH2, { type: 'chars' });
    gsap.from(cs.chars, {
      y: 30, opacity: 0, duration: 0.7, ease: 'power4.out', stagger: 0.02,
      scrollTrigger: { trigger: '.s-cta', start: 'top 65%' },
    });
  }
  gsap.from('.cta-btn-primary', {
    scale: 0.8, opacity: 0, duration: 0.5, ease: 'back.out(1.7)',
    scrollTrigger: { trigger: '.s-cta', start: 'top 60%' },
  });
  gsap.from('.cta-btn-secondary', {
    opacity: 0, duration: 0.4, ease: 'power2.out',
    scrollTrigger: { trigger: '.s-cta', start: 'top 55%' },
  });
  if (h) {
    gsap.fromTo(h.glowRing.scale, { x: 0, y: 0, z: 0 },
      { x: 1.2, y: 1.2, z: 1.2, duration: 1.2, ease: 'elastic.out(1,0.4)',
        scrollTrigger: { trigger: '.s-cta', start: 'top 60%' } });
    gsap.to(h.glowRing.material as any, {
      opacity: 1, scrollTrigger: { trigger: '.s-cta', start: 'top 60%' },
    });
    gsap.to(h.particleMat.uniforms.uSize, {
      value: 0.035, scrollTrigger: { trigger: '.s-cta', start: 'top 80%', end: 'bottom bottom', scrub: 2 },
    });
  }

  // ── SEGMENT G — Footer ──────────────────────────────────────────────────────
  gsap.from('footer .footer-col, footer .footer-logo, footer .footer-nav a, footer .social-icon', {
    y: 20, opacity: 0, duration: 0.5, ease: 'power4.out', stagger: 0.06,
    scrollTrigger: { trigger: 'footer', start: 'top 90%' },
  });

  // ── Hover states (§Homepage — Hover States) ────────────────────────────────
  document.querySelectorAll<HTMLElement>('.service-card').forEach((card) => {
    const arrow = card.querySelector<HTMLElement>('.arrow');
    card.addEventListener('mouseenter', () => {
      gsap.to(card, { scale: 1.03, duration: 0.4, ease: 'power2.out' });
      if (arrow) gsap.to(arrow, { x: 8, opacity: 1, duration: 0.3 });
    });
    card.addEventListener('mouseleave', () => {
      gsap.to(card, { scale: 1, duration: 0.4, ease: 'power2.out' });
      if (arrow) gsap.to(arrow, { x: 0, opacity: 0.6, duration: 0.3 });
    });
  });
  const founderPhoto = document.querySelector<HTMLElement>('.founder-photo');
  if (founderPhoto && h) {
    founderPhoto.addEventListener('mouseenter', () => { h.helixSpeed = 2; });
    founderPhoto.addEventListener('mouseleave', () => { h.helixSpeed = 1; });
  }

  ScrollTrigger.refresh();
}
