/** @jest-environment node */
/**
 * The studio's task client beyond the Agent G follow (./jobFollow): one read of a task by its id (the service panels, the
 * montage export and a reload's batch tiles), and a stop. A read that tells nothing must never be taken as "gone": that
 * is what turns a tile into a red X for a render that was about to succeed.
 */
import { cancelTask, peekTask, TASKS_ROUTE } from './jobFollow';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const TASK = { id: 'image_3_1760000000000', kind: 'render', service: 'image', status: 'running', stage: 'Rendering', pct: 40, attempt: null, result: null, error: null, cancellable: false, label: 'a cat', position: null, createdAt: null, updatedAt: null };

test('a read: the task by its id, from the one task route, with the session and never from a cache', async () => {
  const seen: Array<[string, RequestInit | undefined]> = [];
  const f = async (u: string, init?: RequestInit) => { seen.push([u, init]); return json(200, { ok: true, task: TASK }); };
  expect(await peekTask(f, 'image_3_1760000000000')).toEqual(TASK);
  expect(seen).toEqual([[`${TASKS_ROUTE}?id=image_3_1760000000000`, { credentials: 'include', cache: 'no-store' }]]);
  // The id is a query value, encoded as one.
  await peekTask(f, 'a&b=c');
  expect(seen[1]![0]).toBe(`${TASKS_ROUTE}?id=a%26b%3Dc`);
});

test("'gone' only on the route's own not_found; everything else tells nothing (null)", async () => {
  expect(await peekTask(async () => json(404, { ok: false, error: 'not_found', message: 'No such task.' }), 'x')).toBe('gone');
  // A 404 page for a route this deployment does not have is not the route saying "no such task".
  expect(await peekTask(async () => new Response('<html>404</html>', { status: 404 }), 'x')).toBeNull();
  expect(await peekTask(async () => json(404, { ok: false, error: 'not_found' }), 'x')).toBeNull();
  for (const res of [json(401, { ok: false, error: 'unauthenticated' }), json(429, { error: 'rate_limited' }), json(500, {}), json(200, { ok: true, task: null }), json(200, { ok: false })]) {
    expect(await peekTask(async () => res, 'x')).toBeNull();
  }
  expect(await peekTask(async () => { throw new TypeError('offline'); }, 'x')).toBeNull();
});

test('a stop: one POST to the task route; refused or unreachable is false', async () => {
  const bodies: unknown[] = [];
  const ok = await cancelTask(async (u, init) => { bodies.push([u, init?.method, JSON.parse(String(init?.body))]); return json(200, { ok: true, task: null }); }, 'job-1');
  expect(ok).toBe(true);
  expect(bodies).toEqual([[TASKS_ROUTE, 'POST', { action: 'cancel', id: 'job-1' }]]);
  expect(await cancelTask(async () => json(409, { ok: false, error: 'not_cancellable' }), 'job-1')).toBe(false);
  expect(await cancelTask(async () => { throw new TypeError('offline'); }, 'job-1')).toBe(false);
});
