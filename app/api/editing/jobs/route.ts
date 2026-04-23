import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { generateKey } from '@/lib/storage';
import type { EditingJobPayload } from '@/types/jobs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const EDITING_AGENT_ID = 'editing-agent';
const INPUT_BUCKET = 'job-artifacts';
const MAX_FILE_SIZE_BYTES = 250 * 1024 * 1024;
const ALLOWED_VIDEO_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-matroska',
]);

function buildEditingOperations(instructions: string, effect: string) {
  const operations: EditingJobPayload['operations'] = [
    { op: 'trim', mode: 'timeline-safe', instructions },
    { op: 'transition', preset: effect === 'cinematic' ? 'fade' : 'cut', instructions },
    { op: 'subtitle', mode: 'auto', instructions },
    { op: 'audio_mix', profile: 'balanced' },
  ];

  if (effect !== 'none') {
    operations.push({ op: 'color_grade', preset: effect, instructions });
  }

  if (/lip\s*sync/i.test(instructions)) {
    operations.push({ op: 'lip_sync', mode: 'auto', instructions });
  }

  return operations;
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return apiError(new Error('Unauthorized'), 401, 'Login required');
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const instructions = String(formData.get('instructions') ?? '').trim();
    const effect = String(formData.get('effect') ?? 'none').trim() || 'none';

    if (!(file instanceof File)) {
      return apiError(new Error('Missing source file'), 400, 'file is required');
    }

    if (!instructions) {
      return apiError(new Error('Missing instructions'), 400, 'instructions are required');
    }

    if (!ALLOWED_VIDEO_TYPES.has(file.type || '')) {
      return apiError(new Error(`Unsupported file type: ${file.type}`), 400, 'Unsupported video type');
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return apiError(new Error(`File too large: ${file.size}`), 400, 'Video file exceeds size limit');
    }

    const serviceClient = createServiceRoleClient();
    const { data: agentDef } = await serviceClient
      .from('agent_definitions')
      .select('id, active, timeout_seconds, max_attempts')
      .eq('id', EDITING_AGENT_ID)
      .maybeSingle();

    if (!agentDef) {
      return apiError(new Error('Editing agent not found'), 404, 'Editing agent is unavailable');
    }

    if (!agentDef.active) {
      return apiError(new Error('Editing agent disabled'), 403, 'Editing is temporarily unavailable');
    }

    const extension = (file.name.split('.').pop() || 'mp4').toLowerCase();
    const inputPath = generateKey('editing-input', user.id, extension);
    const fileBytes = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await serviceClient.storage
      .from(INPUT_BUCKET)
      .upload(inputPath, fileBytes, {
        contentType: file.type || 'video/mp4',
        upsert: false,
      });

    if (uploadError) {
      return apiError(uploadError, 500, 'Failed to upload source video');
    }

    const outputPathPrefix = `editing-output/${user.id}/${randomUUID()}`;
    const payload: EditingJobPayload & Record<string, unknown> = {
      source_assets: [{ bucket: INPUT_BUCKET, path: inputPath }],
      operations: buildEditingOperations(instructions, effect),
      export_formats: ['mp4_1080p'],
      output_path_prefix: outputPathPrefix,
      source_file_name: file.name,
      instructions,
      effect,
    };

    const { data: job, error: jobError } = await serviceClient
      .from('jobs')
      .insert({
        user_id: user.id,
        agent_id: EDITING_AGENT_ID,
        status: 'queued',
        priority: 8,
        payload,
        timeout_seconds: agentDef.timeout_seconds ?? 1200,
        max_attempts: agentDef.max_attempts ?? 3,
        attempt_count: 0,
      })
      .select('id, status')
      .single();

    if (jobError || !job) {
      return apiError(jobError ?? new Error('Job creation failed'), 500, 'Failed to create editing job');
    }

    return apiSuccess({
      jobId: job.id,
      status: job.status,
      sourceAsset: { bucket: INPUT_BUCKET, path: inputPath, fileName: file.name },
      effect,
    }, 201);
  } catch (error) {
    return apiError(error, 500, 'Failed to create editing job');
  }
}