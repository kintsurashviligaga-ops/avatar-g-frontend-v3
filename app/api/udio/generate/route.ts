import { NextRequest, NextResponse } from 'next/server';
import { generateUdioTrack } from '@/lib/udio/client';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { guardGeneration } from '@/lib/api/generationGuard';
import { deductCredits, refundCredits } from '@/lib/orchestrator/ledger';
import { creditCostFor } from '@/lib/credits/pricing';
import { ledgerUnavailableBody } from '@/lib/api/billingCopy';
import { insufficientCreditsMessage } from '@/lib/api/generationGuard';
import { providerErrorBody } from '@/lib/api/providerError';
import { randomUUID } from 'node:crypto';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

export async function POST(req: NextRequest) {
  const rateLimitError = await checkRateLimit(req, RATE_LIMITS.AI);
  if (rateLimitError) return rateLimitError;

  // FINANCIAL SHIELD — require a signed-in user with balance before the paid Udio render.
  const guard = await guardGeneration(req, 'music');
  if (!guard.ok) return guard.response;

  const apiKey = process.env.UDIO_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ success: false, error: 'UDIO_API_KEY not configured' }, { status: 500 });
  }

  let charged = false;
  let chargeRef = '';
  let chargeAmount = 0;
  /** Refund the reservation (once). TRUE only when the credits actually went back. */
  const giveBack = async (): Promise<boolean> => {
    if (!charged) return false;
    charged = false;
    const r = await refundCredits(guard.userId, chargeAmount, `${chargeRef}:refund`).catch(() => null);
    return !!r?.ok;
  };

  try {
    const body = await req.json() as {
      prompt?: string;
      style?: string;
      genre?: string;
      mood?: string;
      make_instrumental?: boolean;
    };

    const prompt = (body.prompt ?? '').trim();
    if (!prompt) {
      return NextResponse.json({ success: false, error: 'prompt is required' }, { status: 400 });
    }

    // ⚠️ RESERVED BEFORE THE RENDER, NOT DEDUCTED AFTER IT. This charged post-success with `.catch(() => {})` and
    // returned the track either way, so a deduct that failed — a parallel burst passing one stale balance read, or a
    // ledger error — handed out a free Udio track. The atomic deduct now gates the render (insufficient 402, ledger
    // error 503, `skipped` = no ledger RPC → uncharged as everywhere else), and every miss below gives it back.
    const cost = creditCostFor('music');
    const ref = `udio:${guard.userId}:${randomUUID()}`;
    const debit = await deductCredits(guard.userId, cost, ref);
    if (!debit.ok && debit.reason === 'insufficient') {
      return NextResponse.json({ success: false, error: 'insufficient_credits', message: insufficientCreditsMessage(guard.locale) }, { status: 402 });
    }
    if (!debit.ok && debit.reason === 'error') {
      return NextResponse.json(ledgerUnavailableBody(guard.locale), { status: 503 });
    }
    charged = debit.ok;
    chargeRef = ref;
    chargeAmount = cost;

    // ⚠️ REACHABLE FROM THE UI (CommandCenter) AND FROM AGENT G, and Udio reads English — so a Georgian
    // brief arrived as noise and the track came back unrelated to the request. Same defect as the chat
    // music lane; this is the third entry point into the same provider. Fail-open: a miss sends the
    // original, which is exactly the old behaviour.
    const { promptToEnglish } = await import('@/lib/ai/promptToEnglish');
    const promptEn = await promptToEnglish(prompt, 'music');

    const result = await generateUdioTrack({
      prompt: promptEn,
      style: body.style,
      genre: body.genre,
      mood: body.mood,
      makeInstrumental: body.make_instrumental ?? true,
    }, { maxAttempts: 30, pollIntervalMs: 5000 });

    if (!result.audioUrl) {
      const refunded = await giveBack();
      return NextResponse.json(
        { success: false, error: 'provider_unavailable', workId: result.workId, refunded },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      url: result.audioUrl,
      workId: result.workId,
      model: 'Udio',
    });
  } catch (err) {
    const refunded = await giveBack();
    const message = err instanceof Error ? err.message : 'Music generation failed';
    console.error('[udio/generate]', message);
    // Never the provider's own words — the sanitiser's code (and its sentence only when nothing stayed charged).
    const safe = providerErrorBody(err, guard.locale);
    return NextResponse.json(
      charged && !refunded ? { success: false, error: 'music_failed', refunded: false } : { success: false, error: safe.error, message: safe.message, refunded },
      { status: 502 },
    );
  }
}
