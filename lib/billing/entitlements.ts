import 'server-only';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * Has this account ever actually paid?
 *
 * This is the ONLY thing that decides whether an output carries the MyAvatar mark, so it has to be
 * something a user cannot set about themselves.
 *
 * ⚠️ THE SIGNAL IS `wallet_topups`, AND THAT IS DELIBERATE. Its only writer is the `credit_wallet_gel()`
 * RPC, which is reachable exclusively from the verified payment rails — the Stripe webhook and the
 * RSA-signed Bank of Georgia callback. `wallet_topups.ref` is the PRIMARY KEY, so a re-delivered callback
 * is a no-op rather than a second row. Nothing a browser can call writes here.
 *
 * ⚠️ WHY NOT `profiles.tier`. It looks like the obvious field and it is NOT trustworthy on its own: no
 * application code writes it (grep app/ and lib/ — the only `tier` upsert is on the `pricing_tiers`
 * catalogue table), so the one live 'PRO' row was set by hand in the SQL editor. It is kept here as an
 * OR — that hand-set value IS how the owner comps an account — but it is a manual admin grant, not
 * evidence of a payment, and it must never be the sole signal.
 *
 * ⚠️ AND CREDITS ARE NOT PAYMENT. `credits_balance` starts at 50 for every new signup (the free trial),
 * and referral bonuses add more. Gating on a positive balance would hand the unmarked output to exactly
 * the people the mark exists for.
 *
 * ⚠️ FAILS CLOSED — an error means "not paid", so the mark is applied. The alternative fails toward
 * giving unmarked video to free accounts whenever the database hiccups, which is the failure that costs
 * something. A paying customer briefly seeing a mark is a support message; a systematic free-rider is
 * lost revenue. The miss is logged rather than swallowed so it cannot become the silent normal.
 *
 * NOT CACHED, on purpose. A drain does one indexed lookup per clip, which is nothing next to a render —
 * and a cache means a customer who has just paid keeps getting marked video for as long as the TTL runs.
 * That is the single complaint most worth avoiding here.
 */

/** Tier labels that count as comped. `profiles.tier` is uppercase in the live table ('FREE' | 'PRO'). */
const COMPED_TIERS = new Set(['PRO', 'BUSINESS', 'EXECUTIVE', 'PREMIUM', 'ENTERPRISE']);

export async function hasPaidPlan(userId: string): Promise<boolean> {
  if (!userId) return false;
  try {
    const svc = createServiceRoleClient();

    const { data: topup, error: topupErr } = await svc
      .from('wallet_topups')
      .select('ref')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();
    if (topupErr) throw topupErr;
    if (topup) return true;

    const { data: profile, error: profileErr } = await svc
      .from('profiles')
      .select('tier')
      .eq('id', userId)
      .maybeSingle();
    if (profileErr) throw profileErr;

    return COMPED_TIERS.has(String(profile?.tier ?? '').toUpperCase());
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[entitlements] paid-plan check failed → treating as FREE (output will be marked):',
      e instanceof Error ? e.message : e);
    return false;
  }
}

/**
 * Should this user's output carry the mark? The inverse of hasPaidPlan, named for the call site so the
 * decision reads the same way everywhere it is made — and so nobody re-derives it from a request body.
 *
 * ⚠️ NEVER TAKE THIS FROM THE CLIENT. The agent queue used to accept `watermark` from the POST body,
 * which meant `{"watermark": false}` bought an unmarked render for nothing.
 */
export async function shouldWatermark(userId: string): Promise<boolean> {
  return !(await hasPaidPlan(userId));
}

/**
 * Mark a finished video if this account has not paid, and hand back the URL to deliver.
 *
 * ONE call at every delivery point, so the rule is written once and every lane fails the same way.
 *
 * ⚠️ CALL IT LAST, after every crop/scale/concat. stripVeoWatermark crops the bottom of the frame and
 * would cut the band off; a mark applied before a concat survives on one segment only.
 *
 * ⚠️ FAIL-OPEN ON THE RENDER, FAIL-CLOSED ON THE DECISION. If the entitlement lookup breaks we mark; if
 * the ffmpeg pass breaks we return the original rather than lose a render someone waited for. Those two
 * defaults point in opposite directions on purpose.
 */
export async function markFreeOutput(userId: string, videoUrl: string | null): Promise<string | null> {
  if (!videoUrl) return videoUrl;
  if (!(await shouldWatermark(userId))) return videoUrl;
  // Imported lazily: this module is pulled into routes that never touch ffmpeg, and remixOps drags in
  // the whole video toolchain.
  const { addWatermark } = await import('@/lib/video/remixOps');
  return (await addWatermark(videoUrl).catch(() => null)) ?? videoUrl;
}
