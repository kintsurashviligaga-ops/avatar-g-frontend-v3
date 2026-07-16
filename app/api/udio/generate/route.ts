import { NextRequest, NextResponse } from 'next/server';
import { generateUdioTrack } from '@/lib/udio/client';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { guardGeneration } from '@/lib/api/generationGuard';
import { deductCredits } from '@/lib/orchestrator/ledger';
import { creditCostFor } from '@/lib/credits/pricing';

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

    const result = await generateUdioTrack({
      prompt,
      style: body.style,
      genre: body.genre,
      mood: body.mood,
      makeInstrumental: body.make_instrumental ?? true,
    }, { maxAttempts: 30, pollIntervalMs: 5000 });

    if (!result.audioUrl) {
      return NextResponse.json(
        { success: false, error: 'Udio returned no audio URL', workId: result.workId },
        { status: 502 },
      );
    }

    // FINANCIAL SHIELD — the track resolved successfully (this route blocks until Udio is done), so debit now.
    // Post-success ⇒ a failed/empty render (returned above) is never billed. Best-effort; rejects overdraw.
    await deductCredits(guard.userId, creditCostFor('music'), `udio:${guard.userId}:${Date.now()}`).catch(() => {});

    return NextResponse.json({
      success: true,
      url: result.audioUrl,
      workId: result.workId,
      model: 'Udio',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Music generation failed';
    console.error('[udio/generate]', message);
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
