/** @jest-environment node */
jest.mock('server-only', () => ({}));
const mockUser = 'image-owner';
let mockRows: Record<string, unknown>[] = [];
const mockFilters: unknown[][] = [];
const mockSign = jest.fn(async (paths: string[]) => ({
  data: paths.map(p => ({ signedUrl: 'https://proj.supabase.co/storage/v1/object/sign/renders/' + p + '?token=FRESH' })), error: null,
}));
function mockQuery() {
  const q: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'neq', 'in', 'order', 'range']) {
    q[method] = (...args: unknown[]) => { mockFilters.push([method, ...args]); return q; };
  }
  q.then = (resolve: (value: unknown) => unknown) => resolve({ data: mockRows, error: null });
  return q;
}
jest.mock('../../supabase/server', () => ({
  authedClientFromRequest: async () => ({ user: { id: mockUser }, supabase: { from: () => mockQuery() } }),
  createServiceRoleClient: () => ({ storage: { from: () => ({ createSignedUrls: mockSign }) } }),
}));
jest.mock('../../orchestrator/jobs', () => ({ JOB_COLUMNS: '*', recordCompletedAsset: jest.fn() }));
jest.mock('../../audio/voiceModel', () => ({ DEMO_VOICE_USER_ID: 'demo' }));
import sharp from 'sharp';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/studio/library/route';
import { fakeImage, imageRequest } from './testing';
import { quoteImage, startImage, workImage } from './engine';
const env = { ...process.env };
afterEach(() => { process.env = { ...env }; });
test('completed image jobs use the existing owner-scoped Library, refresh private links and retain portrait orientation', async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proj.supabase.co';
  delete process.env.RENDER_BUCKET;
  mockRows = []; mockFilters.length = 0; mockSign.mockClear();
  const f = await fakeImage();
  const png = await sharp({ create: { width: 768, height: 1365, channels: 3, background: '#338fe8' } }).png().toBuffer();
  jest.mocked(f.deps.generate).mockResolvedValue({ bytes: png, mime: 'image/png', providerRequestId: 'fixture', usage: null });
  const q = await quoteImage(f.deps, mockUser, { ...imageRequest(), aspectRatio: '9:16' });
  await startImage(f.deps, mockUser, q.plan, q.token, true);
  await workImage(f.deps, q.jobId, 'worker');
  const completed = (await f.store.read(q.jobId))!;
  expect(completed.status).toBe('completed');
  const saved = f.outputs.get(q.jobId)!;
  const oldUrl = 'https://proj.supabase.co/storage/v1/object/sign/renders/' + saved.path + '?token=OLD';
  const row = { id: completed.id, user_id: mockUser, service_type: 'image', status: completed.status,
    params: completed.params, result: { ...completed.result, url: oldUrl }, signed_url: oldUrl, created_at: '2026-10-13T00:00:00Z' };
  mockRows = [row, { ...row, id: 'foreign', user_id: 'stranger' }];
  const response = await GET(new NextRequest('https://myavatar.ge/api/studio/library?kind=image&limit=30'));
  expect((await response.json()).items).toEqual([expect.objectContaining({
    id: q.jobId, kind: 'image', prompt: q.plan.request.originalPrompt, orientation: 'vertical',
    url: expect.stringContaining('?token=FRESH'),
  })]);
  expect(mockFilters).toEqual(expect.arrayContaining([
    ['eq', 'user_id', mockUser], ['eq', 'status', 'completed'], ['eq', 'service_type', 'image'],
  ]));
  expect(mockSign).toHaveBeenCalledTimes(1);
  expect(f.deps.generate).toHaveBeenCalledTimes(1);
  expect(f.deps.reserve).toHaveBeenCalledTimes(1);
});
