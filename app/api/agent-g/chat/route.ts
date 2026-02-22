import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  generateAgentGPersonalityReply,
  type AgentGLocale,
} from '@/lib/agentg/personality';
import { readAgentGMemory, writeAgentGMemory } from '@/lib/agentg/memory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  message: z.string().min(1).max(4000),
  locale: z.enum(['ka', 'en', 'ru']).optional(),
  sessionId: z.string().min(1).max(128).optional(),
});

function resolveLocale(locale: unknown): AgentGLocale {
  if (locale === 'en' || locale === 'ru') return locale;
  return 'ka';
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid payload',
          requestId,
        },
        { status: 400 }
      );
    }

    const locale = resolveLocale(parsed.data.locale);
    const memoryUserId = parsed.data.sessionId?.trim() ? `web:${parsed.data.sessionId.trim()}` : undefined;

    const memory = await readAgentGMemory({
      userId: memoryUserId,
      channel: 'web',
    });

    const output = await generateAgentGPersonalityReply({
      userText: parsed.data.message,
      channel: 'web',
      locale,
      sessionId: parsed.data.sessionId,
    });

    void writeAgentGMemory({
      userId: memoryUserId || '',
      channel: 'web',
      locale,
      styleProfile: memory?.style_profile ?? {},
      lastEmotion: output.meta.detectedEmotion,
    });

    console.info('[AgentG.Chat] request completed', {
      request_id: requestId,
      channel: 'web',
      detected_emotion: output.meta.detectedEmotion,
      memory_enabled: Boolean(memory),
      success: true,
      duration_ms: Date.now() - startedAt,
    });

    return NextResponse.json(
      {
        reply: output.replyText,
        tone: output.tone,
        meta: output.meta,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error('[AgentG.Chat] request failed', {
      request_id: requestId,
      channel: 'web',
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
      duration_ms: Date.now() - startedAt,
    });

    return NextResponse.json(
      {
        reply: 'გაგ, ცოტა მომეცი და ახლავე დაგიბრუნდები პასუხით 🙌',
        tone: {
          mood: 'calm',
          confidence: 0.5,
        },
        meta: {
          detectedEmotion: 'neutral',
          styleHints: ['fallback'],
          voiceHint: 'calmer, slower pace, reassuring',
        },
      },
      { status: 200 }
    );
  }
}
