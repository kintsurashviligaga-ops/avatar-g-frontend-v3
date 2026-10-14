/** @jest-environment node */
/**
 * Music Studio audio QC and edits on the REAL bundled ffmpeg, offline, on tones generated here. Every result is decoded
 * and measured again — no assertion trusts the filter string alone.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { assertDeliverable, editFilters, measureAudio, parseAudioReport, renderEdit, renderJoin, type AudioFormat } from './audio';
import { editMusic, type EditDeps } from './edit';

jest.setTimeout(120_000);

async function tone(sec: number, format: AudioFormat, opts: { silent?: boolean; freq?: number } = {}): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'ms-tone-'));
  const out = join(dir, `t.${format}`);
  const src = opts.silent ? `anullsrc=r=44100:cl=stereo` : `sine=frequency=${opts.freq ?? 440}:sample_rate=44100`;
  const enc = format === 'mp3' ? ['-c:a', 'libmp3lame', '-b:a', '128k'] : format === 'wav' ? ['-c:a', 'pcm_s16le'] : ['-c:a', 'aac'];
  await new Promise<void>((res, rej) => execFile(ffmpegStatic as unknown as string, ['-hide_banner', '-y', '-f', 'lavfi', '-i', src, '-t', String(sec), '-ac', '2', ...enc, out], (e) => (e ? rej(e) : res())));
  const b = await readFile(out);
  await rm(dir, { recursive: true, force: true });
  return b;
}

describe('measure + QC', () => {
  test('a real MP3 is measured: length, codec, rate, channels and level', async () => {
    const qc = await measureAudio(await tone(12, 'mp3'), 'mp3');
    expect(qc.durationSec).toBeGreaterThan(11.8);
    expect(qc.durationSec).toBeLessThan(12.3);
    expect(qc.codec).toBe('mp3');
    expect(qc.sampleRate).toBe(44100);
    expect(qc.channels).toBe(2);
    expect(qc.maxVolumeDb!).toBeGreaterThan(-30); // the lavfi sine is ≈ −18…−22 dBFS
    expect(qc.maxVolumeDb!).toBeLessThan(0);
    expect(() => assertDeliverable(qc, { minSec: 10, maxSec: 90 })).not.toThrow();
  });

  test('silence, a too-short track and garbage bytes are refused', async () => {
    const silent = await measureAudio(await tone(12, 'wav', { silent: true }), 'wav');
    expect(() => assertDeliverable(silent, { minSec: 10, maxSec: 90 })).toThrow(/silent/);
    const short = await measureAudio(await tone(3, 'mp3'), 'mp3');
    expect(() => assertDeliverable(short, { minSec: 10, maxSec: 90 })).toThrow(/too short/);
    await expect(measureAudio(Buffer.from('not audio at all'.repeat(100)), 'mp3')).rejects.toMatchObject({ code: 'quality_failed' });
  });

  test('parseAudioReport reads a mono WAV banner', () => {
    const qc = parseAudioReport('  Duration: 00:00:31.25, bitrate: 705 kb/s\n  Stream #0:0: Audio: pcm_s16le ([1][0][0][0] / 0x0001), 44100 Hz, mono, s16, 705 kb/s\n[Parsed_volumedetect_0 @ 0x1] mean_volume: -20.1 dB\n[Parsed_volumedetect_0 @ 0x1] max_volume: -3.0 dB\n');
    expect(qc).toEqual({ durationSec: 31.25, codec: 'pcm_s16le', sampleRate: 44100, channels: 1, maxVolumeDb: -3, meanVolumeDb: -20.1 });
  });
});

describe('edits (real ffmpeg)', () => {
  test('trim + fade in/out + volume: the measured length is the trim window; the source bytes are unchanged', async () => {
    const src = await tone(20, 'mp3');
    const copy = Buffer.from(src);
    const out = await renderEdit({ bytes: src, format: 'mp3' }, [
      { op: 'trim', startSec: 2, endSec: 12 }, { op: 'fade_in', sec: 1 }, { op: 'fade_out', sec: 2 }, { op: 'volume', db: -6 },
    ], 20, 'wav');
    const qc = await measureAudio(out.bytes, 'wav');
    const before = await measureAudio(src, 'mp3');
    expect(Math.abs(qc.durationSec - 10)).toBeLessThan(0.1);
    expect(qc.codec).toBe('pcm_s16le');
    expect(Math.abs((before.maxVolumeDb! - 6) - qc.maxVolumeDb!)).toBeLessThan(1); // −6 dB applied, measured
    expect(src.equals(copy)).toBe(true); // non-destructive
  });

  test('mute makes a silent track of the same length; convert to m4a keeps the length', async () => {
    const src = await tone(8, 'wav');
    const muted = await renderEdit({ bytes: src, format: 'wav' }, [{ op: 'mute' }], 8, 'mp3');
    const mq = await measureAudio(muted.bytes, 'mp3');
    expect(mq.maxVolumeDb === -Infinity || (mq.maxVolumeDb ?? 0) < -80).toBe(true);
    const m4a = await renderEdit({ bytes: src, format: 'wav' }, [], 8, 'm4a');
    const cq = await measureAudio(m4a.bytes, 'm4a');
    expect(cq.codec).toBe('aac');
    expect(Math.abs(cq.durationSec - 8)).toBeLessThan(0.15);
  });

  test('join: plain concat sums the lengths; a crossfade overlaps them', async () => {
    const a = await tone(6, 'mp3', { freq: 330 });
    const b = await tone(5, 'wav', { freq: 550 });
    const plain = await renderJoin([{ bytes: a, format: 'mp3', sec: 6 }, { bytes: b, format: 'wav', sec: 5 }], 0, 'mp3');
    expect(Math.abs((await measureAudio(plain.bytes, 'mp3')).durationSec - 11)).toBeLessThan(0.2);
    const xf = await renderJoin([{ bytes: a, format: 'mp3', sec: 6 }, { bytes: b, format: 'wav', sec: 5 }], 2, 'wav');
    expect(Math.abs((await measureAudio(xf.bytes, 'wav')).durationSec - 9)).toBeLessThan(0.2);
  });

  test('impossible edits are refused, never clamped', () => {
    expect(() => editFilters([{ op: 'trim', startSec: 5, endSec: 40 }], 30)).toThrow(/within/);
    expect(() => editFilters([{ op: 'fade_out', sec: 40 }], 30)).toThrow(/fade/);
    expect(() => editFilters([{ op: 'trim', startSec: 1, endSec: 1.5 }], 30)).toThrow(/shorter than 1 s/);
    expect(() => editFilters([{ op: 'volume', db: 30 }], 30)).toThrow(/Volume/);
  });

  test('editMusic: an owned source becomes a NEW Library version; a foreign id is not found', async () => {
    const src = await tone(15, 'mp3');
    const recorded: unknown[] = [];
    const deps: EditDeps = {
      load: async (id, user) => (user === 'u1' && id === '11111111-1111-4111-8111-111111111111' ? { jobId: id, bytes: src, format: 'mp3' } : null),
      newId: () => '22222222-2222-4222-8222-222222222222',
      store: async (_u, id, bytes, format, qc) => ({ bucket: 'renders', path: `music-studio/u1/${id}.${format}`, url: 'https://x/s', mime: 'audio/mpeg', bytes: bytes.byteLength, digest: 'd', qc }),
      record: async (row) => { recorded.push(row); return true; },
    };
    const r = await editMusic(deps, 'u1', { v: 1, sources: ['11111111-1111-4111-8111-111111111111'], ops: [{ op: 'trim', startSec: 0, endSec: 10 }, { op: 'fade_out', sec: 3 }], format: 'mp3', locale: 'ka' });
    expect(r.jobId).toBe('22222222-2222-4222-8222-222222222222');
    expect(Math.abs(r.durationSec - 10)).toBeLessThan(0.15);
    expect(r.credits).toBe(0);
    expect(recorded).toHaveLength(1);
    await expect(editMusic(deps, 'u2', { v: 1, sources: ['11111111-1111-4111-8111-111111111111'], ops: [{ op: 'mute' }], format: 'mp3', locale: 'ka' })).rejects.toMatchObject({ code: 'not_found' });
  });
});
