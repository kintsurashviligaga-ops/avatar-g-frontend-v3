/**
 * POST /api/v2/montage/smart/captions — Chirp 3 words for the clips on the timeline (Phase 8.7, GG D1: ✦2 per started
 * minute of audio sent, charged AFTER the words came back, nothing charged when no piece came back).
 *
 *   { sources: [{ sourceId, url | path, startSec, endSec }], lang: 'ka'|'en'|'ru', quote?: true }
 *   → quote: { ok, credits, billedSec }                     (no call, no charge)
 *   → run:   { ok, wordsBySource, billedSec, charged }      (words in SOURCE seconds: the editor lays them on the cut
 *                                                            edit itself — smart/captions wordsOnMaster — so later
 *                                                            trims need no new call and no new charge)
 *
 * One window per source (the union of the clips cut from it), at most 300 s of audio in all (Montage's cap).
 * 404 unless MONTAGE_SMART_EDITOR lets this user in.
 */
import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { applyApiGuards } from '@/lib/api/guard';
import { RATE_LIMITS } from '@/lib/api/rate-limit';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { serviceOffResponse } from '@/lib/server/serviceSwitches';
import { deductCreditsOnce, hasSufficientBalance } from '@/lib/orchestrator/ledger';
import { isCaptionLang } from '@/lib/services/montage/smart/captions';
import { captionCredits } from '@/lib/services/montage/smart/price';
import { liveSmartDeps, resolveMedia, runCaptions, smartFail, smartOpenTo, type CaptionSource } from '@/lib/services/montage/smart/server';
import { MAX_TOTAL_SEC } from '@/lib/services/montage/montagePlan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_SOURCES = 12;

export async function POST(req: NextRequest) {
  const gate = await applyApiGuards(req, { limit: RATE_LIMITS.EXPENSIVE, label: 'montage.smart.captions', requireAuth: true });
  if (gate.response) return gate.response;
  const { user } = await authedClientFromRequest(req).catch(() => ({ user: null }));
  if (!user) return smartFail('sign_in', 'Sign in to use the editor.', 401);
  if (!(await smartOpenTo(user))) return smartFail('feature_off', 'Not found.', 404);
  const off = await serviceOffResponse('montage');
  if (off) return off;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const lang = isCaptionLang(body?.lang) ? body!.lang : null;
  if (!lang) return smartFail('invalid_request', 'lang must be ka, en or ru.', 400);
  const raw = Array.isArray(body?.sources) ? (body!.sources as unknown[]).slice(0, MAX_SOURCES + 1) : [];
  if (!raw.length || raw.length > MAX_SOURCES) return smartFail('invalid_request', `Send 1 to ${MAX_SOURCES} clips.`, 400);

  const windows: Array<Omit<CaptionSource, 'url'> & { ref: unknown }> = [];
  for (const x of raw) {
    const o = (x ?? {}) as Record<string, unknown>;
    const a = Number(o.startSec), b = Number(o.endSec);
    const sourceId = typeof o.sourceId === 'string' ? o.sourceId.slice(0, 80) : '';
    if (!sourceId || !Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b <= a) return smartFail('invalid_request', 'Each clip needs sourceId, startSec < endSec.', 400);
    windows.push({ sourceId, startSec: a, endSec: b, ref: o.url ?? o.path });
  }
  const billedSec = windows.reduce((s, w) => s + (w.endSec - w.startSec), 0);
  if (billedSec > MAX_TOTAL_SEC) return smartFail('too_long', `Captions take up to ${MAX_TOTAL_SEC} s of speech at once.`, 413);
  const credits = captionCredits(billedSec);
  if (body?.quote === true) return NextResponse.json({ ok: true, credits, billedSec: Math.round(billedSec * 10) / 10 });

  const sources: CaptionSource[] = [];
  for (const w of windows) {
    const r = await resolveMedia(w.ref, user.id);
    if (!r.ok) return smartFail(r.reason === 'not_yours' ? 'media_not_yours' : 'invalid_request', r.reason === 'not_yours' ? 'One of the clips is not yours, or its link has expired.' : 'A clip link is not valid.', r.reason === 'not_yours' ? 403 : 400);
    sources.push({ sourceId: w.sourceId, startSec: w.startSec, endSec: w.endSec, url: r.url });
  }

  if (!(await hasSufficientBalance(user.id, credits))) return smartFail('insufficient_credits', `Captions cost ✦${credits}. Top up to continue.`, 402, { credits });
  const run = await runCaptions(liveSmartDeps(), sources, lang);
  if (run.pieces === 0 || run.failedPieces === run.pieces) return smartFail('provider_unavailable', 'The speech could not be read right now. Nothing was charged.', 502);
  const charge = captionCredits(run.billedSec);
  const ref = `montage-captions:${randomUUID()}`;
  if (!(await deductCreditsOnce(user.id, charge, ref)).ok) return smartFail('insufficient_credits', `Captions cost ✦${charge}. Top up to continue.`, 402, { credits: charge });
  return NextResponse.json({ ok: true, wordsBySource: run.wordsBySource, billedSec: run.billedSec, charged: charge, partial: run.failedPieces > 0 });
}
