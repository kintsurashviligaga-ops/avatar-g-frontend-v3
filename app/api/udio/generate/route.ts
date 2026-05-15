import { NextRequest, NextResponse } from 'next/server';
import { generateUdioTrack } from '@/lib/udio/client';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

export async function POST(req: NextRequest) {
  const rateLimitError = await checkRateLimit(req, RATE_LIMITS.AI);
  if (rateLimitError) return rateLimitError;

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
