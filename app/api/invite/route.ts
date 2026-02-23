import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';

const InviteBodySchema = z.object({
  email: z.string().email(),
  invitedBy: z.string().optional(),
  role: z.string().max(32).optional(),
  channel: z.string().max(32).optional(),
  note: z.string().max(500).optional(),
});

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const rateLimitError = await checkRateLimit(request, RATE_LIMITS.WRITE);
    if (rateLimitError) return rateLimitError;

    const json = await request.json().catch(() => null);
    const parsed = InviteBodySchema.safeParse(json);

    if (!parsed.success) {
      return apiError(parsed.error, 400, 'Invalid invite payload');
    }

    const { email, invitedBy, role, channel, note } = parsed.data;

    // Placeholder: enqueue invite email or persist invite in DB.
    console.log('[growth] invite requested', {
      email,
      invitedBy: invitedBy || 'unknown',
      role: role || 'member',
      channel: channel || 'manual',
      note,
      at: new Date().toISOString(),
    });

    return apiSuccess({ ok: true });
  } catch (error) {
    return apiError(error, 500, 'Failed to create invite');
  }
}
