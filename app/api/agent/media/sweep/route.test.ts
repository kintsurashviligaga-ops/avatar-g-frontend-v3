/** @jest-environment node */
/**
 * /api/agent/media/sweep: refused without the cron secret, inert while AGENT_G_MEDIA_EXEC is closed (it does not even
 * build the live wiring), and otherwise a tick of the live multi-step runs, then one sweep of each queue that works at
 * most one job. The sweeps themselves are tested in lib/agent/media/montageWorker.test.ts, audioWorker.test.ts,
 * editExec.test.ts and lib/agent/run/runExec.test.ts.
 */
jest.mock('server-only', () => ({}));
const mockSweep = jest.fn();
jest.mock('../../../../../lib/agent/media/montageWorker', () => ({ sweepMontageJobs: (...a: unknown[]) => mockSweep(...a) }));
const mockDeps = jest.fn(() => ({ live: true }));
jest.mock('../../../../../lib/agent/media/montageLive', () => ({ liveMontageDeps: () => mockDeps(), newWorkerId: () => 'w-cron' }));
const mockAudioSweep = jest.fn();
jest.mock('../../../../../lib/agent/media/audioWorker', () => ({ sweepAudioJobs: (...a: unknown[]) => mockAudioSweep(...a) }));
const mockAudioDeps = jest.fn(() => ({ audio: true }));
jest.mock('../../../../../lib/agent/media/audioLive', () => ({ liveAudioDeps: () => mockAudioDeps() }));
const mockEditSweep = jest.fn(async () => ({ gaveUp: [], waiting: [] }));
jest.mock('../../../../../lib/agent/media/editWorker', () => ({ sweepEditJobs: (...a: unknown[]) => mockEditSweep(...(a as [])) }));
const mockEditDeps = jest.fn(() => ({ edit: true }));
jest.mock('../../../../../lib/agent/media/editLive', () => ({ liveEditDeps: () => mockEditDeps() }));
const mockRunSweep = jest.fn(async () => ({ ticked: 0, ended: 0 }));
jest.mock('../../../../../lib/agent/run/runExec', () => ({ sweepRuns: (...a: unknown[]) => mockRunSweep(...(a as [])) }));
const mockRunDeps = jest.fn(() => ({ runs: true }));
jest.mock('../../../../../lib/agent/run/runLive', () => ({ liveRunDeps: () => mockRunDeps() }));
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
  expect(mockAudioDeps).not.toHaveBeenCalled();
  expect(mockAudioSweep).not.toHaveBeenCalled();
  expect(mockEditDeps).not.toHaveBeenCalled();
  expect(mockEditSweep).not.toHaveBeenCalled();
  expect(mockRunDeps).not.toHaveBeenCalled();
  expect(mockRunSweep).not.toHaveBeenCalled();
});

test('open: one sweep of each queue as one worker, and their reports; a throw is a 500', async () => {
  process.env.AGENT_G_MEDIA_EXEC = 'admin';
  mockSweep.mockResolvedValueOnce({ gaveUp: ['a'], paid: [], waiting: [] });
  mockAudioSweep.mockResolvedValueOnce({ gaveUp: [], waiting: ['x'], worked: { jobId: 'x', result: { ran: true, outcome: 'delivered', audioUrl: 'u' } } });
  mockRunSweep.mockResolvedValueOnce({ ticked: 2, ended: 1 });
  const res = await call('Bearer s3cret');
  expect(await res.json()).toEqual({
    ok: true, gaveUp: ['a'], paid: [], waiting: [],
    audio: { gaveUp: [], waiting: ['x'], worked: { jobId: 'x', result: { ran: true, outcome: 'delivered', audioUrl: 'u' } } },
    edit: { gaveUp: [], waiting: [] },
    runs: { ticked: 2, ended: 1 },
  });
  expect(mockRunSweep).toHaveBeenCalledWith({ runs: true }, { limit: 10 });
  expect(mockSweep).toHaveBeenCalledWith({ live: true }, { worker: 'w-cron', work: true });
  expect(mockAudioSweep).toHaveBeenCalledWith({ audio: true }, { worker: 'w-cron', work: true });
  expect(mockEditSweep).toHaveBeenCalledWith({ edit: true }, { worker: 'w-cron', work: false }); // the audio job was this run's one
  mockSweep.mockRejectedValueOnce(new Error('db down'));
  expect((await call('Bearer s3cret')).status).toBe(500);
});

test('a montage worked in this run leaves the audio queue to be reaped only, not worked', async () => {
  process.env.AGENT_G_MEDIA_EXEC = 'on';
  mockSweep.mockResolvedValueOnce({ gaveUp: [], paid: [], waiting: ['m'], worked: { jobId: 'm', result: { ran: true } } });
  mockAudioSweep.mockResolvedValueOnce({ gaveUp: ['dead'], waiting: ['x'] });
  expect(await (await call('Bearer s3cret')).json()).toMatchObject({ audio: { gaveUp: ['dead'], waiting: ['x'] } });
  expect(mockAudioSweep).toHaveBeenCalledWith({ audio: true }, { worker: 'w-cron', work: false });
});

test('with no montage and no audio job waiting, one edit is worked', async () => {
  process.env.AGENT_G_MEDIA_EXEC = 'on';
  mockSweep.mockResolvedValueOnce({ gaveUp: [], paid: [], waiting: [] });
  mockAudioSweep.mockResolvedValueOnce({ gaveUp: [], waiting: [] });
  mockEditSweep.mockResolvedValueOnce({ gaveUp: [], waiting: ['e'], worked: { jobId: 'e', result: { ran: true, outcome: 'delivered', url: 'u' } } } as never);
  expect(await (await call('Bearer s3cret')).json()).toMatchObject({ edit: { worked: { jobId: 'e' } } });
  expect(mockEditSweep).toHaveBeenCalledWith({ edit: true }, { worker: 'w-cron', work: true });
});
