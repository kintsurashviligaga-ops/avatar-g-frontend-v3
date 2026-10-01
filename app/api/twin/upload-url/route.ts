/**
 * POST /api/twin/upload-url — start a Digital Twin capture. Body: { slots: { front, left, right: 'image/jpeg' | …,
 * voice?: 'audio/webm' | … }, handoffToken? }.
 *
 * Returns ONE signed upload URL per slot, all into the caller's private staging folder, plus the digits the person reads
 * aloud and the capture ticket /api/twin/commit requires (lib/twin/ticket.ts — it binds the digits and the slot types).
 *
 * ⚠️ NO BYTES PASS THROUGH HERE. The legacy enroll POSTed base64 data URLs in JSON: a 4.5 MB request-body ceiling on
 * Vercel and a third more bytes on the wire. The browser now PUTs each file straight to storage (uploadToSignedUrl);
 * this route only hands out the paths and tokens. Sizes and types are enforced at commit, on the committed copies.
 *
 *   404  NEXT_PUBLIC_TWIN_ENABLED off — answered BEFORE auth: a dark feature neither runs nor confirms it exists
 *   429  RATE_LIMITS.WRITE
 *   401  no session, and no valid unused phone-handoff link
 *   400  a slot's type is missing or not allowed
 *   503  no signing key / the bucket is missing or not private / storage did not answer
 *   200  { bucket, uploads: { front: { path, token }, … }, digits, ticket, expiresAt }
 */
import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';

import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { resolveTwinCaller } from '@/lib/twin/caller';
import { isTwinEnabled } from '@/lib/twin/flag';
import { TWIN_PRIVATE_BUCKET, extForSlotMime } from '@/lib/twin/paths';
import {
  TwinStorageError,
  assertTwinBucketPrivate,
  clearStaging,
  signStagingUploads,
  twinHandoffJtiStore,
  twinStorageClient,
  type TwinStorageClient,
} from '@/lib/twin/store';
import { CAPTURE_TICKET_TTL_MS, captureTicketsReady, newCaptureDigits, signCaptureTicket, type CaptureTicket } from '@/lib/twin/ticket';
import { TWIN_PHOTO_SLOTS, type TwinUploadUrlResponse } from '@/lib/twin/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

const json = (body: unknown, status: number) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/** The requested slot types → the extension each slot is signed for; null names the first bad slot. */
function parseSlots(raw: unknown): { ok: true; slots: CaptureTicket['s'] } | { ok: false; slot: string } {
  const m = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const slots: CaptureTicket['s'] = {};
  for (const slot of TWIN_PHOTO_SLOTS) {
    const ext = extForSlotMime(slot, m[slot]);
    if (!ext) return { ok: false, slot };
    slots[slot] = ext;
  }
  if (m.voice !== undefined && m.voice !== null && m.voice !== '') {
    const ext = extForSlotMime('voice', m.voice);
    if (!ext) return { ok: false, slot: 'voice' };
    slots.voice = ext;
  }
  return { ok: true, slots };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isTwinEnabled()) return json({ error: 'Not found' }, 404);

  const limited = await checkRateLimit(req, RATE_LIMITS.WRITE);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as { slots?: unknown; handoffToken?: unknown } | null;
  let sb: TwinStorageClient;
  try {
    sb = twinStorageClient();
  } catch {
    return json({ error: 'unavailable' }, 503);
  }
  const caller = await resolveTwinCaller(req, body?.handoffToken, twinHandoffJtiStore(sb));
  if (!caller.ok) return json({ error: caller.error }, caller.status);

  const parsed = parseSlots(body?.slots);
  if (!parsed.ok) return json({ error: 'unsupported_type', slot: parsed.slot }, 400);
  if (!captureTicketsReady()) return json({ error: 'unavailable' }, 503);

  try {
    await assertTwinBucketPrivate(sb);
    // An abandoned capture's uploads go before a new one is signed: staging only ever holds the latest capture.
    await clearStaging(sb, caller.userId);
    const uploads = await signStagingUploads(sb, caller.userId, parsed.slots);
    const now = Date.now();
    const digits = newCaptureDigits();
    const ticket = signCaptureTicket({ u: caller.userId, d: digits, s: parsed.slots }, now);
    if (!ticket) return json({ error: 'unavailable' }, 503);
    const res: TwinUploadUrlResponse = {
      bucket: TWIN_PRIVATE_BUCKET,
      uploads,
      digits,
      ticket,
      expiresAt: new Date(now + CAPTURE_TICKET_TTL_MS).toISOString(),
    };
    return json(res, 200);
  } catch (e) {
    if (e instanceof TwinStorageError) {
      // eslint-disable-next-line no-console
      console.warn('[twin/upload-url] storage unavailable:', e.op);
      return json({ error: 'unavailable' }, 503);
    }
    // eslint-disable-next-line no-console
    console.error('[twin/upload-url] failed:', e instanceof Error ? e.message : e);
    return json({ error: 'failed' }, 500);
  }
}
