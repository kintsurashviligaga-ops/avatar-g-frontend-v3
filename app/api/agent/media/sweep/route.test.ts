/** @jest-environment node */
/**
 * /api/agent/media/sweep: refused without the cron secret, inert while AGENT_G_MEDIA_EXEC is closed (it does not even
 * build the live wiring), and otherwise one sweep that may work one job. The sweep itself is tested in
 * lib/agent/media/montageWorker.test.ts.
 */
jest.mock('server-only', () => ({}));
const mockSweep = jest.fn();
jest.mock('../../../../../lib/agent/media/montageWorker', () => ({ sweepMontageJobs: (...a: unknown[]) => mockSweep(...a) }));
const mockDeps = jest.fn(() => ({ live: true }));
jest.mock('../../../../../lib/agent/media/montageLive', () => ({ liveMontageDeps: () => mockDeps(), newWorkerId: () => 'w-cron' }));
jest.mock('../../../../../lib/observability/report-error', () => ({ reportError: jest.fn() }));
jest.mock('../../../../../lib/admin/guard', () => ({ isAdminUser: () => false }));

import { GET } from './route';

const ENV = { ...process.env };
const call = (auth?: string) => GET(new Request('https://myavatar.ge/api/agent/media/sweep', { headers: auth ? { authorization: auth } : {} }));

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ENV, CRON_SECRET: 's3cret' };
  delete process.env.AGENT_G_MEDIA_EXEC;
  delete process.env.VERCEL_ENV;
});
afterAll(() => { process.env = ENV; });

test('no secret, or the wrong one: 403, nothing read', async () => {
  expect((await call()).status).toBe(403);
  expect((await call('Bearer nope')).status).toBe(403);
  delete process.env.CRON_SECRET;
  expect((await call('Bearer undefined')).status).toBe(403);
  expect(mockDeps).not.toHaveBeenCalled();
});

test('closed (the Production default): skipped without touching the queue', async () => {
  process.env.VERCEL_ENV = 'production';
  expect(await (await call('Bearer s3cret')).json()).toEqual({ ok: true, skipped: 'agent media execution is closed' });
  expect(mockDeps).not.toHaveBeenCalled();
  expect(mockSweep).not.toHaveBeenCalled();
});

test('open: one sweep as one worker, and its report; a throw is a 500', async () => {
  process.env.AGENT_G_MEDIA_EXEC = 'admin';
  mockSweep.mockResolvedValueOnce({ gaveUp: ['a'], paid: [], waiting: [] });
  const res = await call('Bearer s3cret');
  expect(await res.json()).toEqual({ ok: true, gaveUp: ['a'], paid: [], waiting: [] });
  expect(mockSweep).toHaveBeenCalledWith({ live: true }, { worker: 'w-cron', work: true });
  mockSweep.mockRejectedValueOnce(new Error('db down'));
  expect((await call('Bearer s3cret')).status).toBe(500);
});
