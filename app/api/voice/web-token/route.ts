import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { buildAgentGVapiAssistantConfig } from '@/lib/agent-g-voice-config';
import { structuredLog } from '@/lib/logger';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { MINIMUM_CREDITS_TO_START_CALL, hasMinimumVoiceCredits } from '@/lib/voice/credits';
import { insertVoiceCall } from '@/lib/voice/repository';
import { createVapiAssistant, isVapiServerConfigured } from '@/lib/vapi';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const requestSchema = z.object({
  userId: z.string().min(1),
});

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
    const payload = requestSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    }

    const { userId } = payload.data;
    const supabase = createServiceRoleClient();

    const userResult = await supabase.auth.admin.getUserById(userId);
    if (userResult.error || !userResult.data.user) {
      return NextResponse.json({ error: 'user_not_found' }, { status: 404 });
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
