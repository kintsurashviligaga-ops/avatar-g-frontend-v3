import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';

const LeadCaptureBodySchema = z.object({
  email: z.string().email(),
  name: z.string().max(120).optional(),
  company: z.string().max(200).optional(),
  size: z.string().max(32).optional(),
  note: z.string().max(1000).optional(),
  source: z.string().max(64).optional(),
});

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const rateLimitError = await checkRateLimit(request, RATE_LIMITS.WRITE);
    if (rateLimitError) return rateLimitError;

    const json = await request.json().catch(() => null);
    const parsed = LeadCaptureBodySchema.safeParse(json);

    if (!parsed.success) {
      return apiError(parsed.error, 400, 'Invalid lead capture payload');
    }

    const { email, name, company, size, note, source } = parsed.data;

    // Placeholder: send to CRM or persist in leads table.
    console.log('[growth] lead-capture', {
      email,
      name,
      company,
      size,
      note,
      source: source || 'unknown',
      at: new Date().toISOString(),
    });

    return apiSuccess({ ok: true });
  } catch (error) {
    return apiError(error, 500, 'Failed to capture lead');
  }
}
