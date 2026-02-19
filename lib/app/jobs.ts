import 'server-only';

import { createServerClient } from '@/lib/supabase/server';

export type ServiceJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type ServiceJob = {
  id: string;
  user_id: string;
  service_slug: string;
  title: string;
  status: ServiceJobStatus;
  progress: number;
  attempt_count: number;
  max_attempts: number;
  heartbeat_at: string | null;
  error_message: string | null;
  input_payload: Record<string, unknown>;
  output_payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export async function getUserServiceJobs(userId: string, limit = 40, serviceSlug?: string) {
  const supabase = createServerClient();
  let query = supabase
    .from('service_jobs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (serviceSlug) {
    query = query.eq('service_slug', serviceSlug);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as ServiceJob[];
}

export async function getUserOutputs(userId: string, limit = 80) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('service_outputs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getServiceSummary(userId: string) {
  const jobs = await getUserServiceJobs(userId, 250);
  const outputs = await getUserOutputs(userId, 250);

  const completed = jobs.filter((job) => job.status === 'completed').length;
  const processing = jobs.filter((job) => job.status === 'processing').length;
  const failed = jobs.filter((job) => job.status === 'failed').length;

  return {
    totalJobs: jobs.length,
    completed,
    processing,
    failed,
    outputs: outputs.length,
  };
}