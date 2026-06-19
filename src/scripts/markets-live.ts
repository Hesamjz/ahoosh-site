/**
 * markets-live.ts — live market tiles for the homepage Markets stage.
 * Fetches real prices from ahoosh.ai/api/markets/latest, renders big "on-screen"
 * tiles, and polls every 30s so the numbers stay alive (with a flash on change).
 */

const ENDPOINT = 'https://ahoosh.ai/api/markets/latest';
// Preferred display order; falls back to whatever the API returns.
const WANT = ['EUR/USD', 'USD/RSD', 'XAU/USD', 'BTC/USD', 'USD/IRR', 'EUR/IRR', 'ETH/USD', 'GBP/USD'];

interface Asset { value: number; change?: number; fresh?: boolean; as_of?: string }

function fmt(v: number): string {
  if (!isFinite(v)) return '—';
  if (v >= 1000) return Math.round(v).toLocaleString('en-US');
  if (v >= 10) return v.toFixed(2);
  return v.toFixed(4);
}

function tile(sym: string, a: Asset, prev?: number): string {
  const ch = a.change ?? 0;
  const dir = ch > 0 ? 'up' : ch < 0 ? 'down' : 'flat';
  const chTxt = ch ? `${ch > 0 ? '+' : ''}${ch.toFixed(2)}%` : 'live';
  const flash = prev !== undefined && prev !== a.value ? (a.value > prev ? 'flash-up' : 'flash-down') : '';
  return `
    <div class="mkt-tile ${flash}">
      <div class="mkt-sym">${sym}${a.fresh ? '<span class="mkt-dot"></span>' : ''}</div>
      <div class="mkt-val">${fmt(a.value)}</div>
      <div class="mkt-ch mkt-${dir}">${chTxt}</div>
    </div>`;
}

export function initMarketsLive(): void {
  const el = document.getElementById('mkt-live');
  if (!el) return;
  const prevValues = new Map<string, number>();

  async function load() {
    try {
      const res = await fetch(ENDPOINT, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const assets: Record<string, Asset> = data.assets || {};
      const keys = WANT.filter((k) => assets[k]);
      const list = (keys.length ? keys : Object.keys(assets)).slice(0, 6);
      if (!list.length) return;
      el!.innerHTML = list.map((k) => tile(k, assets[k]!, prevValues.get(k))).join('');
      list.forEach((k) => prevValues.set(k, assets[k]!.value));
    } catch {
      /* keep last render */
    }
  }

  load();
  const timer = setInterval(load, 30000);
  window.addEventListener('beforeunload', () => clearInterval(timer));
}
