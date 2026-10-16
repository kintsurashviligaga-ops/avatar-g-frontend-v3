/** @jest-environment node */
import { quoteImage, startImage } from './engine';
import { imageTaskKind } from './task';
import { fakeImage, imageRequest } from './testing';
import type { TaskRow } from '@/lib/tasks/taskView';
test('unified task view uses real stages, null progress and owner cancellation', async () => {
  const f = await fakeImage(), q = await quoteImage(f.deps, 'u', imageRequest());
  await startImage(f.deps, 'u', q.plan, q.token, true);
  const row = f.store.rows.get(q.jobId)!;
  const task: TaskRow = { id: row.id, user_id: row.userId, status: row.status, service_type: 'image',
    current_stage: row.stage, pct: 2, params: row.params, result: null, signed_url: null, error: null, created_at: null, updated_at: null };
  const kind = imageTaskKind(() => f.deps, jest.fn());
  expect(kind.view(task)).toMatchObject({ kind: 'image-studio-v1', status: 'queued', pct: null, cancellable: true });
  expect(await kind.status(task, 'other', { workersOpen: false })).toBeNull();
  expect(await kind.cancel('other', q.jobId)).toBe('not_found');
  expect(await kind.cancel('u', q.jobId)).toBe('ok');
  expect(f.net()).toBe(0);
});
