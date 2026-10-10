/**
 * Agent G's edit (./editExec, ./editWorker), every effect faked (./testing/fakeEditDeps): the quote resolves the asked
 * edits against the caller's own file and signs the plan; only that quote queues one job (never two); the worker edits
 * it once under a lease, QCs it and files it; a source that changed, a bad result, a cancel or a lost lease delivers
 * nothing; a dead worker is replaced once, then the sweep gives up.
 */
import { LEASE_MS } from '@/lib/orchestrator/jobLease';
import {
  EDIT_KIND, cancelEditJob, editCodeOfRow, editJobStatus, enqueueEditJob, quoteEdit, type RenderOutcome,
} from './editExec';
import { EDIT_GAVE_UP, sweepEditJobs, workEditJob } from './editWorker';
import { EDITED, RESULT_URL, SOURCE, UPLOAD, USER, fakeEdit, type FakeEdit, type RenderOpts } from './testing/fakeEditDeps';

const ASKS = [{ op: 'trim', fromSec: 5, toSec: 15 }, { op: 'speed', factor: 2 }, { op: 'aspect', to: '9:16' }];

async function quoted(f: FakeEdit, edits: unknown = ASKS) {
  const q = await quoteEdit(f.deps, { userId: USER, file: UPLOAD, edits, name: 'Trip.mov' });
  if (!q.ok) throw new Error(`${q.error}: ${q.message}`);
  return q;
}

async function queued(f: FakeEdit, edits: unknown = ASKS): Promise<string> {
  const q = await quoted(f, edits);
  const r = await enqueueEditJob(f.deps, { userId: USER, request: q.request, token: q.token });
  if (!r.ok) throw new Error(r.error);
  return q.quote.jobId;
}

/** A render the test finishes by hand; it ends early (like the real ffmpeg kill) when its signal aborts. */
function heldRender() {
  const calls: Array<{ opts: RenderOpts; finish: (o?: RenderOutcome) => void }> = [];
  const render = (_url: string, _req: unknown, opts: RenderOpts) => new Promise<RenderOutcome>((resolve) => {
    opts.signal.addEventListener('abort', () => resolve({ ok: false, error: 'render_failed', detail: 'cancelled' }));
    calls.push({ opts, finish: (o) => resolve(o ?? { ok: true, bytes: Buffer.alloc(2_400_000, 1), input: SOURCE, output: EDITED }) });
  });
  return { calls, render };
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const trail = (f: FakeEdit) => f.audits.filter((a) => a.phase !== 'quote').map((a) => `${a.phase}:${a.outcome}:${a.detail ?? ''}`);

describe('quote: the caller\'s own file, the edits resolved against it, a signed plan, nothing spent', () => {
  test('a trim + speed + frame plan with its exact result', async () => {
    const f = fakeEdit();
    const q = await quoted(f);
    expect(q.quote).toMatchObject({
      jobId: 'job-1', credits: 0, name: 'Trip-edit.mp4',
      edits: [{ op: 'trim', fromSec: 5, toSec: 15 }, { op: 'speed', factor: 2 }, { op: 'aspect', to: '9:16', fit: 'crop' }],
      plan: { output: 'mp4', durationSec: 5, width: 1080, height: 1920, hasAudio: true, sourceSec: 30 },
    });
    expect(q.request.source).toEqual({ ref: UPLOAD });
    expect(f.probes).toEqual([`https://x.supabase.co/signed/${UPLOAD}`]);
    expect(f.store.rows.size).toBe(0);
    expect(f.audits).toEqual([expect.objectContaining({ op: 'media_edit', phase: 'quote', outcome: 'ok', credits: 0, detail: 'trim+speed+aspect → mp4' })]);
  });

  test.each([
    ['no file', { file: '' }, 'bad_input'],
    ['someone else\'s file', { file: 'omni-uploads/user-b/x.mp4' }, 'media_not_yours'],
    ['an unreadable file', { file: 'omni-uploads/user-a/missing.mp4' }, 'unreadable'],
    ['no edits', { edits: [] }, 'nothing_to_do'],
    ['an edit past the end', { edits: [{ op: 'trim', fromSec: 40 }] }, 'out_of_range'],
  ])('%s is refused and audited', async (_why, over, error) => {
    const f = fakeEdit({ foreign: ['omni-uploads/user-b/x.mp4'] });
    const q = await quoteEdit(f.deps, { userId: USER, file: UPLOAD, edits: ASKS, ...over });
    expect(q).toMatchObject({ ok: false, error });
    expect(f.audits.at(-1)).toMatchObject({ op: 'media_edit', phase: 'quote', outcome: 'refused', detail: error });
  });

  test('a file with no picture, or that cannot be probed', async () => {
    expect(await quoteEdit(fakeEdit({ probe: { ...SOURCE, hasVideo: false, width: 0, height: 0 } }).deps, { userId: USER, file: UPLOAD, edits: ASKS })).toMatchObject({ ok: false, error: 'no_video' });
    expect(await quoteEdit(fakeEdit({ probe: null }).deps, { userId: USER, file: UPLOAD, edits: ASKS })).toMatchObject({ ok: false, error: 'unreadable' });
  });

  test('no quote key: nothing can be signed', async () => {
    expect(await quoteEdit(fakeEdit({ key: '' }).deps, { userId: USER, file: UPLOAD, edits: ASKS })).toMatchObject({ ok: false, error: 'not_configured' });
  });
});

describe('run: only the quoted plan, once', () => {
  /** The service type each queued row was inserted with (the Library groups by it; the memory store keeps no column). */
  const typesOf = (f: FakeEdit): string[] => {
    const seen: string[] = [];
    const insert = f.store.insert.bind(f.store);
    f.store.insert = async (row) => { seen.push(row.serviceType); return insert(row); };
    return seen;
  };

  test('queues one row with the plan on it; a second run reports the first', async () => {
    const f = fakeEdit();
    const types = typesOf(f);
    const q = await quoted(f);
    const r1 = await enqueueEditJob(f.deps, { userId: USER, request: q.request, token: q.token });
    expect(r1).toEqual({ ok: true, jobId: 'job-1', status: 'queued', stage: 'queued', pct: 0, attempt: 0, replay: false });
    expect(f.store.rows.get('job-1')).toMatchObject({
      userId: USER, status: 'pending',
      params: { subtype: 'edit', via: 'agent-g', prompt: 'trim + speed + aspect', _job: { request: q.request }, _exec: { kind: EDIT_KIND } },
    });
    const r2 = await enqueueEditJob(f.deps, { userId: USER, request: q.request, token: q.token });
    expect(r2).toMatchObject({ ok: true, jobId: 'job-1', replay: true });
    expect(f.store.rows.size).toBe(1);
    expect(types).toEqual(['film', 'film']); // the replay's insert finds the row and reads it
  });

  test('a thumbnail is an image row', async () => {
    const f = fakeEdit();
    const types = typesOf(f);
    const id = await queued(f, [{ op: 'thumbnail', atSec: 2 }]);
    expect(f.store.rows.get(id)).toMatchObject({ params: { subtype: 'thumbnail' } });
    expect(types).toEqual(['image']);
  });

  test('a changed plan, another user, an expired or forged quote is refused', async () => {
    const f = fakeEdit();
    const q = await quoted(f);
    const longer = { ...q.request, edits: [{ op: 'trim', fromSec: 5, toSec: 25 }, ...q.request.edits.slice(1)], plan: { ...q.request.plan, durationSec: 10 } };
    expect(await enqueueEditJob(f.deps, { userId: USER, request: longer, token: q.token })).toMatchObject({ ok: false, error: 'quote_changed' });
    expect(await enqueueEditJob(f.deps, { userId: 'user-b', request: q.request, token: q.token })).toMatchObject({ ok: false, error: 'quote_invalid' });
    expect(await enqueueEditJob(f.deps, { userId: USER, request: q.request, token: 'x.y' })).toMatchObject({ ok: false, error: 'quote_invalid' });
    expect(await enqueueEditJob(f.deps, { userId: USER, request: { ...q.request, v: 2 }, token: q.token })).toMatchObject({ ok: false, error: 'invalid_request' });
    f.clock.now += 31 * 60_000;
    expect(await enqueueEditJob(f.deps, { userId: USER, request: q.request, token: q.token })).toMatchObject({ ok: false, error: 'quote_expired' });
    expect(f.store.rows.size).toBe(0);
  });

  test('a run step keeps its parent run on the row and in the audit', async () => {
    const f = fakeEdit();
    const q = await quoted(f);
    await enqueueEditJob(f.deps, { userId: USER, request: q.request, token: q.token, parent: 'run-1' });
    expect(f.store.rows.get('job-1')!.params._parent).toBe('run-1');
    expect(f.audits.at(-1)).toMatchObject({ phase: 'run', outcome: 'ok', runId: 'run-1' });
  });
});

describe('work: one edit under a lease', () => {
  test('claims, renders the planned edit, QCs it, stores it and files it', async () => {
    const f = fakeEdit();
    const id = await queued(f);
    expect(await workEditJob(f.deps, { jobId: id, worker: 'w1' })).toEqual({ ran: true, outcome: 'delivered', url: RESULT_URL });
    expect(f.renders).toHaveLength(1);
    expect(f.renders[0]!.url).toBe(`https://x.supabase.co/signed/${UPLOAD}`);
    expect(f.uploads).toEqual([{ jobId: id, bytes: 2_400_000, output: 'mp4' }]);
    expect(f.store.rows.get(id)).toMatchObject({
      status: 'completed', pct: 100, signedUrl: RESULT_URL,
      result: { url: RESULT_URL, videoUrl: RESULT_URL, output: 'mp4', name: 'Trip-edit.mp4', durationSec: 5.02, width: 1080, height: 1920, subtype: 'edit', via: 'agent-g', edits: ['trim', 'speed', 'aspect'] },
    });
    expect(f.beating()).toBe(0);
    expect(trail(f)).toEqual(['run:ok:queued: trim+speed+aspect', 'run:ok:started', 'run:ok:delivered 2400000 bytes']);
    const s = await editJobStatus(f.deps, { userId: USER, jobId: id });
    expect(s).toMatchObject({ view: { status: 'completed', url: `${RESULT_URL}&fresh=1`, edits: [{ op: 'trim' }, { op: 'speed' }, { op: 'aspect' }] }, needsWorker: false });
  });

  test('a second worker on the same job renders nothing', async () => {
    const f = fakeEdit();
    const id = await queued(f);
    const held = heldRender();
    f.deps.render = held.render;
    const first = workEditJob(f.deps, { jobId: id, worker: 'w1' });
    await flush();
    expect(await workEditJob(f.deps, { jobId: id, worker: 'w2' })).toEqual({ ran: false, reason: 'leased' });
    held.calls[0]!.finish();
    expect(await first).toMatchObject({ outcome: 'delivered' });
    expect(held.calls).toHaveLength(1);
  });

  test('a file that is no longer the caller\'s is failed before ffmpeg sees it', async () => {
    const f = fakeEdit();
    const id = await queued(f);
    f.deps.resolveFile = async () => ({ ok: false, reason: 'not_yours' });
    expect(await workEditJob(f.deps, { jobId: id, worker: 'w1' })).toMatchObject({ outcome: 'failed', error: expect.stringMatching(/^media_not_yours:/) });
    expect(f.renders).toEqual([]);
  });

  test('a stored plan that was tampered with is failed before ffmpeg sees it', async () => {
    const f = fakeEdit();
    const id = await queued(f);
    (f.store.rows.get(id)!.params._job as { request: { edits: unknown[] } }).request.edits = [{ op: 'speed', factor: 9 }];
    expect(await workEditJob(f.deps, { jobId: id, worker: 'w1' })).toMatchObject({ outcome: 'failed', error: 'invalid_request: the stored plan is not valid' });
    expect(f.renders).toEqual([]);
  });
});

describe('what cannot be delivered is failed at once, with its reason', () => {
  test.each([
    ['ffmpeg failed', { ok: false, error: 'render_failed', detail: 'Invalid data found' }, 'render_failed: Invalid data found'],
    ['the file is gone', { ok: false, error: 'unavailable', detail: 'http_error' }, 'unavailable: http_error'],
    ['a source that changed', { ok: true, bytes: Buffer.alloc(9e5), input: { ...SOURCE, durationSec: 12 }, output: EDITED }, 'source_changed: 12.0 s now, 30 s when quoted'],
    ['a wrong length', { ok: true, bytes: Buffer.alloc(9e5), input: SOURCE, output: { ...EDITED, durationSec: 10 } }, 'qc_failed: length 10.00s, planned 5.00s'],
    ['a wrong frame', { ok: true, bytes: Buffer.alloc(9e5), input: SOURCE, output: { ...EDITED, width: 1920, height: 1080 } }, 'qc_failed: frame 1920x1080, planned 1080x1920'],
  ] as Array<[string, RenderOutcome, string]>)('%s', async (_why, out, error) => {
    const f = fakeEdit({ render: async () => out });
    const id = await queued(f);
    expect(await workEditJob(f.deps, { jobId: id, worker: 'w1' })).toEqual({ ran: true, outcome: 'failed', error });
    expect(f.store.rows.get(id)).toMatchObject({ status: 'failed', error, signedUrl: null, result: null });
    expect(f.uploads).toEqual([]);
    expect(f.beating()).toBe(0);
    expect(editCodeOfRow(error)).toBe(error.split(':')[0]);
  });

  test('a render that throws is a failed job, not a crashed worker; storage refusing the file fails it too', async () => {
    const f = fakeEdit({ render: async () => { throw new Error('spawn ENOMEM'); } });
    const id = await queued(f);
    expect(await workEditJob(f.deps, { jobId: id, worker: 'w1' })).toEqual({ ran: true, outcome: 'failed', error: 'render_failed: spawn ENOMEM' });
    const g = fakeEdit({ upload: null });
    const id2 = await queued(g);
    expect(await workEditJob(g.deps, { jobId: id2, worker: 'w1' })).toMatchObject({ outcome: 'failed', error: 'upload_failed: storage refused the result' });
  });
});

describe('stop: a cancel or a lost lease kills ffmpeg and delivers nothing', () => {
  test('the owner cancels mid-run: the next heartbeat aborts the render', async () => {
    const f = fakeEdit();
    const id = await queued(f);
    const held = heldRender();
    f.deps.render = held.render;
    const run = workEditJob(f.deps, { jobId: id, worker: 'w1' });
    await flush();
    expect(await cancelEditJob(f.deps, { userId: USER, jobId: id })).toEqual({ ok: true });
    await f.beat();
    expect(held.calls[0]!.opts.signal.aborted).toBe(true);
    expect(await run).toEqual({ ran: true, outcome: 'stopped' });
    expect(f.uploads).toEqual([]);
    expect(f.store.rows.get(id)).toMatchObject({ status: 'failed', error: 'cancelled by the user', result: null });
    expect(await cancelEditJob(f.deps, { userId: USER, jobId: id })).toMatchObject({ ok: false, error: 'not_running' });
    expect(await editJobStatus(f.deps, { userId: USER, jobId: id })).toMatchObject({ view: { status: 'failed', error: 'cancelled' } });
  });

  test('another user can neither read nor stop the job', async () => {
    const f = fakeEdit();
    const id = await queued(f);
    expect(await editJobStatus(f.deps, { userId: 'user-b', jobId: id })).toMatchObject({ ok: false, error: 'not_found' });
    expect(await cancelEditJob(f.deps, { userId: 'user-b', jobId: id })).toMatchObject({ ok: false, error: 'not_found' });
  });

  test('a worker that stalled past its lease and was replaced stops, and the replacement delivers', async () => {
    const f = fakeEdit();
    const id = await queued(f);
    const held = heldRender();
    f.deps.render = held.render;
    const first = workEditJob(f.deps, { jobId: id, worker: 'w1' });
    await flush();
    f.clock.now += LEASE_MS + 1;
    f.deps.render = async () => ({ ok: true, bytes: Buffer.alloc(2_400_000, 1), input: SOURCE, output: EDITED });
    expect(await workEditJob(f.deps, { jobId: id, worker: 'w2' })).toMatchObject({ outcome: 'delivered' });
    await f.beat();
    expect(await first).toEqual({ ran: true, outcome: 'lost' });
    expect(f.store.rows.get(id)).toMatchObject({ status: 'completed', exec: { attempt: 2 } });
    expect(f.uploads).toHaveLength(1);
  });
});

describe('status and sweep', () => {
  test('a job nobody took is handed to a worker after a while', async () => {
    const f = fakeEdit();
    const id = await queued(f);
    expect(await editJobStatus(f.deps, { userId: USER, jobId: id })).toMatchObject({ view: { status: 'queued' }, needsWorker: false });
    f.clock.now += 15_000;
    expect(await editJobStatus(f.deps, { userId: USER, jobId: id })).toMatchObject({ needsWorker: true });
  });

  test('a lapsed first attempt is run again; a lapsed last attempt is failed and audited', async () => {
    const f = fakeEdit();
    const id = await queued(f);
    const held = heldRender();
    f.deps.render = held.render;
    void workEditJob(f.deps, { jobId: id, worker: 'dead-1' });
    await flush();
    f.clock.now += LEASE_MS + 1;
    const again = heldRender();
    f.deps.render = again.render;
    const sweep1 = sweepEditJobs(f.deps, { worker: 'sweep-1', work: true });
    await flush();
    expect(f.store.rows.get(id)).toMatchObject({ status: 'processing', stage: 'render', exec: { attempt: 2, owner: 'sweep-1' } });
    f.clock.now += LEASE_MS + 1;
    const report = await sweepEditJobs(f.deps, { worker: 'sweep-2', work: true });
    expect(report.gaveUp).toEqual([id]);
    expect(f.store.rows.get(id)).toMatchObject({ status: 'failed', error: EDIT_GAVE_UP });
    expect(f.audits.at(-1)).toMatchObject({ op: 'media_edit', phase: 'run', outcome: 'failed', jobId: id });
    again.calls[0]!.finish();
    expect(await sweep1).toMatchObject({ worked: { jobId: id, result: { ran: true, outcome: 'stopped' } } });
    expect(f.uploads).toEqual([]);
  });
});
