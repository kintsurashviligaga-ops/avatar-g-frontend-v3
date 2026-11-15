/**
 * POST /api/v2/montage/smart/silence — where the pauses are in one clip (Phase 8.7, GG D2: FREE — pure ffmpeg
 * silencedetect on our own server, no model, no Vertex call).
 *
 *   { url | path, startSec, endSec, sensitivity?, words?, lang? } → { ok, silences, plan }
 *
 * The plan is a PREVIEW (cuts, kept pieces, "14 pauses, −0:11"); the editor applies it to the clip itself, so the cut
 * stays undoable. 404 unless MONTAGE_SMART_EDITOR lets this user in.
 */
import { NextRequest, NextResponse } from 'next/server';
import { applyApiGuards } from '@/lib/api/guard';
import { RATE_LIMITS } from '@/lib/api/rate-limit';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { isCaptionLang } from '@/lib/services/montage/smart/captions';
import { planSilenceRemoval, SENSITIVITIES, type Sensitivity } from '@/lib/services/montage/smart/silence';
import { detectSilences, liveSmartDeps, resolveMedia, smartFail, smartOpenTo } from '@/lib/services/montage/smart/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const gate = await applyApiGuards(req, { limit: RATE_LIMITS.WRITE, label: 'montage.smart.silence', requireAuth: true });
  if (gate.response) return gate.response;
  const { user } = await authedClientFromRequest(req).catch(() => ({ user: null }));
  if (!user) return smartFail('sign_in', 'Sign in to use the editor.', 401);
  if (!(await smartOpenTo(user))) return smartFail('feature_off', 'Not found.', 404);

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const a = Number(body?.startSec), b = Number(body?.endSec);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b <= a || b - a > 600) return smartFail('invalid_request', 'Send startSec < endSec (up to 10 minutes).', 400);
  const media = await resolveMedia(body?.url ?? body?.path, user.id);
  if (!media.ok) return smartFail(media.reason === 'not_yours' ? 'media_not_yours' : 'invalid_request', 'That clip cannot be read.', media.reason === 'not_yours' ? 403 : 400);
  const sensitivity: Sensitivity = (SENSITIVITIES as readonly unknown[]).includes(body?.sensitivity) ? (body!.sensitivity as Sensitivity) : 'normal';

  const silences = await detectSilences(liveSmartDeps(), media.url, { startSec: a, endSec: b }).catch(() => null);
  if (!silences) return smartFail('provider_unavailable', 'The clip could not be read.', 502);
  // plan in window-relative seconds, returned in source seconds
  const rel = silences.map((s) => ({ startSec: s.startSec - a, endSec: s.endSec - a }));
  const words = Array.isArray(body?.words)
    ? (body!.words as Array<{ text?: unknown; startSec?: unknown; endSec?: unknown }>).slice(0, 3000)
        .map((w) => ({ text: String(w?.text ?? ''), startSec: Number(w?.startSec) - a, endSec: Number(w?.endSec) - a }))
        .filter((w) => w.text && Number.isFinite(w.startSec) && Number.isFinite(w.endSec))
    : undefined;
  const plan = planSilenceRemoval({ durationSec: b - a, silences: rel, sensitivity, ...(words && isCaptionLang(body?.lang) ? { words, lang: body!.lang } : {}) });
  const shift = (s: { startSec: number; endSec: number }) => ({ startSec: Math.round((s.startSec + a) * 1000) / 1000, endSec: Math.round((s.endSec + a) * 1000) / 1000 });
  return NextResponse.json({ ok: true, silences, plan: { ...plan, cuts: plan.cuts.map(shift), kept: plan.kept.map(shift) }, charged: 0 });
}
