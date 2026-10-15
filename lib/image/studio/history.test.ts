/** @jest-environment node */
import { fakeImage, imageRequest } from './testing';
import { quoteImage, startImage, workImage } from './engine';
import { readImageAsset, imageVersions, type ImageHistoryIO } from './history';

test('a reusable edit branches from its original, keeps exact requests, and returns fresh private output', async () => {
  const f = await fakeImage();
  const make = async (parentJobId?: string) => {
    const q = await quoteImage(f.deps, 'owner', { ...imageRequest(), ...(parentJobId ? { parentJobId } : {}) });
    await startImage(f.deps, 'owner', q.plan, q.token, true);
    await workImage(f.deps, q.jobId, 'worker');
    return q.jobId;
  };
  const root = await make(), child = await make(root), sibling = await make(root);
  const io: ImageHistoryIO = { read: f.store.read, children: async () => (await Promise.all([child, sibling].map(f.store.read))).filter(r => !!r),
    resign: f.deps.resign };
  const history = await imageVersions(io, 'owner', root);
  expect(history.children.map(v => v.id)).toEqual([child, sibling]);
  expect((await imageVersions(io, 'owner', child)).ancestors.map(v => v.id)).toEqual([root]);
  const asset = await readImageAsset(io, 'owner', child);
  expect(asset.request.parentJobId).toBe(root);
  expect(asset.request.originalPrompt).toBe(imageRequest().originalPrompt);
  expect(asset.image.url).toContain('?fresh=1');
  await expect(readImageAsset(io, 'stranger', child)).rejects.toMatchObject({ code: 'not_found' });
  await expect(imageVersions(io, 'stranger', child)).rejects.toMatchObject({ code: 'not_found' });
});
test('version history never follows a foreign parent or includes a foreign child', async () => {
  const f = await fakeImage();
  const q = await quoteImage(f.deps, 'owner', imageRequest());
  await startImage(f.deps, 'owner', q.plan, q.token, true);
  const row = (await f.store.read(q.jobId))!;
  const foreign = { ...row, id: 'foreign', userId: 'stranger' };
  const local = { ...row, params: { ...row.params, _job: { ...q.plan, request: { ...q.plan.request, parentJobId: '11111111-1111-4111-8111-111111111111' } } } };
  const io: ImageHistoryIO = { read: async id => id === row.id ? local : foreign,
    children: async () => [foreign], resign: f.deps.resign };
  const result = await imageVersions(io, 'owner', row.id);
  expect(result.ancestors).toEqual([]);
  expect(result.children).toEqual([]);
  expect(f.deps.resign).not.toHaveBeenCalled();
});
