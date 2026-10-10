/**
 * lib/calls/whatsapp/callService.ts — what the app does with each WhatsApp call event, and with each request the media
 * bridge makes back. Every effect goes through `deps`, so the whole flow is tested against a mocked Meta, a fake bridge
 * and an in-memory store (callService.test.ts). Nothing here decides prices or talks to Gemini.
 *
 * A call a person makes (user-initiated):
 *   1. `connect` webhook (signed by Meta, checked by the route) → seen once → fresh (≤ 45 s) → gates (gates.ts).
 *   2. Refused → Meta `reject` at once + one WhatsApp message saying why (copy.ts) + audit. No ringing into silence.
 *   3. Allowed → a record (requested) → a signed ticket (ticket.ts) → the bridge gets the ticket and Meta's SDP offer.
 *   4. The bridge answers `answer(ticket, sdp)` → Meta `pre_accept` (ringing) → `accept` (answered). Media may flow
 *      only after Meta's 200 OK, which is why the bridge waits for this answer before it starts Gemini.
 *   5. The bridge reports `active` once WhatsApp audio and Gemini Live both run, then `end` with its metrics.
 *   6. Meta's `terminate` webhook closes it: ended (COMPLETED) or failed, Meta's duration recorded, the day's minutes
 *      counted, and — only once a price is approved and a charger is wired — an ended call charged once, at the price
 *      it was opened with. A failed call (no media, Live down) is never charged.
 *
 * A call Agent G places (business-initiated) reuses steps 3–6; `status` webhooks move it (RINGING, ACCEPTED, REJECTED).
 */
import { callEventKey, type CallConnectEvent, type CallEvent, type CallStatusEvent, type CallTerminateEvent } from './events';
import { billableSeconds, moveCall, newCallRecord, type CallFailure, type CallMetrics, type CallRecord, type CallState } from './lifecycle';
import { callCredits, decideInbound, type CallPolicy, type LinkFact } from './gates';
import { addMinutes, createCall, dayIn, firstSeen, readCall, writeCall, type CallKv } from './callStore';
import { issueTicket, verifyTicket, type CallTicket } from './ticket';
import { refusalText, refusalWorthTelling, type CallLang } from './copy';
import type { MetaResult, CallAction } from './metaCalls';
import type { AgentCallPrefs } from '@/lib/notifications/preferences';

/** Meta gives 30–60 s to answer; an older `connect` (a redelivery after an outage) is a call that is already gone. */
export const CONNECT_FRESH_MS = 45_000;
/** Live tokens one call may mint: the first session plus resumptions. */
export const MAX_LIVE_MINTS = 6;

export interface CallServiceDeps {
  kv: CallKv;
  now(): number;
  policy: CallPolicy;
  /** CALL_BRIDGE_SECRET ('' = not configured: nothing is ever handed to a bridge). */
  secret: string;
  origin: string;
  findLink(waId: string): Promise<LinkFact & { locale?: CallLang }>;
  readCallPrefs(userId: string): Promise<{ calls: AgentCallPrefs; timezone: string }>;
  balance(userId: string): Promise<number | null>;
  minutesToday(userId: string, day: string): Promise<number>;
  bridge: {
    ready(): Promise<boolean>;
    /** Hand a call to the bridge: it builds the SDP answer and calls `answer` back. False = it refused. */
    offer(input: { ticket: string; callId: string; sdpOffer: string }): Promise<boolean>;
  };
  meta(input: { callId: string; action: CallAction; sdpAnswer?: string; opaque?: string }): Promise<MetaResult>;
  /** Best-effort WhatsApp text to the caller (never throws, may fail outside the 24 h window). */
  tell(waId: string, text: string): Promise<void>;
  audit(entry: { userId: string | null; callId: string; phase: string; outcome: 'ok' | 'refused' | 'failed'; detail?: string }): Promise<void>;
  /** Charge a finished call once (ledger ref `wacall:<callId>`). Absent until the price is approved. */
  charge?(input: { userId: string; callId: string; credits: number }): Promise<boolean>;
}

export type EventOutcome =
  | 'duplicate' | 'stale' | 'refused' | 'offered' | 'bridge_refused' | 'ended' | 'failed' | 'moved' | 'ignored' | 'unknown_call';

const mask = (waId: string | null): string | null => (waId ? `+${waId.slice(0, 3)} ••• ••${waId.slice(-3)}` : null);

async function save(deps: CallServiceDeps, r: CallRecord): Promise<void> {
  await writeCall(deps.kv, r);
}

async function move(deps: CallServiceDeps, r: CallRecord, to: CallState, reason?: Parameters<typeof moveCall>[3]): Promise<CallRecord> {
  const m = moveCall(r, to, deps.now(), reason);
  if (m.moved) await save(deps, m.record);
  return m.record;
}

async function refuse(deps: CallServiceDeps, e: CallConnectEvent, r: CallRecord, reason: CallFailure, lang: CallLang): Promise<EventOutcome> {
  await deps.meta({ callId: e.callId, action: 'reject' });
  await move(deps, r, 'failed', reason);
  await deps.audit({ userId: r.userId, callId: e.callId, phase: 'gate', outcome: 'refused', detail: reason });
  if (e.waId && refusalWorthTelling(reason)) await deps.tell(e.waId, refusalText(reason, lang, deps.origin));
  return 'refused';
}

async function onConnect(deps: CallServiceDeps, e: CallConnectEvent): Promise<EventOutcome> {
  if (e.direction === 'BUSINESS_INITIATED') return 'ignored'; // the person's answer to our offer goes to the bridge (outbound, later)
  if (deps.now() - e.at > CONNECT_FRESH_MS) return 'stale';

  const link: LinkFact & { locale?: CallLang } = e.waId ? await deps.findLink(e.waId) : { state: 'unlinked' };
  const userId = link.state === 'linked' ? link.userId : null;
  const lang: CallLang = link.locale ?? (e.waId?.startsWith('995') ? 'ka' : 'en');
  const record = newCallRecord({ callId: e.callId, direction: e.direction, phoneNumberId: e.phoneNumberId, userId, waMasked: mask(e.waId), at: deps.now() });
  if (!(await createCall(deps.kv, record))) return 'duplicate';

  if (!deps.policy.enabled) return refuse(deps, e, record, 'calling_off', lang);
  if (!e.sdp || e.sdp.type !== 'offer') return refuse(deps, e, record, 'meta_refused', lang);

  let calls: AgentCallPrefs = { enabled: false, perCallMinutes: 1, dailyMinutes: 1 };
  let timezone = 'Asia/Tbilisi';
  let balance: number | null = null;
  let used = 0;
  if (userId) {
    ({ calls, timezone } = await deps.readCallPrefs(userId));
    [balance, used] = await Promise.all([deps.balance(userId), deps.minutesToday(userId, dayIn(timezone, new Date(deps.now())))]);
  }
  const verdict = decideInbound(deps.policy, {
    link, calls, balance, minutesToday: used, bridgeReady: deps.secret ? await deps.bridge.ready() : false,
  });
  if (!verdict.allow) return refuse(deps, e, record, verdict.reason, lang);

  const ticket = issueTicket({
    callId: e.callId, userId: verdict.userId, phoneNumberId: e.phoneNumberId, locale: lang,
    maxSeconds: verdict.maxSeconds, creditsPerMinute: verdict.creditsPerMinute, direction: e.direction,
  }, deps.secret, deps.now());
  await save(deps, { ...record, maxSeconds: verdict.maxSeconds, creditsPerMinute: verdict.creditsPerMinute });
  const taken = await deps.bridge.offer({ ticket, callId: e.callId, sdpOffer: e.sdp.sdp });
  if (!taken) {
    const r = (await readCall(deps.kv, e.callId)) ?? record;
    await refuse(deps, e, r, 'bridge_unavailable', lang);
    return 'bridge_refused';
  }
  await deps.audit({ userId: verdict.userId, callId: e.callId, phase: 'offer', outcome: 'ok', detail: `max ${verdict.maxSeconds}s` });
  return 'offered';
}

async function onTerminate(deps: CallServiceDeps, e: CallTerminateEvent): Promise<EventOutcome> {
  const r = await readCall(deps.kv, e.callId);
  if (!r) return 'unknown_call';
  const withDuration: CallRecord = typeof e.durationSec === 'number' ? { ...r, durationSec: e.durationSec } : r;
  let final: CallRecord;
  if (e.status === 'FAILED') {
    final = await move(deps, withDuration, 'failed', 'meta_failed');
  } else if (!r.answeredAt && r.state !== 'active') {
    final = await move(deps, withDuration, 'failed', r.state === 'requested' || r.state === 'ringing' ? 'not_answered' : 'meta_failed');
  } else {
    final = await move(deps, withDuration, 'ended', 'completed');
  }
  // A record that was already final (we hung up first) does not move, but still takes Meta's duration: the billing basis.
  if (final.durationSec !== r.durationSec && final.state === r.state) await save(deps, final);
  const seconds = billableSeconds(final);
  if (final.userId && seconds > 0) {
    // Minutes count toward the day's cap whatever the outcome (they cost us); only a call that ENDED normally is charged.
    const { timezone } = await deps.readCallPrefs(final.userId);
    await addMinutes(deps.kv, final.userId, dayIn(timezone, new Date(final.createdAt)), seconds / 60);
    const price = final.creditsPerMinute;
    if (deps.charge && price && final.state === 'ended') {
      const credits = callCredits(seconds, price);
      const ok = await deps.charge({ userId: final.userId, callId: final.callId, credits });
      await deps.audit({ userId: final.userId, callId: final.callId, phase: 'charge', outcome: ok ? 'ok' : 'failed', detail: `${credits} credits for ${seconds}s` });
    }
  }
  await deps.audit({
    userId: final.userId, callId: final.callId, phase: 'end', outcome: final.state === 'ended' ? 'ok' : 'failed',
    detail: `${final.state}${final.failure ? ` (${final.failure})` : ''}; ${seconds}s`,
  });
  return final.state === 'ended' ? 'ended' : 'failed';
}

async function onStatus(deps: CallServiceDeps, e: CallStatusEvent): Promise<EventOutcome> {
  const r = await readCall(deps.kv, e.callId);
  if (!r) return 'unknown_call';
  const to: CallState = e.status === 'RINGING' ? 'ringing' : e.status === 'ACCEPTED' ? 'answered' : 'failed';
  await move(deps, r, to, e.status === 'REJECTED' ? 'rejected' : undefined);
  return 'moved';
}

/** Handle every call event of one (already signature-checked) webhook delivery. Never throws for one bad event. */
export async function handleCallEvents(deps: CallServiceDeps, events: readonly CallEvent[]): Promise<Array<{ callId: string; outcome: EventOutcome }>> {
  const out: Array<{ callId: string; outcome: EventOutcome }> = [];
  for (const e of events) {
    try {
      if (!(await firstSeen(deps.kv, callEventKey(e)))) { out.push({ callId: e.callId, outcome: 'duplicate' }); continue; }
      const outcome = e.kind === 'connect' ? await onConnect(deps, e) : e.kind === 'terminate' ? await onTerminate(deps, e) : await onStatus(deps, e);
      out.push({ callId: e.callId, outcome });
    } catch (error) {
      console.error('[WhatsApp.Calls] event_failed', { kind: e.kind, error: error instanceof Error ? error.message : 'unknown' });
      out.push({ callId: e.callId, outcome: 'failed' });
    }
  }
  return out;
}

// ─── The bridge's requests back to the app (each carries the call's ticket) ─────────────────────────────────────

export type BridgeAuth = { ok: true; ticket: CallTicket; record: CallRecord } | { ok: false; status: 401 | 404 | 409; error: string };

/** The ticket must be valid AND its call must exist and not be final: a ticket dies with its call. */
export async function authorizeBridge(deps: Pick<CallServiceDeps, 'kv' | 'now' | 'secret'>, token: string | null): Promise<BridgeAuth> {
  const v = verifyTicket(token, deps.secret, deps.now());
  if (!v.ok) return { ok: false, status: 401, error: v.error };
  const record = await readCall(deps.kv, v.ticket.callId);
  if (!record || record.userId !== v.ticket.userId) return { ok: false, status: 404, error: 'unknown_call' };
  if (record.state === 'ended' || record.state === 'failed') return { ok: false, status: 409, error: 'call_over' };
  return { ok: true, ticket: v.ticket, record };
}

/** The bridge's SDP answer: pre_accept (ringing), then accept (answered). Media may flow after this returns ok. */
export async function answerCall(deps: CallServiceDeps, auth: Extract<BridgeAuth, { ok: true }>, sdpAnswer: unknown): Promise<{ ok: boolean; error?: string }> {
  const { ticket, record } = auth;
  if (typeof sdpAnswer !== 'string' || !sdpAnswer.startsWith('v=0') || sdpAnswer.length > 16_384) return { ok: false, error: 'bad_sdp' };
  if (record.state !== 'requested') return { ok: false, error: 'not_waiting' };
  const pre = await deps.meta({ callId: ticket.callId, action: 'pre_accept', sdpAnswer });
  if (!pre.ok) {
    await deps.meta({ callId: ticket.callId, action: 'reject' });
    await move(deps, record, 'failed', 'meta_refused');
    return { ok: false, error: 'pre_accept_failed' };
  }
  const ringing = await move(deps, record, 'ringing');
  const acc = await deps.meta({ callId: ticket.callId, action: 'accept', sdpAnswer, opaque: ticket.nonce });
  if (!acc.ok) {
    await deps.meta({ callId: ticket.callId, action: 'terminate' });
    await move(deps, ringing, 'failed', 'meta_refused');
    return { ok: false, error: 'accept_failed' };
  }
  await move(deps, ringing, 'answered');
  return { ok: true };
}

/** Count one Gemini Live token for this call (first session or a resumption). False once the call used its share. */
export async function takeLiveMint(deps: Pick<CallServiceDeps, 'kv'>, record: CallRecord): Promise<boolean> {
  const used = record.liveMints ?? 0;
  if (used >= MAX_LIVE_MINTS) return false;
  await writeCall(deps.kv, { ...record, liveMints: used + 1 });
  return true;
}

export type BridgeEvent =
  | { type: 'active' }
  | { type: 'metrics'; metrics: CallMetrics }
  | { type: 'end'; reason: 'hangup' | 'max_duration' | 'media_failed' | 'live_failed'; metrics?: CallMetrics };

const METRIC_KEYS: ReadonlyArray<keyof CallMetrics> = [
  'replyLatencyP50Ms', 'replyLatencyP95Ms', 'inputPathP50Ms', 'outputPathP50Ms', 'bargeIns', 'reconnects', 'promptTokens', 'responseTokens', 'totalTokens',
];

export function cleanMetrics(raw: unknown): CallMetrics {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: CallMetrics = {};
  for (const k of METRIC_KEYS) {
    const v = src[k];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e9) out[k] = Math.round(v);
  }
  return out;
}

export function parseBridgeEvent(raw: unknown): BridgeEvent | null {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  if (!r) return null;
  if (r.type === 'active') return { type: 'active' };
  if (r.type === 'metrics') return { type: 'metrics', metrics: cleanMetrics(r.metrics) };
  if (r.type === 'end' && (r.reason === 'hangup' || r.reason === 'max_duration' || r.reason === 'media_failed' || r.reason === 'live_failed')) {
    return { type: 'end', reason: r.reason, ...(r.metrics ? { metrics: cleanMetrics(r.metrics) } : {}) };
  }
  return null;
}

export async function bridgeEvent(deps: CallServiceDeps, auth: Extract<BridgeAuth, { ok: true }>, ev: BridgeEvent): Promise<{ ok: boolean }> {
  const { record, ticket } = auth;
  if (ev.type === 'active') {
    await move(deps, record, 'active');
    await deps.audit({ userId: ticket.userId, callId: ticket.callId, phase: 'active', outcome: 'ok' });
    return { ok: true };
  }
  if (ev.type === 'metrics') {
    await save(deps, { ...record, metrics: { ...record.metrics, ...ev.metrics } });
    return { ok: true };
  }
  // end: we hang up at Meta (Meta's terminate webhook then brings the duration), and close the record now.
  await deps.meta({ callId: ticket.callId, action: 'terminate' });
  const withMetrics = ev.metrics ? { ...record, metrics: { ...record.metrics, ...ev.metrics } } : record;
  const failed = ev.reason === 'media_failed' || ev.reason === 'live_failed';
  await move(deps, withMetrics, failed ? 'failed' : 'ended', ev.reason);
  return { ok: true };
}
