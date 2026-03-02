import { NextRequest, NextResponse } from 'next/server';
import { routeRequest } from '@/lib/router/agentGRouter';

export const dynamic = 'force-dynamic';

/**
 * POST /api/router
 * Unified routing endpoint — delegates to the correct agent + provider.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      userId?: string;
      serviceId?: string;
      message?: string;
      locale?: string;
      attachments?: Array<{
        name: string;
        url: string;
        mimeType: string;
        sizeBytes: number;
      }>;
    };

    if (!body.userId || !body.serviceId || !body.message) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, serviceId, message' },
        { status: 400 }
      );
    }

    const result = await routeRequest({
      userId: body.userId,
      serviceId: body.serviceId,
      message: body.message,
      locale: body.locale,
      attachments: body.attachments,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error, ...result }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
