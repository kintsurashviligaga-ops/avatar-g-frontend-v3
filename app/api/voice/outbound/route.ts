import { randomUUID } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { buildAgentGVapiAssistantConfig } from '@/lib/agent-g-voice-config';
import { structuredLog } from '@/lib/logger';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { MINIMUM_CREDITS_TO_START_CALL, hasMinimumVoiceCredits } from '@/lib/voice/credits';
import { isValidGeorgianMobile, normalizePhoneNumber } from '@/lib/voice/phone';
import { upsertVoiceCallByVapiId } from '@/lib/voice/repository';
import { createVapiCall, getVapiPhoneNumberId, isVapiServerConfigured } from '@/lib/vapi';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const requestSchema = z.object({
  userId: z.string().min(1),
  phoneNumber: z.string().optional(),
  reason: z.string().max(400).optional(),
  savePhone: z.boolean().optional(),
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

async function getSavedPhoneNumber(userId: string): Promise<string> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from('agent_g_user_prefs')
    .select('phone_number')
    .eq('user_id', userId)
    .maybeSingle();

  return String(data?.phone_number || '').trim();
}

function mapCallStatus(status: string): 'initiated' | 'ringing' | 'active' | 'ended' | 'failed' {
  const normalized = status.toLowerCase();
  if (normalized.includes('ring')) return 'ringing';
  if (normalized.includes('active')) return 'active';
  if (normalized.includes('end') || normalized.includes('complete')) return 'ended';
  if (normalized.includes('fail') || normalized.includes('error')) return 'failed';
  return 'initiated';
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

    const requestedPhone = String(payload.data.phoneNumber || '').trim();
    const resolvedRawPhone = requestedPhone || (await getSavedPhoneNumber(userId));
    const normalizedPhone = normalizePhoneNumber(resolvedRawPhone);

    if (!normalizedPhone) {
      return NextResponse.json({ error: 'missing_phone_number' }, { status: 400 });
    }

    if (requestedPhone && requestedPhone.replace(/\D/g, '').startsWith('5') && !isValidGeorgianMobile(normalizedPhone)) {
      return NextResponse.json({ error: 'invalid_georgian_phone' }, { status: 400 });
    }

    if (payload.data.savePhone) {
      await supabase
        .from('agent_g_user_prefs')
        .upsert({
          user_id: userId,
          phone_number: normalizedPhone,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
    }

    let provider = 'demo';
    let vapiCallId = `demo_${randomUUID()}`;
    let status: 'initiated' | 'ringing' | 'active' | 'ended' | 'failed' = 'initiated';

    const vapiPhoneNumberId = getVapiPhoneNumberId();

    if (isVapiServerConfigured() && vapiPhoneNumberId) {
      try {
        const call = await createVapiCall({
          phoneNumberId: vapiPhoneNumberId,
          customer: {
            number: normalizedPhone,
            externalId: userId,
          },
          assistant: buildAgentGVapiAssistantConfig({
            metadata: {
              userId,
              reason: payload.data.reason || 'dashboard_callback',
            },
          }),
          name: `Agent G callback ${new Date().toISOString()}`,
        });

        vapiCallId = String(call.id || call.callId || call.phoneCallProviderId || vapiCallId);
        status = mapCallStatus(String(call.status || 'initiated'));
        provider = 'vapi';
      } catch (error) {
        structuredLog('error', 'voice.outbound.vapi_call_failed', {
          userId,
          error: error instanceof Error ? error.message : 'unknown',
        });

        return NextResponse.json(
          {
            error: 'voice_provider_unavailable',
            message: 'Vapi API is currently unavailable. Please retry shortly.',
          },
          { status: 503 },
        );
      }
    }

    const row = await upsertVoiceCallByVapiId(vapiCallId, {
      user_id: userId,
      direction: 'outbound',
      status,
      phone_number: normalizedPhone,
      metadata: {
        provider,
        reason: payload.data.reason || 'dashboard_callback',
      },
    });

    return NextResponse.json({
      callId: row.vapi_call_id || row.id,
      estimatedWaitSeconds: 5,
      provider,
      status: row.status,
    });
  } catch (error) {
    structuredLog('error', 'voice.outbound.failed', {
      error: error instanceof Error ? error.message : 'unknown',
    });

    return NextResponse.json({ error: 'voice_outbound_failed' }, { status: 500 });
  }
}
