/** @jest-environment node */
/**
 * Agent G's multi-step runs (./runExec) end to end in ISOLATION: a throwaway local Postgres with the Production shape,
 * served by a real PostgREST (scripts/lease-isolation/run.sh), the REAL bundled ffmpeg for every step, and the live
 * code between them. That covers the run engine and its compare-and-set writes (supabaseLeaseStore), the three step
 * executors and their workers (audio extraction, montage, edit, each from its *Live wiring), their sweeps, the montage's
 * stage writes, and the credit ledger (deduct_credits / refund_credits). Only storage and the network are local:
 * "uploads" write to a temp dir, "downloads" copy from it, and a file reference resolves to its owner's file alone.
 *
 * The PART 7 scenarios it pins:
 *   I  one message, three steps: a video's sound, then a cut of two clips to it, then a look on that cut. Three real results.
 *   E  the cut's worker dies mid-render and the server restarts. Once the lease lapses, the montage sweep runs it again,
 *      and a fresh process finishes the run from the database alone.
 *   F  a stop during ffmpeg kills the encoder. The step's charge comes back once, and the delivered extraction stays.
 *   G  one start per plan. A priced step waits for its own yes and charges nothing before it. Eight ticks race, and each
 *      step gets one job and one charge. A failed step is paid back, and a resume reuses what was delivered.
 *   H  another user can neither steer the run nor use its files or its results.
 *
 * The montage, the extraction and the edit are free today (0 credits). To exercise the price, the approval and the
 * ledger, F and G raise the cut's quote to 7 credits, signed with the same key. Nothing else changes.
 *
 * Opt-in: runs only when LEASE_PG_REST_URL and LEASE_PG_JWT_SECRET point at this machine (run.sh sets them).
 */
import { createHmac, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PostgrestClient } from '@supabase/postgrest-js';

const REST = process.env.LEASE_PG_REST_URL ?? '';
const SECRET = process.env.LEASE_PG_JWT_SECRET ?? '';
const local = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(REST);
const suite = REST && SECRET && local ? describe : describe.skip;

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
function serviceJwt(): string {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ role: 'service_role', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${head}.${body}.${createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url')}`;
}
const jwt = REST && SECRET ? serviceJwt() : '';
const db = new PostgrestClient(REST || 'http://127.0.0.1:1', { headers: { apikey: jwt, Authorization: `Bearer ${jwt}` } });

jest.mock('server-only', () => ({}));
const storeErrors: unknown[] = [];
jest.mock('../../observability/report-error', () => ({ reportError: (e: unknown) => { storeErrors.push(e); } }));
// The live code's service-role client is this local PostgREST, nothing else.
jest.mock('../../supabase/server', () => ({ createServiceRoleClient: () => db, createSupabaseServerClient: () => db }));
jest.mock('../optimizer/activeConfig', () => ({ getActiveConfig: async () => null }));

// Storage and the network, local: a stored file is a file in a temp dir, and a "download" copies it.
const mockFiles = new Map<string, string>();
let mockOut = '';
jest.mock('../../web/publicFetch', () => {
  const { copyFile, stat } = jest.requireActual('node:fs/promises');
  const types: Record<string, string> = { mp4: 'video/mp4', mp3: 'audio/mpeg', m4a: 'audio/mp4', jpg: 'image/jpeg' };
  return {
    MEDIA_TYPES: /.*/,
    // The extraction's link check (a HEAD): what the stored file is and how big.
    fetchPublic: async (url: string) => {
      const src = mockFiles.get(url.split('?')[0]!);
      if (!src) return { ok: false, error: 'http_error', status: 404 };
      const type = types[/\.([a-z0-9]+)$/i.exec(url.split('?')[0]!)?.[1]?.toLowerCase() ?? ''] ?? 'application/octet-stream';
      return { ok: true, url, res: new Response(null, { headers: { 'content-type': type, 'content-length': String((await stat(src)).size) } }) };
    },
    fetchPublicToFile: async (url: string, path: string) => {
      const src = mockFiles.get(url.split('?')[0]!);
      if (!src) return { ok: false, error: 'fetch_failed' };
      await copyFile(src, path);
      return { ok: true, bytes: (await stat(path)).size, contentType: 'application/octet-stream' };
    },
  };
});
jest.mock('../../orchestrator/storage-adapter', () => {
  const { writeFileSync: write } = jest.requireActual('node:fs');
  const { join: at } = jest.requireActual('node:path');
  const host = (bucket: string, path: string, buf: Buffer) => {
    const file = at(mockOut, `${bucket}_${path}`.replace(/\//g, '_'));
    write(file, buf);
    const url = `https://media.test/${bucket}/${path}`;
    mockFiles.set(url, file);
    return `${url}?token=t`;
  };
  return {
    uploadBufferAndSign: async (bucket: string, path: string, buf: Buffer) => host(bucket, path, buf),
    uploadAndSign: async (bucket: string, path: string, b64s: string) => host(bucket, path, Buffer.from(b64s, 'base64')),
    reSignIfInternal: async (url: string) => url,
  };
});

import ffmpegStatic from 'ffmpeg-static';
import { LEASE_MS } from '@/lib/orchestrator/jobLease';
import { bodyFingerprint, produceRef } from '@/lib/orchestrator/idemRef';
import { probeMedia } from '@/lib/services/montage/beatAnalysis';
import type { MontageOutcome } from '@/lib/services/montage/montagePipeline';
import { signQuote } from '@/lib/agent/media/quoteToken';
import { KICK_AFTER_MS, MONTAGE_KIND, type AuditEvent, type FileRef, type MontageExecDeps } from '@/lib/agent/media/montageExec';
import { liveMontageDeps } from '@/lib/agent/media/montageLive';
import { sweepMontageJobs, workMontageJob } from '@/lib/agent/media/montageWorker';
import { AUDIO_KIND, type AudioExecDeps } from '@/lib/agent/media/audioExtract';
import { liveAudioDeps } from '@/lib/agent/media/audioLive';
import { workAudioJob } from '@/lib/agent/media/audioWorker';
import { EDIT_KIND, type EditExecDeps } from '@/lib/agent/media/editExec';
import { liveEditDeps } from '@/lib/agent/media/editLive';
import { workEditJob } from '@/lib/agent/media/editWorker';
import { RUN_KIND, isTerminalRun, stepOf } from './runEngine';
import { approveStep, cancelRun, planRun, readRun, resumeRun, startRun, tickRun, type RunExecDeps, type RunRead, type StepAdapter } from './runExec';
import { audioAdapter, editAdapter, montageAdapter } from './runAdapters';
import { liveRunDeps } from './runLive';

const A = '0e000000-0000-4000-8000-00000000000a';
const B = '0e000000-0000-4000-8000-00000000000b';
const START = 100;
const KEY = 'run-isolation-key';
const bin = ffmpegStatic as unknown as string;

/** The test's clock: real time, moved forward by hand to let a lease lapse. Every effect reads it. */
const clock = { skew: 0 };
const now = () => Date.now() + clock.skew;

/** A file the user uploaded (omni-uploads/<user>/<name>) and the link it is stored under. */
const upload = (user: string, name: string) => `omni-uploads/${user}/${name}`;
const storedAt = (ref: string) => `https://media.test/in/${ref.replace(/^omni-uploads\//, '')}`;

/**
 * A reference → a link ffmpeg may read, for that user only: an upload under their own folder, or a result of ours that
 * one of their own jobs produced (the row that holds the link is theirs). Anything else is not theirs.
 */
async function resolveFile(ref: string, userId: string): Promise<FileRef> {
  const up = /^omni-uploads\/([^/]+)\/.+$/.exec(ref);
  if (up) {
    if (up[1] !== userId) return { ok: false, reason: 'not_yours' };
    const url = storedAt(ref);
    return mockFiles.has(url) ? { ok: true, url } : { ok: false, reason: 'unreadable' };
  }
  const base = ref.split('?')[0]!;
  if (!mockFiles.has(base)) return { ok: false, reason: 'unreadable' };
  const { data } = await db.from('generation_jobs').select('signed_url,result').eq('user_id', userId);
  return (data ?? []).some((r) => JSON.stringify(r).includes(base)) ? { ok: true, url: ref } : { ok: false, reason: 'not_yours' };
}

interface World {
  run: RunExecDeps;
  montage: MontageExecDeps;
  audio: AudioExecDeps;
  edit: EditExecDeps;
  audits: AuditEvent[];
  /** The workers started so far and not yet awaited. */
  workers: Array<Promise<{ ran: boolean; outcome?: string; reason?: string }>>;
  /** Fire every running worker's heartbeat once (what its interval would do every HEARTBEAT_MS). */
  beat(): Promise<void>;
  /** Await every worker started so far (and those they lead to). */
  drain(): Promise<Array<{ ran: boolean; outcome?: string; reason?: string }>>;
}

/** The cut, priced: the montage's real quote, signed again at `credits` with the same key (the only change). */
function priced(base: StepAdapter, credits: number): StepAdapter {
  return {
    ...base,
    async quote(userId, step) {
      const q = await base.quote(userId, step);
      if (!q.ok) return q;
      const token = signQuote({ u: userId, j: q.quote.taskId, f: bodyFingerprint(q.quote.request), c: credits, x: q.quote.expiresAt }, KEY);
      if (!token) return { ok: false, error: 'not_configured' };
      return { ok: true, quote: { ...q.quote, credits, token } };
    },
  };
}

/** One server process: the live wiring of every executor and of the run, with storage, the audit trail, the key and the clock local. */
function world(opts: { cutCredits?: number } = {}): World {
  const audits: AuditEvent[] = [];
  const ticks = new Set<() => Promise<void>>();
  const common = {
    resolveFile,
    audit: async (ev: AuditEvent) => { audits.push(ev); },
    key: () => KEY,
    now,
    newId: () => randomUUID(),
    every: (_ms: number, tick: () => Promise<void>) => { ticks.add(tick); return () => { ticks.delete(tick); }; },
  };
  const montage: MontageExecDeps = { ...liveMontageDeps(), ...common };
  const audio: AudioExecDeps = { ...liveAudioDeps(), ...common };
  const edit: EditExecDeps = { ...liveEditDeps(), ...common };
  const workers: World['workers'] = [];
  let n = 0;
  const cut = montageAdapter(() => montage);
  const run: RunExecDeps = {
    ...liveRunDeps(),
    adapters: { montage: opts.cutCredits ? priced(cut, opts.cutCredits) : cut, audio_extract: audioAdapter(() => audio), edit: editAdapter(() => edit) },
    startWorker(kind, taskId) {
      const worker = `w-${(n += 1)}`;
      if (kind === MONTAGE_KIND) workers.push(workMontageJob(montage, { jobId: taskId, worker }));
      else if (kind === AUDIO_KIND) workers.push(workAudioJob(audio, { jobId: taskId, worker }));
      else if (kind === EDIT_KIND) workers.push(workEditJob(edit, { jobId: taskId, worker }));
    },
    audit: common.audit,
    key: common.key,
    now,
    newId: common.newId,
  };
  return {
    run, montage, audio, edit, audits, workers,
    beat: async () => { for (const t of [...ticks]) await t(); },
    async drain() {
      const out: Array<{ ran: boolean; outcome?: string; reason?: string }> = [];
      while (workers.length) out.push(...(await Promise.all(workers.splice(0))));
      return out;
    },
  };
}

/** Tick the run and work what it starts until it ends (or `stop` says so). */
async function drive(w: World, id: string, stop?: (r: RunRead) => boolean): Promise<RunRead> {
  for (let i = 0; i < 30; i += 1) {
    const r = await tickRun(w.run, { id, startWorkers: true });
    if (!r) throw new Error(`run ${id} is gone`);
    if (isTerminalRun(r.run) || stop?.(r)) return r;
    if (!w.workers.length) await new Promise((res) => setTimeout(res, 50));
    await w.drain();
  }
  throw new Error(`run ${id} did not end`);
}
const waiting = (r: RunRead) => r.run.steps.some((s) => s.status === 'awaiting_approval');

async function plannedAndStarted(w: World, user: string, spec: unknown): Promise<string> {
  const plan = await planRun(w.run, { userId: user, spec });
  if (!plan.ok) throw new Error(`plan: ${plan.message}`);
  const started = await startRun(w.run, { userId: user, spec: plan.spec, token: plan.token });
  if (!started.ok) throw new Error(`start: ${started.message}`);
  return started.runId;
}

async function rows(user: string) {
  const { data, error } = await db.from('generation_jobs').select('id,status,error,signed_url,result,params').eq('user_id', user);
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{ id: string; status: string; error: string | null; signed_url: string | null; result: Record<string, unknown> | null; params: Record<string, unknown> & { _exec?: { kind?: string; attempt?: number }; _parent?: string } }>;
}
const kindOf = (r: { params: { _exec?: { kind?: string } } }) => r.params._exec?.kind;
async function balance(user: string): Promise<number> {
  const { data } = await db.from('profiles').select('credits_balance').eq('id', user).single();
  return (data as { credits_balance: number }).credits_balance;
}
async function ledger(user: string) {
  const { data } = await db.from('credit_ledger').select('delta,reason,metadata').eq('user_id', user).order('created_at');
  return ((data ?? []) as Array<{ delta: number; reason: string; metadata: { ref: string } }>).map((l) => `${l.delta} ${l.reason} ${l.metadata.ref}`);
}

/** PIDs of the montage's conform ffmpeg (fitAspect writes into a remix-fit-* temp dir). */
function encoders(): number[] {
  try {
    return execFileSync('pgrep', ['-f', `^${bin} .*remix-fit-`]).toString().trim().split('\n').map(Number).filter(Boolean);
  } catch {
    return []; // pgrep exits 1 when nothing matches
  }
}
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

let dir = '';
/** Make a media file with ffmpeg and store it as the user's upload. */
function make(user: string, name: string, args: string[]): string {
  const out = join(dir, `${user}-${name}`);
  execFileSync(bin, ['-hide_banner', '-loglevel', 'error', '-y', ...args, out]);
  const ref = upload(user, name);
  mockFiles.set(storedAt(ref), out);
  return ref;
}
const ENC = ['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac'];
let TALK = '';
let CLIP_A = '';
let CLIP_B = '';
let LONG = '';

suite('Agent G runs on a real Postgres + PostgREST and real ffmpeg (local, isolated)', () => {
  jest.setTimeout(240_000);

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'run-isolation-'));
    mockOut = dir;
    // A talking-head stand-in (a picture and a voice-like tone), two clips (one portrait, one silent), one long clip.
    TALK = make(A, 'talk.mp4', ['-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=30:duration=8', '-f', 'lavfi', '-i', 'sine=f=440:duration=8', ...ENC]);
    CLIP_A = make(A, 'a.mp4', ['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25:duration=5', '-f', 'lavfi', '-i', 'sine=f=300:duration=5', ...ENC]);
    CLIP_B = make(A, 'b.mp4', ['-f', 'lavfi', '-i', 'smptebars=size=360x640:rate=25:duration=5', ...ENC.slice(0, 6)]);
    LONG = make(A, 'long.mp4', ['-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=40', '-f', 'lavfi', '-i', 'sine=f=400:duration=40', ...ENC]);
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  beforeEach(async () => {
    clock.skew = 0;
    storeErrors.length = 0;
    await db.from('generation_jobs').delete().in('user_id', [A, B]);
    await db.from('credit_ledger').delete().in('user_id', [A, B]);
    const up = await db.from('profiles').upsert([{ id: A, email: 'a@local.test', credits_balance: START }, { id: B, email: 'b@local.test', credits_balance: START }]);
    if (up.error) throw new Error(up.error.message);
  });
  afterEach(() => {
    clock.skew = 0;
    expect(storeErrors).toEqual([]);
  });

  test('I: one message, three steps: a video’s sound → a cut of two clips to it → a noir look with fades; three real results, one start per plan, nothing charged', async () => {
    const w = world();
    const spec = {
      title: 'sound → cut → look',
      steps: [
        { id: 'sound', tool: 'audio_extract', source: { file: TALK } },
        { id: 'cut', tool: 'montage', files: [CLIP_A, CLIP_B, { step: 'sound' }], targetSec: 6 },
        { id: 'look', tool: 'edit', file: { step: 'cut' }, edits: [{ op: 'grade', style: 'noir' }, { op: 'fade', inSec: 0.5, outSec: 0.5 }] },
      ],
    };
    const plan = await planRun(w.run, { userId: A, spec });
    if (!plan.ok) throw new Error(plan.message);
    expect(plan.plan.credits).toBe(0);
    // A double tap on Start: one run.
    const taps = await Promise.all([0, 1].map(() => startRun(w.run, { userId: A, spec: plan.spec, token: plan.token })));
    expect(taps.map((t) => (t.ok ? t.runId : t.error))).toEqual([plan.plan.runId, plan.plan.runId]);
    expect(taps.map((t) => (t.ok ? t.replay : null)).sort()).toEqual([false, true]);
    const id = plan.plan.runId;

    const end = await drive(w, id);
    expect(end.run.status).toBe('completed');
    expect(end.run.steps.map((s) => `${s.id}:${s.status}`)).toEqual(['sound:completed', 'cut:completed', 'look:completed']);
    expect(end.run.events.some((e) => e.type === 'run.invariant')).toBe(false);

    // Real media, each from the step before it.
    const [sound, cut, look] = end.run.steps.map((s) => s.output!);
    const mp3 = await probeMedia(sound!.url);
    expect(mp3).toMatchObject({ hasVideo: false, hasAudio: true, audioCodec: 'mp3' });
    expect(Math.abs(mp3!.durationSec - 8)).toBeLessThan(0.5);
    const master = await probeMedia(cut!.url);
    expect(master).toMatchObject({ hasVideo: true, hasAudio: true, videoCodec: 'h264', audioCodec: 'aac' });
    expect(master!.durationSec).toBeLessThanOrEqual(6.5);
    const graded = await probeMedia(look!.url);
    expect(graded).toMatchObject({ hasVideo: true, videoCodec: 'h264' });
    expect(Math.abs(graded!.durationSec - master!.durationSec)).toBeLessThan(0.5);
    // The cut took its music from the extraction, the look its picture from the cut.
    const all = await rows(A);
    const job = (step: string) => all.find((r) => r.id === stepOf(end.run, step)!.taskId)!;
    expect(JSON.stringify(job('cut').params)).toContain(sound!.url.split('?')[0]);
    expect(JSON.stringify(job('look').params)).toContain(cut!.url.split('?')[0]);

    // One run row and three ordinary jobs of their own executors, each naming the run; nothing else.
    expect(all.map(kindOf).sort()).toEqual([AUDIO_KIND, MONTAGE_KIND, EDIT_KIND, RUN_KIND].sort());
    const steps = all.filter((r) => kindOf(r) !== RUN_KIND);
    expect(steps.every((r) => r.params._parent === id && r.status === 'completed')).toBe(true);
    const runRow = all.find((r) => r.id === id)!;
    expect(runRow).toMatchObject({ status: 'completed', signed_url: null, result: { status: 'completed' } });
    expect((runRow.result as { artifacts: unknown[] }).artifacts).toHaveLength(3);
    // Free: no ledger row, no balance change.
    expect(await ledger(A)).toEqual([]);
    expect(await balance(A)).toBe(START);
    // A third tap after the end still replays the same run.
    expect(await startRun(w.run, { userId: A, spec: plan.spec, token: plan.token })).toEqual({ ok: true, runId: id, replay: true });
    expect(await rows(A)).toHaveLength(4);
    // RUN_ISOLATION_OUT=<file> keeps the run's steps, events and the probed results as evidence.
    if (process.env.RUN_ISOLATION_OUT) {
      writeFileSync(process.env.RUN_ISOLATION_OUT, JSON.stringify({ steps: end.run.steps, events: end.run.events, probes: { mp3, master, graded } }, null, 1));
    }
  });

  test('E: the cut’s worker dies mid-render and the server restarts; after the lease lapses the montage sweep runs it as attempt 2, and a fresh process finishes the run from the database alone', async () => {
    const w = world();
    const finish: Array<(o: MontageOutcome) => void> = [];
    w.montage.render = (_req, o) => new Promise<MontageOutcome>((resolve) => {
      o.signal.addEventListener('abort', () => resolve({ ok: false, step: 'stitch', error: 'cancelled' }));
      finish.push(resolve);
    });
    const id = await plannedAndStarted(w, A, {
      steps: [
        { id: 'sound', tool: 'audio_extract', source: { file: TALK } },
        { id: 'cut', tool: 'montage', files: [CLIP_A, CLIP_B, { step: 'sound' }], targetSec: 6 },
      ],
    });
    await tickRun(w.run, { id, startWorkers: true });
    await w.drain(); // the extraction, for real
    await tickRun(w.run, { id, startWorkers: true }); // the cut is queued and its worker starts…
    for (let i = 0; i < 100 && !finish.length; i += 1) await new Promise((r) => setTimeout(r, 50));
    expect(finish).toHaveLength(1); // …and "dies" inside the render: no result, no heartbeat
    const dead = w.workers.splice(0);
    const cutTask = stepOf((await readRun(w.run, id))!.run, 'cut')!.taskId!;
    expect((await rows(A)).find((r) => r.id === cutTask)!.params._exec).toMatchObject({ attempt: 1 });

    // Still leased: the sweep leaves it alone.
    const fresh = world(); // the server restarts: new deps, new clients, nothing in memory
    expect((await sweepMontageJobs(fresh.montage, { worker: 'sweep-1', work: true })).worked).toBeUndefined();
    clock.skew += LEASE_MS + 1; // no heartbeat came: the worker is gone
    const swept = await sweepMontageJobs(fresh.montage, { worker: 'sweep-2', work: true });
    expect(swept).toMatchObject({ waiting: [cutTask], gaveUp: [], worked: { jobId: cutTask, result: { ran: true, outcome: 'delivered' } } });

    const end = await drive(fresh, id);
    expect(end.run.status).toBe('completed');
    const master = await probeMedia(stepOf(end.run, 'cut')!.output!.url);
    expect(master).toMatchObject({ hasVideo: true, hasAudio: true, videoCodec: 'h264' });
    expect((await rows(A)).find((r) => r.id === cutTask)!.params._exec).toMatchObject({ attempt: 2 });

    // The first worker wakes up late: its render returns, but every write it tries is fenced off.
    finish[0]!({ ok: false, step: 'stitch', error: 'late' });
    expect(await Promise.all(dead)).toEqual([{ ran: true, outcome: 'lost' }]);
    expect((await rows(A)).find((r) => r.id === cutTask)).toMatchObject({ status: 'completed' });
    expect((await readRun(fresh.run, id))!.run.status).toBe('completed');
  });

  test('F: a stop while ffmpeg encodes the priced cut kills the encoder; the 7 credits come back once and the delivered sound stays', async () => {
    const w = world({ cutCredits: 7 });
    let conforming: () => void = () => {};
    const reached = new Promise<void>((r) => { conforming = r; });
    const live = w.montage.render;
    w.montage.render = (req, o) => live(req, { ...o, onStage: async (step, pct) => { if (step === 'normalize') conforming(); return o.onStage(step, pct); } });
    const id = await plannedAndStarted(w, A, {
      steps: [
        { id: 'sound', tool: 'audio_extract', source: { file: LONG } },
        { id: 'cut', tool: 'montage', files: [LONG, { step: 'sound' }], aspect: '9:16', targetSec: 30 },
      ],
    });
    const asked = await drive(w, id, waiting);
    const cut = stepOf(asked.run, 'cut')!;
    expect(cut).toMatchObject({ status: 'awaiting_approval', quote: { credits: 7 } });
    expect(await balance(A)).toBe(START); // nothing is charged before the yes
    expect((await rows(A)).some((r) => r.id === cut.quote!.taskId)).toBe(false); // nor queued

    const yes = await approveStep(w.run, { userId: A, id, step: 'cut', quoteId: cut.quote!.quoteId, startWorkers: true });
    expect(yes).toEqual({ ok: true });
    const ref = produceRef(MONTAGE_KIND, cut.quote!.taskId);
    expect(await ledger(A)).toEqual([`-7 commit ${ref}`]);
    await reached;
    let running = encoders();
    for (let i = 0; i < 50 && running.length === 0; i += 1) {
      await new Promise((r) => setTimeout(r, 100));
      running = encoders();
    }
    expect(running.length).toBeGreaterThan(0); // the conform ffmpeg is encoding now

    expect(await cancelRun(w.run, { userId: B, id })).toMatchObject({ ok: false, error: 'not_found' });
    expect(await cancelRun(w.run, { userId: A, id })).toEqual({ ok: true });
    const t0 = Date.now();
    await w.beat(); // the worker's heartbeat hears the stop
    expect(await w.drain()).toEqual([{ ran: true, outcome: 'stopped' }]);
    expect(Date.now() - t0).toBeLessThan(3_000);
    expect(running.filter(alive)).toEqual([]); // the encoder was killed, not left to finish

    const end = await drive(w, id);
    expect(end.run.status).toBe('cancelled'); // stopped by its owner…
    expect(stepOf(end.run, 'sound')).toMatchObject({ status: 'completed', output: { media: 'audio' } }); // …what was delivered stays
    expect(stepOf(end.run, 'cut')!.status).toBe('cancelled');
    expect((await rows(A)).find((r) => r.id === cut.quote!.taskId)).toMatchObject({ status: 'failed', signed_url: null });
    expect(await ledger(A)).toEqual([`-7 commit ${ref}`, `7 refund ${ref}:refund`]);
    expect(await balance(A)).toBe(START);
    // A second sweep pays nothing more; the stopped run cannot be stopped again.
    expect(await sweepMontageJobs(w.montage, { worker: 'sweep', work: true })).toMatchObject({ paid: [] });
    expect(await balance(A)).toBe(START);
    expect(await cancelRun(w.run, { userId: A, id })).toMatchObject({ ok: false, error: 'not_running' });
  });

  test('G: a priced step waits for its own yes (forged ones refused); eight ticks race on the run and each step gets one job and one charge', async () => {
    const w = world({ cutCredits: 7 });
    const id = await plannedAndStarted(w, A, {
      steps: [
        { id: 'sound', tool: 'audio_extract', source: { file: TALK } },
        { id: 'cut', tool: 'montage', files: [CLIP_A, CLIP_B, { step: 'sound' }], targetSec: 6 },
      ],
    });
    const asked = await drive(w, id, waiting);
    const cut = stepOf(asked.run, 'cut')!;
    const yes = (over: Partial<{ userId: string; step: string; quoteId: string }>) =>
      approveStep(w.run, { userId: A, id, step: 'cut', quoteId: cut.quote!.quoteId, startWorkers: false, ...over });
    expect(await yes({ userId: B })).toMatchObject({ ok: false, error: 'not_found' });
    expect(await yes({ quoteId: 'forged' })).toMatchObject({ ok: false, error: 'quote_changed' });
    expect(await yes({ step: 'sound' })).toMatchObject({ ok: false, error: 'not_waiting' });
    expect(await balance(A)).toBe(START);
    expect(await yes({})).toEqual({ ok: true });
    expect(await yes({})).toMatchObject({ ok: false, error: 'not_waiting' }); // a second yes is not a second job
    expect(await balance(A)).toBe(START - 7);

    // No worker was started: once the job has waited past the kick, eight ticks race to move the run and wake it.
    clock.skew += KICK_AFTER_MS + 1;
    await Promise.all(Array.from({ length: 8 }, () => tickRun(w.run, { id, startWorkers: true })));
    const results = await w.drain();
    expect(results.filter((r) => r.ran && r.outcome === 'delivered')).toHaveLength(1);
    expect(results.filter((r) => r.ran)).toHaveLength(1);

    const end = await drive(w, id);
    expect(end.run.status).toBe('completed');
    const all = await rows(A);
    expect(all.filter((r) => kindOf(r) === MONTAGE_KIND)).toHaveLength(1);
    expect(all.filter((r) => kindOf(r) === AUDIO_KIND)).toHaveLength(1);
    expect(await ledger(A)).toEqual([`-7 commit ${produceRef(MONTAGE_KIND, cut.quote!.taskId)}`]);
    expect(await balance(A)).toBe(START - 7);
    expect(await resumeRun(w.run, { userId: A, id })).toMatchObject({ ok: false, error: 'nothing_to_resume' });
  });

  test('G: a failed priced step is paid back; a resume reuses the delivered sound (no second extraction, no second charge for it) and a second tap replays the first resume', async () => {
    const w = world({ cutCredits: 7 });
    const live = w.montage.render;
    w.montage.render = async () => ({ ok: false, step: 'stitch', error: 'the encoder ran out of memory' });
    const spec = {
      steps: [
        { id: 'sound', tool: 'audio_extract', source: { file: TALK } },
        { id: 'cut', tool: 'montage', files: [CLIP_A, CLIP_B, { step: 'sound' }], targetSec: 6 },
      ],
    };
    const id = await plannedAndStarted(w, A, spec);
    const asked = await drive(w, id, waiting);
    const first = stepOf(asked.run, 'cut')!.quote!;
    expect(await approveStep(w.run, { userId: A, id, step: 'cut', quoteId: first.quoteId, startWorkers: true })).toEqual({ ok: true });
    const ended = await drive(w, id);
    expect(ended.run.status).toBe('partially_completed');
    const ref1 = produceRef(MONTAGE_KIND, first.taskId);
    expect(await ledger(A)).toEqual([`-7 commit ${ref1}`, `7 refund ${ref1}:refund`]);
    expect(await balance(A)).toBe(START);

    w.montage.render = live;
    expect(await resumeRun(w.run, { userId: B, id })).toMatchObject({ ok: false, error: 'not_found' });
    const [r1, r2] = [await resumeRun(w.run, { userId: A, id }), await resumeRun(w.run, { userId: A, id })];
    if (!r1.ok || !r2.ok) throw new Error('resume refused');
    expect(r1).toMatchObject({ replay: false });
    expect(r2).toEqual({ ok: true, runId: r1.runId, replay: true });

    // The resume is the user's tap on Retry at the price of what is left: the cut keeps the 7 credits said yes to, so
    // it is not asked again at the same price.
    const next = await drive(w, r1.runId);
    expect(next.run.status).toBe('completed');
    expect(stepOf(next.run, 'sound')).toMatchObject({ status: 'completed', reused: true, taskId: stepOf(ended.run, 'sound')!.taskId });
    const again = stepOf(next.run, 'cut')!;
    expect(again).toMatchObject({ status: 'completed', approvedCredits: 7 });
    expect(again.taskId).not.toBe(first.taskId);
    expect(next.run.events.some((e) => e.type === 'step.awaiting_approval')).toBe(false);

    const all = await rows(A);
    expect(all.filter((r) => kindOf(r) === AUDIO_KIND)).toHaveLength(1); // the sound was extracted once
    expect(all.filter((r) => kindOf(r) === MONTAGE_KIND).map((r) => r.status).sort()).toEqual(['completed', 'failed']);
    const ref2 = produceRef(MONTAGE_KIND, again.taskId!);
    expect(await ledger(A)).toEqual([`-7 commit ${ref1}`, `7 refund ${ref1}:refund`, `-7 commit ${ref2}`]);
    expect(await balance(A)).toBe(START - 7);
  });

  test('H: another user can neither steer the run nor use its token, its uploads or its results; their own run fails at the quote and charges nothing', async () => {
    const w = world();
    const spec = { steps: [{ id: 'sound', tool: 'audio_extract', source: { file: TALK } }] };
    const plan = await planRun(w.run, { userId: A, spec });
    if (!plan.ok) throw new Error(plan.message);
    // A's signed plan is A's: B cannot start it.
    expect(await startRun(w.run, { userId: B, spec: plan.spec, token: plan.token })).toMatchObject({ ok: false });
    expect(await startRun(w.run, { userId: A, spec: plan.spec, token: plan.token })).toMatchObject({ ok: true, replay: false });
    const id = plan.plan.runId;
    const done = await drive(w, id);
    expect(done.run.status).toBe('completed');
    const soundUrl = stepOf(done.run, 'sound')!.output!.url;
    expect(await cancelRun(w.run, { userId: B, id })).toMatchObject({ ok: false, error: 'not_found' });
    expect(await resumeRun(w.run, { userId: B, id })).toMatchObject({ ok: false, error: 'not_found' });

    // B names A's upload, then A's result: both runs fail at the quote, before any job or charge.
    for (const file of [TALK, soundUrl]) {
      const theirs = await plannedAndStarted(w, B, { steps: [{ id: 'take', tool: 'edit', file, edits: [{ op: 'mute' }] }] });
      const end = await drive(w, theirs);
      expect(end.run.status).toBe('failed');
      expect(stepOf(end.run, 'take')).toMatchObject({ status: 'failed' });
      expect(String(stepOf(end.run, 'take')!.error)).toMatch(/not_yours|not yours/);
    }
    const mine = await rows(B);
    expect(mine.every((r) => kindOf(r) === RUN_KIND)).toBe(true); // no step job was ever queued for B
    expect(await ledger(B)).toEqual([]);
    expect(await balance(B)).toBe(START);
    // A's own result, edited by A: allowed.
    const own = await plannedAndStarted(w, A, { steps: [{ id: 'take', tool: 'audio_extract', source: { file: soundUrl } }] });
    expect((await drive(w, own)).run.status).toBe('completed');
  });
});
