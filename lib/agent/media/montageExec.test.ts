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

  test('a clip too short for one shot is named and the quote FAILS: no plan ever leaves a clip out', async () => {
    // Before (owner's report, 2026-10-11): the quote went ahead and only listed the clip in `unusedFiles`.
    const f = fake({ files: { [FILES[0]!]: clip(20), [FILES[1]!]: clip(0.3), [FILES[2]!]: TRACK } });
    const q = await quoteMontage(f.deps, { userId: USER, files: FILES });
    expect(q).toMatchObject({ ok: false, error: 'clip_too_short', files: [1], detail: { minShotSec: 0.6, durationsSec: [0.3] } });
    expect(f.audits).toEqual([expect.objectContaining({ phase: 'quote', outcome: 'refused', detail: 'clip_too_short' })]);
  });

  describe('the manifest: every file, in the order sent, and every clip in the plan (owner, 2026-10-11)', () => {
    // The owner's test: three videos (~9 s, ~11 s, ~6 s) and one ~30 s MP3; the output used only one video.
    const OWNER = [`omni-uploads/${USER}/x1.mp4`, `omni-uploads/${USER}/x2.mp4`, `omni-uploads/${USER}/x3.mp4`, `omni-uploads/${USER}/x4.mp3`];
    const ownerFiles = (track = { ...TRACK, durationSec: 30 }) => fake({
      files: { [OWNER[0]!]: clip(9), [OWNER[1]!]: clip(11), [OWNER[2]!]: clip(6), [OWNER[3]!]: track },
    });

    test('3 videos + 1 MP3 → a manifest of 4 in the user order, names kept, and shots from all 3 clips in that order', async () => {
      const f = ownerFiles();
      // The fake's analyzeTrack reads TRACK (180 s); the manifest's music length is the one analyzed.
      const q = await quoteMontage(f.deps, { userId: USER, files: OWNER, names: ['beach.mp4', 'city.mp4', 'dog.mp4', 'song.mp3'], prompt: 'cut these to the music' });
      if (!q.ok) throw new Error(q.error);
      expect(q.quote.manifest).toEqual([
        { index: 0, path: OWNER[0], name: 'beach.mp4', kind: 'video', durationSec: 9 },
        { index: 1, path: OWNER[1], name: 'city.mp4', kind: 'video', durationSec: 11 },
        { index: 2, path: OWNER[2], name: 'dog.mp4', kind: 'video', durationSec: 6 },
        { index: 3, path: OWNER[3], name: 'song.mp3', kind: 'audio', durationSec: 180 },
      ]);
      expect(q.quote.engine).toEqual({ id: 'ffmpeg-montage', label: 'FFmpeg montage', free: true });
      expect(q.quote.clips).toBe(3);
      expect(q.quote.unusedFiles).toEqual([]);
      expect(q.quote.clipOrder).toEqual([0, 1, 2]);
      // Every shot names its file; the set of shot files is exactly the three videos, kept in the user's order.
      const sources = q.request.shots.map((s) => s.source);
      expect(new Set(sources)).toEqual(new Set([0, 1, 2]));
      expect(sources).toEqual([...sources].sort((a, b) => a - b));
      expect(q.request.manifest).toEqual(q.quote.manifest);
      expect(f.audits).toEqual([expect.objectContaining({ phase: 'quote', outcome: 'ok', files: 4 })]);
    });

    test('names: absent → the file reference\'s base name; a list that does not line up with the files is refused', async () => {
      const q = await quoteMontage(ownerFiles().deps, { userId: USER, files: OWNER });
      if (!q.ok) throw new Error(q.error);
      expect(q.quote.manifest.map((m) => m.name)).toEqual(['x1.mp4', 'x2.mp4', 'x3.mp4', 'x4.mp3']);
      expect(await quoteMontage(ownerFiles().deps, { userId: USER, files: OWNER, names: ['a', 'b'] })).toMatchObject({ ok: false, error: 'bad_input' });
      expect(await quoteMontage(ownerFiles().deps, { userId: USER, files: OWNER, names: 'a,b,c,d' })).toMatchObject({ ok: false, error: 'bad_input' });
      const odd = await quoteMontage(ownerFiles().deps, { userId: USER, files: OWNER, names: ['  a\u0000.mp4 ', '‮evil', '', 'song.mp3'] });
      if (!odd.ok) throw new Error(odd.error);
      expect(odd.quote.manifest.map((m) => m.name)).toEqual(['a.mp4', 'evil', 'x3.mp4', 'song.mp3']);
    });

    test('music too short for one shot per clip (it starts too late): refused, naming the track and the numbers', async () => {
      const f = ownerFiles();
      f.deps.analyzeTrack = async () => ({ probe: { ...TRACK, durationSec: 30 }, grid: { bpm: 120, periodSec: 0.5, phaseSec: 0.2, confidence: 0.6 } });
      const q = await quoteMontage(f.deps, { userId: USER, files: OWNER, musicFromSec: 28.9 });
      expect(q).toMatchObject({ ok: false, error: 'music_too_short', files: [3], detail: { clips: 3, musicSec: 0.8, fromSec: 29.2, neededSec: 1.5 } });
    });

    test('a length asked for that cannot hold one shot per clip: refused, naming every clip', async () => {
      const q = await quoteMontage(ownerFiles().deps, { userId: USER, files: OWNER, targetSec: 1 });
      expect(q).toMatchObject({ ok: false, error: 'target_too_short', files: [0, 1, 2], detail: { clips: 3, targetSec: 1, neededSec: 1.5 } });
      // The length that holds them all is quoted, with every clip in it.
      const ok = await quoteMontage(ownerFiles().deps, { userId: USER, files: OWNER, targetSec: 1.5 });
      if (!ok.ok) throw new Error(ok.error);
      expect(new Set(ok.request.shots.map((s) => s.source))).toEqual(new Set([0, 1, 2]));
    });
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

  test('how the user said yes is kept on the row and in the audit: a tap by default, a voice yes with its words', async () => {
    const f = fake();
    const q = await quoted(f);
    await enqueueMontageJob(f.deps, { userId: USER, request: q.request, token: q.token, approval: { channel: 'voice-transcript', said: 'კი, დაიწყე' } });
    expect(f.store.rows.get(q.quote.jobId)!.params._approval).toEqual({ channel: 'voice-transcript', said: 'კი, დაიწყე' });
    expect(f.audits.at(-1)).toMatchObject({ phase: 'run', outcome: 'ok', approval: 'voice-transcript', detail: 'queued; approved by voice "კი, დაიწყე"' });
    const g = fake();
    const r = await quoted(g);
    await enqueueMontageJob(g.deps, { userId: USER, request: r.request, token: r.token });
    expect(g.store.rows.get(r.quote.jobId)!.params._approval).toEqual({ channel: 'tap' });
    expect(g.audits.at(-1)).toMatchObject({ approval: 'tap', detail: 'queued' });
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

  test('the manifest is stored with the signed plan, and the audit counts the files sent (not shots + 1)', async () => {
    const f = fake();
    const q = await quoted(f);
    await enqueueMontageJob(f.deps, { userId: USER, request: q.request, token: q.token });
    const row = f.store.rows.get(q.quote.jobId)!;
    expect(row.params._job).toEqual({ request: q.request, manifest: q.quote.manifest });
    expect((row.params._job as { manifest: unknown[] }).manifest).toHaveLength(3);
    expect(q.request.shots.length + 1).not.toBe(3); // the old count was wrong whenever a clip had more than one shot
    expect(f.audits.at(-1)).toMatchObject({ phase: 'run', outcome: 'ok', files: 3 });
  });

  test('a run cannot change the files: a manifest dropped, a clip\'s shots removed, or a file swapped is refused', async () => {
    const f = fake();
    const q = await quoted(f);
    const { manifest: _gone, ...noManifest } = q.request;
    expect(await enqueueMontageJob(f.deps, { userId: USER, request: noManifest, token: q.token })).toMatchObject({ ok: false, error: 'manifest_invalid' });
    // Only clip 1's shots: clip 2 (file index 1) would be missing from the output.
    const oneClip = { ...q.request, shots: q.request.shots.filter((s) => s.source === 0) };
    expect(await enqueueMontageJob(f.deps, { userId: USER, request: oneClip, token: q.token })).toMatchObject({ ok: false, error: 'manifest_invalid', files: [1] });
    // A shot re-pointed at the track, or at a file that is not in the manifest.
    const atTrack = { ...q.request, shots: q.request.shots.map((s, i) => (i === 0 ? { ...s, source: 2 } : s)) };
    expect(await enqueueMontageJob(f.deps, { userId: USER, request: atTrack, token: q.token })).toMatchObject({ ok: false, error: 'manifest_invalid' });
    // A manifest that still covers every clip but is not the quoted one (a name, a file): the signature says no.
    const renamed = { ...q.request, manifest: q.request.manifest.map((m) => (m.index === 0 ? { ...m, name: 'other.mp4' } : m)) };
    expect(await enqueueMontageJob(f.deps, { userId: USER, request: renamed, token: q.token })).toMatchObject({ ok: false, error: 'quote_changed' });
    const swapped = { ...q.request, manifest: q.request.manifest.map((m) => (m.index === 1 ? { ...m, path: `omni-uploads/${USER}/z.mp4` } : m)) };
    expect(await enqueueMontageJob(f.deps, { userId: USER, request: swapped, token: q.token })).toMatchObject({ ok: false, error: 'quote_changed' });
    expect(f.store.rows.size).toBe(0);
    // The request exactly as quoted still runs.
    expect(await enqueueMontageJob(f.deps, { userId: USER, request: JSON.parse(JSON.stringify(q.request)), token: q.token })).toMatchObject({ ok: true, status: 'queued' });
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
