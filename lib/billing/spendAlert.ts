/**
 * lib/billing/spendAlert.ts — tell the owner, by Telegram and/or e-mail, when today's platform spend passes a figure.
 *
 * Phase 8.21. Before this, every budget alert (BillingGuard.checkThresholds) was only returned by an admin GET route:
 * nobody was told unless they opened the page. A Google Cloud budget e-mail arrives hours late.
 *
 *   SPEND_ALERT_USD             the figure, US dollars per UTC day (e.g. 50). Unset = off: nothing is read or sent.
 *   SPEND_ALERT_TELEGRAM_CHAT_ID the chat to message (bot: TELEGRAM_BOT_TOKEN, the one lib/server/telegram already uses).
 *   SPEND_ALERT_EMAIL           the address to e-mail, through Resend (RESEND_API_KEY + SPEND_ALERT_FROM_EMAIL, else
 *                               SUPPORT_FROM_EMAIL). No address is written in code.
 *
 * Steps: one message at the figure, another each time spend passes another multiple of it (50, 100, 150 …), and one when
 * a hard cap refuses a call. Each step is sent once per UTC day (Redis SET NX; this instance's memory without Redis).
 * Sending never throws and never blocks a paid call for long (the caller does not await it on the hot path).
 */
import 'server-only';
import { getRedisClient } from '@/lib/platform/redis';
import { sendTelegramTextMessage } from '@/lib/server/telegram';

type Env = Record<string, string | undefined>;

export function spendAlertUsd(env: Env = process.env): number | null {
  const raw = (env.SPEND_ALERT_USD ?? '').trim();
  const v = Number(raw);
  return raw !== '' && Number.isFinite(v) && v > 0 ? v : null;
}

/** Which alert step `totalUsd` has reached: 0 = below the figure, 1 = the figure, 2 = twice it … */
export function alertStep(totalUsd: number, thresholdUsd: number): number {
  if (!Number.isFinite(totalUsd) || totalUsd < thresholdUsd || thresholdUsd <= 0) return 0;
  return Math.floor(totalUsd / thresholdUsd);
}

export interface AlertChannels {
  telegram: (text: string) => Promise<boolean>;
  email: (subject: string, text: string) => Promise<boolean>;
  /** true the first time `key` is claimed today. */
  once: (key: string) => Promise<boolean>;
}

const mem = new Set<string>();

const liveChannels = (env: Env): AlertChannels => ({
  async telegram(text) {
    const chatId = (env.SPEND_ALERT_TELEGRAM_CHAT_ID ?? '').trim();
    if (!chatId) return false;
    return (await sendTelegramTextMessage({ text, chatId })).ok;
  },
  async email(subject, text) {
    const to = (env.SPEND_ALERT_EMAIL ?? '').trim();
    const key = (env.RESEND_API_KEY ?? '').trim();
    const from = (env.SPEND_ALERT_FROM_EMAIL ?? env.SUPPORT_FROM_EMAIL ?? '').trim();
    if (!to || !key || !from) return false;
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [to], subject, text }),
        signal: AbortSignal.timeout(5_000),
      });
      return res.ok;
    } catch {
      return false;
    }
  },
  async once(key) {
    const r = getRedisClient();
    if (r) {
      try {
        return (await r.set(key, '1', { nx: true, ex: 2 * 86_400 })) === 'OK';
      } catch { /* fall through to memory */ }
    }
    if (mem.has(key)) return false;
    mem.add(key);
    return true;
  },
});

let channelsOverride: AlertChannels | null = null;
/** Test seam. */
export function setSpendAlertChannelsForTests(c: AlertChannels | null): void {
  channelsOverride = c;
}

async function send(c: AlertChannels, subject: string, text: string): Promise<{ telegram: boolean; email: boolean }> {
  const [telegram, email] = await Promise.all([c.telegram(text).catch(() => false), c.email(subject, text).catch(() => false)]);
  if (!telegram && !email) {
    // eslint-disable-next-line no-console
    console.error(`[spend-alert] NOT DELIVERED (no channel configured or both failed): ${subject}`);
  }
  return { telegram, email };
}

/**
 * Today's spend is `totalUsd`: alert once per step past SPEND_ALERT_USD. Returns what was sent, or null when nothing
 * was due. Never throws.
 */
export async function maybeAlertSpend(totalUsd: number, day: string, env: Env = process.env): Promise<{ step: number; telegram: boolean; email: boolean } | null> {
  try {
    const threshold = spendAlertUsd(env);
    if (threshold === null) return null;
    const step = alertStep(totalUsd, threshold);
    if (step === 0) return null;
    const c = channelsOverride ?? liveChannels(env);
    if (!(await c.once(`spend-alert:${day}:${step}`))) return null;
    const subject = `[MyAvatar] AI spend today $${totalUsd.toFixed(2)} (alert at $${threshold})`;
    const text = `${subject}\nUTC day ${day}. Step ${step}: spend passed $${(step * threshold).toFixed(2)}.\nCheck /ka/admin and Google Cloud Billing. Hard cap: GLOBAL_DAILY_LIMIT_USD=${(env.GLOBAL_DAILY_LIMIT_USD ?? '').trim() || 'off'}.`;
    return { step, ...(await send(c, subject, text)) };
  } catch {
    return null;
  }
}

/** A hard cap refused a call: alert once per day per reason. Never throws. */
export async function alertCapReached(reason: string, day: string, detail: string, env: Env = process.env): Promise<void> {
  try {
    if (spendAlertUsd(env) === null) return;
    const c = channelsOverride ?? liveChannels(env);
    if (!(await c.once(`spend-alert:${day}:cap:${reason}`))) return;
    const subject = `[MyAvatar] Hard cap reached: ${reason}`;
    await send(c, subject, `${subject}\nUTC day ${day}. ${detail}\nNew paid jobs are refused until 00:00 UTC (04:00 Tbilisi).`);
  } catch {
    /* an alert never breaks a request */
  }
}
