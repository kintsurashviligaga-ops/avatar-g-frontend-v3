/** @jest-environment node */
/**
 * muxAudioOntoVideo — argv only (no ffmpeg runs here). The rule under test is Montage's „start the music at":
 * `audioStartSec` is INPUT seeking on the incoming track — `-ss <sec>` immediately before `-i audioUrl`, never before
 * the picture's `-i` and never as an output option — in EVERY branch (replace · mix · under · bed, and the replace
 * each of them falls back to). 0 / absent / garbage must leave the argv exactly as it was.
 */
jest.mock('server-only', () => ({}));

type Call = { args: string[] };
const calls: Call[] = [];
/** Which output passes should fail (by the filter graph they carry), to drive the fallbacks. */
let failWhen: (args: string[]) => boolean = () => false;

const PROBE_STDERR = 'Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709, progressive), 720x1280, 24 fps';

jest.mock('node:child_process', () => ({
  execFile: jest.fn((_bin: string, args: string[], _opts: unknown, cb: (err: unknown, out?: { stdout: string; stderr: string }) => void) => {
    // The header probe exits non-zero with the stream list on stderr — that is how ffmpeg answers `-i` alone.
    if (args.includes('-hide_banner')) { cb(Object.assign(new Error('probe'), { stderr: PROBE_STDERR })); return; }
    calls.push({ args });
    if (failWhen(args)) { cb(Object.assign(new Error('ffmpeg failed'), { stderr: 'Stream specifier :a matches no streams' })); return; }
    cb(null, { stdout: '', stderr: '' });
  }),
}));
jest.mock('node:fs/promises', () => ({
  mkdtemp: jest.fn(async () => '/tmp/remix-mux-test'),
  readFile: jest.fn(async () => Buffer.alloc(4096, 1)),
  writeFile: jest.fn(async () => undefined),
  rm: jest.fn(async () => undefined),
}));
jest.mock('ffmpeg-static', () => '/usr/bin/ffmpeg-test');
jest.mock('../orchestrator/storage-adapter', () => ({ uploadBufferAndSign: jest.fn(async () => 'https://cdn.test/muxed.mp4') }));
jest.mock('../agent/optimizer/activeConfig', () => ({ getActiveConfig: jest.fn() }));
jest.mock('./modelLock', () => ({ VIDEO_PRIMARY: 'test' }));
jest.mock('../utils/withRetry', () => ({ withRetry: jest.fn() }));
jest.mock('../pipeline/compositing/ffmpeg-overlay', () => ({ applyMarketingOverlays: jest.fn() }));
jest.mock('../jobs/stallDetector', () => ({ StallDetector: class {} }));
jest.mock('../orchestrator/idempotency', () => ({ isProviderTripped: jest.fn(), recordProviderResult: jest.fn() }));

// eslint-disable-next-line import/first
import { muxAudioOntoVideo } from './remixOps';

const VIDEO = 'https://x.supabase.co/storage/v1/object/sign/renders/montage/master.mp4?token=v';
const SONG = 'https://x.supabase.co/storage/v1/object/sign/uploads/u/song.mp3?token=a';
const MODES = ['replace', 'mix', 'under', 'bed'] as const;

/** The input section of a pass: everything up to the first option that is not an input. */
const inputsOf = (args: string[]) => args.slice(0, args.indexOf(SONG) + 1);

beforeEach(() => {
  calls.length = 0;
  failWhen = () => false;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('muxAudioOntoVideo · audioStartSec', () => {
  it.each(MODES)('%s: `-ss` sits right before the song’s -i — input seeking on the track only', async (mode) => {
    await expect(muxAudioOntoVideo(VIDEO, SONG, mode, 12, 42.5)).resolves.toBe('https://cdn.test/muxed.mp4');
    expect(calls).toHaveLength(1);
    const { args } = calls[0]!;
    expect(inputsOf(args)).toEqual(['-y', '-i', VIDEO, '-ss', '42.5', '-i', SONG]);
    // Exactly one seek, and it is not on the picture or the output.
    expect(args.filter((a) => a === '-ss')).toHaveLength(1);
    expect(args.indexOf('-ss')).toBeGreaterThan(args.indexOf(VIDEO));
    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf(SONG));
  });

  it.each(MODES)('%s: 0 / absent / garbage add nothing — the argv is what it always was', async (mode) => {
    for (const start of [undefined, 0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      calls.length = 0;
      await muxAudioOntoVideo(VIDEO, SONG, mode, 12, start as number);
      expect(calls).toHaveLength(1);
      expect(inputsOf(calls[0]!.args)).toEqual(['-y', '-i', VIDEO, '-i', SONG]);
      expect(calls[0]!.args).not.toContain('-ss');
    }
  });

  it('keeps each branch’s own graph and length rule', async () => {
    await muxAudioOntoVideo(VIDEO, SONG, 'bed', 12, 7);
    expect(calls[0]!.args).toContain('[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]');
    calls.length = 0;
    await muxAudioOntoVideo(VIDEO, SONG, 'under', 12, 7);
    expect(calls[0]!.args).toContain('[1:a]volume=-12dB[a1];[0:a][a1]amix=inputs=2:duration=first:dropout_transition=0[aout]');
    calls.length = 0;
    await muxAudioOntoVideo(VIDEO, SONG, 'mix', 6, 7);
    expect(calls[0]!.args).toContain('[0:a]volume=-6dB[a0];[a0][1:a]amix=inputs=2:duration=first:dropout_transition=0[aout]');
    calls.length = 0;
    await muxAudioOntoVideo(VIDEO, SONG, 'replace', 12, 7);
    expect(calls[0]!.args).toEqual(expect.arrayContaining(['-map', '0:v:0', '-map', '1:a:0', '-shortest']));
    // The picture is copied, not re-encoded: only the audio changes.
    expect(calls[0]!.args.slice(calls[0]!.args.indexOf('-c:v'), calls[0]!.args.indexOf('-c:v') + 2)).toEqual(['-c:v', 'copy']);
  });

  it.each(['bed', 'under', 'mix'] as const)('%s → the replace fallback (a silent master) still starts the song at the offset', async (mode) => {
    failWhen = (args) => args.includes('-filter_complex');
    await expect(muxAudioOntoVideo(VIDEO, SONG, mode, 12, 30)).resolves.toBe('https://cdn.test/muxed.mp4');
    expect(calls).toHaveLength(2);
    for (const { args } of calls) expect(inputsOf(args)).toEqual(['-y', '-i', VIDEO, '-ss', '30', '-i', SONG]);
    expect(calls[1]!.args).not.toContain('-filter_complex');
  });

  it('rounds the offset to the millisecond in the argv', async () => {
    await muxAudioOntoVideo(VIDEO, SONG, 'bed', 12, 12.345678);
    expect(inputsOf(calls[0]!.args)).toEqual(['-y', '-i', VIDEO, '-ss', '12.346', '-i', SONG]);
  });
});
