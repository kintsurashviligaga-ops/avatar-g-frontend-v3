import { googleAiConfigured } from '@/lib/ai/google/transport';
import { NextRequest, NextResponse } from 'next/server';
import { analyzeRoomImage } from '@/lib/gemini/image-analysis';
import { RATE_LIMITS, checkRateLimit } from '@/lib/api/rate-limit';
import { mustSignInToGenerate, signInToGenerateBody } from '@/lib/auth/generationGate';
import { authedClientFromRequest } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    // Gemini vision on the platform key — cheap to ask for, not cheap to answer. Bound the burst per IP first.
    const limited = await checkRateLimit(req, RATE_LIMITS.AI);
    if (limited) return limited;

    const { imageBase64, mimeType, locale } = (await req.json()) as {
      imageBase64?: string;
      mimeType?: string;
      locale?: string;
    };

    // ⚠️ SIGNED-IN ONLY (lib/auth/generationGate). Every call is a Gemini vision read of a caller-supplied image on
    // the platform's prepaid balance, it had neither a session check nor a rate limit, and nothing in the product
    // calls it — so the only callers it could have had were ones spending the balance on our behalf.
    const { user } = await authedClientFromRequest(req);
    if (mustSignInToGenerate(user?.id)) {
      return NextResponse.json(signInToGenerateBody(locale), { status: 401 });
    }

    if (!imageBase64 || !mimeType) {
      return NextResponse.json(
        { error: 'imageBase64 and mimeType required' },
        { status: 400 },
      );
    }

    if (!googleAiConfigured()) {
      return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 503 });
    }

    const result = await analyzeRoomImage(imageBase64, mimeType, locale ?? 'ka');
    return NextResponse.json({ ok: true, analysis: result });
  } catch (err) {
    console.error('[gemini/analyze] error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
