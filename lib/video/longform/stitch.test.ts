/** @jest-environment node */
/**
 * stitch.ts — argv only (no ffmpeg runs here). Rules under test: probe parsing from real ffmpeg stderr; copy only
 * when EVERY clip is probed and identical; the concat-demuxer copy plan (with remote sources whitelisted); the music
 * bed looped in the filtergraph (aloop — never -stream_loop, which hangs the bundled ffmpeg) and ended with -shortest
 * + -t, mixed under clip audio or alone; the re-encode
 * fallback (concat filter, scale/pad, silent tracks for silent clips); the size guard's ladder (copy → resumable →
 * fit-to-size → needs_resumable_upload); and the refusal of unsafe sources.
 */
import {
  buildLastFrameArgs,
  buildProbeArgs,
  buildStitchPlan,
  concatListLine,
  copyCompatibility,
  decideEncode,
  DEFAULT_MAX_UPLOAD_BYTES,
  estimateCopyBytes,
  isSafeSource,
  parseProbe,
  type ProbedClip,
  type StitchClip,
} from './stitch';

const VEO_STDERR = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'https://x.supabase.co/storage/v1/object/sign/renders/longform/j/s0.mp4':
  Metadata:
    major_brand     : isom
  Duration: 00:00:08.00, start: 0.000000, bitrate: 10234 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709, progressive), 1920x1080 [SAR 1:1 DAR 16:9], 10031 kb/s, 24 fps, 24 tbr, 12288 tbn (default)
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 192 kb/s (default)
At least one output file must be specified`;

const VEO: ProbedClip = {
  durationSec: 8,
  bitrateKbps: 10234,
  video: { codec: 'h264', width: 1920, height: 1080, fps: 24, pixFmt: 'yuv420p' },
  audio: { codec: 'aac', sampleRate: 48000, channels: 2 },
};
const url = (i: number) => `https://x.supabase.co/storage/v1/object/sign/renders/longform/j/s${i}.mp4?token=abc`;
const clips = (n: number, o: (i: number) => Partial<StitchClip> = () => ({})): StitchClip[] =>
  Array.from({ length: n }, (_, i) => ({ source: url(i), durationSec: 8, bytes: 4 * 1024 * 1024, probe: VEO, ...o(i) }));
const WORK = '/tmp/longform-j1';
const after = (argv: string[], flag: string) => argv[argv.indexOf(flag) + 1];

describe('parseProbe', () => {
  test('a Veo clip: duration, bitrate, h264 1920x1080 @ 24 yuv420p, AAC 48 kHz stereo', () => {
    expect(parseProbe(VEO_STDERR)).toEqual(VEO);
  });

  test('a silent clip, a mono clip, a 5.1 clip, tbr-only frame rate, garbage', () => {
    const silent = parseProbe('  Duration: 00:00:06.50, start: 0, bitrate: 900 kb/s\n  Stream #0:0: Video: hevc (Main), yuv420p10le, 1280x720, 25 tbr');
    expect(silent).toEqual({ durationSec: 6.5, bitrateKbps: 900, video: { codec: 'hevc', width: 1280, height: 720, fps: 25, pixFmt: 'yuv420p10le' }, audio: null });
    expect(parseProbe('Stream #0:1: Audio: mp3, 44100 Hz, mono, fltp, 128 kb/s').audio).toEqual({ codec: 'mp3', sampleRate: 44100, channels: 1 });
    expect(parseProbe('Stream #0:1: Audio: ac3, 48000 Hz, 5.1(side), fltp').audio).toBeNull(); // unknown layout label → not guessed
    expect(parseProbe('Stream #0:1: Audio: aac, 48000 Hz, 5.1, fltp').audio?.channels).toBe(6);
    expect(parseProbe('garbage')).toEqual({ durationSec: null, bitrateKbps: null, video: null, audio: null });
    expect(parseProbe(undefined as unknown as string).video).toBeNull();
  });

  test('buildProbeArgs', () => {
    expect(buildProbeArgs('/tmp/a.mp4')).toEqual(['-hide_banner', '-nostdin', '-i', '/tmp/a.mp4']);
  });
});

describe('copyCompatibility', () => {
  test('identical probed clips are copy-compatible', () => {
    expect(copyCompatibility(clips(30))).toEqual({ compatible: true, reasons: [] });
  });

  test('every kind of mismatch is named', () => {
    const v = VEO.video!;
    const bad = clips(7, (i) => ({
      probe: [
        VEO,
        { ...VEO, video: { ...v, codec: 'hevc' } },
        { ...VEO, video: { ...v, width: 1280, height: 720 } },
        { ...VEO, video: { ...v, fps: 25 } },
        { ...VEO, video: { ...v, pixFmt: 'yuv444p' } },
        { ...VEO, audio: null },
        { ...VEO, audio: { codec: 'aac', sampleRate: 44100, channels: 2 } },
      ][i]!,
    }));
    const r = copyCompatibility(bad);
    expect(r.compatible).toBe(false);
    expect(r.reasons).toEqual([
      'clip 1: video codec hevc ≠ h264',
      'clip 2: 1280x720 ≠ 1920x1080',
      'clip 3: 25 fps ≠ 24 fps',
      'clip 4: pixel format yuv444p ≠ yuv420p',
      'clip 5: audio absent unlike clip 0',
      'clip 6: audio aac/44100/2 ≠ aac/48000/2',
    ]);
  });

  test('an unprobed clip is never assumed compatible', () => {
    expect(copyCompatibility(clips(3, (i) => (i === 2 ? { probe: null } : {}))).reasons).toEqual(['clip 2 is not probed']);
    expect(copyCompatibility(clips(2, () => ({ probe: null }))).compatible).toBe(false);
    expect(copyCompatibility([])).toEqual({ compatible: false, reasons: ['no clips'] });
  });
});

describe('size estimate and the upload guard', () => {
  test('measured bytes win; probed bitrate next; the assumption last', () => {
    expect(estimateCopyBytes(clips(2))).toEqual({ bytes: Math.ceil(8 * 1024 * 1024 * 1.01), basis: 'measured' });
    expect(estimateCopyBytes(clips(1, () => ({ bytes: null })))).toEqual({ bytes: Math.ceil(((10234 * 1000 * 8) / 8) * 1.01), basis: 'probed' });
    expect(estimateCopyBytes(clips(1, () => ({ bytes: null, probe: null })))).toEqual({ bytes: Math.ceil(12_000_000 * 1.01), basis: 'assumed' });
  });

  const MB = 1024 * 1024;
  test('compatible + fits → copy, standard upload', () => {
    expect(decideEncode({ durationSec: 48, copyCompatible: true, copyBytes: 30 * MB, grade: '1080p' })).toEqual({ mode: 'copy', upload: 'standard', estimatedBytes: 30 * MB, videoKbps: null });
  });

  test('compatible + too big + resumable available → still a copy, resumable upload', () => {
    expect(decideEncode({ durationSec: 240, copyCompatible: true, copyBytes: 300 * MB, grade: '1080p', resumableUploadAvailable: true }))
      .toMatchObject({ mode: 'copy', upload: 'resumable' });
  });

  test('compatible + too big + no resumable: re-encode to fit when the bitrate stays above the floor', () => {
    // 96 s: (50 MB × 0.95 × 8 / 1000 / 96) − 192 = 4958 kb/s → capped at the 1080p ceiling? No: 4958 < 8000.
    const d = decideEncode({ durationSec: 96, copyCompatible: true, copyBytes: 120 * MB, grade: '1080p' });
    expect(d).toMatchObject({ mode: 'reencode', upload: 'standard', videoKbps: 3958, reason: 'fit_to_upload_limit' });
    expect(d.estimatedBytes).toBeLessThanOrEqual(DEFAULT_MAX_UPLOAD_BYTES);
  });

  test('240 s at 1080p cannot fit 50 MB above the floor → needs_resumable_upload; at 720p it fits', () => {
    const d = decideEncode({ durationSec: 240, copyCompatible: true, copyBytes: 360 * MB, grade: '1080p' });
    expect(d).toMatchObject({ mode: 'none', needsResumableUpload: true, fitKbps: 1468 });
    expect(decideEncode({ durationSec: 240, copyCompatible: true, copyBytes: 180 * MB, grade: '720p' })).toMatchObject({ mode: 'reencode', videoKbps: 1468 });
  });

  test('incompatible: re-encode at the ceiling when it fits, else resumable, else fit-to-size, else refuse', () => {
    expect(decideEncode({ durationSec: 16, copyCompatible: false, copyBytes: 0, grade: '1080p' })).toMatchObject({ mode: 'reencode', upload: 'standard', videoKbps: 8000, reason: 'incompatible' });
    expect(decideEncode({ durationSec: 120, copyCompatible: false, copyBytes: 0, grade: '1080p', resumableUploadAvailable: true })).toMatchObject({ mode: 'reencode', upload: 'resumable', videoKbps: 8000 });
    expect(decideEncode({ durationSec: 120, copyCompatible: false, copyBytes: 0, grade: '1080p' })).toMatchObject({ mode: 'reencode', upload: 'standard', videoKbps: 3128, reason: 'incompatible' });
    expect(decideEncode({ durationSec: 240, copyCompatible: false, copyBytes: 0, grade: '1080p' }).mode).toBe('none');
  });

  test('the doc\'s launch envelope at 50 MB: ≤ 176 s fits at 1080p above the floor, 184 s does not; 240 s fits at 720p', () => {
    const big = (durationSec: number, grade: '720p' | '1080p') => decideEncode({ durationSec, copyCompatible: true, copyBytes: 999 * MB, grade }).mode;
    expect(big(176, '1080p')).toBe('reencode');
    expect(big(184, '1080p')).toBe('none');
    expect(big(240, '720p')).toBe('reencode');
  });

  test('a custom upload limit (e.g. a raised bucket limit) moves every threshold', () => {
    expect(decideEncode({ durationSec: 240, copyCompatible: true, copyBytes: 360 * MB, grade: '1080p', maxUploadBytes: 500 * MB }).mode).toBe('copy');
  });
});

describe('buildStitchPlan — copy', () => {
  test('no music: concat demuxer, remote sources whitelisted, stream copy, exact length', () => {
    const r = buildStitchPlan({ clips: clips(3), workDir: WORK });
    if (!r.ok) throw new Error(r.detail);
    const p = r.plan;
    expect(p.mode).toBe('copy');
    expect(p.upload).toBe('standard');
    expect(p.concatList).toEqual({
      path: `${WORK}/concat.txt`,
      content: `ffconcat version 1.0\n${[0, 1, 2].map((i) => `file '${url(i)}'`).join('\n')}\n`,
    });
    expect(p.argv).toEqual([
      '-hide_banner', '-nostdin', '-y',
      '-f', 'concat', '-safe', '0', '-protocol_whitelist', 'file,http,https,tcp,tls,crypto', '-i', `${WORK}/concat.txt`,
      '-map', '0:v:0', '-map', '0:a:0?', '-c', 'copy',
      '-t', '24', '-movflags', '+faststart', `${WORK}/longform.mp4`,
    ]);
    expect(p.totalDurationSec).toBe(24);
    expect(p.outPath).toBe(`${WORK}/longform.mp4`);
  });

  test('local sources need no protocol whitelist', () => {
    const r = buildStitchPlan({ clips: clips(2, (i) => ({ source: `/tmp/longform-j1/s${i}.mp4` })), workDir: WORK });
    expect(r.ok && r.plan.argv).not.toContain('-protocol_whitelist');
  });

  test('music under clip audio: looped by aloop for the whole film, faded, mixed at full clip level, ended by -shortest + -t', () => {
    const r = buildStitchPlan({ clips: clips(30), workDir: WORK, music: { source: '/tmp/longform-j1/bed.mp3', durationSec: 30 }, resumableUploadAvailable: true });
    if (!r.ok) throw new Error(r.detail);
    const a = r.plan.argv;
    expect(a).not.toContain('-stream_loop'); // hangs the bundled ffmpeg 6.0 at exit (see stitch.ts)
    expect(a.filter((x, i) => a[i - 1] === '-i')).toEqual([`${WORK}/concat.txt`, '/tmp/longform-j1/bed.mp3']);
    expect(after(a, '-filter_complex')).toBe(
      '[1:a]aresample=48000,aloop=loop=-1:size=1440000,volume=0.3,afade=t=out:st=238:d=2[bed];' +
        '[0:a][bed]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]',
    );
    expect(a).toEqual(expect.arrayContaining(['-c:v', 'copy', '-c:a', 'aac', '-shortest']));
    expect(a.slice(a.indexOf('-map'), a.indexOf('-map') + 4)).toEqual(['-map', '0:v:0', '-map', '[aout]']);
    expect(after(a, '-t')).toBe('240');
    expect(r.plan.mode).toBe('copy'); // the video is NOT re-encoded for a music bed
  });

  test('the loop buffer: a track that outlasts the film is not looped; an unknown length loops at most the film', () => {
    const graph = (durationSec: number | null) => {
      const r = buildStitchPlan({ clips: clips(3), workDir: WORK, music: { source: '/tmp/bed.mp3', durationSec } });
      return r.ok ? after(r.plan.argv, '-filter_complex')! : '';
    };
    expect(graph(60).startsWith('[1:a]aresample=48000,volume=0.3,')).toBe(true);
    expect(graph(null)).toContain('aloop=loop=-1:size=1152000'); // 24 s × 48 kHz
    expect(graph(10)).toContain('aloop=loop=-1:size=480000');
  });

  test('music over silent clips: the bed alone, louder', () => {
    const silent: ProbedClip = { ...VEO, audio: null };
    const r = buildStitchPlan({ clips: clips(2, () => ({ probe: silent })), workDir: WORK, music: { source: 'https://cdn.example/bed.mp3', fadeOutSec: 0 } });
    if (!r.ok) throw new Error(r.detail);
    expect(after(r.plan.argv, '-filter_complex')).toBe('[1:a]aresample=48000,aloop=loop=-1:size=768000,volume=0.9[bed]');
    expect(r.plan.argv).toEqual(expect.arrayContaining(['-map', '[bed]']));
  });

  test('a concat line escapes a single quote the ffmpeg way', () => {
    expect(concatListLine("/tmp/it's.mp4")).toBe("file '/tmp/it'\\''s.mp4'");
  });
});

describe('buildStitchPlan — re-encode fallback', () => {
  test('mismatched clips: concat filter, scale+pad to clip 0, silent clip gets a silent track, VBV-capped x264', () => {
    const r = buildStitchPlan({
      clips: clips(3, (i) => (i === 1 ? { probe: { ...VEO, video: { ...VEO.video!, width: 1280, height: 720 }, audio: null } } : {})),
      workDir: WORK,
    });
    if (!r.ok) throw new Error(r.detail);
    const p = r.plan;
    expect(p.mode).toBe('reencode');
    expect(p.modeReasons).toEqual(['clip 1: 1280x720 ≠ 1920x1080', 'clip 1: audio absent unlike clip 0']);
    expect(p.concatList).toBeNull();
    expect(p.argv.filter((x, i) => p.argv[i - 1] === '-i')).toEqual([url(0), url(1), url(2)]);
    const graph = after(p.argv, '-filter_complex')!.split(';');
    expect(graph[0]).toBe('[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24,format=yuv420p,trim=duration=8,setpts=PTS-STARTPTS[v0]');
    expect(graph[3]).toBe('anullsrc=channel_layout=stereo:sample_rate=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,atrim=duration=8[a1]');
    expect(graph[6]).toBe('[v0][a0][v1][a1][v2][a2]concat=n=3:v=1:a=1[vcat][acat]');
    expect(p.argv).toEqual(expect.arrayContaining(['-map', '[vcat]', '-map', '[acat]', '-c:v', 'libx264', '-maxrate', '8000k', '-bufsize', '16000k', '-threads', '2']));
    expect(after(p.argv, '-preset')).toBe('superfast'); // no rc-lookahead: the assembler's OOM lesson
    expect(p.videoKbps).toBe(8000);
  });

  test('re-encode with music mixes the bed into the concatenated audio', () => {
    const r = buildStitchPlan({ clips: clips(2, (i) => (i ? { probe: null } : {})), workDir: WORK, music: { source: '/tmp/bed.m4a', volume: 0.5 } });
    if (!r.ok) throw new Error(r.detail);
    expect(after(r.plan.argv, '-map')).toBe('[vcat]');
    const graph = after(r.plan.argv, '-filter_complex')!;
    expect(graph.endsWith(';[2:a]aresample=48000,aloop=loop=-1:size=768000,volume=0.5,afade=t=out:st=14:d=2[bed];[acat][bed]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]')).toBe(true);
    expect(r.plan.argv).toEqual(expect.arrayContaining(['-i', '/tmp/bed.m4a', '-map', '[aout]']));
    expect(r.plan.argv).not.toContain('-stream_loop');
  });

  test('a compatible film too big for the limit is re-encoded to fit', () => {
    const r = buildStitchPlan({ clips: clips(12, () => ({ bytes: 10 * 1024 * 1024 })), workDir: WORK });
    if (!r.ok) throw new Error(r.detail);
    expect(r.plan.mode).toBe('reencode');
    expect(r.plan.modeReasons).toEqual(['fit the 50 MB upload limit']);
    expect(r.plan.estimatedBytes).toBeLessThanOrEqual(DEFAULT_MAX_UPLOAD_BYTES);
  });

  test('a 240 s 1080p film with no resumable upload is refused, not shipped at mush bitrate', () => {
    const r = buildStitchPlan({ clips: clips(30, () => ({ bytes: 12 * 1024 * 1024 })), workDir: WORK });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toBe('needs_resumable_upload');
    expect(!r.ok && r.estimatedBytes).toBeGreaterThan(DEFAULT_MAX_UPLOAD_BYTES);
  });
});

describe('safety', () => {
  test('isSafeSource: absolute paths and https URLs only', () => {
    for (const ok of ['/tmp/a.mp4', url(0), 'https://cdn.example/x.mp4']) expect(isSafeSource(ok)).toBe(true);
    for (const bad of ['a.mp4', '../a.mp4', '/tmp/../etc/passwd', 'http://cdn/x.mp4', 'file:///etc/passwd', '-i', "https://x/a'b.mp4",
      'https://x/a b.mp4', '/tmp/a.mp4\nfile /etc/passwd', '', 'concat:/a|/b', 42, null]) {
      expect(isSafeSource(bad)).toBe(false);
    }
  });

  test('a plan with an unsafe clip, music or workDir is refused; no clips is refused', () => {
    expect(buildStitchPlan({ clips: clips(2, (i) => (i ? { source: '/tmp/a.mp4\nfile /etc/passwd' } : {})), workDir: WORK })).toMatchObject({ ok: false, reason: 'unsafe_source' });
    expect(buildStitchPlan({ clips: clips(1), workDir: WORK, music: { source: 'http://evil/x.mp3' } })).toMatchObject({ ok: false, reason: 'unsafe_source' });
    expect(buildStitchPlan({ clips: clips(1), workDir: 'https://evil/' })).toMatchObject({ ok: false, reason: 'unsafe_source' });
    expect(buildStitchPlan({ clips: [], workDir: WORK })).toMatchObject({ ok: false, reason: 'no_clips' });
  });

  test('the output name is sanitised into the work dir', () => {
    const r = buildStitchPlan({ clips: clips(1), workDir: `${WORK}/`, outName: '../../evil name.mp4' });
    expect(r.ok && r.plan.outPath).toBe(`${WORK}/.._.._evil_name.mp4`);
  });

  test('buildLastFrameArgs seeks from the end and writes one JPEG', () => {
    expect(buildLastFrameArgs(url(0), '/tmp/f.jpg')).toEqual(['-hide_banner', '-nostdin', '-y', '-sseof', '-0.5', '-i', url(0), '-frames:v', '1', '-q:v', '2', '-update', '1', '/tmp/f.jpg']);
  });
});
