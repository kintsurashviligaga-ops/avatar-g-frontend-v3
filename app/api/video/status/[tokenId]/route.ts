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
 */

import { NextResponse } from 'next/server';
import { getFilmStatus, filmStatusPersistenceEnabled, type FilmStatusRecord } from '@/lib/chat/filmStatusStore';
import { reSignIfInternal } from '@/lib/orchestrator/storage-adapter';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: { tokenId: string } },
): Promise<NextResponse> {
  const tokenId = String(params.tokenId || '').trim();
  if (!tokenId) {
    return NextResponse.json({ error: 'tokenId is required' }, { status: 400 });
  }

  const record = await getFilmStatus(tokenId);
  if (record) {
    // v330 — re-sign the persisted master URL on every recovery so a reload / second
    // device / returning session always gets a LIVE link. The stored URL can be a
    // short-lived signed URL that has since expired (→ blank player / MEDIA_ERR 4);
    // reSignIfInternal mints a fresh 7-day token for our bucket objects and passes
    // external/provider URLs through unchanged.
    const masterUrl = record.masterUrl ? await reSignIfInternal(record.masterUrl, 604_800) : record.masterUrl;
    return NextResponse.json({ ...record, masterUrl, durable: filmStatusPersistenceEnabled() });
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
