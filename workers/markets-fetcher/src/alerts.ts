import type { Env } from "./store";

// Telegram nudge when sources cross the consecutive-failure threshold.
// Uses the existing AHoosh bot (TELEGRAM_BOT_TOKEN + TELEGRAM_HESAM_CHAT_ID as
// Worker secrets). If the secrets aren't set, this no-ops with a console line so
// a missing secret never crashes the cron.
export async function alertFailures(env: Env, assets: string[]): Promise<void> {
  if (!assets.length) return;
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_HESAM_CHAT_ID) {
    console.warn(`[markets-fetcher] would alert (no TG secret): ${assets.join(", ")}`);
    return;
  }
  const text =
    `⚠️ markets-fetcher: source down >3 cycles\n` +
    assets.map((a) => `• ${a}`).join("\n") +
    `\n(No source substitution — per sources_of_truth_v2 rule 8. Verify the endpoint.)`;
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_HESAM_CHAT_ID,
        text,
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) console.error(`[markets-fetcher] TG alert HTTP ${res.status}`);
  } catch (e) {
    console.error(`[markets-fetcher] TG alert error`, e);
  }
}
