/** @jest-environment node */
/**
 * GET /api/app/worker/tick — Vercel Cron calls GET. The route exported only POST, so every scheduled run was a 405 and
 * the channel queues (WhatsApp, Telegram) were never drained. Pinned: GET runs the tick under the same cron auth, a
 * failed stale-job scan no longer stops the queues being drained, and a WhatsApp delivery in the queue is answered.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../../../lib/supabase/server', () => ({ createServiceRoleClient: jest.fn() }));
jest.mock('../../../../../lib/platform/queues', () => ({
  dequeueQueueItems: jest.fn(),
  enqueueQueueItem: jest.fn(async () => undefined),
  getQueueSnapshot: jest.fn(async () => ({})),
}));
jest.mock('../../../../../lib/agent-g/channels/whatsapp-processor', () => ({ processWhatsAppPayload: jest.fn(async () => undefined) }));
jest.mock('../../../../../lib/agent-g/channels/telegram-webhook-handler', () => ({ processTelegramUpdateInBackground: jest.fn(async () => undefined) }));
jest.mock('../../../../../lib/platform/request-metrics', () => ({ recordRouteMetric: jest.fn() }));

import { NextRequest } from 'next/server';
import { GET } from './route';
import { createServiceRoleClient } from '../../../../../lib/supabase/server';
import { dequeueQueueItems } from '../../../../../lib/platform/queues';
import { processWhatsAppPayload } from '../../../../../lib/agent-g/channels/whatsapp-processor';

const ENV = { ...process.env };
const tick = (headers: Record<string, string> = {}) => GET(new NextRequest('https://myavatar.ge/api/app/worker/tick', { headers }));

function db(staleError: { message: string } | null) {
  const chain = {
    select: () => chain, eq: () => chain, lt: () => chain, in: () => chain, update: () => chain,
    limit: async () => ({ data: staleError ? null : [], error: staleError }),
  };
  return { from: () => chain };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.CRON_SECRET = 'cron-secret';
  const queues: Record<string, Array<Record<string, unknown>>> = {
    webhooks_ingest: [],
    processing_jobs: [{ id: 'q1', payload: { source: 'whatsapp', request_id: 'r1', origin: 'https://myavatar.ge', payload: { entry: [] } } }],
    billing_events: [],
  };
  (dequeueQueueItems as jest.Mock).mockImplementation(async (name: string, n: number) => queues[name].splice(0, n));
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { process.env = { ...ENV }; jest.restoreAllMocks(); });

test('GET without the cron secret is refused', async () => {
  (createServiceRoleClient as jest.Mock).mockReturnValue(db(null));
  expect((await tick()).status).toBe(403);
  expect(processWhatsAppPayload).not.toHaveBeenCalled();
});

test('GET with Vercel Cron’s bearer runs the tick and answers the queued WhatsApp delivery', async () => {
  (createServiceRoleClient as jest.Mock).mockReturnValue(db(null));
  const res = await tick({ authorization: 'Bearer cron-secret' });
  expect(res.status).toBe(200);
  expect(processWhatsAppPayload).toHaveBeenCalledWith({ entry: [] }, 'r1', 'https://myavatar.ge');
});

test('a failed stale-job scan no longer starves the channel queues', async () => {
  (createServiceRoleClient as jest.Mock).mockReturnValue(db({ message: 'relation "service_jobs" does not exist' }));
  const res = await tick({ authorization: 'Bearer cron-secret' });
  expect(res.status).toBe(200);
  expect(processWhatsAppPayload).toHaveBeenCalledTimes(1);
});
