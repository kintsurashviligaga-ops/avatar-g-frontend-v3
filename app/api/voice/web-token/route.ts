import { NextRequest, NextResponse } from 'next/server';

import { buildAgentGVapiAssistantConfig } from '@/lib/agent-g-voice-config';
import { RATE_LIMITS, checkRateLimit } from '@/lib/api/rate-limit';
import { structuredLog } from '@/lib/logger';
import { createServiceRoleClient, requireUser } from '@/lib/supabase/server';
import { MINIMUM_CREDITS_TO_START_CALL, hasMinimumVoiceCredits } from '@/lib/voice/credits';
import { insertVoiceCall } from '@/lib/voice/repository';
import { createVapiAssistant, isVapiServerConfigured } from '@/lib/vapi';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function getCreditsBalance(userId: string): Promise<number> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from('credits')
    .select('balance')
    .eq('user_id', userId)
    .maybeSingle();

  return Number(data?.balance || 0);
}

export async function POST(request: NextRequest) {
  try {
    // Rate-limit a cost-bearing mint: each call reads a balance, can create a paid Vapi assistant, and
    // inserts a voice_calls row. Mirror the EXPENSIVE cap used by the sibling app/api/voice/live route.
    const limited = await checkRateLimit(request, RATE_LIMITS.EXPENSIVE);
    if (limited) return limited;

    // Authenticate the CALLER via their session — NEVER a `userId` from the request body. The prior
    // version parsed `{ userId }` from the body and ran it on a service-role (RLS-bypassing) client with
    // no auth, so any request could read ANOTHER account's balance (leaked in the 402 `current` field),
    // inject voice_calls rows under a victim's id, and mint a paid Vapi assistant against the platform —
    // a classic IDOR. Deriving the principal from requireUser() closes it; the body is now ignored.
    let userId: string;
    try {
      userId = (await requireUser()).id;
    } catch {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }

    const creditsBalance = await getCreditsBalance(userId);
    if (!hasMinimumVoiceCredits(creditsBalance)) {
      return NextResponse.json(
        {
          error: 'insufficient_credits',
          required: MINIMUM_CREDITS_TO_START_CALL,
          current: creditsBalance,
        },
        { status: 402 },
      );
    }

    const publicToken = String(process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY || '').trim();
    if (!publicToken) {
      return NextResponse.json(
        {
          error: 'vapi_public_key_missing',
          message: 'NEXT_PUBLIC_VAPI_PUBLIC_KEY is required for browser calls.',
        },
        { status: 503 },
      );
    }

    const assistantConfig = buildAgentGVapiAssistantConfig({
      metadata: {
        userId,
        flow: 'web_call',
      },
    });

    let assistantId: string | null = null;

    if (isVapiServerConfigured()) {
      try {
        const assistant = await createVapiAssistant(assistantConfig);
        assistantId = String(assistant.id || assistant.assistantId || '').trim() || null;
      } catch (error) {
        structuredLog('warn', 'voice.web_token.assistant_create_failed', {
          userId,
          error: error instanceof Error ? error.message : 'unknown',
        });
      }
    }

    const callRow = await insertVoiceCall({
      user_id: userId,
      direction: 'web',
      status: 'initiated',
      metadata: {
        assistantId,
        provider: isVapiServerConfigured() ? 'vapi' : 'demo',
      },
    });

    return NextResponse.json({
      token: publicToken,
      assistantId,
      assistant: assistantConfig,
      callId: callRow.id,
    });
  } catch (error) {
    structuredLog('error', 'voice.web_token.failed', {
      error: error instanceof Error ? error.message : 'unknown',
    });

    return NextResponse.json({ error: 'voice_web_token_failed' }, { status: 500 });
  }
}
