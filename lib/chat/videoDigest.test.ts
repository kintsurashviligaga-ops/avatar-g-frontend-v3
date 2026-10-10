/** @jest-environment node */
import {
  DIGEST_BUDGET_CHARS, bytesToDataUrl, digestNote, digestToMedia, downmixAndResample, encodeWav, fitDigest, formatClock, planFrameTimes,
  type VideoDigest,
} from './videoDigest';
import { defaultVideoQuestion, isVideoEditRequest, isVideoQuestion } from './videoIntent';

describe('planFrameTimes — where to look', () => {
  test('eight midpoints across a long clip, in order, inside the clip', () => {
    const t = planFrameTimes(80);
    expect(t).toHaveLength(8);
    expect(t[0]).toBe(5);
    expect(t[7]).toBe(75);
    expect([...t].sort((a, b) => a - b)).toEqual(t);
    expect(t.every((x) => x > 0 && x < 80)).toBe(true);
  });
  test('a short clip gets one frame per second, never eight near-copies; a sub-second clip gets one', () => {
    expect(planFrameTimes(3)).toHaveLength(3);
    expect(planFrameTimes(0.5)).toEqual([0.25]);
  });
  test('nothing for a clip without a length', () => {
    expect(planFrameTimes(0)).toEqual([]);
    expect(planFrameTimes(Number.NaN)).toEqual([]);
    expect(planFrameTimes(Infinity)).toEqual([]);
  });
});

test('formatClock', () => {
  expect(formatClock(0)).toBe('0:00');
  expect(formatClock(83)).toBe('1:23');
  expect(formatClock(600)).toBe('10:00');
});

describe('downmixAndResample — the soundtrack the model hears', () => {
  test('stereo is averaged to mono and the rate is divided down', () => {
    const left = new Float32Array(48).fill(0.5);
    const right = new Float32Array(48).fill(-0.5);
    const out = downmixAndResample([left, right], 48000, 8000, 60);
    expect(out.length).toBe(8);
    expect(Array.from(out).every((s) => s === 0)).toBe(true);
    const mono = downmixAndResample([new Float32Array(48).fill(0.5)], 48000, 8000, 60);
    expect(Array.from(mono)).toEqual(Array(8).fill(Math.round(0.5 * 32767)));
  });
  test('it stops at maxSec', () => {
    const out = downmixAndResample([new Float32Array(48000 * 10).fill(0.1)], 48000, 8000, 2);
    expect(out.length).toBe(16000);
  });
  test('samples are clamped to 16 bits and bad input yields nothing', () => {
    expect(downmixAndResample([new Float32Array([5, 5, 5, 5, 5, 5])], 48000, 8000, 1)[0]).toBe(32767);
    expect(downmixAndResample([], 48000, 8000, 1).length).toBe(0);
    expect(downmixAndResample([new Float32Array(10)], 0, 8000, 1).length).toBe(0);
  });
});

test('encodeWav: a canonical 44-byte header, mono 16-bit, little-endian', () => {
  const wav = encodeWav(Int16Array.from([1, -2, 3]), 8000);
  const dv = new DataView(wav.buffer);
  expect(String.fromCharCode(...wav.subarray(0, 4))).toBe('RIFF');
  expect(String.fromCharCode(...wav.subarray(8, 12))).toBe('WAVE');
  expect(dv.getUint32(4, true)).toBe(36 + 6);
  expect(dv.getUint16(22, true)).toBe(1);        // mono
  expect(dv.getUint32(24, true)).toBe(8000);     // rate
  expect(dv.getUint32(28, true)).toBe(16000);    // byte rate
  expect(dv.getUint16(34, true)).toBe(16);       // bits
  expect(String.fromCharCode(...wav.subarray(36, 40))).toBe('data');
  expect(dv.getUint32(40, true)).toBe(6);
  expect([dv.getInt16(44, true), dv.getInt16(46, true), dv.getInt16(48, true)]).toEqual([1, -2, 3]);
  expect(wav.length).toBe(50);
});

describe('the digest that travels with the question', () => {
  const frame = (t: number, size = 100) => ({ dataUrl: `data:image/jpeg;base64,${'A'.repeat(size)}`, timeSec: t });
  const digest = (n: number, size = 100, audio = true): VideoDigest => ({
    durationSec: 42,
    frames: Array.from({ length: n }, (_, i) => frame(i * 5, size)),
    ...(audio ? { audio: { dataUrl: `data:audio/wav;base64,${'B'.repeat(size * 3)}`, seconds: 42 } } : {}),
  });

  test('the note names the frames, their times and the soundtrack — and admits when there is none', () => {
    const note = digestNote('clip.mp4', digest(3));
    expect(note).toContain('clip.mp4');
    expect(note).toContain('3 image(s)');
    expect(note).toContain('0:00, 0:05, 0:10');
    expect(note).toContain('soundtrack');
    expect(digestNote('clip.mp4', digest(3, 100, false))).toContain('no readable soundtrack');
  });

  test('media order is the note\'s promise: info, frames in order, then the soundtrack', () => {
    const media = digestToMedia('clip.mp4', digest(2));
    expect(media.map((m) => m.mimeType)).toEqual(['text/plain', 'image/jpeg', 'image/jpeg', 'audio/wav']);
    expect(media[1]!.name).toContain('frame 1/2');
    expect(Buffer.from(media[0]!.dataUrl.split(',')[1]!, 'base64').toString('utf8')).toContain('Video "clip.mp4"');
  });

  test('under budget nothing is dropped', () => {
    expect(fitDigest(digest(8), DIGEST_BUDGET_CHARS)).toEqual(digest(8));
  });
  test('over budget the soundtrack goes first, then every other frame — never below two frames', () => {
    const big = digest(8, 1000);               // 8 frames ≈ 8 KB + audio 3 KB
    const noAudio = fitDigest(big, 9000);
    expect(noAudio.audio).toBeUndefined();
    expect(noAudio.frames).toHaveLength(8);
    const thinned = fitDigest(big, 3500);
    expect(thinned.audio).toBeUndefined();
    expect(thinned.frames.length).toBeLessThan(8);
    expect(thinned.frames.length).toBeGreaterThanOrEqual(2);
    expect(fitDigest(big, 1).frames).toHaveLength(2);
  });
});

test('bytesToDataUrl round-trips', () => {
  const url = bytesToDataUrl(Uint8Array.from([104, 105]), 'text/plain');
  expect(url).toBe('data:text/plain;base64,aGk=');
});

describe('isVideoEditRequest — an edit, or a question about the video', () => {
  test.each([
    'add subtitles', 'make it vintage', 'trim the first 10 seconds', 'speed it up 2x', 'cinematic color grade',
    'add background music (attach an audio file too)', 'add a text overlay: ', 'remove the background', 'stabilize it',
    'სუბტიტრები დაამატე: ', 'ფერი შეცვალე — კინემატოგრაფიული', 'მუსიკა დაამატე', 'ტექსტი დაამატე: ', 'მოჭერი პირველი 10 წამი', 'სიჩქარე გაზარდე 2x',
    'ფონი მოაშორე', 'მოაშორე ფონი', 'ფონი ამოიღე', 'შეცვალე პერსონაჟი ამ ვიდეოში',
    'добавь субтитры: ', 'кинематографичный цвет', 'добавь музыку', 'добавь текст: ', 'обрежь первые 10 секунд', 'ускорь в 2 раза',
  ])('an edit: %s', (t) => { expect(isVideoEditRequest(t)).toBe(true); });

  test.each([
    'what is said in this video?', 'what music is in this video?', 'describe this video', 'summarize it', 'transcribe the speech',
    'translate what they say', 'who is in the video', 'how many people are there', 'hello', '',
    'რა ხდება ვიდეოში?', 'რა მუსიკაა ამ ვიდეოში?', 'აღწერე ეს ვიდეო', 'შეაჯამე', 'ვინ არის კადრში', 'თარგმნე რას ამბობენ',
    'что в этом видео?', 'какая музыка играет?', 'опиши видео', 'перескажи кратко', 'переведи речь',
  ])('not an edit: "%s"', (t) => { expect(isVideoEditRequest(t)).toBe(false); });

  test('a question wins over an edit word; the default question is never an edit', () => {
    expect(isVideoQuestion('what music is in this video?')).toBe(true);
    expect(isVideoEditRequest('what music is in this video?')).toBe(false);
    for (const l of ['ka', 'en', 'ru']) expect(isVideoEditRequest(defaultVideoQuestion(l))).toBe(false);
  });
});
