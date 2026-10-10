/**
 * Every effect behind Agent G's edit, faked: the caller's files, the probe, ffmpeg, storage, the job queue (the
 * in-memory lease store with the live semantics), the audit trail, the clock and the heartbeat (ticked by hand).
 */
import type { BannerProbe } from '@/lib/video/probeBanner';
import { memoryLeaseStore, type MemoryLeaseStore } from '@/lib/orchestrator/testing/memoryLeaseStore';
import type { EditExecDeps, RenderOutcome } from '../editExec';
import type { EditRequest } from '../editPlan';
import type { AuditEvent } from '../montageExec';

export const USER = 'user-a';
export const UPLOAD = `omni-uploads/${USER}/1700000000-trip.mov`;
export const RESULT_URL = 'https://x.supabase.co/storage/v1/object/sign/renders/edits/job-1.mp4?token=t';

export const SOURCE: BannerProbe = { durationSec: 30, hasVideo: true, hasAudio: true, width: 1920, height: 1080, rotation: 0, videoCodec: 'h264', audioCodec: 'aac' };
/** What a 10 s → 5 s (2×) vertical edit of SOURCE reads back as. */
export const EDITED: BannerProbe = { durationSec: 5.02, hasVideo: true, hasAudio: true, width: 1080, height: 1920, rotation: 0, videoCodec: 'h264', audioCodec: 'aac' };

export type RenderOpts = Parameters<EditExecDeps['render']>[2];

export interface FakeEdit {
  deps: EditExecDeps;
  store: MemoryLeaseStore;
  audits: AuditEvent[];
  probes: string[];
  renders: Array<{ url: string; request: EditRequest; opts: RenderOpts }>;
  uploads: Array<{ jobId: string; bytes: number; output: string }>;
  clock: { now: number };
  beat: () => Promise<void>;
  beating: () => number;
}

export function fakeEdit(opts: {
  probe?: BannerProbe | null;
  render?: (url: string, request: EditRequest, o: RenderOpts) => Promise<RenderOutcome>;
  files?: Record<string, string>;
  foreign?: string[];
  upload?: string | null;
  key?: string;
} = {}): FakeEdit {
  const clock = { now: 1_000_000 };
  const store = memoryLeaseStore(() => clock.now);
  const ticks = new Set<() => Promise<void>>();
  const files = opts.files ?? { [UPLOAD]: `https://x.supabase.co/signed/${UPLOAD}` };
  let ids = 0;
  const f = {
    store, audits: [], probes: [], renders: [], uploads: [], clock,
    beat: async () => { for (const t of [...ticks]) await t(); },
    beating: () => ticks.size,
  } as unknown as FakeEdit;
  f.deps = {
    async resolveFile(ref) {
      if (opts.foreign?.includes(ref)) return { ok: false, reason: 'not_yours' };
      const url = files[ref];
      return url ? { ok: true, url } : { ok: false, reason: 'unreadable' };
    },
    async probe(url) {
      f.probes.push(url);
      return opts.probe === undefined ? SOURCE : opts.probe;
    },
    async render(url, request, o) {
      f.renders.push({ url, request, opts: o });
      if (opts.render) return opts.render(url, request, o);
      return { ok: true, bytes: Buffer.alloc(2_400_000, 1), input: SOURCE, output: EDITED };
    },
    async upload(jobId, bytes, output) {
      f.uploads.push({ jobId, bytes: bytes.byteLength, output });
      return opts.upload === undefined ? RESULT_URL : opts.upload;
    },
    resign: async (url) => `${url}&fresh=1`,
    store,
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
