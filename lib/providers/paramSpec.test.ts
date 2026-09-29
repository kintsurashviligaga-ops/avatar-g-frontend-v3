/** @jest-environment node */
import { describeInput } from './paramSpec';
import {
  genjutsuMotionInput,
  klingI2vInput,
  klingMotionInput,
  klingT2vInput,
  seedanceR2vInput,
  seedanceT2vInput,
  soul2Input,
} from './higgsfield/models';
import { MODELS } from './registry';

const byKey = (specs: ReturnType<typeof describeInput>) => Object.fromEntries(specs.map((s) => [s.key, s]));

describe('describeInput — the form mirrors the documented schema', () => {
  test('Kling 3 text→video: prompt, a 3–15 s integer duration, three aspects, sound on/off', () => {
    const p = byKey(describeInput(klingT2vInput));
    expect(p.prompt).toEqual({ key: 'prompt', kind: 'text', required: true, min: 1, max: 2500 });
    expect(p.duration).toEqual({ key: 'duration', kind: 'int', required: false, default: 5, min: 3, max: 15 });
    expect(p.aspect_ratio).toMatchObject({ kind: 'enum', options: ['16:9', '9:16', '1:1'], default: '16:9' });
    expect(p.sound).toMatchObject({ kind: 'enum', options: ['on', 'off'], default: 'on' });
    expect(p.cfg_scale).toMatchObject({ kind: 'number', required: false, min: 0, max: 1 });
  });

  test('Kling 3 image→video: the first frame is a required image, the last one optional', () => {
    const p = byKey(describeInput(klingI2vInput));
    expect(p.image_url).toEqual({ key: 'image_url', kind: 'media', media: 'image', required: true });
    expect(p.last_image_url).toEqual({ key: 'last_image_url', kind: 'media', media: 'image', required: false });
    expect(p.aspect_ratio).toBeUndefined(); // i2v takes the frame's own shape
  });

  test('Seedance 2.5: 4–30 s, two resolutions, six aspects, audio on by default', () => {
    const p = byKey(describeInput(seedanceT2vInput));
    expect(p.duration).toMatchObject({ kind: 'int', min: 4, max: 30, default: 5 });
    expect(p.resolution).toMatchObject({ kind: 'enum', options: ['480p', '720p'], default: '720p' });
    expect(p.aspect_ratio!.options).toHaveLength(6);
    expect(p.generate_audio).toEqual({ key: 'generate_audio', kind: 'bool', required: false, default: true });
  });

  test('Seedance reference→video: under the "at least one reference" refinement, lists of up to five', () => {
    const p = byKey(describeInput(seedanceR2vInput));
    expect(p.image_urls).toEqual({ key: 'image_urls', kind: 'mediaList', media: 'image', required: false, min: 1, max: 5 });
    expect(p.audio_urls).toMatchObject({ kind: 'mediaList', media: 'audio', max: 5 });
    expect(p.video_urls).toBeUndefined(); // unpriceable, so not offered
    expect(p.prompt).toMatchObject({ kind: 'text', required: false });
  });

  test('motion transfer: source video + photo(s)', () => {
    const k = byKey(describeInput(klingMotionInput));
    expect(k.video_url).toMatchObject({ kind: 'media', media: 'video', required: true });
    expect(k.image_url).toMatchObject({ kind: 'media', media: 'image', required: true });
    expect(k.prompt).toMatchObject({ kind: 'text', required: false, default: '' });
    const g = byKey(describeInput(genjutsuMotionInput));
    expect(g.image_urls).toMatchObject({ kind: 'mediaList', required: true, min: 1, max: 5 });
  });

  test('Soul 2: a prompt and nothing else', () => {
    expect(describeInput(soul2Input).map((s) => s.key)).toEqual(['prompt']);
  });

  test('every registered model is fully describable — no field the form could not render', () => {
    for (const m of MODELS) {
      const specs = describeInput(m.input);
      const shapeKeys = Object.keys((m.input as unknown as { _def: { schema?: { shape: object } }; shape?: object }).shape
        ?? (m.input as unknown as { _def: { schema: { shape: object } } })._def.schema.shape);
      expect({ id: m.id, keys: specs.map((s) => s.key) }).toEqual({ id: m.id, keys: shapeKeys });
    }
  });

  test('a spec is plain data — safe to serialise to the browser', () => {
    for (const m of MODELS) {
      const s = describeInput(m.input);
      expect(JSON.parse(JSON.stringify(s))).toEqual(s);
      expect(JSON.stringify(s)).not.toMatch(/higgsfield|kling-video|bytedance|https?:/);
    }
  });
});
