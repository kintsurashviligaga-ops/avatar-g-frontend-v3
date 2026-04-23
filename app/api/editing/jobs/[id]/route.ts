import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { editingAgent, type EditingProgress } from '@/workers/gpu/agents/editingAgent';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const EDITING_AGENT_ID = 'editing-agent';
const SIGNED_URL_TTL_SECONDS = 60 * 60;

type JobRow = {
  id: string;
  user_id: string;
  agent_id: string;
  status: string;
  payload: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

type ExportRow = {
  format: string;
  bucket: string;
  path: string;
  size_bytes: number;
  duration_sec: number;
  resolution: string;
  codec: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function extractProgress(result: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  const topLevel = asRecord(result);
  const metadata = asRecord(topLevel.metadata);
  const nested = asRecord(metadata.progress);
  if (Object.keys(nested).length > 0) {
    return nested;
  }

  const direct = asRecord(topLevel.progress);
  return Object.keys(direct).length > 0 ? direct : null;
}

function withProgress(
  result: Record<string, unknown> | null | undefined,
  progress: Record<string, unknown>,
): Record<string, unknown> {
  const current = asRecord(result);
  const metadata = asRecord(current.metadata);

  return {
    ...current,
    progress,
    metadata: {
      ...metadata,
      progress,
    },
  };
}

async function loadJob(serviceClient: ReturnType<typeof createServiceRoleClient>, userId: string, jobId: string) {
  const { data, error } = await serviceClient
    .from('jobs')
    .select('id, user_id, agent_id, status, payload, result, error_message, created_at, updated_at')
    .eq('id', jobId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as JobRow | null) ?? null;
}

async function processQueuedEditingJob(serviceClient: ReturnType<typeof createServiceRoleClient>, job: JobRow) {
  if (job.status !== 'queued') {
    return job;
  }

  const initialProgress = {
    status: 'processing',
    currentStepId: null,
    currentStepDescription: 'Editing started',
    currentStepIndex: 0,
    totalSteps: 0,
    stepsCompleted: [],
    percent: 0,
    notes: [],
    updatedAt: new Date().toISOString(),
  };

  const { data: claimed, error: claimError } = await serviceClient
    .from('jobs')
    .update({
      status: 'processing',
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      result: withProgress(job.result, initialProgress),
    })
    .eq('id', job.id)
    .eq('user_id', job.user_id)
    .eq('status', 'queued')
    .select('id, user_id, agent_id, status, payload, result, error_message, created_at, updated_at')
    .maybeSingle();

  if (claimError) {
    throw claimError;
  }

  const activeJob = (claimed as JobRow | null) ?? job;
  if (activeJob.status !== 'processing') {
    return activeJob;
  }

  const persistProgress = async (progress: EditingProgress) => {
    const { error } = await serviceClient
      .from('jobs')
      .update({
        result: withProgress(activeJob.result, progress as unknown as Record<string, unknown>),
        updated_at: new Date().toISOString(),
      })
      .eq('id', activeJob.id)
      .eq('user_id', activeJob.user_id);

    if (error) {
      throw error;
    }
  };

  const agentResult = await editingAgent({
    ...((activeJob.payload ?? {}) as Record<string, unknown>),
    jobId: activeJob.id,
    userId: activeJob.user_id,
  }, {
    onProgress: persistProgress,
  });

  if (agentResult.success) {
    const resultData = asRecord(agentResult.data);
    const resultMetadata = asRecord(resultData.metadata);
    const finalProgress = extractProgress(resultData) ?? extractProgress(agentResult.metadata ?? null);
    const persistedResult = {
      ...resultData,
      artifacts: agentResult.artifacts ?? [],
      ...(finalProgress ? { progress: finalProgress } : {}),
      metadata: {
        ...resultMetadata,
        ...(finalProgress ? { progress: finalProgress } : {}),
      },
    };

    const { data: completed, error: completeError } = await serviceClient
      .from('jobs')
      .update({
        status: 'completed',
        result: persistedResult,
        error_message: null,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        worker_id: null,
      })
      .eq('id', activeJob.id)
      .eq('user_id', activeJob.user_id)
      .select('id, user_id, agent_id, status, payload, result, error_message, created_at, updated_at')
      .single();

    if (completeError) {
      throw completeError;
    }

    return completed as JobRow;
  }

  const failedProgress = extractProgress(agentResult.metadata ?? null) ?? {
    status: 'failed',
    currentStepId: null,
    currentStepDescription: 'Editing failed',
    currentStepIndex: 0,
    totalSteps: 0,
    stepsCompleted: [],
    percent: 0,
    notes: [],
    updatedAt: new Date().toISOString(),
  };

  const { data: failed, error: failError } = await serviceClient
    .from('jobs')
    .update({
      status: 'failed',
      result: withProgress(activeJob.result, failedProgress),
      error_message: agentResult.error ?? 'Editing job failed',
      updated_at: new Date().toISOString(),
      worker_id: null,
    })
    .eq('id', activeJob.id)
    .eq('user_id', activeJob.user_id)
    .select('id, user_id, agent_id, status, payload, result, error_message, created_at, updated_at')
    .single();

  if (failError) {
    throw failError;
  }

  return failed as JobRow;
}

async function signExports(serviceClient: ReturnType<typeof createServiceRoleClient>, result: Record<string, unknown> | null) {
  const rawExports = Array.isArray(result?.exports) ? (result?.exports as ExportRow[]) : [];

  return Promise.all(rawExports.map(async (item) => {
    const { data } = await serviceClient.storage
      .from(item.bucket)
      .createSignedUrl(item.path, SIGNED_URL_TTL_SECONDS);

    return {
      ...item,
      signed_url: data?.signedUrl ?? null,
    };
  }));
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return apiError(new Error('Unauthorized'), 401, 'Login required');
    }

    const { id } = await params;
    const serviceClient = createServiceRoleClient();
    const loadedJob = await loadJob(serviceClient, user.id, id);

    if (!loadedJob || loadedJob.agent_id !== EDITING_AGENT_ID) {
      return apiError(new Error('Job not found'), 404, 'Editing job not found');
    }

    const job = await processQueuedEditingJob(serviceClient, loadedJob);
    const exports = await signExports(serviceClient, job.result);
    const primaryUrl = exports[0]?.signed_url ?? null;
    const progress = extractProgress(job.result);

    return apiSuccess({
      job: {
        id: job.id,
        status: job.status,
        error_message: job.error_message,
        created_at: job.created_at,
        updated_at: job.updated_at,
        progress,
      },
      output: {
        primaryUrl,
        exports,
        metadata: job.result?.metadata ?? null,
        progress,
      },
    });
  } catch (error) {
    return apiError(error, 500, 'Failed to load editing job');
  }
}