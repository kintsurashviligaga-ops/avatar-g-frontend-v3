import { NextRequest, NextResponse } from 'next/server';

interface AnalyticsEventPayload {
  event?: string;
  locale?: string;
  page?: string;
  ts?: number;
  [key: string]: unknown;
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as AnalyticsEventPayload;

    if (!payload.event || typeof payload.event !== 'string') {
      return NextResponse.json({ error: 'Invalid analytics event payload' }, { status: 400 });
    }

    // Centralized server log for conversion analysis and event debugging.
    console.info('[AnalyticsEvent]', {
      event: payload.event,
      locale: payload.locale ?? 'unknown',
      page: payload.page ?? 'unknown',
      ts: payload.ts ?? Date.now(),
      payload,
    });

    return NextResponse.json({ ok: true }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to process analytics event' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed. Use POST.' }, { status: 405 });
}
