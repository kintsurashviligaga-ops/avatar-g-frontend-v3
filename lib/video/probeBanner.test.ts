/** The banner parser, on banners captured from the bundled ffmpeg-static (7.0.2). */
import { displaysPortrait, parseProbeBanner } from './probeBanner';

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
