/**
 * Delivery Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Dispatches executive task outputs to the user via email, SMS, or dashboard.
 *
 * ⚠️ Email and SMS used to be recorded as `sent` ("mock: … delivery simulated") though nothing was sent. No sender is
 * wired here, so they are recorded as `failed` with the reason, and only the dashboard (the data is already stored)
 * counts as delivered. Nothing calls this today; Agent G's channel delivery is docs/handoffs/omnichannel.
 */

import { createServiceRoleClient } from '@/lib/supabase/server';
import { structuredLog } from '@/lib/logger';
import type { DeliveryRecord, ExecutiveOutputs } from '@/types/billing';

/** Why an email or SMS delivery is recorded as failed: no sender is wired, so nothing left. */
export const NOT_WIRED = 'not_configured: no sender is wired for this channel; nothing was sent';

export interface DeliveryRequest {
  userId: string;
  taskId: string;
  outputs: ExecutiveOutputs;
  channels: Array<'email' | 'sms' | 'dashboard'>;
}

/**
 * Deliver executive-task outputs to the requested channels.
 * Returns an array of delivery records persisted against the task.
 */
export async function deliverOutputs(
  req: DeliveryRequest,
): Promise<DeliveryRecord[]> {
  const db = createServiceRoleClient();
  const records: DeliveryRecord[] = [];

  for (const channel of req.channels) {
    try {
      switch (channel) {
        case 'email':
        case 'sms':
          records.push({ channel, status: 'failed', detail: NOT_WIRED });
          break;

        case 'dashboard':
          // Dashboard delivery = data is already in DB, just mark it
          records.push({
            channel: 'dashboard',
            status: 'sent',
            sentAt: new Date().toISOString(),
          });
          break;
      }
    } catch (err) {
      structuredLog('error', 'delivery.fail', {
        channel,
        taskId: req.taskId,
        error: err instanceof Error ? err.message : 'unknown',
      });
      records.push({
        channel,
        status: 'failed',
        detail: err instanceof Error ? err.message : 'unknown',
      });
    }
  }

  // Merge delivery records into the task's outputs
  const updatedOutputs: ExecutiveOutputs = {
    ...req.outputs,
    deliveries: [...req.outputs.deliveries, ...records],
  };

  await db
    .from('executive_task_logs')
    .update({ outputs: updatedOutputs })
    .eq('id', req.taskId);

  structuredLog('info', 'delivery.complete', {
    taskId: req.taskId,
    channels: req.channels,
    deliveries: records.length,
  });

  return records;
}
