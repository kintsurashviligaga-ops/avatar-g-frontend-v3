import 'server-only';

import { createRouteHandlerClient } from '@/lib/supabase/server';

export type JobStatus = 'queued' | 'processing' | 'succeeded' | 'failed';

export interface JobRecord {
  id: string;
  user_id: string;
  agent_id: string;
  status: JobStatus;
  cost: number;
  input_json: Record<string, unknown>;
  output_json: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export async function createJob(input: {
  userId: string;
  agentId: string;
  cost: number;
  payload: Record<string, unknown>;
}): Promise<JobRecord> {
  const supabase = createRouteHandlerClient();

  const { data, error } = await supabase
    .from('jobs')
    .insert({
      user_id: input.userId,
      agent_id: input.agentId,
      status: 'queued',
      cost: input.cost,
      input_json: input.payload,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to create job');
  }

  return data as JobRecord;
}

export async function updateJob(input: {
  userId: string;
  id: string;
  status?: JobStatus;
  outputJson?: Record<string, unknown>;
  error?: string | null;
}): Promise<JobRecord> {
  const supabase = createRouteHandlerClient();

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.status) {
    updates.status = input.status;
  }

  if (input.outputJson !== undefined) {
    updates.output_json = input.outputJson;
  }

  if (input.error !== undefined) {
    updates.error = input.error;
  }

  const { data, error } = await supabase
    .from('jobs')
    .update(updates)
    .eq('id', input.id)
    .eq('user_id', input.userId)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to update job');
  }

  return data as JobRecord;
}

export async function getJob(input: { userId: string; id: string }): Promise<JobRecord | null> {
  const supabase = createRouteHandlerClient();

  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', input.id)
    .eq('user_id', input.userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(error.message);
  }

  return data as JobRecord;
}

export async function getRecentJobs(input: { userId: string; limit?: number }): Promise<JobRecord[]> {
  const supabase = createRouteHandlerClient();

  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('user_id', input.userId)
    .order('created_at', { ascending: false })
    .limit(input.limit ?? 20);

  if (error) {
    throw new Error(error.message);
  }

  return (data || []) as JobRecord[];
}

export async function getMonthlyUsageSummary(userId: string): Promise<{
  creditsSpent: number;
  jobsCount: number;
  byService: Array<{ agentId: string; jobs: number; credits: number }>;
}> {
  const supabase = createRouteHandlerClient();
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();

  const { data, error } = await supabase
    .from('jobs')
    .select('agent_id, cost')
    .eq('user_id', userId)
    .gte('created_at', monthStart);

  if (error) {
    throw new Error(error.message);
  }

  const rows = data || [];
  let creditsSpent = 0;
  const grouped: Record<string, { jobs: number; credits: number }> = {};

  for (const row of rows) {
    const agentId = row.agent_id || 'unknown';
    const cost = row.cost || 0;
    creditsSpent += cost;
    grouped[agentId] = grouped[agentId] || { jobs: 0, credits: 0 };
    grouped[agentId].jobs += 1;
    grouped[agentId].credits += cost;
  }

  return {
    creditsSpent,
    jobsCount: rows.length,
    byService: Object.entries(grouped).map(([agentId, value]) => ({
      agentId,
      jobs: value.jobs,
      credits: value.credits,
    })),
  };
}

export async function getJobStats(userId: string): Promise<{
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  totalCreditsSpent: number;
  jobsByAgent: Record<string, number>;
}> {
  const summary = await getMonthlyUsageSummary(userId);
  const jobsByAgent: Record<string, number> = {};

  for (const item of summary.byService) {
    jobsByAgent[item.agentId] = item.jobs;
  }

  return {
    totalJobs: summary.jobsCount,
    completedJobs: 0,
    failedJobs: 0,
    totalCreditsSpent: summary.creditsSpent,
    jobsByAgent,
  };
}
