/** The banner parser, on banners captured from the bundled ffmpeg-static (7.0.2). */
import { displaysPortrait, parseFrameCrc, parseProbeBanner } from './probeBanner';

const PHONE_PORTRAIT = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from '/tmp/in0.mp4':
  Duration: 00:00:02.00, start: 0.000000, bitrate: 203 kb/s
  Stream #0:0[0x1](und): Video: h264 (High 4:4:4 Predictive) (avc1 / 0x31637661), yuv444p(progressive), 1280x720 [SAR 1:1 DAR 16:9], 111 kb/s, 30 fps, 30 tbr, 15360 tbn (default)
      Metadata:
        handler_name    : VideoHandler
      Side data:
        displaymatrix: rotation of 90.00 degrees
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, mono, fltp, 69 kb/s (default)
At least one output file must be specified`;

const MP3_WITH_COVER = `Input #0, mp3, from '/tmp/in0.mp3':
  Duration: 00:03:21.47, start: 0.025057, bitrate: 320 kb/s
  Stream #0:0: Audio: mp3 (mp3float), 44100 Hz, stereo, fltp, 320 kb/s
  Stream #0:1: Video: mjpeg (Baseline), yuvj420p(pc, bt470bg/unknown/unknown), 600x600 [SAR 1:1 DAR 1:1], 90k tbr, 90k tbn (attached pic)
At least one output file must be specified`;

const SILENT_CLIP = `  Duration: 00:00:02.00, start: 0.000000, bitrate: 68 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 640x360 [SAR 1:1 DAR 16:9], 62 kb/s, 25 fps, 25 tbr, 12800 tbn (default)`;

test('a phone clip: length, both streams, coded size, rotation, codecs; it displays portrait', () => {
  const p = parseProbeBanner(PHONE_PORTRAIT);
  expect(p).toEqual({
    durationSec: 2, hasVideo: true, hasAudio: true, width: 1280, height: 720, rotation: 90, videoCodec: 'h264', audioCodec: 'aac',
  });
  expect(displaysPortrait(p)).toBe(true);
});

test('an mp3 with cover art is a track: its picture is not a video stream', () => {
  const p = parseProbeBanner(MP3_WITH_COVER);
  expect(p.hasVideo).toBe(false);
  expect(p.hasAudio).toBe(true);
  expect(p.durationSec).toBeCloseTo(201.47, 2);
  expect(p.audioCodec).toBe('mp3');
});

test('a clip without sound, and text that is not a banner', () => {
  const p = parseProbeBanner(SILENT_CLIP);
  expect(p.hasVideo).toBe(true);
  expect(p.hasAudio).toBe(false);
  expect(displaysPortrait(p)).toBe(false);
  expect(parseProbeBanner('No such file or directory')).toMatchObject({ durationSec: 0, hasVideo: false, hasAudio: false });
});

/**
 * `ffmpeg -i x.mp4 -map 0:v:0? -map 0:a:0? -c copy -f framecrc -` from the bundled ffmpeg-static on a 1 s H.264 + AAC
 * file (10 fps, 44.1 kHz), packets trimmed to the first and the last. The AAC priming packet sits before 0.
 */
const FRAMECRC = `#extradata 0:       44, 0x2f9c0d9c
#extradata 1:        5, 0x03460155
#software: Lavf61.1.100
#tb 0: 1/10240
#media_type 0: video
#codec_id 0: h264
#dimensions 0: 64x64
#sar 0: 1/1
#tb 1: 1/44100
#media_type 1: audio
#codec_id 1: aac
#sample_rate 1: 44100
#channel_layout_name 1: mono
1,      -1024,      -1024,     1024,      225, 0xf24e73d9, F=0x5, S=1,       10
0,          0,          0,     1024,     2243, 0x2b844e87
1,          0,          0,     1024,      305, 0xe74f9b9c
1,       1024,       1024,     1024,      177, 0x264c50c4
0,       9216,       9216,     1024,      724, 0xfaf50183, F=0x0
1,      41984,      41984,     1024,      192, 0xf5955f7a
1,      43008,      43008,     1004,      244, 0x8d226a37`;

describe('parseFrameCrc (the master\'s A/V check)', () => {
  test('each stream\'s length from its packets: the end of the last, less where the first starts (priming before 0 ignored)', () => {
    expect(parseFrameCrc(FRAMECRC)).toEqual({ videoSec: 1, audioSec: 0.998 });
  });
  test('a missing stream is null, garbage is no stream at all', () => {
    const videoOnly = FRAMECRC.split('\n').filter((l) => !/^(1,|#\w+ 1:)/.test(l)).join('\n');
    expect(parseFrameCrc(videoOnly)).toEqual({ videoSec: 1, audioSec: null });
    expect(parseFrameCrc('')).toEqual({ videoSec: null, audioSec: null });
    expect(parseFrameCrc('not, a, crc\n0, x, y')).toEqual({ videoSec: null, audioSec: null });
  });
});
