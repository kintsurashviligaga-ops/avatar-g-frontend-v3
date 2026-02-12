/**
 * Avatar G - Jobs Management
 * Create, update, and query job records for agent execution tracking
 */

import { createSupabaseServerClient } from '@/lib/supabase/server';

export type JobStatus = 'queued' | 'processing' | 'done' | 'error';

export interface Job {
  id: string;
  user_id: string;
  type: string;
  agent_id: string;
  cost_credits: number;
  plan_required: string;
  status: JobStatus;
  progress: number;
  error: string | null;
  input_json: Record<string, unknown>;
  output_json: Record<string, unknown> | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateJobParams {
  userId: string;
  agentId: string;
  type: string;
  inputJson: Record<string, unknown>;
  costCredits: number;
  planRequired: string;
}

export interface UpdateJobParams {
  jobId: string;
  status?: JobStatus;
  progress?: number;
  outputJson?: Record<string, unknown>;
  error?: string;
}

/**
 * Create a new job
 */
export async function createJob(params: CreateJobParams): Promise<Job> {
  const supabase = createSupabaseServerClient();
  
  const { data, error } = await supabase
    .from('jobs')
    .insert({
      user_id: params.userId,
      agent_id: params.agentId,
      type: params.type,
      input_json: params.inputJson,
      cost_credits: params.costCredits,
      plan_required: params.planRequired,
      status: 'queued',
      progress: 0,
    })
    .select()
    .single();
  
  if (error) {
    console.error('Failed to create job:', error);
    throw new Error(`Failed to create job: ${error.message}`);
  }
  
  return data as Job;
}

/**
 * Update job status and progress
 */
export async function updateJob(params: UpdateJobParams): Promise<Job> {
  const supabase = createSupabaseServerClient();
  
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  
  if (params.status !== undefined) {
    updates.status = params.status;
    
    // Set timestamps based on status
    if (params.status === 'processing' && !updates.started_at) {
      updates.started_at = new Date().toISOString();
    }
    if (params.status === 'done' || params.status === 'error') {
      updates.completed_at = new Date().toISOString();
    }
  }
  
  if (params.progress !== undefined) updates.progress = params.progress;
  if (params.outputJson !== undefined) updates.output_json = params.outputJson;
  if (params.error !== undefined) updates.error = params.error;
  
  const { data, error } = await supabase
    .from('jobs')
    .update(updates)
    .eq('id', params.jobId)
    .select()
    .single();
  
  if (error) {
    console.error('Failed to update job:', error);
    throw new Error(`Failed to update job: ${error.message}`);
  }
  
  return data as Job;
}

/**
 * Get job by ID
 */
export async function getJob(jobId: string, userId?: string): Promise<Job | null> {
  const supabase = createSupabaseServerClient();
  
  let query = supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId);
  
  // Optionally filter by userId for security
  if (userId) {
    query = query.eq('user_id', userId);
  }
  
  const { data, error } = await query.single();
  
  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    console.error('Failed to get job:', error);
    throw new Error(`Failed to get job: ${error.message}`);
  }
  
  return data as Job;
}

/**
 * List user jobs with filtering
 */
export async function listJobs(params: {
  userId: string;
  status?: JobStatus;
  agentId?: string;
  limit?: number;
  offset?: number;
}): Promise<{ jobs: Job[]; total: number }> {
  const supabase = createSupabaseServerClient();
  
  let query = supabase
    .from('jobs')
    .select('*', { count: 'exact' })
    .eq('user_id', params.userId)
    .order('created_at', { ascending: false });
  
  if (params.status) {
    query = query.eq('status', params.status);
  }
  
  if (params.agentId) {
    query = query.eq('agent_id', params.agentId);
  }
  
  if (params.limit) {
    query = query.limit(params.limit);
  }
  
  if (params.offset) {
    query = query.range(params.offset, params.offset + (params.limit || 10) - 1);
  }
  
  const { data, error, count } = await query;
  
  if (error) {
    console.error('Failed to list jobs:', error);
    throw new Error(`Failed to list jobs: ${error.message}`);
  }
  
  return {
    jobs: (data as Job[]) || [],
    total: count || 0,
  };
}

/**
 * Get recent jobs for dashboard
 */
export async function getRecentJobs(userId: string, limit = 10): Promise<Job[]> {
  const result = await listJobs({ userId, limit });
  return result.jobs;
}

/**
 * Get job statistics for user
 */
export async function getJobStats(userId: string): Promise<{
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  totalCreditsSpent: number;
  jobsByAgent: Record<string, number>;
}> {
  const supabase = createSupabaseServerClient();
  
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('status, cost_credits, agent_id')
    .eq('user_id', userId);
  
  if (error) {
    console.error('Failed to get job stats:', error);
    throw new Error(`Failed to get job stats: ${error.message}`);
  }
  
  const stats = {
    totalJobs: jobs.length,
    completedJobs: 0,
    failedJobs: 0,
    totalCreditsSpent: 0,
    jobsByAgent: {} as Record<string, number>,
  };
  
  for (const job of jobs) {
    if (job.status === 'done') stats.completedJobs++;
    if (job.status === 'error') stats.failedJobs++;
    stats.totalCreditsSpent += job.cost_credits || 0;
    
    const agentId = job.agent_id || 'unknown';
    stats.jobsByAgent[agentId] = (stats.jobsByAgent[agentId] || 0) + 1;
  }
  
  return stats;
}

/**
 * Delete old completed jobs (cleanup)
 */
export async function cleanupOldJobs(daysOld = 90): Promise<number> {
  const supabase = createSupabaseServerClient();
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  
  const { error, count } = await supabase
    .from('jobs')
    .delete({ count: 'exact' })
    .eq('status', 'done')
    .lt('completed_at', cutoffDate.toISOString());
  
  if (error) {
    console.error('Failed to cleanup jobs:', error);
    throw new Error(`Failed to cleanup jobs: ${error.message}`);
  }
  
  return count || 0;
}
