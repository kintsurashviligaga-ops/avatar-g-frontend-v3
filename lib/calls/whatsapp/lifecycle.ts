/**
 * lib/calls/whatsapp/lifecycle.ts — one WhatsApp call's life, as the server records it.
 *
 *   requested → ringing → answered → active → ended
 *        └──────────┴──────────┴─────────┴──→ failed
 *
 *   requested  user-initiated: Meta's `connect` (an SDP offer) arrived. Business-initiated: we asked Meta to place it.
 *   ringing    user-initiated: we pre-accepted with our SDP answer. Business-initiated: Meta says RINGING.
 *   answered   user-initiated: our `accept` got 200 OK. Business-initiated: Meta says ACCEPTED.
 *   active     the bridge reports media both ways AND the Gemini Live session is set up: Agent G can hear and speak.
 *   ended      Meta's `terminate` COMPLETED, or we hung up (end_call, the per-call cap).
 *   failed     refused by a gate, rejected, not answered in time, a bridge or Live failure, Meta's FAILED.
 *
 * Final states never move. A late or repeated event that would move a call backwards is ignored (Meta redelivers; the
 * bridge and the webhook race), never an error. Pure; the store is lib/calls/whatsapp/callStore.ts.
 */
import type { CallDirection } from './events';

export type CallState = 'requested' | 'ringing' | 'answered' | 'active' | 'ended' | 'failed';
export const CALL_STATES: readonly CallState[] = ['requested', 'ringing', 'answered', 'active', 'ended', 'failed'];
export const FINAL_CALL_STATES: ReadonlySet<CallState> = new Set<CallState>(['ended', 'failed']);

export const CALL_TRANSITIONS: Readonly<Record<CallState, readonly CallState[]>> = {
  requested: ['ringing', 'answered', 'ended', 'failed'],
  ringing: ['answered', 'ended', 'failed'],
  answered: ['active', 'ended', 'failed'],
  active: ['ended', 'failed'],
  ended: [],
  failed: [],
};

export function canCallTransition(from: CallState, to: CallState): boolean {
  return CALL_TRANSITIONS[from].includes(to);
}

/** Why a call did not happen or stopped. Plain codes; the words a person hears are in lib/calls/whatsapp/copy.ts. */
export type CallFailure =
  | 'calling_off'          // WHATSAPP_CALLING_ENABLED is off (the default)
  | 'not_linked'           // the number is not linked to an account (or Meta sent no number)
  | 'links_unavailable'    // the link tables are missing (Production today)
  | 'calls_opted_out'      // the user did not turn Agent G calls on
  | 'price_not_approved'   // no approved per-minute price in the pricing SSoT
  | 'insufficient_balance' // not enough credits for the minimum call
  | 'daily_cap'            // today's call minutes are used up
  | 'quiet_hours'          // business-initiated only: outside the user's call window
  | 'no_call_permission'   // business-initiated only: the user has not allowed our calls in WhatsApp
  | 'bridge_unavailable'   // no bridge configured or it refused the call
  | 'meta_refused'         // pre_accept / accept / connect answered an error
  | 'not_answered'         // nobody picked up in time
  | 'rejected'             // the user declined (business-initiated)
  | 'media_failed'         // WebRTC never connected, or dropped
  | 'live_failed'          // the Gemini Live session could not be set up or resumed
  | 'meta_failed';         // Meta's terminate said FAILED

export interface CallTransition { state: CallState; at: number; reason?: CallFailure | 'completed' | 'hangup' | 'max_duration' }

export interface CallMetrics {
  /** Median and 95th percentile, ms: end of the user's speech (bridge VAD) → first answer audio sent to WhatsApp. */
  replyLatencyP50Ms?: number;
  replyLatencyP95Ms?: number;
  /** Inbound audio frame received → handed to Gemini (decode + resample), ms, median. */
  inputPathP50Ms?: number;
  /** Gemini audio chunk received → sent to WhatsApp (resample + encode), ms, median. */
  outputPathP50Ms?: number;
  /** How often the user spoke over Agent G and the answer was cut (barge-in). */
  bargeIns?: number;
  /** Gemini Live reconnects (GoAway, a dropped socket) resumed with the handle. */
  reconnects?: number;
  /** Gemini usageMetadata sums for the whole call (the real cost basis). */
  promptTokens?: number;
  responseTokens?: number;
  totalTokens?: number;
}

export interface CallRecord {
  callId: string;
  direction: CallDirection;
  phoneNumberId: string;
  /** The account, once the number matched a link; null for a refused unknown caller. */
  userId: string | null;
  /** The number masked for logs and audit (never the full number). */
  waMasked: string | null;
  state: CallState;
  history: CallTransition[];
  createdAt: number;
  answeredAt?: number;
  activeAt?: number;
  endedAt?: number;
  /** Meta's own duration (seconds) from the terminate event, the billing basis. */
  durationSec?: number;
  /** The cap this call runs under (seconds), decided by the gates. */
  maxSeconds?: number;
  /** The per-minute price the call was opened with (the ticket's); a later price change never reprices it. */
  creditsPerMinute?: number;
  failure?: CallFailure;
  metrics?: CallMetrics;
  /** How many Live tokens were minted for this call (first session + resumptions). Bounded. */
  liveMints?: number;
}

export function newCallRecord(input: {
  callId: string; direction: CallDirection; phoneNumberId: string; userId: string | null; waMasked: string | null; at: number;
}): CallRecord {
  return {
    callId: input.callId,
    direction: input.direction,
    phoneNumberId: input.phoneNumberId,
    userId: input.userId,
    waMasked: input.waMasked,
    state: 'requested',
    history: [{ state: 'requested', at: input.at }],
    createdAt: input.at,
  };
}

export type MoveResult = { moved: true; record: CallRecord } | { moved: false; record: CallRecord; why: 'final' | 'backwards' | 'same' };

/**
 * Move a call to `to`. A move the table does not allow is ignored (the record is returned unchanged with the reason);
 * the caller decides whether that matters. Timestamps of the first answer, first audio and the end are kept.
 */
export function moveCall(record: CallRecord, to: CallState, at: number, reason?: CallTransition['reason']): MoveResult {
  if (record.state === to) return { moved: false, record, why: 'same' };
  if (FINAL_CALL_STATES.has(record.state)) return { moved: false, record, why: 'final' };
  if (!canCallTransition(record.state, to)) return { moved: false, record, why: 'backwards' };
  const next: CallRecord = {
    ...record,
    state: to,
    history: [...record.history, reason ? { state: to, at, reason } : { state: to, at }].slice(-20),
  };
  if (to === 'answered') next.answeredAt = at;
  if (to === 'active') next.activeAt = at;
  if (to === 'ended' || to === 'failed') next.endedAt = at;
  if (to === 'failed' && reason && reason !== 'completed' && reason !== 'hangup' && reason !== 'max_duration') next.failure = reason;
  return { moved: true, record: next };
}

/** Seconds of the call a person was actually connected (Meta's duration first; else our own answer → end). */
export function billableSeconds(r: CallRecord): number {
  if (typeof r.durationSec === 'number') return r.durationSec;
  if (r.answeredAt && r.endedAt && r.endedAt > r.answeredAt) return Math.round((r.endedAt - r.answeredAt) / 1000);
  return 0;
}
