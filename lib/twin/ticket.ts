/**
 * lib/twin/ticket.ts — the CAPTURE TICKET /api/twin/upload-url hands out and /api/twin/commit requires.
 *
 * It binds, under an HMAC, everything the server decided when it signed the uploads: whose twin (u), the extension each
 * slot was signed for (s), and the DIGITS shown for the voice step (d). So the commit records digits the server
 * issued — not digits a client picked after recording — and can't be pointed at another user's staging objects. The day speech-to-text is funded, these are the digits a transcript is checked
 * against (left dark in v0: `voiceVerified` stays false).
 *
 * Same key policy as lib/avatar/handoff.ts (AVATAR_HANDOFF_SECRET, else the service-role key; fail-closed with
 * neither), with its own domain prefix in the MAC so a ticket can never verify as a handoff token or vice versa.
 */
import 'server-only';
import { createHmac, randomInt, timingSafeEqual } from 'crypto';

import { TWIN_PHOTO_MIMES, TWIN_PHOTO_SLOTS, TWIN_LIMITS, TWIN_VOICE_MIMES, type TwinSlot } from './types';
import { isTwinUserId } from './paths';

export interface CaptureTicket {
  v: 1;
  /** The user whose twin this capture is. */
  u: string;
  /** The digits shown for the voice step. */
  d: string;
  /** Slot → the path extension it was signed for (photos always; voice only when requested). */
  s: Partial<Record<TwinSlot, string>>;
  iat: number;
  exp: number;
}

/** A signed upload URL is valid for 2 hours; the ticket that commits those uploads lives exactly as long. */
export const CAPTURE_TICKET_TTL_MS = 2 * 60 * 60 * 1000;

const PREFIX = 'tw1';

function key(): string {
  return process.env.AVATAR_HANDOFF_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

function mac(payload: string): string {
  return createHmac('sha256', key()).update(`twin-capture:v1:${payload}`).digest('base64url');
}

/** True when tickets can be minted (checked before any upload URL is signed). */
export function captureTicketsReady(): boolean {
  return key().length > 0;
}

/** Fresh digits for the voice step, from the CSPRNG. */
export function newCaptureDigits(n: number = TWIN_LIMITS.digits): string {
  let s = '';
  for (let i = 0; i < n; i += 1) s += String(randomInt(0, 10));
  return s;
}

function validSlots(s: unknown): s is CaptureTicket['s'] {
  if (!s || typeof s !== 'object') return false;
  const map = s as Record<string, unknown>;
  const photoExts = Object.values(TWIN_PHOTO_MIMES);
  const voiceExts = Object.values(TWIN_VOICE_MIMES);
  if (!TWIN_PHOTO_SLOTS.every((slot) => typeof map[slot] === 'string' && photoExts.includes(map[slot] as string))) return false;
  if (map.voice !== undefined && !(typeof map.voice === 'string' && voiceExts.includes(map.voice))) return false;
  return Object.keys(map).every((k) => (TWIN_PHOTO_SLOTS as readonly string[]).includes(k) || k === 'voice');
}

/** Mint a ticket. null when no key is configured, or the input is not a well-formed capture. */
export function signCaptureTicket(t: { u: string; d: string; s: CaptureTicket['s'] }, now: number = Date.now()): string | null {
  if (!key() || !isTwinUserId(t.u) || !/^\d{4,12}$/.test(t.d) || !validSlots(t.s)) return null;
  const body: CaptureTicket = { v: 1, u: t.u, d: t.d, s: { ...t.s }, iat: now, exp: now + CAPTURE_TICKET_TTL_MS };
  const payload = Buffer.from(JSON.stringify(body)).toString('base64url');
  return `${PREFIX}.${payload}.${mac(payload)}`;
}

/** The ticket iff its MAC verifies, its shape is exact and it has not expired; null otherwise. */
export function verifyCaptureTicket(token: unknown, now: number = Date.now()): CaptureTicket | null {
  if (typeof token !== 'string' || token.length > 2048 || !key()) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;
  const payload = parts[1] ?? '';
  const a = Buffer.from(parts[2] ?? '');
  const b = Buffer.from(mac(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let p: Partial<CaptureTicket> | null;
  try {
    p = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<CaptureTicket>;
  } catch {
    return null;
  }
  if (!p || p.v !== 1 || !isTwinUserId(p.u)) return null;
  if (typeof p.d !== 'string' || !/^\d{4,12}$/.test(p.d) || !validSlots(p.s)) return null;
  if (typeof p.iat !== 'number' || typeof p.exp !== 'number' || !Number.isFinite(p.exp) || now > p.exp) return null;
  return { v: 1, u: p.u, d: p.d, s: { ...p.s }, iat: p.iat, exp: p.exp };
}
