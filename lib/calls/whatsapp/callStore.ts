/**
 * lib/calls/whatsapp/callStore.ts — where a call's record, its heard words and the day's minutes live.
 *
 * Redis (Upstash) with the in-memory fallback lib/platform/redis already has: no database table, so nothing here needs
 * a Production migration (the owner's rule). A record lives 7 days; the durable trail of a call is its audit row and,
 * once calls are paid, the ledger entry. Tests pass their own KV.
 */
import { redisGetString, redisSetIfNotExists, redisSetString } from '@/lib/platform/redis';
import type { HeardUtterance } from '@/lib/voice/spokenYes';
import type { CallRecord } from './lifecycle';

export interface CallKv {
  get(key: string): Promise<unknown>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean>;
}

export const redisKv: CallKv = {
  get: (k) => redisGetString(k),
  set: (k, v, t) => redisSetString(k, v, t),
  setIfAbsent: (k, v, t) => redisSetIfNotExists(k, v, t),
};

/** A Map-backed KV for tests and local runs. */
export function memoryKv(): CallKv & { dump(): Map<string, string> } {
  const m = new Map<string, string>();
  return {
    get: async (k) => m.get(k) ?? null,
    set: async (k, v) => { m.set(k, v); },
    setIfAbsent: async (k, v) => { if (m.has(k)) return false; m.set(k, v); return true; },
    dump: () => m,
  };
}

const RECORD_TTL_S = 7 * 24 * 3600;
const HEARD_MAX = 40;

/** Upstash may hand back an already-parsed object for a JSON string; accept both. */
function parse<T>(raw: unknown): T | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'object') return raw as T;
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export const recordKey = (callId: string) => `wacall:rec:${callId}`;
const heardKey = (callId: string) => `wacall:heard:${callId}`;
const minutesKey = (userId: string, day: string) => `wacall:min:${userId}:${day}`;
const outboundKey = (userId: string, day: string) => `wacall:out:${userId}:${day}`;

export async function readCall(kv: CallKv, callId: string): Promise<CallRecord | null> {
  return parse<CallRecord>(await kv.get(recordKey(callId)));
}

export async function writeCall(kv: CallKv, r: CallRecord): Promise<void> {
  await kv.set(recordKey(r.callId), JSON.stringify(r), RECORD_TTL_S);
}

/** Create the record once; a second `connect` for the same call (Meta redelivery) finds it already there. */
export async function createCall(kv: CallKv, r: CallRecord): Promise<boolean> {
  return kv.setIfAbsent(recordKey(r.callId), JSON.stringify(r), RECORD_TTL_S);
}

/** First sight of one webhook event (callId + kind + status), for 24 h. */
export async function firstSeen(kv: CallKv, eventKey: string): Promise<boolean> {
  return kv.setIfAbsent(`wacall:evt:${eventKey}`, '1', 24 * 3600);
}

/** The person's words as the call heard them (input transcription), newest last, bounded. */
export async function appendHeard(kv: CallKv, callId: string, u: HeardUtterance): Promise<HeardUtterance[]> {
  const list = parse<HeardUtterance[]>(await kv.get(heardKey(callId))) ?? [];
  const next = [...list, u].slice(-HEARD_MAX);
  await kv.set(heardKey(callId), JSON.stringify(next), RECORD_TTL_S);
  return next;
}

export async function readHeard(kv: CallKv, callId: string): Promise<HeardUtterance[]> {
  return parse<HeardUtterance[]>(await kv.get(heardKey(callId))) ?? [];
}

/** The calendar day in the person's zone (YYYY-MM-DD). */
export function dayIn(timezone: string, at: Date): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

export async function minutesToday(kv: CallKv, userId: string, day: string): Promise<number> {
  const n = Number(parse<number>(await kv.get(minutesKey(userId, day))) ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function addMinutes(kv: CallKv, userId: string, day: string, minutes: number): Promise<void> {
  const now = await minutesToday(kv, userId, day);
  await kv.set(minutesKey(userId, day), String(now + Math.max(0, Math.ceil(minutes))), 2 * 24 * 3600);
}

export async function outboundToday(kv: CallKv, userId: string, day: string): Promise<number> {
  const n = Number(parse<number>(await kv.get(outboundKey(userId, day))) ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function countOutbound(kv: CallKv, userId: string, day: string): Promise<void> {
  await kv.set(outboundKey(userId, day), String((await outboundToday(kv, userId, day)) + 1), 2 * 24 * 3600);
}
