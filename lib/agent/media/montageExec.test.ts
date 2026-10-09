/**
 * Agent G's montage execution, every effect faked: the quote spends and writes nothing, only the caller's own files
 * are used, a run needs the quote the user confirmed, a quote never renders (or charges) twice, a failure or a failed
 * QC refunds and delivers nothing, a cancel stops the render, and every step leaves an audit event.
 */
import type { BannerProbe } from '@/lib/video/probeBanner';
import type { BeatGrid } from '@/lib/services/montage/beatPlan';
import type { MontageOutcome } from '@/lib/services/montage/montagePipeline';
import type { MontageRequest } from '@/lib/services/montage/montagePlan';
import {
  MONTAGE_PRICE_CREDITS,
  cancelMontageJob,
  quoteMontage,
  runMontageJob,
  type AuditEvent,
  type JobSnap,
  type MontageExecDeps,
} from './montageExec';
import { QUOTE_TTL_MS } from './quoteToken';

const USER = 'user-a';
const clip = (durationSec: number, portrait = false): BannerProbe => ({
  durationSec, hasVideo: true, hasAudio: true, width: portrait ? 1080 : 1920, height: portrait ? 1920 : 1080, rotation: 0,
  videoCodec: 'h264', audioCodec: 'aac',
});
const TRACK: BannerProbe = { durationSec: 180, hasVideo: false, hasAudio: true, width: 0, height: 0, rotation: 0, videoCodec: null, audioCodec: 'mp3' };
const GRID: BeatGrid = { bpm: 120, periodSec: 0.5, phaseSec: 0.2, confidence: 0.6 };

interface Fake {
  deps: MontageExecDeps;
  rows: Map<string, JobSnap & { params?: Record<string, unknown>; error?: string }>;
  audits: AuditEvent[];
  renders: MontageRequest[];
  reserves: Array<{ credits: number; ref: string }>;
  refunds: Array<{ credits: number; ref: string; charged: boolean }>;
  clock: { now: number };
}

function fake(opts: {
  files?: Record<string, BannerProbe | null>;
  foreign?: string[];
  grid?: BeatGrid | null;
  render?: (req: MontageRequest, o: { jobId: string; shouldContinue: () => Promise<boolean> }) => Promise<MontageOutcome>;
  master?: BannerProbe | null;
  reserve?: { proceed: boolean; charged: boolean; reason: string };
  key?: string;
} = {}): Fake {
  const files: Record<string, BannerProbe | null> = opts.files ?? {
    [`omni-uploads/${USER}/a.mp4`]: clip(20),
    [`omni-uploads/${USER}/b.mp4`]: clip(20),
    [`omni-uploads/${USER}/song.mp3`]: TRACK,
  };
  const f: Fake = { rows: new Map(), audits: [], renders: [], reserves: [], refunds: [], clock: { now: 1_000_000 } } as unknown as Fake;
  let ids = 0;
  const masterUrl = 'https://x.supabase.co/storage/v1/object/sign/renders/montage/master.mp4?token=t';
  f.deps = {
    async resolveFile(ref) {
      if (opts.foreign?.includes(ref)) return { ok: false, reason: 'not_yours' };
      return ref in files ? { ok: true, url: `https://x.supabase.co/signed/${ref}` } : { ok: false, reason: 'unreadable' };
    },
    async probe(url) {
      if (url === masterUrl) return opts.master === undefined ? { ...clip(30), durationSec: 30 } : opts.master;
      const ref = url.replace('https://x.supabase.co/signed/', '');
      return files[ref] ?? null;
    },
    async analyzeTrack() {
      return { probe: TRACK, grid: opts.grid === undefined ? GRID : opts.grid };
    },
    async render(req, o) {
      f.renders.push(req);
      if (opts.render) return opts.render(req, o);
      return { ok: true, result: { videoUrl: masterUrl, durationSec: 30, shots: req.shots.length, aspect: req.aspect, bridged: 0, hasMusic: true, stepsRun: ['resolve', 'normalize', 'stitch', 'music'] } };
    },
    jobs: {
      async create({ id, userId, params }) {
        if (f.rows.has(id)) return false;
        f.rows.set(id, { userId, status: 'processing', result: null, params });
        return true;
      },
      async snapshot(id) {
        const r = f.rows.get(id);
        return r ? { userId: r.userId, status: r.status, result: r.result } : null;
      },
      async fail(id, error) {
        const r = f.rows.get(id);
        if (r) Object.assign(r, { status: 'failed', error });
      },
      async complete(id, out) {
        const r = f.rows.get(id);
        if (r) Object.assign(r, { status: 'completed', result: out.result });
      },
    },
    billing: {
      async reserve(_u, credits, ref) {
        f.reserves.push({ credits, ref });
        return opts.reserve ?? { proceed: true, charged: true, reason: 'ok' };
      },
      async recordReservation() {},
      async refund(_u, credits, ref, charged) {
        f.refunds.push({ credits, ref, charged });
      },
    },
    async audit(ev) {
      f.audits.push(ev);
    },
    key: () => opts.key ?? 'k',
    now: () => f.clock.now,
    newId: () => `job-${(ids += 1)}`,
  };
  return f;
}

const FILES = [`omni-uploads/${USER}/a.mp4`, `omni-uploads/${USER}/b.mp4`, `omni-uploads/${USER}/song.mp3`];

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
    expect(f.rows.size).toBe(0);
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

describe('run', () => {
  test('renders the quoted plan once, through one job row, and delivers a master that passed QC', async () => {
    const f = fake();
    const q = await quoted(f);
    const r = await runMontageJob(f.deps, { userId: USER, request: q.request, token: q.token, prompt: 'cut to the song' });
    expect(r).toMatchObject({ ok: true, jobId: q.quote.jobId, replay: false, durationSec: 30 });
    expect(f.renders).toHaveLength(1);
    const row = f.rows.get(q.quote.jobId)!;
    expect(row.status).toBe('completed');
    expect(row.params).toMatchObject({ subtype: 'montage', via: 'agent-g', prompt: 'cut to the song', orientation: 'landscape' });
    expect(f.reserves).toHaveLength(0); // free: the owner's choice
    expect(f.audits.map((a) => `${a.phase}:${a.outcome}:${a.detail ?? ''}`)).toEqual(['quote:ok:', 'run:ok:started', 'run:ok:delivered']);
  });

  test('the same quote run again (double tap, retry) reports the first run and never renders twice', async () => {
    const f = fake();
    const q = await quoted(f);
    const first = await runMontageJob(f.deps, { userId: USER, request: q.request, token: q.token });
    const again = await runMontageJob(f.deps, { userId: USER, request: q.request, token: q.token });
    expect(again).toMatchObject({ ok: true, replay: true, jobId: q.quote.jobId });
    expect(first.ok && again.ok && again.videoUrl === first.videoUrl).toBe(true);
    expect(f.renders).toHaveLength(1);
  });

  test('a changed plan, another user, a forged or an expired quote is refused before anything runs', async () => {
    const f = fake();
    const q = await quoted(f);
    const longer = { ...q.request, shots: q.request.shots.map((s, i) => (i === 0 ? { ...s, endSec: s.endSec + 1 } : s)) };
    expect(await runMontageJob(f.deps, { userId: USER, request: longer, token: q.token })).toMatchObject({ ok: false, error: 'quote_changed' });
    expect(await runMontageJob(f.deps, { userId: 'user-b', request: q.request, token: q.token })).toMatchObject({ ok: false, error: 'quote_invalid' });
    expect(await runMontageJob(f.deps, { userId: USER, request: q.request, token: `${q.token}x` })).toMatchObject({ ok: false, error: 'quote_invalid' });
    f.clock.now += QUOTE_TTL_MS + 1;
    expect(await runMontageJob(f.deps, { userId: USER, request: q.request, token: q.token })).toMatchObject({ ok: false, error: 'quote_expired' });
    expect(f.renders).toHaveLength(0);
    expect(f.rows.size).toBe(0);
  });

  test('a failed render fails the job, refunds what was charged, and delivers nothing', async () => {
    const f = fake({ render: async () => ({ ok: false, step: 'stitch', error: 'the shots could not be stitched together' }) });
    const q = await quoted(f);
    const r = await runMontageJob(f.deps, { userId: USER, request: q.request, token: q.token });
    expect(r).toMatchObject({ ok: false, error: 'render_failed', jobId: q.quote.jobId });
    expect(f.rows.get(q.quote.jobId)).toMatchObject({ status: 'failed', error: 'stitch: the shots could not be stitched together' });
    expect(f.refunds).toEqual([{ credits: 0, ref: `agent-montage:${q.quote.jobId}`, charged: false }]);
    expect(f.audits.at(-1)).toMatchObject({ phase: 'run', outcome: 'failed' });
  });

  test('QC: a master without sound, of the wrong length, or without the music is not delivered', async () => {
    for (const master of [{ ...clip(30), hasAudio: false }, { ...clip(30), durationSec: 12 }, null]) {
      const f = fake({ master });
      const q = await quoted(f);
      const r = await runMontageJob(f.deps, { userId: USER, request: q.request, token: q.token });
      expect(r).toMatchObject({ ok: false, error: 'qc_failed' });
      expect(f.rows.get(q.quote.jobId)!.status).toBe('failed');
    }
    const f = fake({
      render: async (req) => ({ ok: true, result: { videoUrl: 'https://x.supabase.co/storage/v1/object/sign/renders/montage/master.mp4?token=t', durationSec: 30, shots: req.shots.length, aspect: req.aspect, bridged: 0, hasMusic: false, stepsRun: [] } }),
    });
    const q = await quoted(f);
    const r = await runMontageJob(f.deps, { userId: USER, request: q.request, token: q.token });
    expect(r.ok === false && r.problems).toContain('the music did not mix');
  });

  test('cancel: the owner stops a running edit, the render halts, nothing is delivered', async () => {
    const f = fake({
      render: async (req, o) => {
        await cancelMontageJob(f.deps, { userId: USER, jobId: o.jobId });
        expect(await o.shouldContinue()).toBe(false);
        return { ok: false, step: 'stitch', error: 'cancelled' };
      },
    });
    const q = await quoted(f);
    const r = await runMontageJob(f.deps, { userId: USER, request: q.request, token: q.token });
    expect(r).toMatchObject({ ok: false, error: 'cancelled' });
    expect(f.rows.get(q.quote.jobId)).toMatchObject({ status: 'failed', error: 'cancelled by the user' });
    expect(f.audits.map((a) => `${a.phase}:${a.outcome}`)).toContain('cancel:cancelled');
  });

  test("cancel is the owner's only, and only while running", async () => {
    const f = fake();
    const q = await quoted(f);
    await runMontageJob(f.deps, { userId: USER, request: q.request, token: q.token });
    expect(await cancelMontageJob(f.deps, { userId: 'user-b', jobId: q.quote.jobId })).toMatchObject({ ok: false, error: 'not_found' });
    expect(await cancelMontageJob(f.deps, { userId: USER, jobId: q.quote.jobId })).toMatchObject({ ok: false, error: 'not_running' });
  });

  test('a run whose job row cannot be written does not start', async () => {
    const f = fake();
    f.deps.jobs.create = async () => false;
    const q = await quoted(f);
    expect(await runMontageJob(f.deps, { userId: USER, request: q.request, token: q.token })).toMatchObject({ ok: false, error: 'jobs_unavailable' });
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

  test('credits are reserved under the job id before the render, and a failure refunds that exact ref', async () => {
    const f = fake({ render: async () => ({ ok: false, step: 'music', error: 'boom' }) });
    const q = await pricedQuote(f, 7);
    await runMontageJob(f.deps, { userId: USER, request: q.request, token: q.token });
    expect(f.reserves).toEqual([{ credits: 7, ref: `agent-montage:${q.quote.jobId}` }]);
    expect(f.refunds).toEqual([{ credits: 7, ref: `agent-montage:${q.quote.jobId}`, charged: true }]);
  });

  test('a retry of a priced quote never reserves twice', async () => {
    const f = fake();
    const q = await pricedQuote(f, 7);
    await runMontageJob(f.deps, { userId: USER, request: q.request, token: q.token });
    await runMontageJob(f.deps, { userId: USER, request: q.request, token: q.token });
    expect(f.reserves).toHaveLength(1);
    expect(f.refunds.filter((r) => r.charged)).toHaveLength(0);
  });

  test('not enough credits: nothing renders and the job is failed with the reason', async () => {
    const f = fake({ reserve: { proceed: false, charged: false, reason: 'insufficient' } });
    const q = await pricedQuote(f, 7);
    expect(await runMontageJob(f.deps, { userId: USER, request: q.request, token: q.token })).toMatchObject({ ok: false, error: 'insufficient_credits' });
    expect(f.renders).toHaveLength(0);
    expect(f.rows.get(q.quote.jobId)!.status).toBe('failed');
  });
});
