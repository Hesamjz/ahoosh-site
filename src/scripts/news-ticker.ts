/**
 * news-ticker.ts — live headlines sliding right→left (Phase 2).
 *
 * Pulls the latest real headlines from /api/news (in the page's locale), renders
 * them in a seamless marquee that scrolls right→left, pauses on hover, and
 * refreshes every 2 min. Honours reduced-motion (no auto-scroll then).
 */

import { gsap, prefersReducedMotion } from '../3d/core/gsap-config';

const ENDPOINT = 'https://ahoosh.ai/api/news';

let tween: gsap.core.Tween | null = null;

function esc(s: string): string {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function startMarquee(track: HTMLElement): void {
  if (prefersReducedMotion) return;
  if (tween) tween.kill();
  gsap.set(track, { x: 0 });
  const half = track.scrollWidth / 2;
  if (half <= 0) return;
  tween = gsap.to(track, { x: -half, duration: half / 60, ease: 'none', repeat: -1 });
  const vp = track.parentElement;
  if (vp && !vp.dataset.hoverWired) {
    vp.dataset.hoverWired = '1';
    vp.addEventListener('mouseenter', () => tween?.pause());
    vp.addEventListener('mouseleave', () => tween?.resume());
  }
}

export function initNewsTicker(): void {
  const track = document.getElementById('news-track');
  if (!track) return;
  const lang = document.documentElement.lang || 'en';

  const load = async () => {
    try {
      const res = await fetch(`${ENDPOINT}?lang=${encodeURIComponent(lang)}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const items = (data.articles || []).slice(0, 10);
      if (!items.length) return;
      const one = items
        .map((a: any) => {
          const href = a.link || '/news';
          return `<a class="news-item" href="${esc(href)}" target="_blank" rel="noopener">
            <span class="news-src">${esc(a.source || 'News')}</span>
            <span class="news-ttl">${esc(a.title || '')}</span>
          </a>`;
        })
        .join('<span class="news-dot">◆</span>');
      // duplicate the run so the loop is seamless
      track.innerHTML = one + '<span class="news-dot">◆</span>' + one;
      startMarquee(track);
    } catch {
      /* keep last */
    }
  };

  load();
  const timer = setInterval(load, 120000);
  window.addEventListener('beforeunload', () => clearInterval(timer));
}
