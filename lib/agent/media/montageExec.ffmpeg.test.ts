/** @jest-environment node */
/**
 * Agent G's montage on the REAL bundled ffmpeg, end to end but offline: three generated clips (one portrait) and a
 * generated 120 BPM track go through the live analysis (lib/services/montage/beatAnalysis), the quote, the run on the
 * real montage lane (runMontage: conform, stitch, music mux) and the QC probe. Only the network and storage are faked:
 * "downloads" copy local files, "uploads" write to a temp dir. Pins that the plan lands on the track's real beat and
 * the delivered master is an H.264/AAC MP4 of the planned length with the music in it.
 */
jest.mock('server-only', () => ({}));

const mockFiles = new Map<string, string>();
jest.mock('../../web/publicFetch', () => {
  const { copyFile, stat } = jest.requireActual('node:fs/promises');
  return {
    MEDIA_TYPES: /.*/,
    fetchPublicToFile: async (url: string, path: string) => {
      const src = mockFiles.get(url.split('?')[0]!);
      if (!src) return { ok: false, error: 'fetch_failed' };
      await copyFile(src, path);
      return { ok: true, bytes: (await stat(path)).size, contentType: 'video/mp4' };
    },
  };
});
let mockOut = '';
jest.mock('../../orchestrator/storage-adapter', () => {
  const { writeFileSync } = jest.requireActual('node:fs');
  const { join } = jest.requireActual('node:path');
  const host = (path: string, buf: Buffer) => {
    const local = join(mockOut, path.replace(/\//g, '_'));
    writeFileSync(local, buf);
    const url = `https://media.test/${path}`;
    mockFiles.set(url, local);
    return `${url}?token=t`;
  };
  return {
    uploadBufferAndSign: async (_b: string, path: string, buf: Buffer) => host(path, buf),
    uploadAndSign: async (_b: string, path: string, b64: string) => host(path, Buffer.from(b64, 'base64')),
    reSignIfInternal: async (url: string) => url,
  };
});
jest.mock('../../orchestrator/jobs', () => ({ updateJobStage: async () => {} }));
jest.mock('../optimizer/activeConfig', () => ({ getActiveConfig: async () => null }));
jest.mock('../../observability/report-error', () => ({ reportError: () => {} }));

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { analyzeTrack, probeMedia } from '../../services/montage/beatAnalysis';
import { runMontage } from '../../services/montage/montagePipeline';
import { quoteMontage, runMontageJob, type JobSnap, type MontageExecDeps } from './montageExec';

jest.setTimeout(180_000);
const bin = ffmpegStatic as unknown as string;
let dir = '';

function make(name: string, args: string[]): string {
  const out = join(dir, name);
  execFileSync(bin, ['-hide_banner', '-loglevel', 'error', '-y', ...args, out]);
  mockFiles.set(`https://media.test/in/${name}`, out);
  return `https://media.test/in/${name}`;
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'agent-montage-'));
  mockOut = dir;
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

test('three clips + a 120 BPM track → a beat-cut H.264/AAC master of the planned length, with the music', async () => {
  const enc = ['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac'];
  const a = make('a.mp4', ['-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30:duration=7', '-f', 'lavfi', '-i', 'sine=f=300:duration=7', ...enc]);
  const b = make('b.mp4', ['-f', 'lavfi', '-i', 'smptebars=size=360x640:rate=25:duration=6', '-f', 'lavfi', '-i', 'sine=f=500:duration=6', ...enc]);
  const c = make('c.mp4', ['-f', 'lavfi', '-i', 'rgbtestsrc=size=640x360:rate=30:duration=6', ...enc.slice(0, 6)]);
  // A kick every 0.5 s from 0.25 s (120 BPM) over a quiet pad: the beat the analysis must find.
  const song = make('song.m4a', [
    '-f', 'lavfi', '-i',
    "aevalsrc='0.9*sin(2*PI*55*t)*exp(-30*mod(t-0.25+1,0.5))*gte(t,0.25)+0.05*sin(2*PI*220*t)':s=44100:d=20",
    '-c:a', 'aac',
  ]);

  const rows = new Map<string, JobSnap>();
  const audits: string[] = [];
  const deps: MontageExecDeps = {
    resolveFile: async (ref) => ({ ok: true, url: ref }),
    probe: (url) => probeMedia(url),
    analyzeTrack: (url) => analyzeTrack(url),
    render: (req, o) => runMontage(req, { jobId: o.jobId, shouldContinue: o.shouldContinue }),
    jobs: {
      create: async ({ id, userId }) => (rows.has(id) ? false : (rows.set(id, { userId, status: 'processing', result: null }), true)),
      snapshot: async (id) => rows.get(id) ?? null,
      fail: async (id) => { rows.get(id)!.status = 'failed'; },
      complete: async (id, out) => { Object.assign(rows.get(id)!, { status: 'completed', result: out.result }); },
    },
    billing: { reserve: async () => ({ proceed: true, charged: false, reason: 'ok' }), recordReservation: async () => {}, refund: async () => {} },
    audit: async (ev) => { audits.push(`${ev.phase}:${ev.outcome}${ev.detail ? `:${ev.detail}` : ''}`); },
    key: () => 'test-key',
    now: () => Date.now(),
    newId: () => 'e2e-job',
  };

  const q = await quoteMontage(deps, { userId: 'u', files: [a, b, c, song], targetSec: 10 });
  if (!q.ok) throw new Error(`quote: ${q.error} ${q.message}`);
  expect(q.quote.beatSynced).toBe(true);
  expect(Math.abs(q.quote.bpm! - 120)).toBeLessThan(1.5);
  expect(Math.abs(q.quote.musicStartSec - 0.25)).toBeLessThan(0.05);
  expect(q.quote.clips).toBe(3);
  expect(q.quote.totalSec).toBeLessThanOrEqual(10);

  const r = await runMontageJob(deps, { userId: 'u', request: q.request, token: q.token, prompt: 'cut these to the song' });
  if (!r.ok) throw new Error(`run: ${r.error} ${r.message} ${(r as { problems?: string[] }).problems ?? ''}`);
  const master = await probeMedia(r.videoUrl);
  expect(master).toMatchObject({ hasVideo: true, hasAudio: true, videoCodec: 'h264', audioCodec: 'aac' });
  expect(Math.abs(master!.durationSec - q.quote.totalSec)).toBeLessThan(1);
  expect(rows.get('e2e-job')!.status).toBe('completed');
  expect(audits).toEqual(['quote:ok', 'run:ok:started', 'run:ok:delivered']);
  // MONTAGE_E2E_OUT=<file> records the plan and the master as the slice's proof (docs/handoffs).
  if (process.env.MONTAGE_E2E_OUT) {
    writeFileSync(process.env.MONTAGE_E2E_OUT, JSON.stringify({ quote: q.quote, shots: q.request.shots.map((s) => [s.url.split('/').pop(), s.startSec, s.endSec]), master }, null, 1));
  }
});
