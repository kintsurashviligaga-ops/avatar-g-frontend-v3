import {
  createFulfillmentJob as createFulfillmentJobRecord,
  getFulfillmentJob,
  getOrder,
  listSuppliers,
  updateFulfillmentJob,
  updateOrder,
} from './repo';
import type { FulfillmentJob } from './types';

export function createFulfillmentJob(orderId: string): FulfillmentJob {
  const order = getOrder(orderId);

  if (!order) {
    throw new Error('Order not found');
  }

  const supplier = listSuppliers()[0];

  return createFulfillmentJobRecord({
    orderId,
    status: 'queued',
    supplierPayload: {
      supplierId: supplier?.id || 'sup_mock_1',
      orderId,
      quantity: order.quantity,
      mode: 'mock',
    },
  });
}

export async function runFulfillmentJob(jobId: string): Promise<FulfillmentJob> {
  const job = getFulfillmentJob(jobId);

  if (!job) {
    throw new Error('Fulfillment job not found');
  }

  updateFulfillmentJob(job.id, { status: 'processing' });

  await new Promise((resolve) => setTimeout(resolve, 120));

  const trackingCode = `TRK-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const completed = updateFulfillmentJob(job.id, {
    status: 'completed',
    trackingCode,
    error: undefined,
  });

  updateOrder(job.orderId, { status: 'fulfilled' });

  if (!completed) {
    throw new Error('Failed to update fulfillment job');
  }

  return completed;
}
