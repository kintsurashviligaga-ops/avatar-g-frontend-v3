/**
 * Rate Limiting — Redis-backed in production, in-memory fallback for dev.
 *
 * Uses a sliding window counter stored in Upstash Redis via the INCR + EXPIRE
 * pattern. Each key is namespaced by route prefix so limits are isolated.
 *
 * Falls back to in-memory when UPSTASH_REDIS_REST_URL is not set (local dev).
 */

import { NextRequest, NextResponse } from 'next/server';
import type { PlanTier } from '@/lib/billing/plans';
import { isTruthyFlag } from '@/lib/env/flag';

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  keyPrefix?: string;
}

// ─── In-memory fallback (dev / single-process) ───────────────────────────────

class InMemoryRateLimiter {
  private store = new Map<string, { count: number; resetTime: number }>();

  check(key: string, config: RateLimitConfig): { allowed: boolean; remaining: number; resetTime: number } {
    const now = Date.now();
    const record = this.store.get(key);

    if (!record || now > record.resetTime) {
      this.store.set(key, { count: 1, resetTime: now + config.windowMs });
      // The first request counts like any other (1 ≤ max), exactly as the Redis path's INCR does: a bucket with
      // maxRequests 0 (CHAT_PRO_DAILY_LIMIT=0 — "Pro off") used to let every key's first request through here.
      return { allowed: config.maxRequests >= 1, remaining: Math.max(0, config.maxRequests - 1), resetTime: now + config.windowMs };
    }

    record.count++;
    const allowed = record.count <= config.maxRequests;
    return {
      allowed,
      remaining: Math.max(0, config.maxRequests - record.count),
      resetTime: record.resetTime,
    };
  }

  /** Undo one counted request in a live window. A missing or expired bucket, or a count of 0, is left alone. */
  refund(key: string): void {
    const record = this.store.get(key);
    if (!record || Date.now() > record.resetTime || record.count <= 0) return;
    record.count--;
  }

  cleanup() {
    const now = Date.now();
    for (const [key, record] of this.store) {
      if (now > record.resetTime) this.store.delete(key);
    }
  }
}

const memLimiter = new InMemoryRateLimiter();
if (typeof setInterval !== 'undefined') {
  setInterval(() => memLimiter.cleanup(), 5 * 60 * 1000);
}

// ─── Redis-backed limiter (production) ───────────────────────────────────────

async function redisRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<{ allowed: boolean; remaining: number; resetTime: number } | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const windowSec = Math.ceil(config.windowMs / 1000);

  try {
    // Atomic INCR + conditional EXPIRE using a pipeline
    const pipeline = [
      ['INCR', key],
      ['TTL', key],
    ];

    const res = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(pipeline),
      cache: 'no-store',
    });

    if (!res.ok) return null;

    const data = (await res.json()) as Array<{ result: number }>;
    const count = data[0]?.result ?? 1;
    const ttl = data[1]?.result ?? -1;

    // Set expiry only on first request in this window
    if (ttl === -1) {
      await fetch(`${url}/expire/${encodeURIComponent(key)}/${windowSec}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
    }

    const resetTime = Date.now() + (ttl > 0 ? ttl * 1000 : config.windowMs);
    const allowed = count <= config.maxRequests;
    return { allowed, remaining: Math.max(0, config.maxRequests - count), resetTime };
  } catch {
    return null;
  }
}

/**
 * DECR one key. A result below zero means the key had already expired (DECR created it at -1, with no TTL): it is
 * deleted, so a refund can never leave a negative, never-expiring counter behind. Null when Redis is not configured
 * or the call failed — the caller then tries the in-memory store, the one `limitByKey` fell back to.
 */
async function redisRefund(key: string): Promise<true | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const res = await fetch(`${url}/pipeline`, { method: 'POST', headers, body: JSON.stringify([['DECR', key]]), cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ result: number }>;
    if ((data[0]?.result ?? 0) < 0) {
      await fetch(`${url}/pipeline`, { method: 'POST', headers, body: JSON.stringify([['DEL', key]]), cache: 'no-store' });
    }
    return true;
  } catch {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const RATE_LIMITS = {
  READ:      { maxRequests: 100, windowMs: 60_000,       keyPrefix: 'rl:read'  } as const,
  WRITE:     { maxRequests: 20,  windowMs: 60_000,       keyPrefix: 'rl:write' } as const,
  EXPENSIVE: { maxRequests: 5,   windowMs: 60_000,       keyPrefix: 'rl:exp'   } as const,
  // Voice-mode ephemeral-token mint (IP-keyed burst guard). Voice is intentionally FREE for signed-in
  // users (no credit gate), so this is deliberately forgiving — a legit user reconnecting / toggling the
  // ♀/♂ voice (each swap re-mints) / re-opening the call must not hit a "Too many requests" wall at 5.
  // Per-ACCOUNT cost is bounded separately by VOICE_TOKEN_USER (keyed on userId, defeats IP rotation).
  VOICE_TOKEN:{ maxRequests: 15,  windowMs: 60_000,       keyPrefix: 'rl:voice' } as const,
  // Per-USER daily ceiling on the cost-bearing Live mint, keyed on the authenticated userId (NOT IP), so
  // rotating IPs across throwaway auto-confirmed signups can't mint unbounded 30-min native-audio sessions.
  // Generous (≈ a whole day of heavy real use incl. voice-swaps) — it caps abuse, not legitimate testing.
  VOICE_TOKEN_USER:{ maxRequests: 200, windowMs: 24 * 60 * 60_000, keyPrefix: 'rl:voice:user' } as const,
  // Per-USER daily ceiling on the EXPENSIVE real-time LiveAvatar (LiveKit) session mint — each session is a
  // costly streaming avatar, so this is much tighter than the Gemini token cap. Bounds a single account
  // from starting hundreds of paid sessions; the owner can raise it as the plan matures.
  LIVEAVATAR_SESSION:{ maxRequests: 20, windowMs: 24 * 60 * 60_000, keyPrefix: 'rl:liveavatar:user' } as const,
  // Per-USER daily ceiling on the product chat (/api/chat/gemini). Use it with checkRateLimitByKey(userId, …)
  // AFTER the session is verified — keyed on the account, not the IP, so rotating IPs cannot buy more turns.
  // ⚠️ The per-IP READ bucket that used to be chat's ONLY brake is shared with every other READ route and is a
  // per-minute burst guard; it never bounded what one account could spend in a day. Each turn is a paid Gemini
  // call (plus Google Search grounding). 500 matches DAILY_AI_LIMIT, the cap the other chat routes already use —
  // a heavy day of real conversation, far below a scripted drain. The platform budget guard is the global backstop.
  CHAT_USER: { maxRequests: 500, windowMs: 24 * 60 * 60_000, keyPrefix: 'rl:chat:user' } as const,
  // Per-USER daily allowance of PRO turns (/api/chat/gemini, mode 'pro'), keyed on the verified userId and checked
  // AFTER CHAT_USER — a Pro turn draws on both buckets. A Pro turn costs ~3× a Fast one on output (3.1 Pro $2/$12 per
  // 1M vs 3.8 Flash $1.50/$7.50, plus thinking), so CHAT_USER alone left one account able to spend ~$0.10 × 500 a day.
  // 20 is Gemini-app-like: roughly $0.9 typical / $2 heavy per user per day. When it is spent the route DOWNGRADES the
  // turn to Fast (with a notice) instead of refusing it. Read it through `chatProUserLimit()`, which applies the
  // operator's CHAT_PRO_DAILY_LIMIT; this entry is the default and the namespace.
  CHAT_PRO_USER: { maxRequests: 20, windowMs: 24 * 60 * 60_000, keyPrefix: 'rl:chat:pro:user' } as const,
  // Read-aloud (/api/tts/gemini), IP-keyed, before the session check. Its OWN namespace on purpose.
  // ⚠️ IT USED TO DRAW ON WRITE (20/min, shared with every other WRITE route). The studio reads a reply in ~600-char
  // chunks and prefetches the next one, so ONE long answer is ~14 requests. Two long replies in a minute — or one
  // plus a message sent — hit 429, and the client skips a 429'd chunk SILENTLY: words vanished from the middle of
  // the read-aloud. 60/min is four long replies per minute; the sign-in gate and the platform budget guard bound cost.
  TTS:       { maxRequests: 60,  windowMs: 60_000,       keyPrefix: 'rl:tts'   } as const,
  // Per-USER ceiling on speech-to-text (/api/voice/transcribe), keyed on the verified userId via
  // checkRateLimitByKey AFTER the session check, so rotating IPs buys nothing. Sized for real use: a minute of
  // dictation runs ~10 interim passes + the final (lib/voice/interimCadence.ts) and the voice-call loop sends one
  // clip per turn, so 600/hour is a continuous hour of either — far below a scripted drain.
  STT_USER:  { maxRequests: 600, windowMs: 60 * 60_000,  keyPrefix: 'rl:stt:user' } as const,
  // Per-USER daily ceiling on read-aloud (/api/tts/gemini), keyed on the verified userId AFTER the session check (the
  // IP-keyed TTS bucket above is only the burst guard; rotating IPs used to buy unlimited synthesis). A long reply is
  // ~14 chunks, so 1500/day is 100+ long replies read aloud — a heavy day, far below a scripted drain.
  TTS_USER:  { maxRequests: 1500, windowMs: 24 * 60 * 60_000, keyPrefix: 'rl:tts:user' } as const,
  // Per-USER daily ceiling on the small free Gemini text helpers (magic-wand prompt enhance, chat titles). One shared
  // bucket: both are a few hundred tokens, and a real day uses them dozens of times, not thousands.
  HELPER_USER: { maxRequests: 400, windowMs: 24 * 60 * 60_000, keyPrefix: 'rl:helper:user' } as const,
  // Per-USER daily ceiling on the PAID audio helpers that bill no credits of their own — the Georgian-vocal song builder
  // (ElevenLabs TTS + Music, up to 3 attempts per call), sound effects and the /api/orbit voice proxy. Keyed on the
  // verified userId AFTER the sign-in gate. ⚠️ All three used to be anonymous; a georgian-song call alone is several
  // ElevenLabs requests. 60/day is a long day of music videos, far below a scripted drain.
  AUDIO_GEN_USER: { maxRequests: 60, windowMs: 24 * 60 * 60_000, keyPrefix: 'rl:audiogen:user' } as const,
  // The public support form (/api/support), per IP. Each accepted post can send an email through Resend to the support
  // inbox; with no limit at all, one script could fill the inbox and burn the sending quota. 5 per 15 minutes is more
  // than any person writes to support.
  SUPPORT:   { maxRequests: 5,   windowMs: 15 * 60_000,  keyPrefix: 'rl:support' } as const,
  // Storyboard preview = ONE logical generation that fans out into many quick
  // server calls (plan + per-scene frame stream + retries + re-rolls). Treating
  // each as EXPENSIVE (5/min) tripped a 429 mid-board, leaving frames blank. This
  // dedicated tier sizes the limit to a full board (+ a re-roll or two) per minute.
  STORYBOARD:{ maxRequests: 30,  windowMs: 60_000,       keyPrefix: 'rl:sb'    } as const,
  // ⚠️ THIS USED TO LOCK OUT WHOLE NETWORKS. 5 per 15 minutes keyed on IP alone means that behind
  // Georgian mobile CGNAT, an office, or a cafe, the SIXTH registration attempt from that entire
  // network in a quarter of an hour is refused — for something the person has not done. And since a
  // broken resend also spent from this budget, one user's failed sign-up could exhaust it for everyone
  // around them. Auth routes now pass the email as an identity so the small per-user budget is scoped
  // to that user, and AUTH_IP is the far looser ceiling that still stops one host mass-creating
  // accounts. Neither number alone can do both jobs.
  AUTH:      { maxRequests: 5,   windowMs: 15 * 60_000,  keyPrefix: 'rl:auth'  } as const,
  AUTH_IP:   { maxRequests: 40,  windowMs: 15 * 60_000,  keyPrefix: 'rl:authip'} as const,
  // ⚠️ PER ADDRESS, NOT PER IP. AUTH is keyed ip+email, so a script on rotating IPs could flood one inbox with sign-in
  // codes — and every new code invalidates the one the person is typing (security review, 2026-10-01). This bucket is
  // keyed by the ADDRESS alone (hashed — no plain emails in Redis): at most 5 codes per 15 minutes, i.e. ≤ 20 an hour.
  // ⚠️ NO DAILY CAP: anyone can spend an address's budget, so a 24-h bucket let one IP lock a person out of code
  // sign-in for a day (review, 2026-10-01). A short window bounds the flood and expires on its own; the real fix for
  // a determined attacker is a CAPTCHA (owner action — Turnstile keys).
  OTP_ADDRESS:     { maxRequests: 5,  windowMs: 15 * 60_000,      keyPrefix: 'rl:otp:addr' } as const,
  // /api/auth/lookup — „does this address have an account?" (the sheet's log-in / sign-up split, 2026-10-03). It says
  // what sign-up must say anyway („already registered"), so it is bounded like the code sends: this per-ADDRESS bucket
  // (a person retyping and switching between log-in and sign-up stays far inside it) under the AUTH_IP ceiling, which
  // caps how many addresses one host can probe — 40 per 15 minutes.
  AUTH_LOOKUP:     { maxRequests: 20, windowMs: 15 * 60_000,      keyPrefix: 'rl:auth:lookup' } as const,
  PUBLIC:    { maxRequests: 200, windowMs: 60_000,       keyPrefix: 'rl:pub'   } as const,
  AI:        { maxRequests: 10,  windowMs: 60_000,       keyPrefix: 'rl:ai'    } as const,
  // 3D reconstruction STATUS polling — its OWN namespace, and that is the point.
  //
  // It used to draw on the AI bucket, which is the same bucket /api/ai/chat, /api/agent-g/chat,
  // /api/v2/personas and /api/pipeline/run all use. The 3D poll ramps 3s,4s,5s,… so it fires at
  // t=3,7,12,18,25,33,42,52 — EIGHT of the ten allowed requests inside the first minute. And the 3D
  // surface lives INSIDE the chat box, whose own copy invites the user to keep talking while it runs, so
  // the two were guaranteed to starve each other: chat messages came back "Too many requests" mid-render,
  // and chatting got the poll 429'd (the client silently discards those ticks and burns poll attempts).
  // Sized for a long poll — a status read is a cheap provider lookup, not a render.
  POLL_3D:   { maxRequests: 60,  windowMs: 60_000,       keyPrefix: 'rl:3dpoll' } as const,
  WEBHOOK:   { maxRequests: 500, windowMs: 60_000,       keyPrefix: 'rl:wh'    } as const,
} as const;

/** The most a CHAT_PRO_DAILY_LIMIT override may raise the Pro allowance to — a typo must not unbound Pro spend. */
const MAX_CHAT_PRO_DAILY = 10_000;

/**
 * RATE_LIMITS.CHAT_PRO_USER with the operator's CHAT_PRO_DAILY_LIMIT applied, read at CALL time (like the model
 * chains) so an env change needs no code change. A whole number 0 … 10,000; anything else (unset, blank, "20/day",
 * negative, fractional, huge) keeps the default. 0 turns Pro off: every Pro turn is answered by Fast. The key prefix
 * never changes, so moving the number up or down keeps today's count.
 */
export function chatProUserLimit(): RateLimitConfig {
  const base = RATE_LIMITS.CHAT_PRO_USER;
  const raw = (process.env.CHAT_PRO_DAILY_LIMIT ?? '').trim();
  if (!/^\d{1,6}$/.test(raw)) return { ...base };
  const n = Number(raw);
  return n <= MAX_CHAT_PRO_DAILY ? { ...base, maxRequests: n } : { ...base };
}

export function getRateLimitForPlan(
  plan: PlanTier,
  operation: 'read' | 'write' | 'expensive' = 'read'
): RateLimitConfig {
  const key = operation.toUpperCase() as 'READ' | 'WRITE' | 'EXPENSIVE';
  const base = RATE_LIMITS[key];
  const multipliers: Record<string, number> = {
    ENTERPRISE: 5, PREMIUM: 3, PRO: 1.5,
  };
  const mult = multipliers[plan] ?? 1;
  return { ...base, maxRequests: Math.round(base.maxRequests * mult) };
}

/** First comma-separated entry of an IP header, trimmed; '' when absent or blank. */
function firstIp(value: string | null): string {
  return value?.split(',')[0]?.trim() ?? '';
}

/**
 * The client IP the per-IP buckets are keyed on.
 *
 * ⚠️ THIS USED TO TRUST `cf-connecting-ip` FIRST, AND WE ARE NOT BEHIND CLOUDFLARE. The app is served
 * by Vercel's edge (Cloudflare is only R2 storage here), and nothing between the browser and this code
 * sets or strips `cf-connecting-ip` — so it arrives exactly as the client typed it. `curl -H
 * 'cf-connecting-ip: <random>'` got a brand-new bucket on EVERY request, which made every per-IP limit
 * decorative — including the only brake on anonymous chat spend. A header is only trustworthy if the
 * hop that sets it also overwrites whatever the client sent, so the order is:
 *
 *   1. `x-vercel-forwarded-for` — written by Vercel's edge; the client can't supply its own.
 *   2. `x-real-ip`              — also written by Vercel's edge.
 *   3. `x-forwarded-for`, FIRST entry — Vercel overwrites it too, but it is the header every other
 *      proxy APPENDS to, so anywhere else the first slot is whatever the client sent. Last resort.
 *
 * `cf-connecting-ip` is honoured ONLY when TRUST_CF_CONNECTING_IP says the site really is behind
 * Cloudflare — and then it goes FIRST, because behind a Cloudflare proxy the Vercel headers carry
 * Cloudflare's egress IP, which is shared by thousands of unrelated visitors (one bucket for all of
 * them). Turning the flag on without the proxy reopens the bypass, so it is off by default.
 *
 * Off Vercel (local dev, a bare `next start`) all of these are client-controlled; that is a hosting
 * property this function cannot fix, and dev is the only place that happens today.
 */
function getClientIp(req: NextRequest): string {
  const h = req.headers;
  const cf = isTruthyFlag(process.env.TRUST_CF_CONNECTING_IP) ? firstIp(h.get('cf-connecting-ip')) : '';
  return (
    cf ||
    firstIp(h.get('x-vercel-forwarded-for')) ||
    firstIp(h.get('x-real-ip')) ||
    firstIp(h.get('x-forwarded-for')) ||
    'unknown'
  );
}

function getClientKey(req: NextRequest, prefix: string, identity?: string): string {
  const ip = getClientIp(req);
  // An identity (an email, a user id) scopes the bucket to ONE person sharing that IP, which is the
  // difference between rate-limiting an abuser and rate-limiting a cafe.
  return identity ? `${prefix}:${ip}:${identity.toLowerCase().trim()}` : `${prefix}:${ip}`;
}

/** Run the limiter for an already-built key and return a 429 response if the window is exhausted. */
async function limitByKey(key: string, config: RateLimitConfig): Promise<NextResponse | null> {
  const result =
    (await redisRateLimit(key, config)) ??
    memLimiter.check(key, config);

  if (result.allowed) return null;

  const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000);

  return new NextResponse(
    JSON.stringify({
      status: 'error',
      error: 'Too many requests',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter),
        'X-RateLimit-Limit': String(config.maxRequests),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.ceil(result.resetTime / 1000)),
      },
    }
  );
}

export async function checkRateLimit(
  req: NextRequest,
  config: RateLimitConfig = RATE_LIMITS.READ,
  /** Scopes the bucket to one person on a shared IP — see AUTH/AUTH_IP. */
  identity?: string,
): Promise<NextResponse | null> {
  return limitByKey(getClientKey(req, config.keyPrefix ?? 'rl', identity), config);
}

/**
 * Rate-limit by an EXPLICIT identifier (e.g. a resolved userId) rather than the request IP. Use for
 * per-ACCOUNT caps where IP rotation must not defeat the limit (cost-bearing mints). Call AFTER the
 * caller is authenticated so `id` is the trusted principal. Returns a 429 NextResponse when exceeded.
 */
export async function checkRateLimitByKey(
  id: string,
  config: RateLimitConfig
): Promise<NextResponse | null> {
  return limitByKey(`${config.keyPrefix ?? 'rl:key'}:${id}`, config);
}

/**
 * Gives back one request `checkRateLimitByKey(id, config)` counted — for an allowance charged UP FRONT (so two
 * concurrent requests cannot both slip under the cap) whose work then did not happen, e.g. a Pro chat turn that Pro
 * never answered. Best effort: never below zero, never creates a bucket, never throws.
 */
export async function refundRateLimitByKey(id: string, config: RateLimitConfig): Promise<void> {
  const key = `${config.keyPrefix ?? 'rl:key'}:${id}`;
  try {
    if (await redisRefund(key)) return;
    memLimiter.refund(key);
  } catch {
    /* best effort */
  }
}

/** Backward-compatible alias */
export const rateLimit = checkRateLimit;
