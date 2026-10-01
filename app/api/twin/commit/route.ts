/**
 * POST /api/twin/commit — make the staged capture the caller's twin. Body: { ticket, consent: { version, acceptedAt },
 * voiceSeconds?, handoffToken? }.
 *
 * Copies staging into a fresh capture folder and validates the COPIES (lib/twin/store.ts promoteCapture: size, MIME,
 * magic bytes), records the consent (the text version + when it was given) and the digits the server issued, then
 * writes the manifest — the switch. A phone-handoff link is CLAIMED just before that switch: one link, one twin.
 *
 *   404  NEXT_PUBLIC_TWIN_ENABLED off — answered before auth
 *   429  RATE_LIMITS.WRITE
 *   401  no session / an invalid, expired or already-used link
 *   403  the capture ticket belongs to someone else
 *   400  no valid ticket, consent missing or not the current version, a photo missing, a file empty
 *   413  a file over its slot's cap · 415  a type that is not allowed, or bytes that are not what they claim
 *   503  storage or keys unavailable — nothing was switched; the same commit can be retried
 *   200  { ok: true, committedAt, hasVoice }
 */
import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';

import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { consumeHandoffToken } from '@/lib/avatar/handoff';
import { TWIN_CONSENT_VERSION } from '@/lib/legal/content';
import { resolveTwinCaller } from '@/lib/twin/caller';
import { isTwinEnabled } from '@/lib/twin/flag';
import {
  TwinStorageError,
  assertTwinBucketPrivate,
  discardCapture,
  promoteCapture,
  pruneTwinCaptures,
  readTwinManifest,
  twinHandoffJtiStore,
  twinStorageClient,
  writeTwinManifest,
  type TwinStorageClient,
} from '@/lib/twin/store';
import { verifyCaptureTicket } from '@/lib/twin/ticket';
import { buildManifest } from '@/lib/twin/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const json = (body: unknown, status: number) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/** A ticked box is at most a capture session old (the ticket lives 2 h) and never from the future (5 min of skew). */
const CONSENT_MAX_AGE_MS = 3 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

function parseConsent(raw: unknown, now: number): { version: string; acceptedAt: string } | null {
  const c = raw && typeof raw === 'object' ? (raw as { version?: unknown; acceptedAt?: unknown }) : null;
  if (!c || c.version !== TWIN_CONSENT_VERSION || typeof c.acceptedAt !== 'string') return null;
  const t = Date.parse(c.acceptedAt);
  if (!Number.isFinite(t) || t > now + CLOCK_SKEW_MS || t < now - CONSENT_MAX_AGE_MS) return null;
  return { version: TWIN_CONSENT_VERSION, acceptedAt: new Date(t).toISOString() };
}

function parseSeconds(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw <= 120 ? Math.round(raw * 10) / 10 : null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isTwinEnabled()) return json({ error: 'Not found' }, 404);

  const limited = await checkRateLimit(req, RATE_LIMITS.WRITE);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as
    | { ticket?: unknown; consent?: unknown; voiceSeconds?: unknown; handoffToken?: unknown }
    | null;
  let sb: TwinStorageClient;
  try {
    sb = twinStorageClient();
  } catch {
    return json({ error: 'unavailable' }, 503);
  }
  const jti = twinHandoffJtiStore(sb);
  const caller = await resolveTwinCaller(req, body?.handoffToken, jti);
  if (!caller.ok) return json({ error: caller.error }, caller.status);

  const ticket = verifyCaptureTicket(body?.ticket);
  if (!ticket) return json({ error: 'invalid_ticket' }, 400);
  if (ticket.u !== caller.userId) return json({ error: 'ticket_mismatch' }, 403);
  const now = Date.now();
  const consent = parseConsent(body?.consent, now);
  if (!consent) return json({ error: 'consent_required', consentVersion: TWIN_CONSENT_VERSION }, 400);

  let captureId: string | null = null;
  let claimed = false;
  try {
    await assertTwinBucketPrivate(sb);
    // The capture this commit replaces — removed right after the switch (pruneTwinCaptures).
    const previous = (await readTwinManifest(sb, caller.userId))?.captureId ?? null;
    const promoted = await promoteCapture(sb, caller.userId, ticket);
    if (!promoted.ok) return json({ error: promoted.error, ...(promoted.slot ? { slot: promoted.slot } : {}) }, promoted.status);
    captureId = promoted.captureId;

    // The link is spent HERE — after every check passed, right before the switch. A second phone, a replayed QR or a
    // double-tap loses this race and keeps nothing.
    if (caller.via === 'handoff') {
      const consumed = await consumeHandoffToken(caller.token, jti);
      if (!consumed.ok) {
        await discardCapture(sb, caller.userId, captureId).catch(() => undefined);
        return consumed.reason === 'unavailable'
          ? json({ error: 'unavailable' }, 503)
          : json({ error: consumed.reason === 'used' ? 'link_already_used' : 'invalid_or_expired_link' }, 401);
      }
      claimed = true;
    }

    const manifest = buildManifest({
      userId: caller.userId,
      captureId,
      photos: promoted.photos,
      voice: promoted.voice,
      voiceSeconds: promoted.voice ? parseSeconds(body?.voiceSeconds) : null,
      digits: ticket.d,
      consent,
      via: caller.via,
      now: new Date(now),
    });
    try {
      await writeTwinManifest(sb, manifest);
    } catch (e) {
      // ⚠️ A failed write is not proof nothing landed (a lost response). Read it back before undoing anything: deleting
      // the capture a landed manifest points at would leave a twin that can never be signed again.
      const landed = await readTwinManifest(sb, caller.userId).then((m) => m?.captureId === captureId, () => null);
      if (landed !== true) {
        if (landed === false) {
          // Truly not switched: give the link back so the person can retry it, and drop the unreferenced copy.
          if (claimed && caller.via === 'handoff') await jti.release(caller.claims.jti);
          await discardCapture(sb, caller.userId, captureId).catch(() => undefined);
        }
        captureId = null; // undo handled (or deliberately left for the next commit's prune when it cannot be told)
        throw e;
      }
    }

    try {
      await pruneTwinCaptures(sb, caller.userId, { previous });
    } catch (e) {
      // The twin is committed; a leftover older capture is erased by the next commit or by DELETE /api/twin.
      // eslint-disable-next-line no-console
      console.warn('[twin/commit] older capture cleanup skipped:', e instanceof Error ? e.message : e);
    }
    return json({ ok: true, committedAt: manifest.committedAt, hasVoice: manifest.voice !== null }, 200);
  } catch (e) {
    // A failure BEFORE the switch was attempted (captureId is cleared once it was): give the link back and drop the copy.
    if (captureId) {
      if (claimed && caller.via === 'handoff') await jti.release(caller.claims.jti);
      await discardCapture(sb, caller.userId, captureId).catch(() => undefined);
    }
    if (e instanceof TwinStorageError) {
      // eslint-disable-next-line no-console
      console.warn('[twin/commit] storage unavailable:', e.op);
      return json({ error: 'unavailable' }, 503);
    }
    // eslint-disable-next-line no-console
    console.error('[twin/commit] failed:', e instanceof Error ? e.message : e);
    return json({ error: 'failed' }, 500);
  }
}
