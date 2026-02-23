import { createServiceRoleClient } from '@/lib/supabase/server';
import { getPlanDefinition, planHasFeature, type PlanId } from '@/lib/monetization/plans';

export type QueueName = 'default' | 'priority' | 'heavy';

const HEAVY_SERVICES = new Set(['video-studio', 'media-production', 'game-creator']);

export function resolveQueueName(input: { plan: PlanId; serviceSlug: string }): QueueName {
  if (HEAVY_SERVICES.has(input.serviceSlug)) {
    return 'heavy';
  }
  if (planHasFeature(input.plan, 'priority_queue')) {
    return 'priority';
  }
  return 'default';
}

export async function assertQueueConcurrency(input: {
  userId: string;
  orgId?: string | null;
  plan: PlanId;
  queue: QueueName;
}): Promise<void> {
  const supabase = createServiceRoleClient();
  const plan = getPlanDefinition(input.plan);
  const maxConcurrent = plan.limits.concurrent_jobs;

  let query = supabase
    .from('service_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', input.userId)
    .in('status', ['queued', 'processing'])
    .eq('queue_name', input.queue);

  if (input.orgId) query = query.eq('org_id', input.orgId);
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  if ((count ?? 0) >= maxConcurrent) {
    throw new Error('QUEUE_CONCURRENCY_LIMIT_REACHED');
  }
}
