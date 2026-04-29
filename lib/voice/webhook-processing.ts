import { randomUUID } from 'node:crypto';

import { structuredLog } from '@/lib/logger';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { VoiceCallDirection, VoiceCallRecord } from '@/types/voice';
import { calculateVoiceCredits } from '@/lib/voice/credits';
import {
  appendVoiceCallMetadata,
  getVoiceCallByVapiId,
  updateVoiceCallById,
  updateVoiceCallStatusByVapiId,
} from '@/lib/voice/repository';

const SERVICE_TO_SLUG: Record<string, string> = {
  'image-generation': 'image',
  'video-generation': 'video',
  'avatar-studio': 'avatar',
  'voice-synthesis': 'voice',
  'music-studio': 'music',
  'copy-ai': 'copy',
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return {};
  }

  return value as Record<string, unknown>;
}

function getEventType(event: Record<string, unknown>): string {
  const direct = String(event.type || event.event || '').trim();
  if (direct) {
    return direct;
  }

  const messageType = String(asObject(event.message).type || '').trim();
  if (messageType) {
    return messageType;
  }

  return 'unknown';
}

function getCallId(event: Record<string, unknown>): string {
  const direct = String(event.callId || event.call_id || '').trim();
  if (direct) {
    return direct;
  }

  const call = asObject(event.call);
  const callId = String(call.id || call.callId || '').trim();
  if (callId) {
    return callId;
  }

  const message = asObject(event.message);
  const messageCall = asObject(message.call);
  return String(messageCall.id || '').trim();
}

function getDirection(event: Record<string, unknown>): VoiceCallDirection {
  const call = asObject(event.call);
  const type = String(call.type || event.type || '').toLowerCase();

  if (type.includes('inbound')) {
    return 'inbound';
  }

  if (type.includes('web')) {
    return 'web';
  }

  return 'outbound';
}

function parseDurationSeconds(event: Record<string, unknown>): number {
  const call = asObject(event.call);
  const details = asObject(event.details);

  const candidates = [
    call.durationSeconds,
    event.durationSeconds,
    details.durationSeconds,
    call.duration,
    event.duration,
    details.duration,
  ];

  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.round(parsed);
    }
  }

  return 0;
}

function parseFunctionInvocation(event: Record<string, unknown>): { name: string; args: Record<string, unknown> } | null {
  const eventType = getEventType(event);

  if (eventType.startsWith('function.')) {
    const name = eventType.replace('function.', '').trim();
    const rawArgs = (event.arguments || asObject(event.function).arguments || {}) as unknown;

    if (typeof rawArgs === 'string') {
      try {
        return { name, args: JSON.parse(rawArgs) as Record<string, unknown> };
      } catch {
        return { name, args: {} };
      }
    }

    return { name, args: asObject(rawArgs) };
  }

  const functionBlock = asObject(event.function || asObject(event.message).function);
  const name = String(functionBlock.name || '').trim();
  if (!name) {
    return null;
  }

  const rawArgs = functionBlock.arguments;
  if (typeof rawArgs === 'string') {
    try {
      return { name, args: JSON.parse(rawArgs) as Record<string, unknown> };
    } catch {
      return { name, args: {} };
    }
  }

  return { name, args: asObject(rawArgs) };
}

async function getCreditsBalance(userId: string): Promise<number> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from('credits')
    .select('balance')
    .eq('user_id', userId)
    .maybeSingle();

  return Number(data?.balance || 0);
}

async function deductCreditsForCall(call: VoiceCallRecord, creditsUsed: number): Promise<number> {
  if (!call.user_id || creditsUsed <= 0) {
    return 0;
  }

  const supabase = createServiceRoleClient();
  const currentBalance = await getCreditsBalance(call.user_id);
  const nextBalance = Math.max(0, currentBalance - creditsUsed);

  await supabase
    .from('credits')
    .update({ balance: nextBalance })
    .eq('user_id', call.user_id);

  try {
    await supabase
      .from('credits_ledger')
      .insert({
        user_id: call.user_id,
        delta: -creditsUsed,
        reason: 'voice_call',
        meta: {
          voice_call_id: call.id,
          duration_seconds: call.duration_seconds,
        },
      });
  } catch {
    // Ledger insert is best-effort; main balance update already completed.
  }

  return nextBalance;
}

async function createJobFromToolCall(call: VoiceCallRecord, args: Record<string, unknown>) {
  if (!call.user_id) {
    return null;
  }

  const service = String(args.service || '').trim();
  const prompt = String(args.prompt || '').trim();
  const params = asObject(args.params);

  if (!service || !prompt) {
    return null;
  }

  const serviceSlug = SERVICE_TO_SLUG[service] || 'agent-g';
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from('service_jobs')
    .insert({
      user_id: call.user_id,
      service_slug: serviceSlug,
      title: `Voice request: ${serviceSlug}`,
      status: 'queued',
      progress: 0,
      input_payload: {
        prompt,
        params,
        source: 'voice_call',
        voice_call_id: call.id,
      },
      max_attempts: 3,
      attempt_count: 0,
    })
    .select('*')
    .single();

  if (error || !data) {
    structuredLog('error', 'voice.webhook.create_job_failed', {
      callId: call.id,
      error: error?.message || 'unknown',
    });
    return null;
  }

  const metadata = asObject(call.metadata);
  const existingJobs = Array.isArray(metadata.jobs_created) ? metadata.jobs_created : [];

  await appendVoiceCallMetadata(call.id, {
    jobs_created: [
      ...existingJobs,
      {
        id: data.id,
        service: serviceSlug,
        status: data.status,
      },
    ],
  });

  return {
    id: data.id,
    status: data.status,
    service: serviceSlug,
  };
}

async function getJobStatusForToolCall(call: VoiceCallRecord, args: Record<string, unknown>) {
  const jobId = String(args.job_id || '').trim();
  if (!jobId) {
    return null;
  }

  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from('service_jobs')
    .select('id,status,service_slug,progress,created_at,updated_at')
    .eq('id', jobId)
    .maybeSingle();

  const metadata = asObject(call.metadata);
  const toolResults = Array.isArray(metadata.tool_results) ? metadata.tool_results : [];

  await appendVoiceCallMetadata(call.id, {
    tool_results: [
      ...toolResults,
      {
        id: randomUUID(),
        name: 'get_job_status',
        request: args,
        response: data || null,
        at: new Date().toISOString(),
      },
    ],
  });

  return data || null;
}

async function getUserCreditsForToolCall(call: VoiceCallRecord) {
  if (!call.user_id) {
    return null;
  }

  const balance = await getCreditsBalance(call.user_id);
  const metadata = asObject(call.metadata);
  const toolResults = Array.isArray(metadata.tool_results) ? metadata.tool_results : [];

  await appendVoiceCallMetadata(call.id, {
    tool_results: [
      ...toolResults,
      {
        id: randomUUID(),
        name: 'get_user_credits',
        response: {
          balance,
          creditsExhausted: balance <= 0,
          exhaustedMessage: 'კრედიტები ამოიწურა, ზარი დასრულდება',
        },
        at: new Date().toISOString(),
      },
    ],
  });

  return balance;
}

async function handleCallStarted(event: Record<string, unknown>, callId: string) {
  const call = asObject(event.call);
  const metadata = asObject(call.metadata || event.metadata);
  const phone = String(asObject(call.customer).number || call.phoneNumber || event.phoneNumber || '').trim() || null;

  await updateVoiceCallStatusByVapiId(callId, 'active', {
    user_id: (metadata.userId as string | undefined) || null,
    direction: getDirection(event),
    phone_number: phone,
    metadata: {
      ...metadata,
      provider: metadata.provider || 'vapi',
      last_event: 'call.started',
    },
  });
}

async function handleCallEnded(event: Record<string, unknown>, callId: string) {
  const existing = await getVoiceCallByVapiId(callId);
  if (!existing) {
    return;
  }

  const durationSeconds = parseDurationSeconds(event);
  const creditsUsed = calculateVoiceCredits(durationSeconds);
  const summary = String(
    asObject(event.analysis).summary ||
      asObject(event.call).summary ||
      asObject(event.details).summary ||
      existing.summary ||
      ''
  ).trim() || null;

  const updated = await updateVoiceCallById(existing.id, {
    status: 'ended',
    duration_seconds: durationSeconds,
    ended_at: new Date().toISOString(),
    credits_used: creditsUsed,
    summary,
    metadata: {
      ...(existing.metadata || {}),
      last_event: 'call.ended',
    },
  });

  if (!updated) {
    return;
  }

  const remainingBalance = await deductCreditsForCall(updated, creditsUsed);

  if (updated.user_id && remainingBalance <= 0) {
    await appendVoiceCallMetadata(updated.id, {
      credits_exhausted: true,
      credits_exhausted_message: 'კრედიტები ამოიწურა, ზარი დასრულდება',
    });
  }
}

async function handleTranscriptCompleted(event: Record<string, unknown>, callId: string) {
  const existing = await getVoiceCallByVapiId(callId);
  if (!existing) {
    return;
  }

  const transcript = String(
    event.transcript ||
      asObject(event.details).transcript ||
      asObject(event.call).transcript ||
      ''
  ).trim();

  if (!transcript) {
    return;
  }

  await updateVoiceCallById(existing.id, {
    transcript,
    metadata: {
      ...(existing.metadata || {}),
      last_event: 'transcript.completed',
    },
  });
}

async function handleFunctionEvent(event: Record<string, unknown>, callId: string, invocation: { name: string; args: Record<string, unknown> }) {
  const existing = await getVoiceCallByVapiId(callId);
  if (!existing) {
    return;
  }

  if (invocation.name === 'create_job') {
    await createJobFromToolCall(existing, invocation.args);
    return;
  }

  if (invocation.name === 'get_job_status') {
    await getJobStatusForToolCall(existing, invocation.args);
    return;
  }

  if (invocation.name === 'get_user_credits') {
    await getUserCreditsForToolCall(existing);
    return;
  }

  await appendVoiceCallMetadata(existing.id, {
    ignored_function_event: {
      name: invocation.name,
      args: invocation.args,
      at: new Date().toISOString(),
    },
  });
}

export async function processVoiceWebhookEvent(event: Record<string, unknown>): Promise<void> {
  const eventType = getEventType(event);
  const callId = getCallId(event);

  if (!callId) {
    structuredLog('warn', 'voice.webhook.missing_call_id', {
      eventType,
    });
    return;
  }

  if (eventType === 'call.started') {
    await handleCallStarted(event, callId);
    return;
  }

  if (eventType === 'call.ended') {
    await handleCallEnded(event, callId);
    return;
  }

  if (eventType === 'transcript.completed') {
    await handleTranscriptCompleted(event, callId);
    return;
  }

  const invocation = parseFunctionInvocation(event);
  if (invocation) {
    await handleFunctionEvent(event, callId, invocation);
    return;
  }

  structuredLog('info', 'voice.webhook.ignored_event', {
    eventType,
    callId,
  });
}

export async function processVoiceWebhookEventWithRetry(
  event: Record<string, unknown>,
  attempt = 0,
  maxAttempts = 4,
): Promise<void> {
  try {
    await processVoiceWebhookEvent(event);
  } catch (error) {
    structuredLog('error', 'voice.webhook.process_failed', {
      attempt,
      maxAttempts,
      error: error instanceof Error ? error.message : 'unknown',
    });

    if (attempt >= maxAttempts) {
      return;
    }

    const backoffMs = Math.min(5000, 250 * (2 ** attempt));
    setTimeout(() => {
      void processVoiceWebhookEventWithRetry(event, attempt + 1, maxAttempts);
    }, backoffMs);
  }
}
