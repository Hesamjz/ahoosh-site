/**
 * PerfGovernor.ts — AHoosh.ai render gating to protect the perf budget.
 *
 * Skips rendering when the tab is hidden or the canvas is scrolled off-screen,
 * so the WebGL field never burns GPU/battery on frames the user can't see.
 * Owned by SceneManager (one renderer → one governor).
 *
 * Phase 5 may extend this with adaptive DPR / FPS-based quality scaling;
 * for now it only answers `shouldRender`.
 */

export class PerfGovernor {
  private _visible = true;
  private _onscreen = true;
  private _io: IntersectionObserver | null = null;

  constructor(canvas: HTMLElement) {
    this._visible = typeof document !== 'undefined' ? !document.hidden : true;
    document.addEventListener('visibilitychange', this._onVisibility);

    if (typeof IntersectionObserver !== 'undefined') {
      this._io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) this._onscreen = e.isIntersecting;
        },
        { threshold: 0 }
      );
      this._io.observe(canvas);
    }
  }

  /** True when it's worth rendering a frame. */
  get shouldRender(): boolean {
    return this._visible && this._onscreen;
  }

  private _onVisibility = (): void => {
    this._visible = !document.hidden;
  };

  dispose(): void {
    document.removeEventListener('visibilitychange', this._onVisibility);
    this._io?.disconnect();
    this._io = null;
  }
}
