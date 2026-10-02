import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  generateAgentGPersonalityReply,
  type AgentGLocale,
} from '@/lib/agentg/personality';
import { readAgentGMemory, writeAgentGMemory } from '@/lib/agentg/memory';
import { checkRateLimit, checkRateLimitByKey, RATE_LIMITS } from '@/lib/api/rate-limit';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { isAnonymousUser, anonymousGenerationAllowed } from '@/lib/auth/generationGate';
import { spendGuestTurn, guestRefusalMessage } from '@/lib/chat/guestAllowance';
import { secretMatches } from '@/lib/security/secretMatch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const contextSchema = z.object({
  currentPage: z.string().max(200).optional(),
  activeService: z.string().max(100).optional(),
  selectedMode: z.string().max(100).optional(),
}).optional();

const historyTurnSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(4000),
});

const schema = z.object({
  message: z.string().min(1).max(4000),
  locale: z.enum(['ka', 'en', 'ru']).optional(),
  sessionId: z.string().min(1).max(128).optional(),
  context: contextSchema,
  history: z.array(historyTurnSchema).max(20).optional(),
});

function resolveLocale(locale: unknown): AgentGLocale {
  if (locale === 'en' || locale === 'ru') return locale;
  return 'ka';
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const limited = await checkRateLimit(request, RATE_LIMITS.AI);
  if (limited) return limited;

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

    // ⚠️ WHO IS ASKING DECIDES WHAT IT COSTS. This route answered every caller on the platform's model keys with only a
    // per-IP-per-minute limit — a signed-out visitor of /services/* (ServiceChatLayout) got unlimited turns, around the
    // guest policy /api/chat/gemini enforces. Now:
    //   · Agent G's own server-to-server dispatch (/api/agent-g/delegate, holding AGENT_G_INTERNAL_SECRET) — already
    //     authorised upstream, not capped again here;
    //   · a signed-in account — the per-ACCOUNT daily chat cap (CHAT_USER, shared with the product chat);
    //   · a guest — ONE turn from the shared guest allowance (lib/chat/guestAllowance), answered with a sign-in offer
    //     once it is spent. Validation ran first, so a malformed body never spends an allowance.
    const internal = secretMatches(request.headers.get('x-agent-g-secret'), process.env.AGENT_G_INTERNAL_SECRET);
    if (!internal) {
      let accountId: string | null = null;
      try {
        accountId = (await authedClientFromRequest(request)).user?.id ?? null;
      } catch {
        accountId = null; // an auth outage reads as "no session" — fail closed into the guest policy
      }
      if (!isAnonymousUser(accountId) && accountId) {
        const capped = await checkRateLimitByKey(accountId, RATE_LIMITS.CHAT_USER);
        if (capped) return capped;
      } else if (!anonymousGenerationAllowed()) {
        const turn = await spendGuestTurn(request);
        if (turn !== 'ok') {
          return NextResponse.json(
            { reply: guestRefusalMessage(turn, locale), tone: 'neutral', meta: { authRequired: true, code: 'auth_required' } },
            { status: 200, headers: { 'Cache-Control': 'no-store' } },
          );
        }
      }
    }

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
      context: parsed.data.context,
      history: parsed.data.history,
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
        error: 'AI service temporarily unavailable',
        requestId,
      },
      { status: 503 }
    );
  }
}
