/**
 * Agent G's montage on the request side, every effect faked: the quote spends and writes nothing, only the caller's own
 * files are used, a run needs the quote the user confirmed and only QUEUES it (once per quote; charged, when priced,
 * only after its row exists and before any worker may take it), the owner reads where the job is, and a cancel stops
 * it and pays back what was charged. The worker that renders is tested in ./montageWorker.test.ts.
 */
import { MONTAGE_PRICE_CREDITS, cancelMontageJob, codeOfRowError, enqueueMontageJob, montageJobStatus, quoteMontage, KICK_AFTER_MS } from './montageExec';
import { workMontageJob } from './montageWorker';
import { QUOTE_TTL_MS } from './quoteToken';
import { FILES, TRACK, USER, balance, clip, fake, type Fake } from './testing/fakeMontageDeps';

async function quoted(f: Fake, extra: Record<string, unknown> = {}) {
  const q = await quoteMontage(f.deps, { userId: USER, files: FILES, ...extra });
  if (!q.ok) throw new Error(`quote failed: ${q.error}`);
  return q;
}

describe('quote', () => {
  test('analyses, plans on the beat and prices: nothing rendered, charged or recorded as a job', async () => {
    const f = fake();
    const q = await quoted(f, { prompt: 'cut these to the song for a reel' });
    expect(q.quote).toMatchObject({ credits: MONTAGE_PRICE_CREDITS, clips: 2, aspect: '9:16', beatSynced: true, bpm: 120, musicStartSec: 0.2 });
    expect(q.quote.totalSec).toBe(30);
    expect(q.request.musicOnly).toBe(true);
    expect(q.request.shots.every((s) => s.transition === 'cut')).toBe(true);
    expect(f.renders).toHaveLength(0);
    expect(f.reserves).toHaveLength(0);
    expect(f.store.rows.size).toBe(0);
    expect(f.audits).toEqual([expect.objectContaining({ phase: 'quote', outcome: 'ok', files: 3 })]);
  });

  test('the frame shape follows the clips when the user names none', async () => {
    const f = fake({ files: { [FILES[0]!]: clip(20, true), [FILES[1]!]: clip(20, true), [FILES[2]!]: TRACK } });
    expect((await quoted(f)).quote.aspect).toBe('9:16');
    expect((await quoted(fake())).quote.aspect).toBe('16:9');
  });

  test("another user's file, or a link outside our storage, is refused and named", async () => {
    const q = await quoteMontage(fake({ foreign: [FILES[1]!] }).deps, { userId: USER, files: FILES });
    expect(q).toMatchObject({ ok: false, error: 'media_not_yours', files: [1] });
  });

  test('the inputs must be clips plus exactly one track', async () => {
    const two = fake({ files: { [FILES[0]!]: clip(20), [FILES[1]!]: TRACK, [FILES[2]!]: TRACK } });
    expect(await quoteMontage(two.deps, { userId: USER, files: FILES })).toMatchObject({ ok: false, error: 'several_tracks', files: [1, 2] });
    const none = fake({ files: { [FILES[0]!]: clip(20), [FILES[1]!]: clip(20), [FILES[2]!]: clip(5) } });
    expect(await quoteMontage(none.deps, { userId: USER, files: FILES })).toMatchObject({ ok: false, error: 'no_track' });
    const bad = fake({ files: { [FILES[0]!]: clip(20), [FILES[1]!]: null, [FILES[2]!]: TRACK } });
    expect(await quoteMontage(bad.deps, { userId: USER, files: FILES })).toMatchObject({ ok: false, error: 'unreadable', files: [1] });
    expect(await quoteMontage(fake().deps, { userId: USER, files: [] })).toMatchObject({ ok: false, error: 'bad_input' });
    expect(await quoteMontage(fake().deps, { userId: USER, files: Array(14).fill(FILES[0]) })).toMatchObject({ ok: false, error: 'too_many_files' });
  });

  test('a clip too short for one shot is named in the quote, not dropped silently', async () => {
    const f = fake({ files: { [FILES[0]!]: clip(20), [FILES[1]!]: clip(0.3), [FILES[2]!]: TRACK } });
    expect((await quoted(f)).quote.unusedFiles).toEqual([1]);
  });

  test('no pulse in the track: even cuts, and the quote says it is not on the beat', async () => {
    expect((await quoted(fake({ grid: null }))).quote).toMatchObject({ beatSynced: false, bpm: null, musicStartSec: 0 });
  });

  test('no signing key: no quote (fail closed)', async () => {
    expect(await quoteMontage(fake({ key: '' }).deps, { userId: USER, files: FILES })).toMatchObject({ ok: false, error: 'not_configured' });
  });
});

describe('run: queue the confirmed quote, once', () => {
  test('the run answers "queued" with the job id; nothing renders in the request', async () => {
    const f = fake();
    const q = await quoted(f);
    const r = await enqueueMontageJob(f.deps, { userId: USER, request: q.request, token: q.token, prompt: 'cut to the song' });
    expect(r).toMatchObject({ ok: true, jobId: q.quote.jobId, status: 'queued', replay: false });
    expect(f.renders).toHaveLength(0);
    const row = f.store.rows.get(q.quote.jobId)!;
    expect(row).toMatchObject({ status: 'pending', stage: 'queued', userId: USER });
    expect(row.params).toMatchObject({ subtype: 'montage', via: 'agent-g', prompt: 'cut to the song', orientation: 'landscape', _job: { request: q.request } });
    expect(row.exec).toMatchObject({ kind: 'agent-montage', attempt: 0, maxAttempts: 2 });
    expect(row.exec!.hold).toBeUndefined(); // free: nothing to charge, a worker may take it at once
    expect(f.reserves).toHaveLength(0);
    expect(f.audits.map((a) => `${a.phase}:${a.outcome}:${a.detail ?? ''}`)).toEqual(['quote:ok:', 'run:ok:queued']);
  });

  test('the same quote run again (double tap, retry) reports the first job and never queues twice', async () => {
    const f = fake();
    const q = await quoted(f);
    await enqueueMontageJob(f.deps, { userId: USER, request: q.request, token: q.token });
    expect(await enqueueMontageJob(f.deps, { userId: USER, request: q.request, token: q.token })).toMatchObject({ ok: true, replay: true, status: 'queued' });
    await workMontageJob(f.deps, { jobId: q.quote.jobId, worker: 'w1' });
    const again = await enqueueMontageJob(f.deps, { userId: USER, request: q.request, token: q.token });
    expect(again).toMatchObject({ ok: true, replay: true, status: 'completed', videoUrl: expect.stringContaining('master.mp4') });
    expect(f.renders).toHaveLength(1);
    expect(f.store.rows.size).toBe(1);
  });

  test('a changed plan, another user, a forged or an expired quote is refused before anything is queued', async () => {
    const f = fake();
    const q = await quoted(f);
    const longer = { ...q.request, shots: q.request.shots.map((s, i) => (i === 0 ? { ...s, endSec: s.endSec + 1 } : s)) };
    expect(await enqueueMontageJob(f.deps, { userId: USER, request: longer, token: q.token })).toMatchObject({ ok: false, error: 'quote_changed' });
    expect(await enqueueMontageJob(f.deps, { userId: 'user-b', request: q.request, token: q.token })).toMatchObject({ ok: false, error: 'quote_invalid' });
    expect(await enqueueMontageJob(f.deps, { userId: USER, request: q.request, token: `${q.token}x` })).toMatchObject({ ok: false, error: 'quote_invalid' });
    f.clock.now += QUOTE_TTL_MS + 1;
    expect(await enqueueMontageJob(f.deps, { userId: USER, request: q.request, token: q.token })).toMatchObject({ ok: false, error: 'quote_expired' });
    expect(f.store.rows.size).toBe(0);
  });

  test('a queue that cannot be written starts nothing', async () => {
    const f = fake();
    const q = await quoted(f);
    f.store.down = true;
    expect(await enqueueMontageJob(f.deps, { userId: USER, request: q.request, token: q.token })).toMatchObject({ ok: false, error: 'jobs_unavailable' });
    expect(f.renders).toHaveLength(0);
  });
});

describe('status: the owner reads the job, and a job no worker has gets one', () => {
  test("only the owner's own montage job; the view follows the row", async () => {
    const f = fake();
    const q = await quoted(f);
    await enqueueMontageJob(f.deps, { userId: USER, request: q.request, token: q.token });
    expect(await montageJobStatus(f.deps, { userId: 'user-b', jobId: q.quote.jobId })).toMatchObject({ ok: false, error: 'not_found' });
    expect(await montageJobStatus(f.deps, { userId: USER, jobId: 'nope' })).toMatchObject({ ok: false, error: 'not_found' });
    const s = await montageJobStatus(f.deps, { userId: USER, jobId: q.quote.jobId });
    expect(s).toEqual({ view: { ok: true, jobId: q.quote.jobId, status: 'queued', stage: 'queued', pct: 0, attempt: 0 }, needsWorker: false });
  });

  test('a queued job no worker took within KICK_AFTER_MS, or one whose worker died, needs a worker', async () => {
    const f = fake();
    const q = await quoted(f);
    await enqueueMontageJob(f.deps, { userId: USER, request: q.request, token: q.token });
    f.clock.now += KICK_AFTER_MS;
    expect(await montageJobStatus(f.deps, { userId: USER, jobId: q.quote.jobId })).toMatchObject({ needsWorker: true });
  });

  test('failed rows speak the chat\'s codes', () => {
    expect(codeOfRowError('cancelled by the user')).toBe('cancelled');
    expect(codeOfRowError('qc_failed: the music did not mix')).toBe('qc_failed');
    expect(codeOfRowError('render_failed: stitch: x')).toBe('render_failed');
    expect(codeOfRowError('insufficient_credits')).toBe('insufficient_credits');
    expect(codeOfRowError(null)).toBe('render_failed');
  });
});

describe('cancel', () => {
  test("the owner's only, and only while queued or running", async () => {
    const f = fake();
    const q = await quoted(f);
    await enqueueMontageJob(f.deps, { userId: USER, request: q.request, token: q.token });
    expect(await cancelMontageJob(f.deps, { userId: 'user-b', jobId: q.quote.jobId })).toMatchObject({ ok: false, error: 'not_found' });
    expect(await cancelMontageJob(f.deps, { userId: USER, jobId: q.quote.jobId })).toEqual({ ok: true });
    expect(f.store.rows.get(q.quote.jobId)).toMatchObject({ status: 'failed', error: 'cancelled by the user' });
    expect(await cancelMontageJob(f.deps, { userId: USER, jobId: q.quote.jobId })).toMatchObject({ ok: false, error: 'not_running' });
    // A cancelled job is never rendered by a worker that arrives late.
    expect(await workMontageJob(f.deps, { jobId: q.quote.jobId, worker: 'late' })).toEqual({ ran: false, reason: 'final' });
    expect(f.renders).toHaveLength(0);
  });
});

describe('when an edit has a price (the path a priced service takes)', () => {
  // The price is a module constant (free, by the owner's choice); a priced quote is signed here the way quote() would.
  async function pricedQuote(f: Fake, credits: number) {
    const q = await quoted(f);
    const { signQuote } = await import('./quoteToken');
    const { bodyFingerprint } = await import('@/lib/orchestrator/idemRef');
    const token = signQuote({ u: USER, j: q.quote.jobId, f: bodyFingerprint(q.request), c: credits, x: f.clock.now + 1000 }, 'k')!;
    return { ...q, token };
  }

  test('charged under the job id after the row exists, then released to the workers', async () => {
    const f = fake();
    const q = await pricedQuote(f, 7);
    expect(await enqueueMontageJob(f.deps, { userId: USER, request: q.request, token: q.token })).toMatchObject({ ok: true, status: 'queued' });
    expect(f.reserves).toEqual([{ credits: 7, ref: `agent-montage:${q.quote.jobId}` }]);
    const row = f.store.rows.get(q.quote.jobId)!;
    expect(row.params._reserve).toEqual({ ref: `agent-montage:${q.quote.jobId}`, credits: 7 });
    expect(row.exec!.hold).toBeUndefined();
    expect(balance(f)).toBe(-7);
  });

  test('a retry of a priced quote never charges twice', async () => {
    const f = fake();
    const q = await pricedQuote(f, 7);
    await enqueueMontageJob(f.deps, { userId: USER, request: q.request, token: q.token });
    await enqueueMontageJob(f.deps, { userId: USER, request: q.request, token: q.token });
    expect(f.reserves).toHaveLength(1);
  });

  test('not enough credits: the job is failed with the reason and no worker ever takes it', async () => {
    const f = fake({ reserve: { proceed: false, charged: false, reason: 'insufficient' } });
    const q = await pricedQuote(f, 7);
    expect(await enqueueMontageJob(f.deps, { userId: USER, request: q.request, token: q.token })).toMatchObject({ ok: false, error: 'insufficient_credits' });
    expect(f.store.rows.get(q.quote.jobId)).toMatchObject({ status: 'failed', error: 'insufficient_credits' });
    expect(await workMontageJob(f.deps, { jobId: q.quote.jobId, worker: 'w1' })).toEqual({ ran: false, reason: 'final' });
    expect(f.renders).toHaveLength(0);
  });

  test('a cancel pays back what was charged, exactly once', async () => {
    const f = fake();
    const q = await pricedQuote(f, 7);
    await enqueueMontageJob(f.deps, { userId: USER, request: q.request, token: q.token });
    await cancelMontageJob(f.deps, { userId: USER, jobId: q.quote.jobId });
    expect(balance(f)).toBe(0);
    expect(f.store.rows.get(q.quote.jobId)!.exec!.owe).toBeUndefined();
    await cancelMontageJob(f.deps, { userId: USER, jobId: q.quote.jobId });
    expect(f.ledger.filter((l) => l.delta > 0)).toHaveLength(1);
  });
});

describe('the user\'s words set the length and the music start (Agent G PART 1)', () => {
  test('„მუსიკა 5 წამიდან დაიწყე": the plan and the signed request start on the first beat after 5 s', async () => {
    const q = await quoted(fake(), { prompt: 'ამ ვიდეოებიდან კლიპი გამიკეთე, მუსიკა 5 წამიდან დაიწყე' });
    expect(q.quote.musicStartSec).toBe(5.2);
    expect(q.request.musicStartSec).toBe(5.2);
  });

  test('„20 წამიანი" sets the length; an explicit number wins over the words', async () => {
    expect((await quoted(fake(), { prompt: 'cut these to the song, 20-second reel' })).quote.totalSec).toBeLessThanOrEqual(20);
    expect((await quoted(fake(), { prompt: 'cut these to the song, 20-second reel', targetSec: 12 })).quote.totalSec).toBeLessThanOrEqual(12);
    expect((await quoted(fake(), { musicFromSec: 10 })).quote.musicStartSec).toBe(10.2);
  });

  test('a per-shot length is not the length of the edit', async () => {
    expect((await quoted(fake(), { prompt: 'cut these to the music, each shot 2 seconds' })).quote.totalSec).toBe(30);
  });

  test('a plan changed in the chat (the change on a later line) takes the change, not the first words', async () => {
    const q = await quoted(fake(), { prompt: 'cut these to the song for a reel 9:16, 20-second\nmake it 16:9\nმუსიკა 5 წამიდან დაიწყე' });
    expect(q.quote.aspect).toBe('16:9');
    expect(q.quote.totalSec).toBeLessThanOrEqual(20);
    expect(q.quote.musicStartSec).toBe(5.2);
    const back = await quoted(fake(), { prompt: 'cut these to the song 16:9\n9:16' });
    expect(back.quote.aspect).toBe('9:16');
  });
});
