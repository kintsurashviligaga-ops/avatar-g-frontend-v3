import { createHmac, timingSafeEqual } from 'crypto';

/**
 * lib/tasks/relayTicket.ts — a short signed pass from /api/tasks/stream to /api/tasks for ONE task of ONE user.
 *
 * ⚠️ WHY: the live timeline stream relays by reading GET /api/tasks?id=… every 2 s with the caller's own session. Each
 * of those reads re-verified the session (a network round trip to Supabase Auth, iad1 → ap-southeast-1) and spent a
 * rate-limit token in Redis, so one five-minute stream cost ~150 auth calls, and four cards at once reached the
 * 120-a-minute limit and got 429s. The stream already checked the session and the rate limit once, at its start; the
 * ticket carries that result to the reads, so they skip both and go straight to the task.
 *
 * ⚠️ WHAT IT GRANTS: reading that one task id as that user, until it expires (the stream's own lifetime), with the
 * worker rule (`workersOpen`) the stream decided. Nothing else: no list, no POST, no other id. Signed with HMAC-SHA256
 * under a domain label so no other signed token of this app can pass as one. No secret → no ticket (the reads simply
 * use the session, as before). Only minted while TASK_RELAY_TICKET is on.
 */

const DOMAIN = 'task-relay-v1';
export const RELAY_HEADER = 'x-task-relay';

export function relayTicketEnabled(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return /^(1|on|true|yes)$/i.test((env.TASK_RELAY_TICKET ?? '').trim());
}

function secretOf(env: Readonly<Record<string, string | undefined>>): string | null {
  const s = env.TASK_RELAY_SECRET || env.SUPABASE_SERVICE_ROLE_KEY;
  return s && s.length >= 16 ? s : null;
}

const sign = (secret: string, payload: string) => createHmac('sha256', secret).update(`${DOMAIN}\n${payload}`).digest('base64url');

export type RelayClaims = { userId: string; taskId: string; workersOpen: boolean };

/** A ticket for this user and task, valid for `ttlMs`; null when there is no secret. */
export function mintRelayTicket(
  c: RelayClaims, nowMs: number, ttlMs: number, env: Readonly<Record<string, string | undefined>> = process.env,
): string | null {
  const secret = secretOf(env);
  if (!secret || !c.userId || !c.taskId) return null;
  const payload = [c.userId, c.taskId, String(Math.floor(nowMs + ttlMs)), c.workersOpen ? '1' : '0']
    .map((p) => Buffer.from(p).toString('base64url')).join('.');
  return `${payload}.${sign(secret, payload)}`;
}

/** The claims of a valid, unexpired ticket for exactly `taskId`; null for anything else. Never throws. */
export function verifyRelayTicket(
  ticket: string | null | undefined, taskId: string, nowMs: number, env: Readonly<Record<string, string | undefined>> = process.env,
): RelayClaims | null {
  try {
    const secret = secretOf(env);
    if (!secret || !ticket || ticket.length > 1024) return null;
    const parts = ticket.split('.');
    if (parts.length !== 5) return null;
    const payload = parts.slice(0, 4).join('.');
    const want = Buffer.from(sign(secret, payload));
    const got = Buffer.from(parts[4] ?? '');
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
    const [userId, tid, exp, wo] = parts.slice(0, 4).map((p) => Buffer.from(p, 'base64url').toString());
    if (!userId || tid !== taskId) return null;
    const expMs = Number(exp);
    if (!Number.isFinite(expMs) || expMs <= nowMs) return null;
    return { userId, taskId: tid, workersOpen: wo === '1' };
  } catch {
    return null;
  }
}
