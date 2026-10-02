/** @jest-environment node */
/**
 * GET /api/motion-control/status — a failed render is refunded through the LEDGER, AWAITED, before the row turns
 * terminal; the refund goes only to the payer the charge names; the provider's raw text never reaches the body.
 *
 * ⚠️ Before: `void refundCredits(...)` beside `void failJob(...)` on the poll that ends the client's loop — a frozen
 * lambda dropped the refund for good — a fixed creditCostFor('remix') rather than what the ledger shows, and
 * `error: poll.error` (Replicate's own words). The success path filed the Library row with `void` too.
 */
jest.mock('server-only', () => ({}));

let mockUser: { id: string } | null = { id: 'user-1' };
jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: mockUser })) }));
jest.mock('../../../../lib/ai/klingClient', () => ({ klingPoll: jest.fn() }));
jest.mock('../../../../lib/orchestrator/storage-adapter', () => ({ uploadBufferAndSign: jest.fn(async () => null) }));
jest.mock('../../../../lib/orchestrator/jobs', () => ({
  failJob: jest.fn(async () => undefined),
  recordCompletedAsset: jest.fn(async () => true),
  jobOwnerId: jest.fn(async () => 'user-1'),
}));
jest.mock('../../../../lib/orchestrator/ledger', () => ({ refundDebitByRef: jest.fn(async () => ({ ok: true, refunded: 15 })) }));
jest.mock('../../../../lib/ai/replicate', () => ({ generateMusic: jest.fn() }));
jest.mock('../../../../lib/video/remixOps', () => ({ muxAudioOntoVideo: jest.fn(), fitAspect: jest.fn(async () => 'https://x.supabase.co/fitted.mp4') }));
jest.mock('../../../../lib/observability/report-error', () => ({ reportError: jest.fn() }));

import { GET } from './route';
import { klingPoll } from '../../../../lib/ai/klingClient';
import { failJob, recordCompletedAsset, jobOwnerId } from '../../../../lib/orchestrator/jobs';
import { refundDebitByRef } from '../../../../lib/orchestrator/ledger';
import { signMotionCharge, withMotionCharge } from '../../../../lib/services/motion/chargeToken';

const ENV = { ...process.env };
const get = (id: string) => new Request(`https://myavatar.ge/api/motion-control/status?id=${encodeURIComponent(id)}&aspect=9:16`);
const REF = 'motion:reserve:uuid-1:user-1';

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 'user-1' };
  process.env = { ...ENV, MOTION_CHARGE_SECRET: 'test-motion-secret' };
  (refundDebitByRef as jest.Mock).mockResolvedValue({ ok: true, refunded: 15 });
  (jobOwnerId as jest.Mock).mockResolvedValue('user-1');
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => { process.env = ENV; });

const paidId = () => withMotionCharge('pred-abc', signMotionCharge({ u: 'user-1', r: REF, j: 'pred-abc' })!);

test('a failed paid render: refund AWAITED through the ledger under the token’s ref, BEFORE the row is failed', async () => {
  (klingPoll as jest.Mock).mockResolvedValue({ status: 'failed', url: null, error: 'Replicate: CUDA out of memory on node a100-7' });
  const res = await GET(get(paidId()));
  const j = await res.json();
  expect(klingPoll).toHaveBeenCalledWith('pred-abc'); // the bare prediction, token stripped
  expect(refundDebitByRef).toHaveBeenCalledWith('user-1', REF, 15);
  const refundAt = (refundDebitByRef as jest.Mock).mock.invocationCallOrder[0]!;
  const failAt = (failJob as jest.Mock).mock.invocationCallOrder[0]!;
  expect(refundAt).toBeLessThan(failAt);
  expect(j).toMatchObject({ done: true, refunded: true });
  expect(JSON.stringify(j)).not.toMatch(/CUDA|a100|Replicate/);
});

test('a refund that did not land is reported as not refunded', async () => {
  (klingPoll as jest.Mock).mockResolvedValue({ status: 'failed', url: null, error: 'x' });
  (refundDebitByRef as jest.Mock).mockResolvedValue({ ok: false, reason: 'error', refunded: 0 });
  expect((await (await GET(get(paidId()))).json()).refunded).toBe(false);
});

test('another user polling the payer’s token collects nothing', async () => {
  mockUser = { id: 'someone-else' };
  (klingPoll as jest.Mock).mockResolvedValue({ status: 'failed', url: null, error: 'x' });
  const j = await (await GET(get(paidId()))).json();
  expect(refundDebitByRef).not.toHaveBeenCalled();
  expect(j.refunded).toBe(false);
});

test('a LEGACY id (charged after submit under motion:charge:<id>) still refunds its owner — via the ledger, awaited', async () => {
  (klingPoll as jest.Mock).mockResolvedValue({ status: 'failed', url: null, error: 'x' });
  const j = await (await GET(get('pred-legacy'))).json();
  expect(refundDebitByRef).toHaveBeenCalledWith('user-1', 'motion:charge:pred-legacy', 15);
  expect(j.refunded).toBe(true);
});

test('a LEGACY id owned by someone else is refused (fail-closed on money)', async () => {
  (jobOwnerId as jest.Mock).mockResolvedValue('the-real-owner');
  (klingPoll as jest.Mock).mockResolvedValue({ status: 'failed', url: null, error: 'x' });
  await GET(get('pred-legacy'));
  expect(refundDebitByRef).not.toHaveBeenCalled();
});

test('a success files the Library row AWAITED, under the payer the token names', async () => {
  (klingPoll as jest.Mock).mockResolvedValue({ status: 'succeeded', url: 'https://replicate.delivery/clip.mp4' });
  const j = await (await GET(get(paidId()))).json();
  expect(j).toMatchObject({ done: true, videoUrl: 'https://x.supabase.co/fitted.mp4' });
  expect(recordCompletedAsset).toHaveBeenCalledWith(expect.objectContaining({ id: 'motion:pred-abc', userId: 'user-1' }));
  expect(refundDebitByRef).not.toHaveBeenCalled();
});

test('still rendering → done:false, nothing refunded or failed', async () => {
  (klingPoll as jest.Mock).mockResolvedValue({ status: 'processing', url: null });
  expect(await (await GET(get(paidId()))).json()).toEqual({ done: false });
  expect(refundDebitByRef).not.toHaveBeenCalled();
  expect(failJob).not.toHaveBeenCalled();
});
