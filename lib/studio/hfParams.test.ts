/** @jest-environment node */
/**
 * The panel's state mapped onto a Higgsfield model's own parameters: only keys the model takes, only values that fit, a length
 * the model cannot render clamped (and printed), and the panel's pictures on the model's own media key.
 */
import { MODELS, parseModelInput, publicModel, getModel } from '@/lib/providers/registry';
import type { StudioModel } from '@/lib/studio/ui/dock';
import { hfMedia, hfMediaKeys, hfRequest, hfSummary, hfValues } from './hfParams';

const pm = (id: string) => publicModel(MODELS.find((m) => m.id === id)!) as unknown as StudioModel;
const WORDS = { seconds: 's', soundOn: 'sound on', soundOff: 'no sound' };

test('Kling 3 text→video: shape kept when it is one of the model\'s, length clamped into 3–15, sound on/off as the model spells it', () => {
  const m = pm('hf/kling-3-std-t2v');
  expect(hfValues(m, { aspect: '9:16', seconds: 24, sound: false })).toEqual({ duration: 15, aspect_ratio: '9:16', sound: 'off' });
  expect(hfValues(m, { aspect: '4:5', seconds: 1 })).toEqual({ duration: 3, aspect_ratio: '16:9', sound: 'on' }); // 4:5 is not Kling's → its default
  expect(hfSummary(m, hfValues(m, { aspect: '9:16', seconds: 24, sound: true }), WORDS)).toBe('15 s · 9:16 · sound on');
});

test('Seedance: generate_audio is a boolean; the panel\'s size picks the smallest or the largest resolution the model has', () => {
  const m = pm('hf/seedance-2.5-i2v');
  expect(hfValues(m, { seconds: 40, sound: false, quality: 'ultra' })).toMatchObject({ duration: 30, generate_audio: false, resolution: '1080p' });
  expect(hfValues(m, { seconds: 8, quality: 'standard' })).toMatchObject({ duration: 8, resolution: '480p' });
});

test('images: SOUL V2 at 1K → 720p, at 2K/4K → 1080p; Grok\'s 1k / 2k; a model without the key gets nothing', () => {
  expect(hfValues(pm('hf/soul-2'), { aspect: '3:4', quality: 'standard' })).toEqual({ aspect_ratio: '3:4', resolution: '720p' });
  expect(hfValues(pm('hf/soul-2'), { aspect: '21:9', quality: 'ultra' })).toEqual({ aspect_ratio: '1:1', resolution: '1080p' });
  expect(hfValues(pm('hf/grok-image-2'), { aspect: '16:9', quality: 'high' })).toMatchObject({ aspect_ratio: '16:9', resolution: '2k' });
  expect(hfValues(pm('hf/recraft-v4.1'), { quality: 'ultra', seconds: 10, sound: true })).toEqual({ aspect_ratio: '1:1' });
});

test('pictures go on the model\'s own key: a first frame, or a list up to its cap; none for a text-only model', () => {
  expect(hfMediaKeys(pm('hf/kling-3-std-i2v'))).toEqual({ single: 'image_url', list: null });
  expect(hfMedia(pm('hf/kling-3-std-i2v'), ['a', 'b'])).toEqual({ image_url: 'a' });
  expect(hfMedia(pm('hf/grok-image-2'), ['1', '2', '3', '4', '5', '6'])).toEqual({ image_urls: ['1', '2', '3', '4', '5'] });
  expect(hfMedia(pm('hf/soul-2'), ['a'])).toEqual({});
});

test('⚠️ the request carries the schema\'s keys only — and the server\'s own schema accepts what the panel sends', () => {
  const m = pm('hf/kling-3-turbo-t2v');
  const body = hfRequest(m, 'a road at dusk', { aspect: '9:16', seconds: 6, sound: true, quality: 'ultra' }, {});
  expect(body).toEqual({ prompt: 'a road at dusk', duration: 6, resolution: '1080p', aspect_ratio: '9:16' }); // Turbo has no sound field
  expect(parseModelInput(getModel('hf/kling-3-turbo-t2v')!, body).ok).toBe(true);
  const img = hfRequest(pm('hf/ideogram-4'), 'a poster', { aspect: '4:5', quality: 'high' }, hfMedia(pm('hf/ideogram-4'), ['https://cdn.example.com/a.jpg']));
  expect(img).toEqual({ prompt: 'a poster', image_url: 'https://cdn.example.com/a.jpg', aspect_ratio: '4:5', rendering_speed: 'DEFAULT' });
  expect(parseModelInput(getModel('hf/ideogram-4')!, img).ok).toBe(true);
});
