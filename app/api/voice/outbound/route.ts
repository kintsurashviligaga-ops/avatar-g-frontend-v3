import { randomUUID } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { buildAgentGVapiAssistantConfig } from '@/lib/agent-g-voice-config';
import { RATE_LIMITS, checkRateLimit } from '@/lib/api/rate-limit';
import { structuredLog } from '@/lib/logger';
import { createServiceRoleClient, requireUser } from '@/lib/supabase/server';
import { MINIMUM_CREDITS_TO_START_CALL, hasMinimumVoiceCredits } from '@/lib/voice/credits';
import { isValidGeorgianMobile, normalizePhoneNumber } from '@/lib/voice/phone';
import { upsertVoiceCallByVapiId } from '@/lib/voice/repository';
import { createVapiCall, getVapiPhoneNumberId, isVapiServerConfigured } from '@/lib/vapi';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const requestSchema = z.object({
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
    // Rate-limit a cost-bearing action: each call can create a PAID Vapi outbound call and write a
    // voice_calls row. Mirror the EXPENSIVE cap already on the sibling web-token / voice/live routes.
    const limited = await checkRateLimit(request, RATE_LIMITS.EXPENSIVE);
    if (limited) return limited;

    // Authenticate the CALLER via their session — NEVER a `userId` from the request body. The prior
    // version trusted a body `userId` and only checked that the account EXISTED (admin.getUserById), so
    // any anonymous caller could dial ANOTHER user's saved phone number, burn their credits, and read
    // back the victim's balance (leaked in the 402 `current`) — the same IDOR class fixed on web-token.
    // Deriving the principal from requireUser() closes it; the body no longer carries a userId.
    let userId: string;
    try {
      userId = (await requireUser()).id;
    } catch {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }

    const payload = requestSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

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
