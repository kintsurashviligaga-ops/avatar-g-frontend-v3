/** @jest-environment node */
/**
 * Agent G's audio extraction on the REAL bundled ffmpeg and the REAL fetch rules (lib/web/publicFetch), offline: a local
 * HTTP server plays a public media host (DNS answers a public address; the connection is mapped to 127.0.0.1). Pins:
 *   - the link check: a file opens and is media, its declared licence is read, HEAD-refusing hosts are asked by GET, and a
 *     web page, a stream, a dead link, an oversized file and a redirect onto YouTube are each refused for what they are;
 *   - the extraction: a real MP4's sound becomes a stereo 44.1 kHz 192 kbps MP3 of the same length, with no picture and
 *     none of the source's metadata; a silent video is "no sound"; a redirect onto a platform is refused mid-download;
 *     a cancel kills the running ffmpeg;
 *   - the whole job: quote → queue → worker → QC → stored MP3, through the lease queue (in memory).
 */
jest.mock('server-only', () => ({}));
jest.mock('./montageLive', () => ({ audit: async () => {}, quoteKey: () => 'k', every: () => () => {} }));
jest.mock('../../security/callerMedia', () => ({ resolveCallerMedia: async () => ({ ok: false, reason: 'unreadable' }) }));
jest.mock('../../orchestrator/storage-adapter', () => ({ uploadBufferAndSign: async () => null, reSignIfInternal: async (u: string) => u }));
jest.mock('../../supabase/server', () => ({ createServiceRoleClient: () => null }));
jest.mock('../../observability/report-error', () => ({ reportError: () => {} }));

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { memoryLeaseStore } from '../../orchestrator/testing/memoryLeaseStore';
import { parseProbeBanner } from '../../video/probeBanner';
import { enqueueAudioJob, quoteAudioExtract, type AudioExecDeps } from './audioExtract';
import { extractMp3, inspectLink } from './audioLive';
import { workAudioJob } from './audioWorker';

jest.setTimeout(120_000);
const bin = ffmpegStatic as unknown as string;
const HOST = 'https://media.example';
const PUBLIC = async () => [{ address: '93.184.216.34', family: 4 }];
let dir = '';
let server: http.Server;
let port = 0;
const files: Record<string, { path: string; type: string; link?: string }> = {};

function make(name: string, args: string[]): string {
  const out = join(dir, name);
  execFileSync(bin, ['-hide_banner', '-loglevel', 'error', '-y', ...args, out]);
  return out;
}

/** What ffmpeg says about a file. */
function banner(path: string): string {
  try {
    execFileSync(bin, ['-hide_banner', '-i', path], { stdio: 'pipe' });
  } catch (e) {
    return String((e as { stderr?: Buffer }).stderr ?? '');
  }
  return '';
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'agent-audio-'));
  files['/clip.mp4'] = {
    path: make('clip.mp4', [
      '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=25:duration=6', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=6',
      '-ac', '2', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', '-metadata', 'comment=SOURCE-SECRET-TAG', '-metadata', 'artist=Source Artist',
    ]),
    type: 'video/mp4',
    link: '<https://creativecommons.org/publicdomain/zero/1.0/>; rel="license"',
  };
  files['/nohead.mp4'] = { path: files['/clip.mp4'].path, type: 'video/mp4' };
  files['/silent.mp4'] = { path: make('silent.mp4', ['-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=25:duration=2', '-c:v', 'libx264', '-preset', 'ultrafast']), type: 'video/mp4' };
  files['/long.m4a'] = { path: make('long.m4a', ['-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=8000:duration=900', '-c:a', 'aac', '-b:a', '24k']), type: 'audio/mp4' };
  writeFileSync(join(dir, 'page.html'), '<!doctype html><title>a video page</title>');
  files['/page'] = { path: join(dir, 'page.html'), type: 'text/html; charset=utf-8' };
  writeFileSync(join(dir, 'live.m3u8'), '#EXTM3U\n');
  files['/live'] = { path: join(dir, 'live.m3u8'), type: 'application/vnd.apple.mpegurl' };

  server = http.createServer((req, res) => {
    const path = (req.url ?? '').split('?')[0]!;
    if (path === '/to-youtube') { res.writeHead(302, { location: 'https://www.youtube.com/watch?v=abc' }); res.end(); return; }
    if (path === '/huge.mp4') { res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': String(300 * 1024 * 1024) }); res.end(); return; }
    if (path === '/stall.mp4') { res.writeHead(200, { 'content-type': 'video/mp4' }); res.write(Buffer.alloc(1024)); return; } // never ends
    const f = files[path];
    if (!f) { res.writeHead(404); res.end(); return; }
    if (req.method === 'HEAD' && path === '/nohead.mp4') { res.writeHead(405); res.end(); return; }
    res.writeHead(200, { 'content-type': f.type, 'content-length': String(statSync(f.path).size), ...(f.link ? { link: f.link } : {}) });
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(f.path).pipe(res);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(dir, { recursive: true, force: true });
});

/** The public host's connection, mapped to the local server; anything else would be a real request (none happen). */
const fetchImpl = (async (url: string, init: RequestInit) => {
  if (!url.startsWith(HOST)) throw new Error(`unexpected request to ${url}`);
  return fetch(`http://127.0.0.1:${port}${url.slice(HOST.length)}`, init);
}) as unknown as typeof fetch;
const io = { fetchImpl, lookupImpl: PUBLIC };

describe('inspectLink: does it open, what is it, whose', () => {
  test('a media file: its type, its size and the licence it declares', async () => {
    expect(await inspectLink(`${HOST}/clip.mp4`, io)).toEqual({
      ok: true, fetchUrl: `${HOST}/clip.mp4`, contentType: 'video/mp4', bytes: statSync(files['/clip.mp4']!.path).size, disposition: null,
      license: { license: 'CC0 1.0', evidence: 'the file\'s own Link: rel="license" header' },
    });
  });

  test('a host that refuses HEAD is asked by GET', async () => {
    expect(await inspectLink(`${HOST}/nohead.mp4`, io)).toMatchObject({ ok: true, contentType: 'video/mp4', license: null });
  });

  test.each([
    ['/page', { ok: false, error: 'not_media' }],
    ['/live', { ok: false, error: 'stream' }],
    ['/gone.mp4', { ok: false, error: 'unavailable', status: 404 }],
    ['/huge.mp4', { ok: false, error: 'too_large' }],
    ['/to-youtube', { ok: false, error: 'platform', platform: 'YouTube' }],
  ])('%s is refused', async (path, want) => {
    expect(await inspectLink(`${HOST}${path}`, io)).toEqual(want);
  });

  test('an address inside the network is refused before any request', async () => {
    const never = jest.fn() as unknown as typeof fetch;
    expect(await inspectLink('https://intranet.example/a.mp4', { fetchImpl: never, lookupImpl: async () => [{ address: '10.0.0.7', family: 4 }] })).toEqual({ ok: false, error: 'blocked_host' });
    expect(await inspectLink('http://10.0.0.7/a.mp4', { fetchImpl: never, lookupImpl: PUBLIC })).toEqual({ ok: false, error: 'invalid_url' });
    expect(never).not.toHaveBeenCalled();
  });
});

describe('extractMp3 on the real ffmpeg', () => {
  test('a video’s sound → a stereo 44.1 kHz 192 kbps MP3 of the same length, no picture, none of the source’s tags', async () => {
    const r = await extractMp3(`${HOST}/clip.mp4`, { signal: new AbortController().signal, maxSec: 3600, title: 'My clip' }, io);
    if (!r.ok) throw new Error(`${r.error}: ${r.detail}`);
    expect(r.input).toMatchObject({ hasVideo: true, hasAudio: true, audioCodec: 'aac' });
    expect(r.input.durationSec).toBeCloseTo(6, 0);
    expect(r.output).toMatchObject({ hasVideo: false, hasAudio: true, audioCodec: 'mp3' });
    expect(Math.abs(r.output!.durationSec - 6)).toBeLessThan(0.2);
    const out = join(dir, 'out.mp3');
    writeFileSync(out, r.mp3);
    const b = banner(out);
    expect(b).toMatch(/Audio: mp3[^\n]*44100 Hz, stereo[^\n]*192 kb\/s/);
    expect(b).toMatch(/title\s*: My clip/);
    expect(b).not.toMatch(/SOURCE-SECRET-TAG|Source Artist/);
    expect(r.mp3.subarray(0, 3).toString('latin1')).toBe('ID3');
    // 192 kbps × 6 s ≈ 144 KB.
    expect(r.mp3.byteLength).toBeGreaterThan(130_000);
    expect(r.mp3.byteLength).toBeLessThan(170_000);
  });

  test('a video without sound has nothing to take out', async () => {
    expect(await extractMp3(`${HOST}/silent.mp4`, { signal: new AbortController().signal, maxSec: 3600, title: 't' }, io)).toMatchObject({ ok: false, error: 'no_audio' });
  });

  test('a redirect onto a platform is refused mid-download, never fetched', async () => {
    expect(await extractMp3(`${HOST}/to-youtube`, { signal: new AbortController().signal, maxSec: 3600, title: 't' }, io)).toMatchObject({ ok: false, error: 'refused' });
  });

  test('`maxSec` caps what is decoded', async () => {
    const r = await extractMp3(`${HOST}/long.m4a`, { signal: new AbortController().signal, maxSec: 3, title: 't' }, io);
    expect(r.ok && Math.round(r.output!.durationSec)).toBe(3);
    expect(r.ok && r.input.durationSec).toBeGreaterThan(899);
  });

  test('a cancel kills the running ffmpeg, mid-download or mid-encode', async () => {
    const stall = new AbortController();
    setTimeout(() => stall.abort(), 300);
    expect(await extractMp3(`${HOST}/stall.mp4`, { signal: stall.signal, maxSec: 3600, title: 't' }, io)).toEqual({ ok: false, error: 'extract_failed', detail: 'cancelled' });

    const encode = new AbortController();
    const t0 = Date.now();
    setTimeout(() => encode.abort(), 1500);
    const r = await extractMp3(`${HOST}/long.m4a`, { signal: encode.signal, maxSec: 3600, title: 't' }, io);
    expect(r).toEqual({ ok: false, error: 'extract_failed', detail: 'cancelled' });
    expect(Date.now() - t0).toBeLessThan(5000);
  });
});

describe('the whole job on the real ffmpeg: quote → queue → worker → QC → stored MP3', () => {
  test('delivers the QC’d MP3 into the row; the bytes stored are the bytes made', async () => {
    const store = memoryLeaseStore();
    const stored = new Map<string, Buffer>();
    let ids = 0;
    const deps: AudioExecDeps = {
      resolveFile: async () => ({ ok: false, reason: 'unreadable' }),
      inspect: (url) => inspectLink(url, io),
      extract: (url, o) => extractMp3(url, o, io),
      upload: async (jobId, mp3) => { stored.set(jobId, mp3); return `https://storage.test/audio/extract-${jobId}.mp3?token=t`; },
      resign: async (u) => u,
      store,
      audit: async () => {},
      key: () => 'k',
      now: () => Date.now(),
      newId: () => `job-${(ids += 1)}`,
      every: () => () => {},
    };
    const q = await quoteAudioExtract(deps, { userId: 'u1', url: `${HOST}/clip.mp4` });
    if (!q.ok) throw new Error(q.error);
    expect(q.quote).toMatchObject({ name: 'clip.mp3', rights: { status: 'licensed', license: 'CC0 1.0' }, credits: 0 });
    const run = await enqueueAudioJob(deps, { userId: 'u1', request: q.request, token: q.token });
    expect(run).toMatchObject({ ok: true, status: 'queued' });
    expect(await workAudioJob(deps, { jobId: q.quote.jobId, worker: 'w1' })).toMatchObject({ ran: true, outcome: 'delivered' });
    const row = store.rows.get(q.quote.jobId)!;
    const mp3 = stored.get(q.quote.jobId)!;
    expect(row).toMatchObject({ status: 'completed', signedUrl: null, result: { name: 'clip.mp3', codec: 'mp3', bitrateKbps: 192, bytes: mp3.byteLength, rights: { status: 'licensed', license: 'CC0 1.0' } } });
    expect(Math.abs((row.result!.durationSec as number) - 6)).toBeLessThan(0.2);
    const out = join(dir, 'job.mp3');
    writeFileSync(out, mp3);
    expect(parseProbeBanner(banner(out))).toMatchObject({ hasAudio: true, hasVideo: false, audioCodec: 'mp3' });
    expect(createHash('sha256').update(readFileSync(out)).digest('hex')).toBe(createHash('sha256').update(mp3).digest('hex'));
  });
});
