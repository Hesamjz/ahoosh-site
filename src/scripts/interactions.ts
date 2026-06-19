/**
 * interactions.ts — AHoosh.ai pointer interactions (Lusion-style feel)
 *
 * - Magnetic elements: anything with [data-magnetic] eases toward the pointer and
 *   springs back on leave (gsap.quickTo, GPU transforms). Strength via the value.
 * - Hover lift + gold glow on the same elements (scale, not translate, so it
 *   composes with the magnetic x/y on one transform).
 * - Mouse parallax: [data-parallax] layers drift opposite the pointer; depth via
 *   data-parallax-depth.
 *
 * Disabled on touch + reduced-motion. Call initInteractions() once per page.
 */

import { gsap, prefersReducedMotion } from '../3d/core/gsap-config';

export function initInteractions(): void {
  if (prefersReducedMotion) return;
  if (window.matchMedia('(pointer: coarse)').matches) return; // touch: no magnetic

  // ── Magnetic + hover ────────────────────────────────────────────────────────
  document.querySelectorAll<HTMLElement>('[data-magnetic]').forEach((el) => {
    const strength = parseFloat(el.dataset.magnetic || '0.35');
    const xTo = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3.out' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3.out' });

    el.addEventListener('mousemove', (e) => {
      const r = el.getBoundingClientRect();
      const mx = e.clientX - (r.left + r.width / 2);
      const my = e.clientY - (r.top + r.height / 2);
      xTo(mx * strength);
      yTo(my * strength);
    });
    el.addEventListener('mouseenter', () => {
      gsap.to(el, { scale: 1.03, duration: 0.4, ease: 'power3.out', boxShadow: '0 28px 70px rgba(224,169,63,0.25)', borderColor: 'rgba(224,169,63,0.6)' });
      (window as any).cursor?.setMode?.('cta');
    });
    el.addEventListener('mouseleave', () => {
      xTo(0); yTo(0);
      gsap.to(el, { scale: 1, duration: 0.6, ease: 'elastic.out(1,0.5)', boxShadow: '0 8px 28px rgba(0,0,0,0.35)', borderColor: 'rgba(224,169,63,0.18)' });
      (window as any).cursor?.setMode?.('default');
    });

    // Inner arrow nudges with the magnet
    const arrow = el.querySelector<HTMLElement>('.arrow');
    if (arrow) {
      el.addEventListener('mouseenter', () => gsap.to(arrow, { x: 8, opacity: 1, duration: 0.3 }));
      el.addEventListener('mouseleave', () => gsap.to(arrow, { x: 0, opacity: 0.7, duration: 0.3 }));
    }
  });

  // ── Mouse parallax ───────────────────────────────────────────────────────────
  const layers = gsap.utils.toArray<HTMLElement>('[data-parallax]');
  if (layers.length) {
    const setters = layers.map((el) => ({
      el,
      depth: parseFloat(el.dataset.parallaxDepth || '20'),
      xTo: gsap.quickTo(el, 'x', { duration: 0.8, ease: 'power3.out' }),
      yTo: gsap.quickTo(el, 'y', { duration: 0.8, ease: 'power3.out' }),
    }));
    window.addEventListener('mousemove', (e) => {
      const nx = e.clientX / window.innerWidth - 0.5;
      const ny = e.clientY / window.innerHeight - 0.5;
      setters.forEach((s) => { s.xTo(-nx * s.depth); s.yTo(-ny * s.depth); });
    }, { passive: true });
  }
}
