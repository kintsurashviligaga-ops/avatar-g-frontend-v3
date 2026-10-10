/**
 * lib/calls/whatsapp/gates.ts — may this WhatsApp call go ahead, and for how long? Pure: every fact is read by the
 * caller (lib/calls/whatsapp/callService.ts) and passed in, so each rule is tested on its own.
 *
 * The owner's rules (2026-10-10 13:10Z and 16:20Z):
 *   • the number must be linked to the account by the one-time code sent FROM it. Caller ID alone never identifies or
 *     authorizes anything; it only finds the link;
 *   • the person must have turned Agent G calls on (Settings → Connections), and their own limits apply: minutes per
 *     call and per day;
 *   • a call starts only when the balance covers the minimum call at the approved per-minute price. While the price is
 *     not approved in the pricing SSoT, no call starts at all (no unexpected charges, no free unlimited calls);
 *   • a call WE place also needs WhatsApp's own call permission from the person, and must fall inside their call window
 *     (quiet hours), at most a few a day, and never again after two unanswered in a row;
 *   • the whole feature is off unless WHATSAPP_CALLING_ENABLED is on (the default is off).
 * Paid work INSIDE a call still needs its own confirm (lib/calls/whatsapp/phoneTools.ts); these gates only open the line.
 */
import type { CallFailure } from './lifecycle';

export interface CallPolicy {
  /** WHATSAPP_CALLING_ENABLED. */
  enabled: boolean;
  /** Credits per started minute from the approved pricing SSoT, or null while the price is not approved. */
  creditsPerMinute: number | null;
  /** A call starts only if the balance covers at least this many minutes. */
  minFundedMinutes: number;
  /** Business-initiated calls a day per person (Meta revokes permission after repeated unanswered calls). */
  outboundPerDay: number;
}

export const DEFAULT_CALL_POLICY: CallPolicy = Object.freeze({ enabled: false, creditsPerMinute: null, minFundedMinutes: 2, outboundPerDay: 2 });

export type LinkFact = { state: 'linked'; userId: string } | { state: 'unlinked' } | { state: 'unavailable' };

export interface InboundFacts {
  link: LinkFact;
  /** The person's Agent G call settings (lib/notifications/preferences AgentCallPrefs). */
  calls: { enabled: boolean; perCallMinutes: number; dailyMinutes: number };
  /** Spendable credits now, or null when the balance could not be read (then nothing starts). */
  balance: number | null;
  /** Call minutes already used today in the person's zone. */
  minutesToday: number;
  /** A bridge is configured and answered its health check. */
  bridgeReady: boolean;
}

export interface OutboundFacts extends InboundFacts {
  /** WhatsApp's call permission for this person (GET /<PHONE_NUMBER_ID>/call_permissions). */
  permission: 'granted' | 'none' | 'unknown';
  insideCallWindow: boolean;
  outboundToday: number;
  /** Consecutive business-initiated calls the person did not answer. */
  unansweredStreak: number;
}

export type GateResult =
  | { allow: true; userId: string; maxSeconds: number; creditsPerMinute: number }
  | { allow: false; reason: CallFailure };

function common(policy: CallPolicy, f: InboundFacts): GateResult {
  if (!policy.enabled) return { allow: false, reason: 'calling_off' };
  if (f.link.state === 'unavailable') return { allow: false, reason: 'links_unavailable' };
  if (f.link.state !== 'linked') return { allow: false, reason: 'not_linked' };
  if (!f.calls.enabled) return { allow: false, reason: 'calls_opted_out' };
  const price = policy.creditsPerMinute;
  if (price === null || !Number.isInteger(price) || price <= 0) return { allow: false, reason: 'price_not_approved' };
  const left = Math.max(0, f.calls.dailyMinutes - Math.max(0, f.minutesToday));
  if (left < 1) return { allow: false, reason: 'daily_cap' };
  if (f.balance === null || f.balance < price * policy.minFundedMinutes) return { allow: false, reason: 'insufficient_balance' };
  if (!f.bridgeReady) return { allow: false, reason: 'bridge_unavailable' };
  const fundedMinutes = Math.floor(f.balance / price);
  const minutes = Math.max(1, Math.min(f.calls.perCallMinutes, left, fundedMinutes));
  return { allow: true, userId: f.link.userId, maxSeconds: minutes * 60, creditsPerMinute: price };
}

/** A person is calling Agent G. */
export function decideInbound(policy: CallPolicy, f: InboundFacts): GateResult {
  return common(policy, f);
}

/** Agent G is about to call the person back (e.g. "call me when the video is ready"). */
export function decideOutbound(policy: CallPolicy, f: OutboundFacts): GateResult {
  const base = common(policy, f);
  if (!base.allow) return base;
  if (f.permission !== 'granted') return { allow: false, reason: 'no_call_permission' };
  if (!f.insideCallWindow) return { allow: false, reason: 'quiet_hours' };
  if (f.outboundToday >= policy.outboundPerDay || f.unansweredStreak >= 2) return { allow: false, reason: 'daily_cap' };
  return base;
}

/** Credits for a finished call: started minutes × the price the call was opened with. 0 for a call nobody connected. */
export function callCredits(billableSeconds: number, creditsPerMinute: number): number {
  if (!(billableSeconds > 0) || !(creditsPerMinute > 0)) return 0;
  return Math.ceil(billableSeconds / 60) * creditsPerMinute;
}
