/** @jest-environment node */
/** /api/cron/deliveries: the cron secret first, inert while DELIVERY_OUTBOX is off, one sweep while on. */
jest.mock('server-only', () => ({}));
const mockSweep = jest.fn(async (..._a: unknown[]) => ({ seen: 2, outcomes: { delivered: 2 } }));
jest.mock('../../../../lib/notifications/outbox', () => ({ sweepDeliveries: (...a: unknown[]) => mockSweep(...a) }));
jest.mock('../../../../lib/notifications/outboxLive', () => ({
  ...jest.requireActual('../../../../lib/notifications/outboxLive'),
  liveOutboxDeps: () => ({}),
}));
jest.mock('../../../../lib/supabase/server', () => ({ createServiceRoleClient: () => ({}) }));

import { GET } from './route';

const ENV = { ...process.env };
const call = (auth?: string) => GET(new Request('https://myavatar.ge/api/cron/deliveries', { headers: auth ? { authorization: auth } : {} }));

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ENV, CRON_SECRET: 's3cret' };
  delete process.env.DELIVERY_OUTBOX;
  delete process.env.VERCEL_ENV;
});
afterAll(() => { process.env = ENV; });

it('refuses a call without the cron secret, and refuses everyone when no secret is set', async () => {
  expect((await call()).status).toBe(403);
  expect((await call('Bearer nope')).status).toBe(403);
  delete process.env.CRON_SECRET;
  expect((await call('Bearer undefined')).status).toBe(403);
  expect(mockSweep).not.toHaveBeenCalled();
});

it('off (the Production default): answers skipped and reads nothing', async () => {
  const res = await call('Bearer s3cret');
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, skipped: 'the delivery outbox is off' });
  expect(mockSweep).not.toHaveBeenCalled();
});

it('on: one sweep, and its report', async () => {
  process.env.DELIVERY_OUTBOX = 'on';
  const res = await call('Bearer s3cret');
  expect(await res.json()).toEqual({ ok: true, seen: 2, outcomes: { delivered: 2 } });
  expect(mockSweep).toHaveBeenCalledTimes(1);
});
