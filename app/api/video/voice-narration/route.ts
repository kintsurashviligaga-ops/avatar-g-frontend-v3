import { NextRequest } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { refuseOutsideEngine } from '@/lib/providers/mediaPolicy';

/**
 * POST /api/video/voice-narration — used to convert a film's narration into the user's trained voice (RVC on
 * Replicate) before the stitch. RVC has no Google engine, so every request is refused with 503 google_only after the
 * rate limit and before any provider call (MASTER TASK v3.1, lib/providers/mediaPolicy). The film stitch treats an
 * answer without a `url` as "keep the original narration", so a film never breaks on it.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(req, RATE_LIMITS.WRITE); if (rl) return rl;
  return refuseOutsideEngine(req);
}
