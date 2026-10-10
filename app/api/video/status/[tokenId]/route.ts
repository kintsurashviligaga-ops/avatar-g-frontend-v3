/**
 * GET /api/video/status/[tokenId]
 * ===============================
 * PHASE 47 §1 — Unified, storage-backed status tracker for a 30-second film.
 *
 * The chat shell's in-tab poll loop follows the live render, but the assembled
 * master used to live ONLY in that tab's memory. This endpoint exposes the
 * durable `FilmStatusRecord` (persisted by the poll path + the assemble route)
 * so ANY client — a reload, a second device, or a returning session — can
 * recover the unified state and the final hosted master URL without re-driving
 * the whole render.
 *
 *   { tokenId, phase, clips[], audioReady, masterUrl, updatedAt, error }
 *
 * `phase` walks rendering → ready → assembling → assembled (or → failed). When
 * no record has been persisted yet the endpoint answers honestly with
 * `phase: 'unknown'` and HTTP 200 (the film may simply not have reached its
 * first poll tick), so the client can keep polling without treating it as an
 * error. The `tokenId` is a non-guessable hash of the film's identity tuple —
 * not a secret value — and the record never contains a credential.
 *
 * ⚠️ THE MASTER GOES ONLY TO THE ACCOUNT THAT PAID FOR IT. This route used to answer anyone holding a token id with a
 * freshly signed 7-day link to the film, plus the payer's account id and its billing flags. A token id is not a
 * secret (it sits in the client and in logs), so a leaked one was a permanent, renewable link to someone else's film.
 * Now: the billing fields never leave the server, and `masterUrl` is filled in only when the caller is the record's
 * payer (the /assemble route stamps it, and /assemble is signed-in only). Anyone else sees the phase, never the link.
 */

import { NextResponse } from 'next/server';
import { getFilmStatus, filmStatusPersistenceEnabled, type FilmStatusRecord } from '@/lib/chat/filmStatusStore';
import { reSignIfInternal } from '@/lib/orchestrator/storage-adapter';
import { authedClientFromRequest } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** What a caller may see of a record: never the billing fields, and the master only when the caller paid for it. */
function publicView(record: FilmStatusRecord, callerUid: string | null): FilmStatusRecord {
  const mine = typeof record.payerUid === 'string' && record.payerUid.length > 0 && record.payerUid === callerUid;
  const view: FilmStatusRecord = { ...record, masterUrl: mine ? record.masterUrl : null };
  delete view.payerUid;
  delete view.billingConsumed;
  delete view.freeFilmWaived;
  return view;
}

export async function GET(
  request: Request,
  { params }: { params: { tokenId: string } },
): Promise<NextResponse> {
  const tokenId = String(params.tokenId || '').trim();
  if (!tokenId) {
    return NextResponse.json({ error: 'tokenId is required' }, { status: 400 });
  }

  const record = await getFilmStatus(tokenId);
  if (record) {
    let callerUid: string | null = null;
    try {
      callerUid = (await authedClientFromRequest(request)).user?.id ?? null;
    } catch {
      callerUid = null;
    }
    const view = publicView(record, callerUid);
    // v330 — re-sign the persisted master URL on every recovery so a reload / second
    // device / returning session always gets a LIVE link. The stored URL can be a
    // short-lived signed URL that has since expired (→ blank player / MEDIA_ERR 4);
    // reSignIfInternal mints a fresh 7-day token for our bucket objects and passes
    // external/provider URLs through unchanged.
    const masterUrl = view.masterUrl ? await reSignIfInternal(view.masterUrl, 604_800) : view.masterUrl;
    return NextResponse.json({ ...view, masterUrl, durable: filmStatusPersistenceEnabled() });
  }

  // No record yet — honest "unknown" so the client keeps polling rather than
  // surfacing a false failure for a film that hasn't reached its first tick.
  const unknown: FilmStatusRecord = {
    tokenId,
    phase: 'unknown',
    clips: [],
    audioReady: false,
    masterUrl: null,
    updatedAt: Date.now(),
    error: null,
  };
  return NextResponse.json({ ...unknown, durable: filmStatusPersistenceEnabled() });
}
