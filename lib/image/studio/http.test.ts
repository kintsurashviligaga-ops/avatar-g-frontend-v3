/** @jest-environment node */
jest.mock('server-only', () => ({}));
const mockAuth = jest.fn();
jest.mock('../../supabase/server', () => ({ authedClientFromRequest: (...a: unknown[]) => mockAuth(...a) }));
const mockRate = jest.fn(async () => null);
jest.mock('../../api/rate-limit', () => ({ checkRateLimit: (...a: unknown[]) => mockRate(...(a as [])), RATE_LIMITS: { READ: {}, EXPENSIVE: {} } }));
const mockOpen = jest.fn(() => true);
jest.mock('../../agent/media/access', () => ({ agentMediaOpenTo: (...a: unknown[]) => mockOpen(...(a as [])) }));
jest.mock('../../security/apiGuard', () => ({ checkDailyBudget: () => ({ allowed: true }) }));
const mockDeps = jest.fn();
jest.mock('./live', () => ({ liveImageDeps: () => mockDeps() }));
jest.mock('../../platform/afterResponse', () => ({ runAfterResponse: () => true }));
import { NextRequest } from 'next/server';
import { POST as quote } from '@/app/api/image/jobs/quote/route';
import { POST as start } from '@/app/api/image/jobs/route';
import { GET as status } from '@/app/api/image/jobs/[id]/route';
import { POST as cancel } from '@/app/api/image/jobs/[id]/cancel/route';
import { imageBody } from './http';
import { POST as command } from '@/app/api/image/commands/route';
import { workImage } from './engine';
import { fakeImage, imageRequest } from './testing';
const post = (body: unknown) => new NextRequest('https://myavatar.ge/api/image/jobs', { method: 'POST', body: JSON.stringify(body) });
beforeEach(() => { jest.clearAllMocks(); mockAuth.mockResolvedValue({ user: { id: 'me' } }); mockOpen.mockReturnValue(true); });
test('unauthenticated and closed callers are refused before any image dependencies are created', async () => {
  mockAuth.mockResolvedValue({ user: null });
  expect((await quote(post(imageRequest()))).status).toBe(401);
  expect(mockDeps).not.toHaveBeenCalled();
  mockAuth.mockResolvedValue({ user: { id: 'me' } }); mockOpen.mockReturnValue(false);
  expect((await quote(post(imageRequest()))).status).toBe(404);
  expect(mockDeps).not.toHaveBeenCalled();
});
test('HTTP quote → explicit confirm → status/cancel, no paid call in quote and no client price trust', async () => {
  const f = await fakeImage(); mockDeps.mockReturnValue(f.deps);
  const quoted = await quote(post(imageRequest()));
  expect(quoted.status).toBe(200);
  const q = await quoted.json();
  expect(f.net()).toBe(0);
  expect((await start(post({ plan: q.plan, token: q.token, confirmed: false }))).status).toBe(400);
  expect((await start(post({ plan: q.plan, token: q.token, confirmed: true, credits: 0 }))).status).toBe(202);
  expect(f.net()).toBe(q.credits);
  const r = await status(new NextRequest('https://myavatar.ge/api/image/jobs/' + q.jobId), { params: { id: q.jobId } });
  expect(await r.json()).toMatchObject({ status: 'queued', progress: null });
  expect((await cancel(post({}), { params: { id: q.jobId } })).status).toBe(200);
  expect(f.net()).toBe(0);
});
test('other user receives 404 for the job and cannot cancel it', async () => {
  const f = await fakeImage(); mockDeps.mockReturnValue(f.deps);
  const q = await (await quote(post(imageRequest()))).json();
  await start(post({ plan: q.plan, token: q.token, confirmed: true }));
  mockAuth.mockResolvedValue({ user: { id: 'other' } });
  expect((await status(new NextRequest('https://myavatar.ge/api/image/jobs/' + q.jobId), { params: { id: q.jobId } })).status).toBe(404);
  expect((await cancel(post({}), { params: { id: q.jobId } })).status).toBe(404);
  expect(f.net()).toBe(q.credits);
});
test('body byte cap applies to streamed input, regardless of its declared length', async () => {
  await expect(imageBody(post({ prompt: 'x'.repeat(70_000) }))).rejects.toMatchObject({ status: 413 });
});

test('Agent G commands route quotes exact references, then one confirmed edit produces an owned saved result', async () => {
  const f = await fakeImage(); mockDeps.mockReturnValue(f.deps);
  const originalPrompt = '  ფონი შეცვალე თეთრი სტუდიით\n';
  const input = { ...imageRequest(), originalPrompt, references: [
    { id: 'product', role: 'product', asset: { kind: 'upload', path: 'me/product.png' } },
    { id: 'style', role: 'style', asset: { kind: 'upload', path: 'me/style.png' } },
  ] };
  const response = await command(post(input));
  expect(response.status).toBe(200);
  const q = await response.json();
  expect(q.plan.request).toMatchObject({ originalPrompt, operation: 'replace_background', references: input.references });
  expect(q.plan.references.map((r: { id: string; role: string }) => [r.id, r.role])).toEqual([['product', 'product'], ['style', 'style']]);
  expect(f.deps.reserve).not.toHaveBeenCalled(); expect(f.deps.generate).not.toHaveBeenCalled();
  await start(post({ plan: q.plan, token: q.token, confirmed: true }));
  await start(post({ plan: q.plan, token: q.token, confirmed: true }));
  await workImage(f.deps, q.jobId, 'worker');
  const result = await (await status(new NextRequest('https://myavatar.ge/api/image/jobs/' + q.jobId), { params: { id: q.jobId } })).json();
  expect(result).toMatchObject({ status: 'completed', result: { originalPrompt } });
  expect(f.deps.reserve).toHaveBeenCalledTimes(1); expect(f.deps.generate).toHaveBeenCalledTimes(1);
});
