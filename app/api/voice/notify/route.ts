import { randomUUID } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { buildAgentGVapiAssistantConfig } from '@/lib/agent-g-voice-config';
import { structuredLog } from '@/lib/logger';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { hasMinimumVoiceCredits } from '@/lib/voice/credits';
import { normalizePhoneNumber } from '@/lib/voice/phone';
import { upsertVoiceCallByVapiId } from '@/lib/voice/repository';
import { createVapiCall, getVapiPhoneNumberId, isVapiServerConfigured } from '@/lib/vapi';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const requestSchema = z.object({
  userId: z.string().min(1),
  jobId: z.string().min(1),
  service: z.string().min(1),
  resultUrl: z.string().url(),
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

    const { userId, jobId, service, resultUrl } = payload.data;

    const supabase = createServiceRoleClient();
    const prefsRes = await supabase
      .from('agent_g_user_prefs')
      .select('phone_number,call_me_when_finished')
      .eq('user_id', userId)
      .maybeSingle();

    const phone = normalizePhoneNumber(String(prefsRes.data?.phone_number || ''));
    const wantsCalls = Boolean(prefsRes.data?.call_me_when_finished);

    if (!wantsCalls) {
      return NextResponse.json({ queued: false, reason: 'notifications_disabled' });
    }

    if (!phone) {
      return NextResponse.json({ queued: false, reason: 'missing_phone_number' });
    }

    const creditsBalance = await getCreditsBalance(userId);
    if (!hasMinimumVoiceCredits(creditsBalance)) {
      return NextResponse.json({ queued: false, reason: 'insufficient_credits' });
    }

    const firstMessage = `თქვენი ${service} მზად არის! გსურთ დეტალები?`;

    let provider = 'demo';
    let callId = `notify_${randomUUID()}`;

    const vapiPhoneNumberId = getVapiPhoneNumberId();

    if (isVapiServerConfigured() && vapiPhoneNumberId) {
      try {
        const call = await createVapiCall({
          phoneNumberId: vapiPhoneNumberId,
          customer: {
            number: phone,
            externalId: userId,
          },
          assistant: buildAgentGVapiAssistantConfig({
            firstMessage,
            metadata: {
              userId,
              flow: 'job_notify',
              jobId,
              service,
              resultUrl,
            },
          }),
          name: `Job notify ${jobId}`,
        });

        callId = String(call.id || call.callId || call.phoneCallProviderId || callId);
        provider = 'vapi';
      } catch (error) {
        structuredLog('error', 'voice.notify.vapi_call_failed', {
          userId,
          jobId,
          error: error instanceof Error ? error.message : 'unknown',
        });

        return NextResponse.json({ queued: false, reason: 'provider_unavailable' }, { status: 503 });
      }
    }

    const row = await upsertVoiceCallByVapiId(callId, {
      user_id: userId,
      direction: 'outbound',
      status: 'initiated',
      phone_number: phone,
      metadata: {
        provider,
        flow: 'job_notify',
        jobId,
        service,
        resultUrl,
      },
      summary: firstMessage,
    });

    return NextResponse.json({ queued: true, callId: row.vapi_call_id || row.id, provider });
  } catch (error) {
    structuredLog('error', 'voice.notify.failed', {
      error: error instanceof Error ? error.message : 'unknown',
    });

    return NextResponse.json({ error: 'voice_notify_failed' }, { status: 500 });
  }
}
