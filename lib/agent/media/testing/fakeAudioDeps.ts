/**
 * Every effect behind Agent G's audio extraction, faked: the caller's files, the live link check, ffmpeg, storage, the
 * job queue (the in-memory lease store with the live semantics), the audit trail, the clock and the heartbeat (ticked
 * by hand).
 */
import type { BannerProbe } from '@/lib/video/probeBanner';
import { memoryLeaseStore, type MemoryLeaseStore } from '@/lib/orchestrator/testing/memoryLeaseStore';
import type { AudioExecDeps, ExtractOutcome, Inspection } from '../audioExtract';
import type { AuditEvent } from '../montageExec';

export const USER = 'user-a';
export const LINK = 'https://media.example.com/clips/Concert%20Night.mp4';
export const UPLOAD = `omni-uploads/${USER}/1700000000-clip.mov`;
export const AUDIO_URL = 'https://x.supabase.co/storage/v1/object/sign/renders/audio/extract-job-1.mp3?token=t';

export const SOURCE: BannerProbe = { durationSec: 189.4, hasVideo: true, hasAudio: true, width: 1920, height: 1080, rotation: 0, videoCodec: 'h264', audioCodec: 'aac' };
export const MP3: BannerProbe = { durationSec: 189.5, hasVideo: false, hasAudio: true, width: 0, height: 0, rotation: 0, videoCodec: null, audioCodec: 'mp3' };

export type ExtractOpts = Parameters<AudioExecDeps['extract']>[1];

export interface FakeAudio {
  deps: AudioExecDeps;
  store: MemoryLeaseStore;
  audits: AuditEvent[];
  inspected: string[];
  extracts: Array<{ url: string; opts: ExtractOpts }>;
  uploads: Array<{ jobId: string; bytes: number }>;
  clock: { now: number };
  beat: () => Promise<void>;
  beating: () => number;
}

export function fakeAudio(opts: {
  inspect?: (url: string) => Promise<Inspection>;
  extract?: (url: string, o: ExtractOpts) => Promise<ExtractOutcome>;
  files?: Record<string, string>;
  foreign?: string[];
  upload?: string | null;
  key?: string;
} = {}): FakeAudio {
  const clock = { now: 1_000_000 };
  const store = memoryLeaseStore(() => clock.now);
  const ticks = new Set<() => Promise<void>>();
  const files = opts.files ?? { [UPLOAD]: `https://x.supabase.co/signed/${UPLOAD}` };
  let ids = 0;
  const f = {
    store, audits: [], inspected: [], extracts: [], uploads: [], clock,
    beat: async () => { for (const t of [...ticks]) await t(); },
    beating: () => ticks.size,
  } as unknown as FakeAudio;
  f.deps = {
    async resolveFile(ref) {
      if (opts.foreign?.includes(ref)) return { ok: false, reason: 'not_yours' };
      const url = files[ref];
      return url ? { ok: true, url } : { ok: false, reason: 'unreadable' };
    },
    async inspect(url) {
      f.inspected.push(url);
      if (opts.inspect) return opts.inspect(url);
      return { ok: true, fetchUrl: url, contentType: 'video/mp4', bytes: 48_000_000, disposition: null, license: null };
    },
    async extract(url, o) {
      f.extracts.push({ url, opts: o });
      if (opts.extract) return opts.extract(url, o);
      return { ok: true, mp3: Buffer.alloc(4_546_000, 1), input: SOURCE, output: MP3 };
    },
    async upload(jobId, mp3) {
      f.uploads.push({ jobId, bytes: mp3.byteLength });
      return opts.upload === undefined ? AUDIO_URL : opts.upload;
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
