/**
 * lib/calls/whatsapp/events.ts — the `calls` webhook field of the WhatsApp Cloud API, read into plain events.
 *
 * Shapes as Meta documents them (developers.facebook.com/documentation/business-messaging/whatsapp/calling,
 * "User-initiated calls", updated Jun 24, 2026, read 2026-10-10):
 *   connect    `value.calls[].event = 'connect'` with `session { sdp_type: 'offer', sdp }` — a user is calling us (or, for
 *              a call we placed, the user's answer SDP).
 *   terminate  `event = 'terminate'` with `status` COMPLETED | FAILED (sent as a string, some samples show a list),
 *              `duration` (seconds, only when the call was picked up) and `errors[]` for a failed call.
 *   status     a call WE placed: `value.statuses[]` with `type: 'call'` and `status` RINGING | ACCEPTED | REJECTED.
 *
 * ⚠️ `from` (the caller's number) MAY BE MISSING when the user adopted a WhatsApp username; `from_user_id` (the
 * business-scoped user id) is then the only identity. A call without a number can never match a linked account (links
 * are made by a message FROM the number, lib/agent-g/channels/whatsapp-link), so it is treated as not linked.
 *
 * Pure, bounded and defensive: anything malformed is dropped, never thrown. The SDP is kept as text (bounded) and only
 * ever handed to the bridge; it is never logged.
 */

export type CallDirection = 'USER_INITIATED' | 'BUSINESS_INITIATED';

interface CallBase {
  callId: string;
  /** The business number's Graph id the event is for (value.metadata.phone_number_id). */
  phoneNumberId: string;
  /** The WhatsApp user's number in digits, or null when Meta omitted it (username users). */
  waId: string | null;
  /** The business-scoped user id (BSUID), when sent. */
  bsuid: string | null;
  /** Event time in epoch milliseconds (Meta sends Unix seconds as a string). */
  at: number;
}

export interface CallConnectEvent extends CallBase {
  kind: 'connect';
  direction: CallDirection;
  /** The SDP in the event: an OFFER for a user-initiated call, the user's ANSWER for one we placed. */
  sdp: { type: 'offer' | 'answer'; sdp: string } | null;
}

export interface CallTerminateEvent extends CallBase {
  kind: 'terminate';
  direction: CallDirection;
  status: 'COMPLETED' | 'FAILED' | null;
  /** Seconds; present only when the call was picked up. */
  durationSec: number | null;
  errorCode: number | null;
  /** What we passed as biz_opaque_callback_data on accept/connect (our own call reference). */
  opaque: string | null;
}

export interface CallStatusEvent extends CallBase {
  kind: 'status';
  status: 'RINGING' | 'ACCEPTED' | 'REJECTED';
  opaque: string | null;
}

export type CallEvent = CallConnectEvent | CallTerminateEvent | CallStatusEvent;

export const SDP_MAX_CHARS = 16_384;
const ID_MAX = 256;
const CALL_ID_RE = /^[A-Za-z0-9._:=+/-]{4,256}$/;

const rec = (x: unknown): Record<string, unknown> | null => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null);
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown, max = ID_MAX): string | null => {
  if (typeof x !== 'string' && typeof x !== 'number') return null;
  const t = String(x).trim();
  return t && t.length <= max ? t : null;
};
const digits = (x: unknown): string | null => {
  const t = str(x, 32);
  if (!t) return null;
  const d = t.replace(/\D/g, '');
  return d.length >= 6 && d.length <= 20 ? d : null;
};
const epochMs = (x: unknown): number | null => {
  const n = Number(typeof x === 'string' ? x.trim() : x);
  return Number.isFinite(n) && n > 1_000_000_000 && n < 10_000_000_000 ? Math.round(n * 1000) : null;
};
const direction = (x: unknown): CallDirection => (x === 'BUSINESS_INITIATED' ? 'BUSINESS_INITIATED' : 'USER_INITIATED');

function terminateStatus(x: unknown): 'COMPLETED' | 'FAILED' | null {
  const first = Array.isArray(x) ? x[0] : x;
  const t = typeof first === 'string' ? first.trim().toUpperCase() : '';
  return t === 'COMPLETED' || t === 'FAILED' ? t : null;
}

function sdpOf(x: unknown): CallConnectEvent['sdp'] {
  const s = rec(x);
  if (!s) return null;
  const type = s.sdp_type === 'offer' || s.sdp_type === 'answer' ? s.sdp_type : null;
  const sdp = typeof s.sdp === 'string' ? s.sdp : '';
  if (!type || !sdp.startsWith('v=0') || sdp.length > SDP_MAX_CHARS) return null;
  return { type, sdp };
}

/** True when the payload carries any `calls` change (the route then routes it here, not to the message handler). */
export function hasCallsField(payload: unknown): boolean {
  for (const entry of arr(rec(payload)?.entry)) {
    for (const change of arr(rec(entry)?.changes)) {
      if (rec(change)?.field === 'calls') return true;
    }
  }
  return false;
}

/** Every call event in one webhook payload, oldest first as Meta listed them. */
export function parseCallEvents(payload: unknown): CallEvent[] {
  const out: CallEvent[] = [];
  for (const entry of arr(rec(payload)?.entry)) {
    for (const change of arr(rec(entry)?.changes)) {
      const c = rec(change);
      if (!c || c.field !== 'calls') continue;
      const value = rec(c.value);
      if (!value) continue;
      const phoneNumberId = str(rec(value.metadata)?.phone_number_id, 64);
      if (!phoneNumberId) continue;

      for (const raw of arr(value.calls)) {
        const call = rec(raw);
        if (!call) continue;
        const callId = str(call.id);
        const at = epochMs(call.timestamp);
        if (!callId || !CALL_ID_RE.test(callId) || at === null) continue;
        const dir = direction(call.direction);
        // For a user-initiated call the user is `from`; for one we placed, the user is `to`.
        const waId = dir === 'BUSINESS_INITIATED' ? digits(call.to) : digits(call.from);
        const bsuid = str(call.from_user_id, 128);
        const base = { callId, phoneNumberId, waId, bsuid, at };
        if (call.event === 'connect') {
          out.push({ kind: 'connect', ...base, direction: dir, sdp: sdpOf(call.session) });
        } else if (call.event === 'terminate') {
          const errors = arr(value.errors);
          const code = Number(rec(errors[0])?.code);
          const dur = Number(call.duration);
          out.push({
            kind: 'terminate', ...base, direction: dir,
            status: terminateStatus(call.status),
            durationSec: Number.isFinite(dur) && dur >= 0 && dur < 86_400 ? Math.round(dur) : null,
            errorCode: Number.isFinite(code) ? code : null,
            opaque: str(call.biz_opaque_callback_data, 512),
          });
        }
      }

      for (const raw of arr(value.statuses)) {
        const s = rec(raw);
        if (!s || s.type !== 'call') continue;
        const callId = str(s.id);
        const at = epochMs(s.timestamp);
        const status = s.status === 'RINGING' || s.status === 'ACCEPTED' || s.status === 'REJECTED' ? s.status : null;
        if (!callId || !CALL_ID_RE.test(callId) || at === null || !status) continue;
        out.push({
          kind: 'status', callId, phoneNumberId, waId: digits(s.recipient_id), bsuid: str(s.recipient_user_id, 128), at, status,
          opaque: str(s.biz_opaque_callback_data, 512),
        });
      }
    }
  }
  return out;
}

/** The dedupe key of one event: Meta redelivers on any non-200, and the same call sends several events. */
export function callEventKey(e: CallEvent): string {
  return `${e.callId}:${e.kind}:${e.kind === 'status' ? e.status : ''}`;
}
