/**
 * lib/calls/whatsapp/ticket.ts — the signed, short-lived pass the media bridge carries for ONE call.
 *
 * The bridge (services/wa-call-bridge) holds no key, no prompt and no rules. For each call our app hands it a ticket;
 * every request the bridge makes back (the SDP answer, the Gemini Live setup, a tool call, a transcript, the end) carries
 * that ticket, and the app reads the user, the call and its limits FROM THE TICKET, never from the request body. A
 * ticket for one call can never act for another user or another call.
 *
 * Format: base64url(JSON payload) "." base64url(HMAC-SHA256(payload, CALL_BRIDGE_SECRET)). Verified with a constant-time
 * compare; expired tickets are refused. It is valid for the call's cap plus a margin, and the app also refuses it once
 * the call record is final (lib/calls/whatsapp/callService.ts), so a leaked ticket dies with its call.
 */
import crypto from 'node:crypto';

export interface CallTicket {
  v: 1;
  callId: string;
  userId: string;
  phoneNumberId: string;
  locale: 'ka' | 'en' | 'ru';
  /** Seconds this call may last (the gates' decision). */
  maxSeconds: number;
  creditsPerMinute: number;
  direction: 'USER_INITIATED' | 'BUSINESS_INITIATED';
  /** Expiry, epoch ms. */
  exp: number;
  nonce: string;
}

export const TICKET_MARGIN_MS = 5 * 60_000;
const MAX_TICKET_CHARS = 2048;

const b64u = (b: Buffer | string): string => Buffer.from(b).toString('base64url');
const mac = (payload: string, secret: string): string => crypto.createHmac('sha256', secret).update(payload).digest('base64url');

/** The configured secret, or '' (then no ticket is ever issued or accepted: fail closed). At least 32 characters. */
export function bridgeSecret(env: NodeJS.ProcessEnv = process.env): string {
  const s = (env.CALL_BRIDGE_SECRET ?? '').trim();
  return s.length >= 32 ? s : '';
}

export function issueTicket(
  input: Omit<CallTicket, 'v' | 'exp' | 'nonce'>,
  secret: string,
  now: number,
): string {
  if (!secret) throw new Error('CALL_BRIDGE_SECRET is not configured');
  const t: CallTicket = { v: 1, ...input, exp: now + input.maxSeconds * 1000 + TICKET_MARGIN_MS, nonce: crypto.randomBytes(12).toString('base64url') };
  const payload = b64u(JSON.stringify(t));
  return `${payload}.${mac(payload, secret)}`;
}

export type TicketCheck = { ok: true; ticket: CallTicket } | { ok: false; error: 'missing' | 'malformed' | 'bad_signature' | 'expired' };

export function verifyTicket(token: unknown, secret: string, now: number): TicketCheck {
  if (typeof token !== 'string' || !token) return { ok: false, error: 'missing' };
  if (!secret || token.length > MAX_TICKET_CHARS) return { ok: false, error: 'malformed' };
  const dot = token.indexOf('.');
  if (dot <= 0 || dot !== token.lastIndexOf('.')) return { ok: false, error: 'malformed' };
  const payload = token.slice(0, dot);
  const sig = Buffer.from(token.slice(dot + 1));
  const want = Buffer.from(mac(payload, secret));
  if (sig.length !== want.length || !crypto.timingSafeEqual(sig, want)) return { ok: false, error: 'bad_signature' };
  let t: CallTicket;
  try {
    t = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as CallTicket;
  } catch {
    return { ok: false, error: 'malformed' };
  }
  if (!t || t.v !== 1 || typeof t.callId !== 'string' || typeof t.userId !== 'string' || typeof t.exp !== 'number') {
    return { ok: false, error: 'malformed' };
  }
  if (t.exp <= now) return { ok: false, error: 'expired' };
  return { ok: true, ticket: t };
}

/** The ticket from `Authorization: Bearer <ticket>`. */
export function ticketFromRequest(req: Request): string | null {
  const h = req.headers.get('authorization') ?? '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() || null : null;
}

/**
 * The app → bridge request signature: HMAC over `${timestamp}.${body}`, sent as `x-call-signature: t=<ms>,s=<b64u>`.
 * The bridge accepts it only within ±60 s (no replays of an old offer).
 */
export function signBridgeRequest(body: string, secret: string, now: number): string {
  return `t=${now},s=${mac(`${now}.${body}`, secret)}`;
}

export function verifyBridgeRequest(body: string, header: string | null, secret: string, now: number, skewMs = 60_000): boolean {
  if (!secret || !header) return false;
  const m = /^t=(\d{10,16}),s=([A-Za-z0-9_-]{20,128})$/.exec(header.trim());
  if (!m) return false;
  const [, ts = '', sig = ''] = m;
  const t = Number(ts);
  if (!Number.isFinite(t) || Math.abs(now - t) > skewMs) return false;
  const want = Buffer.from(mac(`${t}.${body}`, secret));
  const got = Buffer.from(sig);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}
