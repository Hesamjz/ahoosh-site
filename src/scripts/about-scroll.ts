/**
 * about-scroll.ts — AHoosh.ai About page ScrollTrigger choreography
 * Part II → PAGE 2 (Segments A–D) of AHoosh_3D_Interaction_Spec.docx v1.0.
 *
 * Drives the DOM + the Three.js controller on scene.userData.about. Entrance
 * animations use gsap.from() so the natural CSS state stays visible without JS.
 * Highlight: a horizontal PINNED career timeline (500vw track), RTL-aware.
 */

import { gsap, ScrollTrigger, SplitText, prefersReducedMotion } from '../3d/core/gsap-config';
import { SceneManager } from '../3d/core/SceneManager';
import type { AboutController } from '../3d/scenes/SceneAbout';

function about(): AboutController | null {
  try {
    return (SceneManager.getInstance().scene.userData.about as AboutController) ?? null;
  } catch {
    return null;
  }
}

export function initAboutScroll(): void {
  if (prefersReducedMotion) return;
  const a = about();

  // ── SEGMENT A — Hero portrait ───────────────────────────────────────────────
  const name = document.querySelector<HTMLElement>('.about-hero-name');
  const tl = gsap.timeline({ defaults: { ease: 'power4.out' } });
  if (name) {
    const split = new SplitText(name, { type: 'chars' });
    tl.from(name, { y: 80, opacity: 0, duration: 1 }, 0);
    tl.from(split.chars, { opacity: 0, duration: 0.8, stagger: 0.03 }, 0);
  }
  tl.from('.about-role-tag', { scale: 0.8, opacity: 0, duration: 0.6, ease: 'back.out(1.5)' }, 0.5);
  tl.from('.hero-portrait', { scale: 0.95, opacity: 0, duration: 1, ease: 'circ.out', clipPath: 'circle(0%)' }, 0.3);
  tl.from('.hero-intro-text', { y: 40, opacity: 0, duration: 0.7 }, 0.6);

  // Parallax + name fade-out on scroll
  gsap.to('.hero-portrait', {
    y: -50, scrollTrigger: { trigger: '.s-about-hero', start: 'top top', end: 'bottom top', scrub: 1.5 },
  });
  gsap.to('.about-hero-name', {
    opacity: 0, scrollTrigger: { trigger: '.s-about-hero', start: '12% top', end: '22% top', scrub: 1 },
  });

  if (a) {
    gsap.to(a.shards.position, {
      y: -30 / 50, scrollTrigger: { trigger: '.s-about-hero', start: 'top top', end: 'bottom top', scrub: 2 },
    });
    gsap.to(a.camera.position, {
      z: 5, scrollTrigger: { trigger: '.timeline-wrapper', start: 'top bottom', end: 'top top', scrub: 2 },
    });
  }

  // ── SEGMENT B — Horizontal PINNED career timeline ───────────────────────────
  const wrapper = document.querySelector<HTMLElement>('.timeline-wrapper');
  const track = document.querySelector<HTMLElement>('.timeline-track');
  if (wrapper && track) {
    const isRTL =
      document.documentElement.dir === 'rtl' ||
      ['fa', 'ar'].includes(document.documentElement.lang);
    const stops = track.querySelectorAll('.timeline-stop').length;
    const distance = Math.max(0, stops - 1) * 100; // vw per stop
    const hTween = gsap.to(track, {
      x: () => (isRTL ? `${distance}vw` : `-${distance}vw`),
      ease: 'none',
      scrollTrigger: { trigger: wrapper, pin: true, scrub: 1, end: '+=400%', invalidateOnRefresh: true },
    });

    // Each stop reveals its content as it scrolls into the horizontal viewport.
    gsap.utils.toArray<HTMLElement>('.timeline-stop').forEach((stop) => {
      gsap.from(stop.querySelectorAll('.timeline-date, .timeline-title, .timeline-body'), {
        opacity: 0, y: 20, duration: 0.6, ease: 'power4.out', stagger: 0.1,
        scrollTrigger: { trigger: stop, containerAnimation: hTween, start: 'left 70%' },
      });
    });
  }

  // ── SEGMENT C — Values + working style ──────────────────────────────────────
  gsap.from('.values-eyebrow', {
    y: 20, opacity: 0, duration: 0.5, ease: 'power4.out',
    scrollTrigger: { trigger: '.s-values', start: 'top 75%' },
  });
  gsap.from('.values-heading', {
    y: 40, opacity: 0, duration: 0.7, ease: 'power4.out',
    scrollTrigger: { trigger: '.s-values', start: 'top 72%' },
  });
  gsap.from('.value-item', {
    y: 40, opacity: 0, duration: 0.6, ease: 'power4.out', stagger: 0.15,
    scrollTrigger: { trigger: '.s-values', start: 'top 65%' },
  });
  gsap.from('.working-style-section', {
    y: 50, opacity: 0, duration: 0.8, ease: 'power4.out',
    scrollTrigger: { trigger: '.working-style-section', start: 'top 80%' },
  });
  if (a) {
    gsap.to(a.auroraMat.uniforms.uHue, {
      value: 0.35, // blue → warm gold
      scrollTrigger: { trigger: '.s-values', start: 'top center', end: 'bottom center', scrub: 3 },
    });
  }

  // ── SEGMENT D — CTA ──────────────────────────────────────────────────────────
  gsap.from('.about-cta-text', {
    y: 50, opacity: 0, duration: 0.8, ease: 'power4.out',
    scrollTrigger: { trigger: '.s-about-cta', start: 'top 75%' },
  });
  gsap.from('.contact-btn', {
    scale: 0.85, opacity: 0, duration: 0.6, ease: 'back.out(1.7)',
    scrollTrigger: { trigger: '.s-about-cta', start: 'top 70%' },
  });
  gsap.from('.download-cv', {
    opacity: 0, duration: 0.5, ease: 'power2.out',
    scrollTrigger: { trigger: '.s-about-cta', start: 'top 65%' },
  });

  // ── Hover states ─────────────────────────────────────────────────────────────
  const portrait = document.querySelector<HTMLElement>('.hero-portrait');
  if (portrait && a) {
    portrait.addEventListener('mouseenter', () => { a.shardSpeed = 3; gsap.to(portrait, { scale: 1.01, duration: 0.3 }); });
    portrait.addEventListener('mouseleave', () => { a.shardSpeed = 1; gsap.to(portrait, { scale: 1, duration: 0.3 }); });
  }
  document.querySelectorAll<HTMLElement>('.value-item').forEach((item) => {
    item.addEventListener('mouseenter', () => gsap.to(item, { scale: 1.02, backgroundColor: 'rgba(215,161,61,0.08)', duration: 0.3 }));
    item.addEventListener('mouseleave', () => gsap.to(item, { scale: 1, backgroundColor: 'rgba(255,255,255,0.04)', duration: 0.3 }));
  });

  ScrollTrigger.refresh();
}
