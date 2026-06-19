/**
 * markets-live.ts — the homepage Markets *visual* (not a numbers box).
 *
 * Renders a full-width flowing market line on a canvas (continuous live motion,
 * gold stroke + gradient fill, integrated over the background — no card), plus a
 * row of plain live tickers (asset · value · change) pulled from the real
 * /api/markets/latest and polled. The line's drift is nudged by the live values;
 * the numbers are real.
 */

const ENDPOINT = 'https://ahoosh.ai/api/markets/latest';
const WANT = ['EUR/USD', 'XAU/USD', 'BTC/USD', 'USD/RSD', 'USD/IRR', 'ETH/USD'];

interface Asset { value: number; change?: number; fresh?: boolean }

function fmt(v: number): string {
  if (!isFinite(v)) return '—';
  if (v >= 1000) return Math.round(v).toLocaleString('en-US');
  if (v >= 10) return v.toFixed(2);
  return v.toFixed(4);
}

export function initMarketsLive(): void {
  const tickersEl = document.getElementById('mkt-tickers');
  const canvas = document.getElementById('mkt-chart') as HTMLCanvasElement | null;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── Flowing market line (canvas) ─────────────────────────────────────────────
  if (canvas) {
    const ctx = canvas.getContext('2d')!;
    let raf = 0, t = 0, level = 0.5, target = 0.5;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 2);
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      raf = requestAnimationFrame(draw);
      t += 0.012;
      level += (target - level) * 0.02;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      const pts: [number, number][] = [];
      const N = 80;
      for (let i = 0; i <= N; i++) {
        const x = (i / N) * w;
        const base = level * h;
        const y =
          base +
          Math.sin(i * 0.18 + t) * h * 0.10 +
          Math.sin(i * 0.07 - t * 1.4) * h * 0.16 +
          Math.sin(i * 0.31 + t * 0.6) * h * 0.05;
        pts.push([x, h - y]);
      }
      // gradient fill under the line
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, 'rgba(224,169,63,0.22)');
      grad.addColorStop(1, 'rgba(224,169,63,0)');
      ctx.beginPath();
      ctx.moveTo(0, h);
      pts.forEach(([x, y]) => ctx.lineTo(x, y));
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      // the line
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.strokeStyle = 'rgba(240,190,90,0.9)';
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(224,169,63,0.6)';
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.shadowBlur = 0;
      // leading dot
      const [lx, ly] = pts[pts.length - 1]!;
      ctx.beginPath();
      ctx.arc(lx, ly, 4, 0, 6.28);
      ctx.fillStyle = '#f0be5a';
      ctx.fill();
    };
    if (!reduced) draw();
    else { resize(); /* static frame */ t = 1; }
    window.addEventListener('beforeunload', () => cancelAnimationFrame(raf));

    // nudge the line level from a live value so motion tracks reality a bit
    (window as any).__mktNudge = (v: number) => { target = 0.35 + (v % 1) * 0.3; };
  }

  // ── Live tickers (real numbers, no box) ──────────────────────────────────────
  if (tickersEl) {
    const prev = new Map<string, number>();
    const load = async () => {
      try {
        const res = await fetch(ENDPOINT, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const assets: Record<string, Asset> = data.assets || {};
        const keys = WANT.filter((k) => assets[k]);
        const list = (keys.length ? keys : Object.keys(assets)).slice(0, 5);
        if (!list.length) return;
        tickersEl.innerHTML = list
          .map((k) => {
            const a = assets[k]!;
            const ch = a.change ?? 0;
            const dir = ch > 0 ? 'mkt-up' : ch < 0 ? 'mkt-down' : 'mkt-flat';
            const arrow = ch > 0 ? '▲' : ch < 0 ? '▼' : '•';
            const moved = prev.has(k) && prev.get(k) !== a.value ? 'mkt-moved' : '';
            return `<div class="mkt-ticker ${moved}"><span class="mkt-sym">${k}</span><span class="mkt-val">${fmt(a.value)}</span><span class="mkt-ch ${dir}">${arrow} ${ch ? Math.abs(ch).toFixed(2) + '%' : 'live'}</span></div>`;
          })
          .join('');
        list.forEach((k) => prev.set(k, assets[k]!.value));
        const lead = assets[list[0]!];
        if (lead && (window as any).__mktNudge) (window as any).__mktNudge(lead.value);
      } catch { /* keep */ }
    };
    load();
    const timer = setInterval(load, 20000);
    window.addEventListener('beforeunload', () => clearInterval(timer));
  }
}
