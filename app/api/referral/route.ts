import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';

const ReferralBodySchema = z.object({
  userId: z.string().min(1),
  referralCode: z.string().min(2),
  source: z.string().max(64).optional(),
});

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const rateLimitError = await checkRateLimit(request, RATE_LIMITS.WRITE);
    if (rateLimitError) return rateLimitError;

    const json = await request.json().catch(() => null);
    const parsed = ReferralBodySchema.safeParse(json);

    if (!parsed.success) {
      return apiError(parsed.error, 400, 'Invalid referral payload');
    }

    const { userId, referralCode, source } = parsed.data;

    // Placeholder: in production this should write to referral_events /
    // analytics tables or enqueue an event for processing.
    console.log('[growth] referral event', {
      userId,
      referralCode,
      source: source || 'unknown',
      at: new Date().toISOString(),
    });

    return apiSuccess({ ok: true });
  } catch (error) {
    return apiError(error, 500, 'Failed to record referral');
  }
}
