/** @jest-environment node */
/**
 * The Higgsfield input builder. The registry's strict schema is the contract: the input carries only keys the model's
 * schema declares, so the saga refuses nothing for a field it never heard of — and the day the registry's Genjutsu
 * schema gains `prompt`, the preset starts riding with no change here.
 */
jest.mock('server-only', () => ({}));

import { getModel, parseModelInput } from '../providers/registry';
import { buildHfInput, hfJobIdFromPublic, hfJobView, hfPublicId, modelAcceptsKey } from './hfMotion';

const args = { imageUrls: ['https://signed.example/c.jpg', 'https://signed.example/p.jpg'], videoUrl: 'https://signed.example/v.mp4', prompt: 'Fire VFX: …', keepSound: true };

test('Kling 3 Motion Control: ONE image, the video, the preset prompt and the sound choice — and the registry\'s own schema accepts it', () => {
  const input = buildHfInput({ ...args, modelId: 'hf/kling-3-motion-std' })!;
  expect(input).toEqual({
    image_url: 'https://signed.example/c.jpg',
    video_url: 'https://signed.example/v.mp4',
    prompt: 'Fire VFX: …',
    keep_original_sound: 'yes',
    character_orientation: 'video',
  });
  const parsed = parseModelInput(getModel('hf/kling-3-motion-std')!, input);
  expect(parsed.ok).toBe(true);
  expect(buildHfInput({ ...args, modelId: 'hf/kling-3-motion-pro', keepSound: false })!.keep_original_sound).toBe('no');
  expect(parseModelInput(getModel('hf/kling-3-motion-pro')!, buildHfInput({ ...args, modelId: 'hf/kling-3-motion-pro' }))).toMatchObject({ ok: true });
});

test('Genjutsu motion-transfer TODAY takes video + images only — the preset cannot ride until its registry schema has `prompt`', () => {
  expect(modelAcceptsKey('hf/genjutsu-motion', 'prompt')).toBe(false);
  const input = buildHfInput({ ...args, modelId: 'hf/genjutsu-motion' })!;
  expect(input).toEqual({ video_url: 'https://signed.example/v.mp4', image_urls: args.imageUrls });
  expect(parseModelInput(getModel('hf/genjutsu-motion')!, input).ok).toBe(true);
});

test('…and once a schema DECLARES prompt / resolution they are sent (checked with an injected declaration, no registry change)', () => {
  const accepts = (id: string, key: string) => modelAcceptsKey(id, key) || (id === 'hf/genjutsu-motion' && (key === 'prompt' || key === 'resolution'));
  expect(buildHfInput({ ...args, modelId: 'hf/genjutsu-motion' }, accepts)).toEqual({
    video_url: 'https://signed.example/v.mp4', image_urls: args.imageUrls, prompt: 'Fire VFX: …', resolution: '720p',
  });
});

test('an unknown model, or no photo for an engine that needs one, builds nothing (the route answers model_unavailable)', () => {
  expect(buildHfInput({ ...args, modelId: 'hf/genjutsu-swap' })).toBeNull(); // not registered
  expect(buildHfInput({ ...args, modelId: 'nope' })).toBeNull();
  expect(buildHfInput({ ...args, imageUrls: [], modelId: 'hf/kling-3-motion-std' })).toBeNull();
  expect(buildHfInput({ ...args, imageUrls: [], modelId: 'hf/genjutsu-motion' })).toBeNull();
  // A model with neither an image_url nor an image_urls field is not one this module can feed.
  expect(buildHfInput({ ...args, modelId: 'hf/soul-2' })).toBeNull();
});

test('the saga\'s many statuses become the few the panel shows; a rejected generation says content_rejected', () => {
  const v = (status: string, error_code: string | null = null, refund_state: string | null = null) => hfJobView({ status, error_code, refund_state } as never);
  for (const s of ['reserving', 'reserved', 'pending', 'submitting', 'submit_unknown', 'in_progress', 'finalizing']) expect(v(s).state).toBe('processing');
  expect(v('queued').state).toBe('queued');
  expect(v('completed')).toEqual({ state: 'ready', errorCode: null, refunded: false });
  expect(v('failed', 'provider_unavailable', 'done')).toEqual({ state: 'failed', errorCode: 'provider_unavailable', refunded: true });
  expect(v('failed', null, 'pending')).toEqual({ state: 'failed', errorCode: 'generation_failed', refunded: false });
  expect(v('nsfw')).toMatchObject({ state: 'failed', errorCode: 'content_rejected' });
  expect(v('canceled').state).toBe('failed');
});

test('public ids round-trip, and only a well-formed uuid is accepted', () => {
  const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  expect(hfPublicId(id)).toBe(`hf:${id}`);
  expect(hfJobIdFromPublic(`hf:${id}`)).toBe(id);
  for (const bad of ['hf:', 'hf:123', `x:${id}`, `hf:${id}/../`, id]) expect(hfJobIdFromPublic(bad)).toBeNull();
});
