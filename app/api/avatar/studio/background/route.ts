/**
 * POST /api/avatar/studio/background — a background image for a Live presenter's 16:9 frame.
 *   { kind: 'upload', dataUrl }            → saved privately, free (JPEG / PNG / WebP, ≤ 5 MB).
 *   { kind: 'generate', prompt, format }   → one Gemini image (gemini-3.1-flash-image, Vertex), BACKGROUND_CREDITS
 *                                            (today ✦5, v8 ✦8): balance first, charged once after the image came
 *                                            back, refunded if it cannot be saved.
 * Answers { path, url }; the Studio request then names it as { kind: 'upload', path }. 404 unless AVATAR_STUDIO_V2.
 */
import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { applyApiGuards } from '@/lib/api/guard';
import { RATE_LIMITS } from '@/lib/api/rate-limit';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { serviceOffResponse } from '@/lib/server/serviceSwitches';
import { generateGeminiImage } from '@/lib/ai/geminiImage';
import { deductCreditsOnce, hasSufficientBalance, refundCredits } from '@/lib/orchestrator/ledger';
import { liveSceneDeps } from '@/lib/avatar/studio/live';
import { studioBook } from '@/lib/avatar/studio/book';
import { BACKGROUND_CREDITS } from '@/lib/avatar/studio/price';
import { StudioError } from '@/lib/avatar/studio/errors';
import { studioFail, studioOpenTo } from '@/lib/avatar/studio/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 90;

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export async function POST(req: NextRequest) {
  const gate = await applyApiGuards(req, { limit: RATE_LIMITS.EXPENSIVE, label: 'avatar.studio.background', requireAuth: true });
  if (gate.response) return gate.response;
  const { user } = await authedClientFromRequest(req).catch(() => ({ user: null }));
  if (!user) return studioFail('sign_in', 'Sign in to use the studio.', 401);
  if (!(await studioOpenTo(user))) return studioFail('feature_off', 'Not found.', 404);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const deps = liveSceneDeps(user.id);
  const id = randomUUID();

  if (body?.kind === 'upload') {
    const m = typeof body.dataUrl === 'string' ? DATA_URL.exec(body.dataUrl) : null;
    if (!m) return studioFail('invalid_request', 'Send a JPEG, PNG or WebP image.', 400);
    const bytes = Buffer.from(m[2]!, 'base64');
    if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES) return studioFail('invalid_request', 'The image must be under 5 MB.', 413);
    const path = `avatar-studio/${user.id}/uploads/bg-${id}.${EXT[m[1]!]}`;
    try {
      return NextResponse.json({ ok: true, path, url: await deps.save(user.id, path, bytes, m[1]!), charged: 0 });
    } catch (e) {
      return e instanceof StudioError ? studioFail(e.code, e.message, e.status) : studioFail('not_configured', 'Studio storage is unavailable.', 503);
    }
  }

  if (body?.kind !== 'generate') return studioFail('invalid_request', 'kind must be upload or generate.', 400);
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, 400) : '';
  if (!prompt) return studioFail('invalid_request', 'Describe the background.', 400);
  const off = await serviceOffResponse('image');
  if (off) return off;
  const credits = BACKGROUND_CREDITS[studioBook()];
  if (!(await hasSufficientBalance(user.id, credits))) return studioFail('insufficient_credits', 'Not enough credits for a background.', 402);
  const image = await generateGeminiImage({
    prompt: `A photorealistic, empty presenter studio background for a talking-head video: ${prompt}. Softly lit, slightly out of focus, no people, no text, no logos.`,
    aspectRatio: body.format === '9:16' ? '9:16' : '16:9',
  }).catch(() => null);
  if (!image) return studioFail('provider_unavailable', 'The background did not come back. Nothing was charged.', 502);
  const ref = `avatar-studio:bg:${id}`;
  if (!(await deductCreditsOnce(user.id, credits, ref)).ok) return studioFail('insufficient_credits', 'Not enough credits for a background.', 402);
  const path = `avatar-studio/${user.id}/uploads/bg-${id}.${EXT[image.mimeType] ?? 'png'}`;
  try {
    const url = await deps.save(user.id, path, Buffer.from(image.base64, 'base64'), image.mimeType);
    return NextResponse.json({ ok: true, path, url, charged: credits });
  } catch {
    await refundCredits(user.id, credits, `${ref}:refund`);
    return studioFail('not_configured', 'The background could not be saved. Your credits were returned.', 503);
  }
}
