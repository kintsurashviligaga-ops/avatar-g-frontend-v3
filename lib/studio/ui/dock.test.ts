/** @jest-environment node */
import { MODELS, parseModelInput, publicModel, getModel } from '@/lib/providers/registry';
import {
  carryMedia,
  carryOver,
  chipSpecs,
  durationChoices,
  initialParams,
  missing,
  modelsForTab,
  requestKey,
  requestParams,
  type StudioModel,
} from './dock';

const pm = (id: string) => publicModel(getModel(id)!) as unknown as StudioModel;
const kling = pm('hf/kling-3-std-t2v');
const klingI2v = pm('hf/kling-3-std-i2v');
const seedance = pm('hf/seedance-2.5-t2v');
const r2v = pm('hf/seedance-2.5-r2v');
const motion = pm('hf/kling-3-motion-std');
const soul = pm('hf/soul-2');

describe('initialParams / chips', () => {
  test('defaults come from the schema; cfg_scale stays hidden', () => {
    expect(initialParams(kling)).toEqual({ duration: 5, aspect_ratio: '16:9', sound: 'on' });
    expect(chipSpecs(kling).map((p) => p.key)).not.toContain('cfg_scale');
    expect(initialParams(seedance)).toEqual({ duration: 5, resolution: '720p', aspect_ratio: '16:9', generate_audio: true });
    // SOUL V2's documented shape and size (soul-2/generate, read 2026-10-02), at the provider's own defaults.
    expect(initialParams(soul)).toEqual({ aspect_ratio: '1:1', resolution: '720p' });
  });

  test('duration choices stay inside each model’s own range', () => {
    const kd = chipSpecs(kling).find((p) => p.key === 'duration')!;
    expect(durationChoices(kd)).toEqual([3, 5, 8, 10, 15]);
    const sd = chipSpecs(seedance).find((p) => p.key === 'duration')!;
    expect(durationChoices(sd)).toEqual([4, 5, 8, 10, 15, 20, 30]);
  });
});

describe('missing — nothing is priced until the request could be valid', () => {
  test('a required prompt', () => {
    expect(missing(kling, '   ', {})).toEqual(['prompt']);
    expect(missing(kling, 'ზღვა', {})).toEqual([]);
  });
  test('image→video needs its first frame; the last frame is optional', () => {
    expect(missing(klingI2v, 'x', {})).toEqual(['image_url']);
    expect(missing(klingI2v, 'x', { image_url: 'omni-uploads/u/1.jpg' })).toEqual([]);
  });
  test('reference→video: prompt optional, but at least one photo or sound', () => {
    expect(missing(r2v, '', {})).toEqual(['image_urls']);
    expect(missing(r2v, '', { audio_urls: ['omni-uploads/u/a.mp3'] })).toEqual([]);
  });
  test('motion transfer: both the photo and the source video', () => {
    expect(missing(motion, '', { image_url: 'omni-uploads/u/p.jpg' })).toEqual(['video_url']);
  });
});

describe('requestParams — exactly what the schema accepts', () => {
  test('every model: a complete dock produces input the server-side schema accepts', () => {
    const media = { image_url: 'https://cdn.example.com/a.jpg', last_image_url: 'https://cdn.example.com/b.jpg', video_url: 'https://cdn.example.com/v.mp4', image_urls: ['https://cdn.example.com/c.jpg'], audio_urls: ['https://cdn.example.com/s.mp3'] };
    for (const m of MODELS) {
      const model = publicModel(m) as unknown as StudioModel;
      const body = requestParams(model, 'a lighthouse at dawn', initialParams(model), media);
      const parsed = parseModelInput(m, body);
      expect({ id: m.id, ok: parsed.ok, issues: parsed.ok ? [] : parsed.issues }).toEqual({ id: m.id, ok: true, issues: [] });
    }
  });

  test('a chip value from another model never leaks in (unknown keys are a 422 at the provider)', () => {
    const body = requestParams(kling, 'x', { duration: 5, aspect_ratio: '21:9', resolution: '720p', generate_audio: true }, {});
    expect(body).toEqual({ prompt: 'x', duration: 5 }); // 21:9 is not a Kling aspect; the Seedance keys are dropped
  });

  test('an empty optional prompt is omitted, a long one is cut to the schema max', () => {
    expect(requestParams(r2v, '  ', initialParams(r2v), { image_urls: ['omni-uploads/u/1.jpg'] })).not.toHaveProperty('prompt');
    expect((requestParams(kling, 'a'.repeat(3000), {}, {}).prompt as string).length).toBe(2500);
  });

  test('reference lists are capped at the schema max', () => {
    const six = Array.from({ length: 6 }, (_, i) => `omni-uploads/u/${i}.jpg`);
    expect((requestParams(r2v, '', {}, { image_urls: six }).image_urls as string[]).length).toBe(5);
  });
});

describe('switching models', () => {
  test('values that fit are kept, the rest reset to the new model’s default', () => {
    expect(carryOver(kling, { duration: 10, aspect_ratio: '9:16', sound: 'off' })).toEqual({ duration: 10, aspect_ratio: '9:16', sound: 'off' });
    expect(carryOver(kling, { duration: 30, aspect_ratio: '21:9' })).toEqual({ duration: 5, aspect_ratio: '16:9', sound: 'on' });
    expect(carryOver(seedance, { duration: 3 })).toMatchObject({ duration: 5 }); // Seedance starts at 4 s
  });
  test('media follows only where the new model has the same field', () => {
    expect(carryMedia(klingI2v, { image_url: 'p', video_url: 'v' })).toEqual({ image_url: 'p' });
    expect(carryMedia(kling, { image_url: 'p' })).toEqual({});
  });
});

test('requestKey is order-independent and changes with any value', () => {
  expect(requestKey('m', { a: 1, b: 2 })).toBe(requestKey('m', { b: 2, a: 1 }));
  expect(requestKey('m', { a: 1 })).not.toBe(requestKey('m', { a: 2 }));
  expect(requestKey('m', { a: 1 })).not.toBe(requestKey('n', { a: 1 }));
});

test('tabs: music and voice have no studio models (they open their own flows)', () => {
  const all = MODELS.map((m) => publicModel(m) as unknown as StudioModel);
  expect(modelsForTab(all, 'video').every((m) => m.service === 'video')).toBe(true);
  expect(modelsForTab(all, 'music')).toEqual([]);
  expect(modelsForTab(all, 'motion').map((m) => m.id)).toEqual(['hf/kling-3-motion-std', 'hf/kling-3-motion-pro', 'hf/genjutsu-motion']);
});
