/**
 * Delivery Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Dispatches executive task outputs to the user via email, SMS, or dashboard.
 * Production: hook into SendGrid / Twilio for real delivery.
 */

import { createServiceRoleClient } from '@/lib/supabase/server';
import { structuredLog } from '@/lib/logger';
import type { DeliveryRecord, ExecutiveOutputs } from '@/types/billing';

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
          // TODO(prod): SendGrid / Resend integration
          structuredLog('info', 'delivery.email.mock', {
            userId: req.userId,
            taskId: req.taskId,
          });
          records.push({
            channel: 'email',
            status: 'sent',
            sentAt: new Date().toISOString(),
            detail: 'mock: email delivery simulated',
          });
          break;

        case 'sms':
          // TODO(prod): Twilio SMS integration
          structuredLog('info', 'delivery.sms.mock', {
            userId: req.userId,
            taskId: req.taskId,
          });
          records.push({
            channel: 'sms',
            status: 'sent',
            sentAt: new Date().toISOString(),
            detail: 'mock: sms delivery simulated',
          });
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
