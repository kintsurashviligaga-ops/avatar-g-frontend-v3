import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { generateVoice } from '@/lib/ai/elevenlabs';
import type { VoiceJob } from '@/lib/voice-lab/types';
import { getBillingSnapshot } from '@/lib/billing/enforce';

export const dynamic = 'force-dynamic';

const createJobSchema = z.object({
  project_id: z.string().uuid().nullable().optional(),
  type: z.enum(['cleanup', 'clone', 'generate']),
  input: z.record(z.unknown()).default({}),
});

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return apiSuccess({ guest: true, jobs: [] as VoiceJob[] });
    }

    const projectId = request.nextUrl.searchParams.get('project_id');
    const supabase = createServiceRoleClient();

    let query = supabase
      .from('voice_jobs')
      .select('*')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    const { data, error } = await query;
    if (error) {
      return apiError(error, 500, 'Failed to load voice jobs');
    }

    return apiSuccess({ guest: false, jobs: (data ?? []) as VoiceJob[] });
  } catch (error) {
    return apiError(error, 500, 'Failed to load voice jobs');
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = createJobSchema.safeParse(await request.json());
    if (!payload.success) {
      return apiError(payload.error, 400, 'Invalid voice job payload');
    }

    const user = await getAuthenticatedUser(request);
    if (!user) {
      return apiSuccess({ guest: true, job: null, message: 'Guest mode runs jobs locally in UI.' });
    }

    const supabase = createServiceRoleClient();

    const { data: createdJob, error: createError } = await supabase
      .from('voice_jobs')
      .insert({
        owner_id: user.id,
        project_id: payload.data.project_id ?? null,
        type: payload.data.type,
        status: 'queued',
        input: payload.data.input,
      })
      .select('*')
      .single();

    if (createError || !createdJob) {
      return apiError(createError ?? new Error('Insert failed'), 500, 'Failed to enqueue voice job');
    }

    await supabase
      .from('voice_jobs')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', createdJob.id)
      .eq('owner_id', user.id);

    const input = payload.data.input;
    const sourceText = String(input.text ?? input.prompt ?? '').trim();
    const voiceId = String(input.provider_voice_id ?? process.env.ELEVENLABS_VOICE_ID ?? '').trim();
    const snapshot = await getBillingSnapshot(user.id);
    const qualityByPlan: Record<string, 'draft' | 'standard' | 'studio'> = {
      FREE: 'draft',
      PRO: 'standard',
      PREMIUM: 'studio',
      ENTERPRISE: 'studio',
    };
    const quality = qualityByPlan[snapshot.plan] || 'draft';

    if (!sourceText) {
      return apiError(new Error('Text is required'), 400, 'Voice job requires input text');
    }

    if (!voiceId) {
      return apiError(new Error('ELEVENLABS_VOICE_ID missing'), 500, 'Voice provider configuration missing');
    }

    const voice = await generateVoice(sourceText, voiceId, quality === 'studio' ? 'excited' : 'neutral');
    const audioBase64 = Buffer.from(voice.audioBuffer).toString('base64');
    const output = {
      provider: 'elevenlabs',
      quality,
      title: String(input.title ?? 'Voice Lab Output'),
      text: sourceText,
      language: String(input.language ?? 'en'),
      profile_name: String(input.profile_name ?? 'Default Voice'),
      audio_url: `data:audio/mpeg;base64,${audioBase64}`,
      duration_seconds: voice.duration,
      voice_id: voice.voiceId,
    };

    const { data: doneJob, error: doneError } = await supabase
      .from('voice_jobs')
      .update({
        status: 'done',
        output,
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', createdJob.id)
      .eq('owner_id', user.id)
      .select('*')
      .single();

    if (doneError || !doneJob) {
      return apiError(doneError ?? new Error('Finalize failed'), 500, 'Failed to finalize voice job');
    }

    return apiSuccess({ guest: false, job: doneJob as VoiceJob }, 201);
  } catch (error) {
    return apiError(error, 500, 'Failed to run voice job');
  }
}
