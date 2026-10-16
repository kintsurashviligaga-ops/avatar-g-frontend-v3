/** @jest-environment node */
/**
 * POST /api/avatar/veo — the Veo talking avatar (GG's choice 2026-10-16), every provider and the ledger mocked: no
 * network, no spend. Admin only until AVATAR_VEO_PUBLIC; the photo is the first frame; the price is reserved before the
 * submit and refunded on a failed one.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn() }));
jest.mock('../../../../lib/auth/adminGuard', () => ({ isAdminIdentity: jest.fn() }));
jest.mock('../../../../lib/api/rate-limit', () => ({ checkRateLimitByKey: jest.fn(async () => null), RATE_LIMITS: {} }));
jest.mock('../../../../lib/platform/redis', () => ({ getRedisClient: () => null }));
jest.mock('../../../../lib/observability/report-error', () => ({ reportError: jest.fn() }));
jest.mock('../../../../lib/security/callerMedia', () => ({ resolveCallerMedia: jest.fn() }));
jest.mock('../../../../lib/genjutsu/veoScene', () => ({ submitScene: jest.fn() }));
jest.mock('../../../../lib/genjutsu/serverCommon', () => ({
  ...jest.requireActual('../../../../lib/genjutsu/serverCommon'),
  claimDailySlot: jest.fn(async () => true),
  releaseDailySlot: jest.fn(async () => undefined),
}));
jest.mock('../../../../lib/orchestrator/ledger', () => ({
  hasSufficientBalance: jest.fn(async () => true),
  deductCredits: jest.fn(async () => ({ ok: true })),
  refundDebitByRef: jest.fn(async () => ({ ok: true })),
}));
jest.mock('../../../../lib/orchestrator/jobs', () => ({ createJob: jest.fn(async () => true), failJob: jest.fn(async () => undefined) }));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { authedClientFromRequest } from '../../../../lib/supabase/server';
import { isAdminIdentity } from '../../../../lib/auth/adminGuard';
import { resolveCallerMedia } from '../../../../lib/security/callerMedia';
import { submitScene } from '../../../../lib/genjutsu/veoScene';
import { genjutsuChargeForPolledId } from '../../../../lib/genjutsu/chargeToken';
import { deductCredits, refundDebitByRef } from '../../../../lib/orchestrator/ledger';
import { createJob } from '../../../../lib/orchestrator/jobs';
import { veoAvatarCredits } from '../../../../lib/avatar/veoAvatar';

const ENV = { ...process.env };
const UID = '11111111-2222-4333-8444-555555555555';
const BODY = { photo: `omni-uploads/${UID}/face.jpg`, speech: 'გამარჯობა, მე ვარ შენი ავატარი', direction: 'იღიმის', aspect: '9:16' };
const post = (body: unknown) => new NextRequest('https://myavatar.ge/api/avatar/veo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ENV, GENJUTSU_CHARGE_SECRET: 'test-genjutsu-secret' };
  delete process.env.AVATAR_VEO_PUBLIC;
  (authedClientFromRequest as jest.Mock).mockResolvedValue({ user: { id: UID } });
  (isAdminIdentity as jest.Mock).mockResolvedValue(true);
  (resolveCallerMedia as jest.Mock).mockResolvedValue({ ok: true, url: 'https://own/signed/face.jpg', own: true });
  (submitScene as jest.Mock).mockResolvedValue({ ok: true, operation: 'projects/p/operations/op1', aspect: '9:16', model: 'veo', transport: 'vertex', adjustments: [] });
});
afterAll(() => { process.env = ENV; });

test('an ordinary account is refused before anything is read or charged while the owner has not opened it', async () => {
  (isAdminIdentity as jest.Mock).mockResolvedValue(false);
  const res = await POST(post(BODY));
  expect(res.status).toBe(423);
  expect(deductCredits).not.toHaveBeenCalled();
  expect(submitScene).not.toHaveBeenCalled();
});

test('admin: row with _reserve, then the charge, then ONE Veo submit with the photo as the first frame and the words verbatim', async () => {
  const res = await POST(post(BODY));
  expect(res.status).toBe(202);
  const j = await res.json();
  expect(j.credits).toBe(veoAvatarCredits());
  const order = [(createJob as jest.Mock).mock.invocationCallOrder[0]!, (deductCredits as jest.Mock).mock.invocationCallOrder[0]!, (submitScene as jest.Mock).mock.invocationCallOrder[0]!];
  expect(order).toEqual([...order].sort((a, b) => a - b));
  expect((createJob as jest.Mock).mock.calls[0][0].params._reserve.credits).toBe(veoAvatarCredits());
  const sub = (submitScene as jest.Mock).mock.calls[0][0];
  expect(sub.startImageUrl).toBe('https://own/signed/face.jpg');
  expect(sub.referenceUrls).toEqual([]);
  expect(sub.prompt).toContain('"გამარჯობა, მე ვარ შენი ავატარი"');
  expect(sub.prompt).toContain('იღიმის.');
  // The status route can authorise the poll and its refund with the token it carries.
  expect(genjutsuChargeForPolledId(j.jobId).charge?.u).toBe(UID);
});

test('a photo that is not the caller\'s own storage object is refused before any charge', async () => {
  (resolveCallerMedia as jest.Mock).mockResolvedValue({ ok: false, reason: 'not_owner' });
  expect((await POST(post(BODY))).status).toBe(422);
  (resolveCallerMedia as jest.Mock).mockResolvedValue({ ok: true, url: 'https://elsewhere/x.jpg', own: false });
  expect((await POST(post(BODY))).status).toBe(422);
  expect(deductCredits).not.toHaveBeenCalled();
});

test('a stale price is refused before the charge; a failed submit is refunded and says so', async () => {
  expect((await POST(post({ ...BODY, expectedCredits: 1 }))).status).toBe(409);
  expect(deductCredits).not.toHaveBeenCalled();
  (submitScene as jest.Mock).mockResolvedValue({ ok: false, reason: 'safety', retryable: false });
  const res = await POST(post(BODY));
  expect(res.status).toBe(422);
  expect(await res.json()).toMatchObject({ error: 'content_rejected', refunded: true });
  expect(refundDebitByRef).toHaveBeenCalledTimes(1);
});

test('the owner\'s flag opens it to every signed-in account', async () => {
  process.env.AVATAR_VEO_PUBLIC = '1';
  (isAdminIdentity as jest.Mock).mockResolvedValue(false);
  expect((await POST(post(BODY))).status).toBe(202);
});
