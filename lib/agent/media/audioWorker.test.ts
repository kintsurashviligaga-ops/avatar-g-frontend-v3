/**
 * Agent G's audio-extraction worker and its sweep (./audioWorker), every effect faked (./testing/fakeAudioDeps): a job
 * is extracted once under a lease, QC'd and delivered into the row (not into the Library); the source is checked again
 * before ffmpeg sees it; a cancel or a lost lease kills ffmpeg and delivers nothing; a worker that dies is replaced once;
 * a job whose attempts ran out is failed by the sweep.
 */
import { LEASE_MS } from '@/lib/orchestrator/jobLease';
import { cancelAudioJob, enqueueAudioJob, quoteAudioExtract, type ExtractOutcome } from './audioExtract';
import { AUDIO_GAVE_UP, sweepAudioJobs, workAudioJob } from './audioWorker';
import { AUDIO_URL, LINK, MP3, SOURCE, UPLOAD, USER, fakeAudio, type ExtractOpts, type FakeAudio } from './testing/fakeAudioDeps';

async function queued(f: FakeAudio, input: { url?: string; file?: string } = { url: LINK }): Promise<string> {
  const q = await quoteAudioExtract(f.deps, { userId: USER, ...input });
  if (!q.ok) throw new Error(q.error);
  const r = await enqueueAudioJob(f.deps, { userId: USER, request: q.request, token: q.token });
  if (!r.ok) throw new Error(r.error);
  return q.quote.jobId;
}

/** An extraction the test finishes by hand; it ends early (like the real ffmpeg kill) when its signal aborts. */
function heldExtract() {
  const calls: Array<{ opts: ExtractOpts; finish: (o?: ExtractOutcome) => void }> = [];
  const extract = (_url: string, opts: ExtractOpts) => new Promise<ExtractOutcome>((resolve) => {
    opts.signal.addEventListener('abort', () => resolve({ ok: false, error: 'extract_failed', detail: 'cancelled' }));
    calls.push({ opts, finish: (o) => resolve(o ?? { ok: true, mp3: Buffer.alloc(4_546_000, 1), input: SOURCE, output: MP3 }) });
  });
  return { calls, extract };
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const trail = (f: FakeAudio) => f.audits.filter((a) => a.phase !== 'quote').map((a) => `${a.phase}:${a.outcome}:${a.detail ?? ''}`);

describe('work: one extraction under a lease', () => {
  test('claims, extracts the first sound stream, QCs it, stores it and delivers it into the row only', async () => {
    const f = fakeAudio();
    const id = await queued(f);
    const r = await workAudioJob(f.deps, { jobId: id, worker: 'w1' });
    expect(r).toEqual({ ran: true, outcome: 'delivered', audioUrl: AUDIO_URL });
    expect(f.extracts).toEqual([{ url: LINK, opts: expect.objectContaining({ maxSec: 3600, title: 'Concert Night' }) }]);
    expect(f.uploads).toEqual([{ jobId: id, bytes: 4_546_000 }]);
    expect(f.store.rows.get(id)).toMatchObject({
      status: 'completed', pct: 100, signedUrl: null,
      result: {
        audioUrl: AUDIO_URL, name: 'Concert Night.mp3', durationSec: 189.5, bytes: 4_546_000, bitrateKbps: 192, codec: 'mp3',
        subtype: 'audio-extract', via: 'agent-g', source: 'link', rights: { status: 'unverified' },
      },
      exec: { attempt: 1, owner: null, leaseUntil: null },
    });
    expect(f.store.writes.progress).toBe(3); // extract, qc, upload
    expect(f.beating()).toBe(0);
    expect(trail(f)).toEqual(['run:ok:queued; rights unverified', 'run:ok:started', 'run:ok:delivered 4546000 bytes']);
  });

  test('the caller’s own upload is read through a fresh link to their file', async () => {
    const f = fakeAudio();
    const id = await queued(f, { file: UPLOAD });
    expect(await workAudioJob(f.deps, { jobId: id, worker: 'w1' })).toMatchObject({ outcome: 'delivered' });
    expect(f.extracts[0]!.url).toBe(`https://x.supabase.co/signed/${UPLOAD}`);
    expect(f.store.rows.get(id)!.result).toMatchObject({ source: 'file', rights: { status: 'own' } });
  });

  test('a second worker on the same job extracts nothing', async () => {
    const f = fakeAudio();
    const id = await queued(f);
    const held = heldExtract();
    f.deps.extract = held.extract;
    const first = workAudioJob(f.deps, { jobId: id, worker: 'w1' });
    await flush();
    expect(await workAudioJob(f.deps, { jobId: id, worker: 'w2' })).toEqual({ ran: false, reason: 'leased' });
    held.calls[0]!.finish();
    expect(await first).toMatchObject({ outcome: 'delivered' });
    expect(held.calls).toHaveLength(1);
  });
});

describe('the source, checked again before ffmpeg sees it', () => {
  test('a stored plan that no longer passes the rule is failed without a fetch', async () => {
    const f = fakeAudio();
    const id = await queued(f);
    const row = f.store.rows.get(id)!;
    (row.params._job as { request: { source: unknown } }).request.source = { kind: 'link', url: 'https://youtu.be/x' };
    expect(await workAudioJob(f.deps, { jobId: id, worker: 'w1' })).toMatchObject({ outcome: 'failed', error: 'invalid_request: the stored plan is not valid' });
    expect(f.extracts).toEqual([]);
  });

  test('an upload that is no longer the caller’s is failed without a fetch', async () => {
    const f = fakeAudio();
    const id = await queued(f, { file: UPLOAD });
    f.deps.resolveFile = async () => ({ ok: false, reason: 'not_yours' });
    expect(await workAudioJob(f.deps, { jobId: id, worker: 'w1' })).toMatchObject({ outcome: 'failed', error: expect.stringMatching(/^media_not_yours:/) });
    expect(f.extracts).toEqual([]);
  });
});

describe('what cannot be delivered is failed at once, with its reason', () => {
  test.each([
    ['a redirect onto a platform', { ok: false, error: 'platform', platform: 'YouTube' }, 'platform: YouTube'],
    ['no sound stream', { ok: false, error: 'no_audio', detail: 'the source has no sound stream' }, 'no_audio: the source has no sound stream'],
    ['ffmpeg failed', { ok: false, error: 'extract_failed', detail: 'Invalid data found when processing input' }, 'extract_failed: Invalid data found when processing input'],
    ['longer than an hour', { ok: true, mp3: Buffer.alloc(9e7), input: { ...SOURCE, durationSec: 4000 }, output: { ...MP3, durationSec: 3600 } }, 'too_long: 4000 s'],
    ['a bad MP3', { ok: true, mp3: Buffer.alloc(9000), input: SOURCE, output: { ...MP3, durationSec: 30 } }, 'qc_failed: length 30.0s, source 189.4s'],
  ] as Array<[string, ExtractOutcome, string]>)('%s', async (_why, out, error) => {
    const f = fakeAudio({ extract: async () => out });
    const id = await queued(f);
    expect(await workAudioJob(f.deps, { jobId: id, worker: 'w1' })).toEqual({ ran: true, outcome: 'failed', error });
    expect(f.store.rows.get(id)).toMatchObject({ status: 'failed', error, signedUrl: null, result: null });
    expect(f.uploads).toEqual([]);
    expect(f.beating()).toBe(0);
  });

  test('an extraction that throws is a failed job, not a crashed worker', async () => {
    const f = fakeAudio({ extract: async () => { throw new Error('spawn ENOMEM'); } });
    const id = await queued(f);
    expect(await workAudioJob(f.deps, { jobId: id, worker: 'w1' })).toEqual({ ran: true, outcome: 'failed', error: 'extract_failed: spawn ENOMEM' });
  });

  test('storage refusing the MP3 fails the job', async () => {
    const f = fakeAudio({ upload: null });
    const id = await queued(f);
    expect(await workAudioJob(f.deps, { jobId: id, worker: 'w1' })).toMatchObject({ outcome: 'failed', error: 'upload_failed: storage refused the MP3' });
  });
});

describe('stop: a cancel or a lost lease kills ffmpeg and delivers nothing', () => {
  test('the owner cancels mid-run: the next heartbeat aborts the extraction', async () => {
    const f = fakeAudio();
    const id = await queued(f);
    const held = heldExtract();
    f.deps.extract = held.extract;
    const run = workAudioJob(f.deps, { jobId: id, worker: 'w1' });
    await flush();
    expect(await cancelAudioJob(f.deps, { userId: USER, jobId: id })).toEqual({ ok: true });
    await f.beat();
    expect(held.calls[0]!.opts.signal.aborted).toBe(true);
    expect(await run).toEqual({ ran: true, outcome: 'stopped' });
    expect(f.uploads).toEqual([]);
    expect(f.store.rows.get(id)).toMatchObject({ status: 'failed', error: 'cancelled by the user', result: null });
    expect(f.beating()).toBe(0);
  });

  test('a worker that stalled past its lease and was replaced stops, and the replacement delivers', async () => {
    const f = fakeAudio();
    const id = await queued(f);
    const held = heldExtract();
    f.deps.extract = held.extract;
    const first = workAudioJob(f.deps, { jobId: id, worker: 'w1' });
    await flush();
    f.clock.now += LEASE_MS + 1;
    f.deps.extract = async () => ({ ok: true, mp3: Buffer.alloc(4_546_000, 1), input: SOURCE, output: MP3 });
    expect(await workAudioJob(f.deps, { jobId: id, worker: 'w2' })).toMatchObject({ outcome: 'delivered' });
    await f.beat();
    expect(await first).toEqual({ ran: true, outcome: 'lost' });
    expect(f.store.rows.get(id)).toMatchObject({ status: 'completed', exec: { attempt: 2 } });
    expect(f.uploads).toHaveLength(1);
  });
});

describe('sweep: retry a dead worker once, then give up', () => {
  test('a lapsed first attempt is run again; a lapsed last attempt is failed and audited', async () => {
    const f = fakeAudio();
    const id = await queued(f);
    const held = heldExtract();
    f.deps.extract = held.extract;
    void workAudioJob(f.deps, { jobId: id, worker: 'dead-1' }); // dies: never finishes, never beats again
    await flush();
    f.clock.now += LEASE_MS + 1;
    const again = heldExtract();
    f.deps.extract = again.extract;
    const sweep1 = sweepAudioJobs(f.deps, { worker: 'sweep-1', work: true });
    await flush();
    expect(f.store.rows.get(id)).toMatchObject({ status: 'processing', stage: 'extract', exec: { attempt: 2, owner: 'sweep-1' } });
    expect(f.audits.at(-1)).toMatchObject({ outcome: 'retried', detail: 'started', attempt: 2 });
    f.clock.now += LEASE_MS + 1; // the retry dies too
    const report = await sweepAudioJobs(f.deps, { worker: 'sweep-2', work: true });
    expect(report.gaveUp).toEqual([id]);
    expect(f.store.rows.get(id)).toMatchObject({ status: 'failed', error: AUDIO_GAVE_UP });
    expect(f.audits.at(-1)).toMatchObject({ op: 'audio_extract', phase: 'run', outcome: 'failed', jobId: id });
    again.calls[0]!.finish();
    expect(await sweep1).toMatchObject({ worked: { jobId: id, result: { ran: true, outcome: 'stopped' } } });
    expect(f.uploads).toEqual([]);
  });

  test('a waiting job is listed, and run here only when asked', async () => {
    const f = fakeAudio();
    const id = await queued(f);
    expect(await sweepAudioJobs(f.deps, { worker: 's', work: false })).toEqual({ gaveUp: [], waiting: [id] });
    expect(await sweepAudioJobs(f.deps, { worker: 's', work: true })).toMatchObject({ worked: { jobId: id, result: { outcome: 'delivered' } } });
  });
});
