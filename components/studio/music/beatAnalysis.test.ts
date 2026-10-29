/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import { analyzePcm, beatAtTime, BEAT_FPS, type PcmSource } from './beatAnalysis';

function makeSample(seconds: number, sampleRate = 24000): PcmSource {
  const length = sampleRate * seconds;
  const data = new Float32Array(length);
  for (let n = 0; n < length; n++) {
    const t = n / sampleRate;
    const beat = [0.5, 1.0, 1.5, 2.0, 2.5].find((time) => t >= time && t < time + 0.09);
    if (beat !== undefined) {
      const k = t - beat;
      const decay = Math.exp(-k * 35);
      data[n] = 0.6 * decay * Math.sin(2 * Math.PI * 80 * k)
        + 0.14 * decay * Math.sin(2 * Math.PI * 1300 * k);
    } else {
      data[n] = 0.003 * Math.sin(2 * Math.PI * 280 * t);
    }
  }
  return { sampleRate, length, numberOfChannels: 1, getChannelData: () => data };
}

test('detects actual 120 BPM kick events, not synthetic periodic animation', () => {
  const result = analyzePcm(makeSample(3));
  expect(result.fps).toBe(BEAT_FPS);
  expect(result.frames.length).toBeGreaterThan(120);
  for (const hit of [0.5, 1.0, 1.5, 2.0, 2.5]) {
    const window = result.frames.slice(Math.round((hit - 0.02) * BEAT_FPS), Math.round((hit + 0.14) * BEAT_FPS));
    expect(Math.max(...window.map(frame => frame.beat))).toBeGreaterThan(0.18);
  }
  expect(beatAtTime(result, 0.35).beat).toBeLessThan(0.1);
  expect(beatAtTime(result, 1.5).energy).toBeGreaterThan(beatAtTime(result, 1.35).energy);
});

test('seek backwards reads the same frame each time, independently from wall-clock time', () => {
  const result = analyzePcm(makeSample(3));
  const first = beatAtTime(result, 1.52);
  expect(beatAtTime(result, 0.17).beat).toBe(0);
  expect(beatAtTime(result, 1.52)).toEqual(first);
  expect(beatAtTime(result, 0.52)).not.toEqual(beatAtTime(result, 0.35));
});

test('silence does not invent drum beats; malformed audio returns neutral values', () => {
  const silence = new Float32Array(24000);
  const track = analyzePcm({
    sampleRate: 24000,
    length: silence.length,
    numberOfChannels: 1,
    getChannelData: () => silence,
  });
  expect(Math.max(...track.frames.map(frame => frame.beat))).toBe(0);
  expect(beatAtTime(track, 0.4)).toEqual({ energy: 0, bass: 0, beat: 0 });
  expect(beatAtTime(null, 2)).toEqual({ energy: 0, bass: 0, beat: 0 });
  expect(analyzePcm({ sampleRate: 0, length: 0, numberOfChannels: 0, getChannelData: () => silence }).frames).toHaveLength(0);
});

test('duration and sample collection are bounded to three minutes', () => {
  const data = new Float32Array(24000 * 185);
  const track = analyzePcm({ sampleRate: 24000, length: data.length, numberOfChannels: 1, getChannelData: () => data });
  expect(track.frames).toHaveLength(180 * BEAT_FPS);
  expect(track.duration).toBe(180);
});
