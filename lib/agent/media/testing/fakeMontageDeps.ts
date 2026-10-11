/**
 * Every effect behind Agent G's montage, faked: the caller's files, probes, the beat, the montage lane, the job queue
 * (an in-memory lease store with the live semantics), a credit ledger that refunds only what it debited and each ref
 * once, the audit trail, the clock and the heartbeat (ticked by hand).
 */
import type { BannerProbe, StreamDurations } from '@/lib/video/probeBanner';
import type { BeatGrid } from '@/lib/services/montage/beatPlan';
import type { MontageOutcome } from '@/lib/services/montage/montagePipeline';
import type { MontageRequest } from '@/lib/services/montage/montagePlan';
import { memoryLeaseStore, type MemoryLeaseStore } from '@/lib/orchestrator/testing/memoryLeaseStore';
import type { AuditEvent, MontageExecDeps } from '../montageExec';

export const USER = 'user-a';
export const clip = (durationSec: number, portrait = false): BannerProbe => ({
  durationSec, hasVideo: true, hasAudio: true, width: portrait ? 1080 : 1920, height: portrait ? 1920 : 1080, rotation: 0,
  videoCodec: 'h264', audioCodec: 'aac',
});
export const TRACK: BannerProbe = { durationSec: 180, hasVideo: false, hasAudio: true, width: 0, height: 0, rotation: 0, videoCodec: null, audioCodec: 'mp3' };
export const GRID: BeatGrid = { bpm: 120, periodSec: 0.5, phaseSec: 0.2, confidence: 0.6 };
export const FILES = [`omni-uploads/${USER}/a.mp4`, `omni-uploads/${USER}/b.mp4`, `omni-uploads/${USER}/song.mp3`];
export const MASTER_URL = 'https://x.supabase.co/storage/v1/object/sign/renders/montage/master.mp4?token=t';

export type RenderOpts = Parameters<MontageExecDeps['render']>[1];

export interface Fake {
  deps: MontageExecDeps;
  store: MemoryLeaseStore;
  audits: AuditEvent[];
  renders: MontageRequest[];
  reserves: Array<{ credits: number; ref: string }>;
  /** The ledger: what each ref took (negative) and gave back (positive), per user. */
  ledger: Array<{ userId: string; delta: number; ref: string }>;
  /** Every frame read the per-clip QC made. */
  grabs: Array<{ url: string; timesSec: number[]; fit: boolean }>;
  clock: { now: number };
  /** Fires the heartbeat once (what the interval would do every HEARTBEAT_MS). */
  beat: () => Promise<void>;
  /** How many heartbeats are running right now. */
  beating: () => number;
  /** Switches a test flips mid-way. */
  flags: { refundDown: boolean };
}

/** A fake frame: every pixel the same grey, derived from the file it shows (so two files never look alike). */
export function frameOf(url: string, size: number): Uint8Array {
  let h = 7;
  for (const ch of url) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return new Uint8Array(size * size).fill(20 + (h % 200));
}

/**
 * What the fake master shows at `t`: the source of the shot that covers `t` in the montage job being rendered (the
 * processing row holding a montage request), or — for a manifest index in `omit` — the shot before it (a render that dropped that clip).
 */
function masterSourceAt(store: MemoryLeaseStore, t: number, omit: readonly number[]): string | null {
  // The montage row being rendered (a run row or another executor's job in the same store holds no montage request).
  type Job = { request?: { shots?: Array<{ url: string; source: number; startSec: number; endSec: number }> } } | undefined;
  const row = [...store.rows.values()].find((r) => r.status === 'processing' && Array.isArray((r.params._job as Job)?.request?.shots));
  const shots = (row?.params._job as Job)?.request?.shots ?? [];
  let at = 0;
  for (let i = 0; i < shots.length; i += 1) {
    const s = shots[i]!;
    const len = s.endSec - s.startSec;
    if (t >= at && t < at + len) {
      let k = i;
      while (k > 0 && omit.includes(shots[k]!.source)) k -= 1;
      return omit.includes(shots[k]!.source) ? 'https://x.supabase.co/black' : shots[k]!.url;
    }
    at += len;
  }
  return null;
}

export function fake(opts: {
  files?: Record<string, BannerProbe | null>;
  foreign?: string[];
  grid?: BeatGrid | null;
  render?: (req: MontageRequest, o: RenderOpts) => Promise<MontageOutcome>;
  master?: BannerProbe | null;
  /** The master's real stream lengths (default: both the master's probed length). */
  streams?: StreamDurations | null;
  /** Manifest indices the fake master leaves out (the render shows the shot before instead). */
  omit?: number[];
  reserve?: { proceed: boolean; charged: boolean; reason: string };
  refundDown?: boolean;
  key?: string;
} = {}): Fake {
  const files: Record<string, BannerProbe | null> = opts.files ?? {
    [FILES[0]!]: clip(20),
    [FILES[1]!]: clip(20),
    [FILES[2]!]: TRACK,
  };
  const clock = { now: 1_000_000 };
  const store = memoryLeaseStore(() => clock.now);
  const ticks = new Set<() => Promise<void>>();
  const f: Fake = {
    store, audits: [], renders: [], reserves: [], ledger: [], grabs: [], clock,
    beat: async () => { for (const t of [...ticks]) await t(); },
    beating: () => ticks.size,
    flags: { refundDown: opts.refundDown ?? false },
  } as unknown as Fake;
  let ids = 0;
  const net = (userId: string, ref: string) => {
    const taken = f.ledger.filter((l) => l.userId === userId && l.ref === ref && l.delta < 0).reduce((s, l) => s - l.delta, 0);
    const given = f.ledger.filter((l) => l.userId === userId && l.ref.startsWith(`${ref}:`) && l.delta > 0).reduce((s, l) => s + l.delta, 0);
    return Math.max(0, taken - given);
  };
  f.deps = {
    async resolveFile(ref) {
      if (opts.foreign?.includes(ref)) return { ok: false, reason: 'not_yours' };
      return ref in files ? { ok: true, url: `https://x.supabase.co/signed/${ref}` } : { ok: false, reason: 'unreadable' };
    },
    async probe(url) {
      if (url === MASTER_URL) return opts.master === undefined ? { ...clip(30), durationSec: 30 } : opts.master;
      return files[url.replace('https://x.supabase.co/signed/', '')] ?? null;
    },
    async analyzeTrack() {
      return { probe: TRACK, grid: opts.grid === undefined ? GRID : opts.grid };
    },
    async render(req, o) {
      f.renders.push(req);
      if (opts.render) return opts.render(req, o);
      await o.onStage('stitch', 88);
      return { ok: true, result: { videoUrl: MASTER_URL, durationSec: 30, shots: req.shots.length, aspect: req.aspect, bridged: 0, hasMusic: true, stepsRun: ['resolve', 'normalize', 'stitch', 'music'] } };
    },
    async grabFrames(url, timesSec, o) {
      f.grabs.push({ url, timesSec: [...timesSec], fit: Boolean(o.fit) });
      if (url !== MASTER_URL) return timesSec.map(() => frameOf(url, o.size));
      return timesSec.map((t) => {
        const src = masterSourceAt(store, t, opts.omit ?? []);
        return src ? frameOf(src, o.size) : null;
      });
    },
    async streamDurations(url) {
      if (url !== MASTER_URL) return null;
      if (opts.streams !== undefined) return opts.streams;
      const m = opts.master === undefined ? { ...clip(30), durationSec: 30 } : opts.master;
      return m ? { videoSec: m.hasVideo ? m.durationSec : null, audioSec: m.hasAudio ? m.durationSec : null } : null;
    },
    store,
    billing: {
      async reserve(userId, credits, ref) {
        f.reserves.push({ credits, ref });
        const r = opts.reserve ?? { proceed: true, charged: true, reason: 'ok' };
        if (r.charged && !f.ledger.some((l) => l.ref === ref && l.delta < 0)) f.ledger.push({ userId, delta: -credits, ref });
        return r;
      },
      async refund(userId, ref, credits) {
        if (f.flags.refundDown) return 'error';
        const amount = Math.min(net(userId, ref), credits);
        if (!(amount > 0)) return 'nothing';
        if (f.ledger.some((l) => l.ref === `${ref}:refund`)) return 'nothing';
        f.ledger.push({ userId, delta: amount, ref: `${ref}:refund` });
        return 'refunded';
      },
    },
    async audit(ev) {
      f.audits.push(ev);
    },
    key: () => opts.key ?? 'k',
    now: () => clock.now,
    newId: () => `job-${(ids += 1)}`,
    every(_ms, tick) {
      ticks.add(tick);
      return () => { ticks.delete(tick); };
    },
  };
  return f;
}

/** The user's balance change across the ledger (negative = charged and not paid back). */
export const balance = (f: Fake, userId = USER) => f.ledger.filter((l) => l.userId === userId).reduce((s, l) => s + l.delta, 0);
