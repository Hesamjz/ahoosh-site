/**
 * Parallax.ts — AHoosh.ai centralized scroll + pointer parallax provider.
 *
 * Single source of truth for:
 *   - scroll  : lerped page-scroll progress 0..1
 *   - mouse   : lerped pointer position, ~-1..1, aspect-corrected
 *   - offset  : derived directional drift — the field moves UP + LEFT as you
 *               scroll down (Hesam's core ask), nudged by the pointer.
 *
 * Scenes subscribe by reading these each frame instead of each registering
 * their own scroll/mouse listeners. Idempotent + reduced-motion aware.
 *
 * Usage (inside a SceneFactory):
 *   const para = Parallax.getInstance(); para.start();
 *   // per frame: uMouse <- para.mouse, uScroll <- para.scroll, uParallax <- para.offset
 */

import { gsap } from 'gsap';

type Vec2 = { x: number; y: number };

export class Parallax {
  private static _instance: Parallax | null = null;
  static getInstance(): Parallax {
    return (Parallax._instance ??= new Parallax());
  }

  /** lerped page-scroll progress, 0..1 */
  scroll = 0;
  /** lerped pointer, aspect-corrected, ~-1..1 */
  readonly mouse: Vec2 = { x: 0, y: 0 };
  /** derived shader-space drift — up + left on scroll, pointer-nudged */
  readonly offset: Vec2 = { x: 0, y: 0 };

  // ── tunables ────────────────────────────────────────────────────────────
  private _drift = 0.14;       // total field travel over a full page scroll
  private _mouseDrift = 0.04;  // pointer contribution to the drift
  private _ease = 0.06;        // lerp factor (lower = silkier, more lag)

  private _scrollTarget = 0;
  private readonly _mouseTarget: Vec2 = { x: 0, y: 0 };
  private _started = false;

  private constructor() {}

  start(): void {
    if (this._started) return;
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return; // freeze at zero — no listeners, no ticker
    this._started = true;

    window.addEventListener('scroll', this._onScroll, { passive: true });
    window.addEventListener('mousemove', this._onMouse, { passive: true });
    window.addEventListener('resize', this._onScroll, { passive: true });
    this._onScroll();
    gsap.ticker.add(this._tick);
  }

  stop(): void {
    if (!this._started) return;
    this._started = false;
    window.removeEventListener('scroll', this._onScroll);
    window.removeEventListener('mousemove', this._onMouse);
    window.removeEventListener('resize', this._onScroll);
    gsap.ticker.remove(this._tick);
  }

  private _aspect(): number {
    return window.innerWidth / Math.max(1, window.innerHeight);
  }

  private _onScroll = (): void => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    this._scrollTarget = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
  };

  private _onMouse = (e: MouseEvent): void => {
    this._mouseTarget.x = (e.clientX / window.innerWidth - 0.5) * this._aspect();
    this._mouseTarget.y = -(e.clientY / window.innerHeight - 0.5);
  };

  private _tick = (): void => {
    this.scroll += (this._scrollTarget - this.scroll) * this._ease;
    this.mouse.x += (this._mouseTarget.x - this.mouse.x) * this._ease;
    this.mouse.y += (this._mouseTarget.y - this.mouse.y) * this._ease;
    // left = negative x, up = positive y (in shader sample space)
    this.offset.x = -(this.scroll * this._drift) + this.mouse.x * this._mouseDrift;
    this.offset.y = this.scroll * this._drift + this.mouse.y * this._mouseDrift;
  };
}
