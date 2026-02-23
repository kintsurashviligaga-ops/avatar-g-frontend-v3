import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';

const ShareEventBodySchema = z.object({
  channel: z.enum(['twitter', 'x', 'linkedin', 'facebook', 'email', 'copy', 'other']).default('other'),
  context: z.string().max(128).optional(),
  userId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const rateLimitError = await checkRateLimit(request, RATE_LIMITS.WRITE);
    if (rateLimitError) return rateLimitError;

    const json = await request.json().catch(() => null);
    const parsed = ShareEventBodySchema.safeParse(json);

    if (!parsed.success) {
      return apiError(parsed.error, 400, 'Invalid share event');
    }

    const { channel, context, userId, metadata } = parsed.data;

    // Placeholder: send to analytics/queue.
    console.log('[growth] share-event', {
      channel,
      context: context || 'unknown',
      userId: userId || 'anonymous',
      metadata: metadata || {},
      at: new Date().toISOString(),
    });

    return apiSuccess({ ok: true });
  } catch (error) {
    return apiError(error, 500, 'Failed to record share event');
  }
}
