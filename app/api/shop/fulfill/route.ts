import { NextRequest } from 'next/server';
import { createFulfillmentJob, runFulfillmentJob } from '@/lib/onlineShop/fulfillment';
import { FulfillOrderSchema } from '@/lib/onlineShop/schemas';
import { errorResponse, okResponse } from '@/lib/onlineShop/http';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => ({}));
  const parsed = FulfillOrderSchema.safeParse(payload);

  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message || 'Invalid fulfill input', 400);
  }

  try {
    const queued = createFulfillmentJob(parsed.data.orderId);
    const completed = await runFulfillmentJob(queued.id);

    return okResponse({ job: completed });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Fulfillment failed', 500);
  }
}
