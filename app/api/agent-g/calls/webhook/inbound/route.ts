import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/api/response';
import { getCallsProvider } from '@/lib/calls/providers';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const provider = getCallsProvider();
    const result = await provider.onWebhookEvent(body as Record<string, unknown>);

    return apiSuccess({ ok: result.ok, provider: provider.name, event: body });
  } catch (error) {
    return apiError(error, 500, 'Inbound webhook failed');
  }
}
