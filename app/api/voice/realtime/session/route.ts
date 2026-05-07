import { randomUUID } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { getRealtimeProviderSnapshot } from '@/lib/voice-v2v/providers';
import { issueRealtimeSessionToken } from '@/lib/voice-v2v/session';
import type { RealtimeVoiceLanguage } from '@/types/voice';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({
  language: z.enum(['ka-GE', 'en-US', 'ru-RU']).default('ka-GE'),
});

function resolveWsUrl(request: NextRequest): string | null {
  const explicit = String(process.env.VOICE_V2V_WS_URL || process.env.NEXT_PUBLIC_VOICE_V2V_WS_URL || '').trim();
  if (explicit) {
    return explicit;
  }

  // In production (HTTPS) without an explicit WS URL, voice realtime is not available.
  if (request.nextUrl.protocol === 'https:') {
    return null;
  }

  return `ws://localhost:8787/realtime`;
}

export async function POST(request: NextRequest) {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    const language: RealtimeVoiceLanguage = parsed.success ? parsed.data.language : 'ka-GE';

    const user = await getAuthenticatedUser(request).catch(() => null);
    const sessionId = randomUUID();

    const tokenData = issueRealtimeSessionToken({
      sessionId,
      language,
      userId: user?.id || null,
      ttlSeconds: 120,
    });

    const wsUrl = resolveWsUrl(request);
    if (!wsUrl) {
      return NextResponse.json(
        { status: 'error', error: 'voice_not_configured' },
        { status: 503 },
      );
    }

    const providers = getRealtimeProviderSnapshot();

    return NextResponse.json({
      status: 'success',
      data: {
        sessionId,
        token: tokenData.token,
        expiresAt: tokenData.expiresAt,
        wsUrl,
        sampleRate: 16_000,
        targetLatencyMs: 800,
        providers,
      },
    });
  } catch {
    return NextResponse.json(
      {
        status: 'error',
        error: 'voice_realtime_session_failed',
      },
      { status: 500 },
    );
  }
}
