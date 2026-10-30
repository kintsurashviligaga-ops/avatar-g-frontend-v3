/**
 * lib/video/directClip — the video service's one clip (GG 2026-10-25): 4, 6, 8 or 10 s, 8 by default, nothing longer; the
 * quality said as a resolution and a frame; today's price for the same length and tier, and the price book's Omni row at 10 s.
 */
import { quoteCredits } from '@/lib/credits/quote';
import { PRICE_BOOK } from '@/lib/credits/priceBook';
import {
  DIRECT_CLIP_DEFAULT_SECONDS, DIRECT_CLIP_PHOTO_MAX_BYTES, clipOmniPath, directClipCredits, directClipEngine, directClipFrame,
  directClipQualityLabel, directClipResolution, directClipSeconds, directClipTierAllowed, parseDirectClipRequest, snapDirectClipSeconds,
} from './directClip';

const JPEG = `data:image/jpeg;base64,${Buffer.from('photo').toString('base64')}`;

test('the default is 8 s, and no length grows past one clip; 10 s only when exactly 10 is chosen', () => {
  expect(DIRECT_CLIP_DEFAULT_SECONDS).toBe(8);
  expect([undefined, null, 'x', 0, -3, 8, 9, 9.9, 10.5, 11, 16, 24, 240].map(snapDirectClipSeconds)).toEqual([8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8]);
  expect([4, 4.9, 5, 6, 6.9, 7, 10, '10'].map(snapDirectClipSeconds)).toEqual([4, 4, 6, 6, 6, 8, 10, 10]);
  expect([4, 6, 8, 10].map(directClipEngine)).toEqual(['veo', 'veo', 'veo', 'omni']);
  // Two or three photos are Veo's reference images, which render 8 s only.
  expect(directClipSeconds(4, 0)).toBe(4);
  expect(directClipSeconds(4, 1)).toBe(4);
  expect(directClipSeconds(4, 2)).toBe(8);
  // Omni's 10 s takes one photo as its first frame; two or more are Veo's reference images again, at 8 s.
  expect(directClipSeconds(10, 1)).toBe(10);
  expect(directClipSeconds(10, 2)).toBe(8);
});

test('quality is a resolution and a frame: 1080p at 8 s, 720p at 4 and 6 s', () => {
  expect([4, 6, 8].map(directClipResolution)).toEqual(['720p', '720p', '1080p']);
  expect(directClipFrame('9:16', 8)).toEqual({ width: 1080, height: 1920 });
  expect(directClipFrame('16:9', 8)).toEqual({ width: 1920, height: 1080 });
  expect(directClipFrame('9:16', 6)).toEqual({ width: 720, height: 1280 });
  expect(directClipFrame('16:9', 4)).toEqual({ width: 1280, height: 720 });
  expect(directClipQualityLabel('9:16', 8)).toBe('1080p · 1080×1920');
  // A 10 s Omni clip is the resolution picked, 720p unless 1080p; Veo's lengths ignore a pick.
  expect(directClipResolution(10)).toBe('720p');
  expect(directClipResolution(10, '1080p')).toBe('1080p');
  expect(directClipResolution(6, '1080p')).toBe('720p');
  expect(directClipQualityLabel('9:16', 10)).toBe('720p · 720×1280');
  expect(directClipQualityLabel('16:9', 10, '1080p')).toBe('1080p · 1920×1080');
});

test('the price is the composer\'s own quote for the same length and tier — no new price', () => {
  for (const tier of ['lite', 'fast', 'standard'] as const) {
    for (const seconds of [4, 6, 8]) {
      expect(directClipCredits({ seconds, tier, photos: 0 })).toBe(quoteCredits({ tool: 'video', seconds, quality: tier }));
    }
  }
  // Reference mode is billed as the 8 s it renders.
  expect(directClipCredits({ seconds: 4, tier: 'fast', photos: 3 })).toBe(quoteCredits({ tool: 'video', seconds: 8, quality: 'fast' }));
  expect(directClipCredits({ seconds: 8, tier: 'fast', photos: 0 })).toBe(75);
});

test('10 s is the price book\'s Omni row for its resolution (GG card 16:51Z), whatever the tier', () => {
  expect(PRICE_BOOK.omniClip['720p'][10]).toBe(69);
  expect(PRICE_BOOK.omniClip['1080p'][10]).toBe(102);
  for (const tier of ['lite', 'fast', 'standard'] as const) {
    expect(directClipCredits({ seconds: 10, tier, photos: 0 })).toBe(69);
    expect(directClipCredits({ seconds: 10, tier, photos: 1, resolution: '1080p' })).toBe(102);
  }
  // Two photos make it an 8 s Veo reference clip, billed as that.
  expect(directClipCredits({ seconds: 10, tier: 'fast', photos: 2, resolution: '1080p' })).toBe(quoteCredits({ tool: 'video', seconds: 8, quality: 'fast' }));
  expect(clipOmniPath('u-1')).toBe('video-clip/u-1/omni.mp4');
});

test('a Georgian line makes it Omni\'s at every length (GG card 2026-10-26 10:55Z): its own price, 1080p unless 720p is picked', () => {
  expect([4, 6, 8, 10].map((s) => directClipEngine(s, 'ka'))).toEqual(['omni', 'omni', 'omni', 'omni']);
  expect([4, 6, 8].map((s) => directClipEngine(s, null))).toEqual(['veo', 'veo', 'veo']);
  for (const tier of ['lite', 'fast', 'standard'] as const) {
    expect([4, 6, 8, 10].map((seconds) => directClipCredits({ seconds, tier, photos: 1, speech: 'ka' }))).toEqual([42, 62, 82, 102]);
    expect([4, 6, 8, 10].map((seconds) => directClipCredits({ seconds, tier, photos: 0, speech: 'ka', resolution: '720p' }))).toEqual([28, 42, 55, 69]);
  }
  // Unpicked: a speaking clip is 1080p at every length; a 10 s clip without words keeps the 720p it had.
  expect([4, 6, 8, 10].map((s) => directClipResolution(s, null, 'ka'))).toEqual(['1080p', '1080p', '1080p', '1080p']);
  expect(directClipResolution(10, null, null)).toBe('720p');
  expect(directClipResolution(4, '720p', 'ka')).toBe('720p');
  expect(directClipQualityLabel('9:16', 6, null, 'ka')).toBe('1080p · 1080×1920');
  expect(directClipQualityLabel('16:9', 4, '720p', 'ka')).toBe('720p · 1280×720');
});

test('Lite takes no reference images', () => {
  expect(directClipTierAllowed('lite', 1)).toBe(true);
  expect(directClipTierAllowed('lite', 2)).toBe(false);
  expect(directClipTierAllowed('fast', 3)).toBe(true);
});

test('parse: defaults, the user\'s words kept, strict refusals', () => {
  const ok = parseDirectClipRequest({ prompt: '  ბავშვი   ბუშტს  უშვებს  ' });
  expect(ok).toEqual({ ok: true, value: { prompt: 'ბავშვი ბუშტს უშვებს', aspect: '9:16', seconds: 8, tier: 'fast', resolution: '1080p', photos: [], speech: null, picked: null, expectedCredits: null } });
  // What the card read is carried; a speaking clip keeps its pick, and is 1080p without one.
  expect(parseDirectClipRequest({ prompt: 'x', seconds: 4, speech: 'ka' })).toMatchObject({ ok: true, value: { seconds: 4, speech: 'ka', resolution: '1080p', picked: null } });
  expect(parseDirectClipRequest({ prompt: 'x', seconds: 6, speech: 'ka', resolution: '720p' })).toMatchObject({ ok: true, value: { speech: 'ka', resolution: '720p', picked: '720p' } });
  // Omni has no tier: Lite on a speaking clip with a photo is no refusal.
  expect(parseDirectClipRequest({ prompt: 'x', seconds: 8, tier: 'lite', photos: [JPEG], speech: 'ka' }).ok).toBe(true);
  const withPhoto = parseDirectClipRequest({ prompt: 'x', photos: [JPEG], seconds: 6, aspect: '16:9', tier: 'standard', expectedCredits: 12 });
  expect(withPhoto.ok && withPhoto.value).toMatchObject({ seconds: 6, aspect: '16:9', tier: 'standard', resolution: '720p', expectedCredits: 12, photos: [{ mimeType: 'image/jpeg' }] });
  // 10 s keeps the resolution asked for (720p when none); Lite with photos is no refusal there, Omni has no tier.
  const ten = parseDirectClipRequest({ prompt: 'x', seconds: 10, resolution: '1080p', photos: [JPEG] });
  expect(ten.ok && ten.value).toMatchObject({ seconds: 10, resolution: '1080p', photos: [{ mimeType: 'image/jpeg' }] });
  expect(parseDirectClipRequest({ prompt: 'x', seconds: 10 }).ok && (parseDirectClipRequest({ prompt: 'x', seconds: 10 }) as { value: { resolution: string } }).value.resolution).toBe('720p');
  expect(parseDirectClipRequest({ prompt: 'x', seconds: 10, tier: 'lite', photos: [JPEG] }).ok).toBe(true);
  // A resolution asked for at 8 s is Veo's own 1080p, never the pick.
  expect((parseDirectClipRequest({ prompt: 'x', seconds: 6, resolution: '1080p' }) as { value: { resolution: string } }).value.resolution).toBe('720p');

  const bad: [unknown, string, string][] = [
    [{}, 'prompt', 'required'],
    [{ prompt: 'x'.repeat(2001) }, 'prompt', 'too_long'],
    [{ prompt: 'x', aspect: '4:5' }, 'aspect', 'invalid'],
    [{ prompt: 'x', seconds: 9 }, 'seconds', 'invalid'],
    [{ prompt: 'x', seconds: '10' }, 'seconds', 'invalid'],
    [{ prompt: 'x', seconds: 16 }, 'seconds', 'invalid'],
    [{ prompt: 'x', tier: 'pro' }, 'tier', 'invalid'],
    [{ prompt: 'x', seconds: 10, resolution: '4k' }, 'resolution', 'invalid'],
    [{ prompt: 'x', seconds: 10, resolution: '480p' }, 'resolution', 'invalid'],
    [{ prompt: 'x', photos: 'a' }, 'photos', 'invalid'],
    [{ prompt: 'x', photos: [JPEG, JPEG, JPEG, JPEG] }, 'photos', 'too_many'],
    [{ prompt: 'x', photos: ['data:image/gif;base64,AAAA'] }, 'photos', 'invalid'],
    [{ prompt: 'x', photos: [`data:image/jpeg;base64,${'A'.repeat(Math.ceil((DIRECT_CLIP_PHOTO_MAX_BYTES + 10) * 4 / 3))}`] }, 'photos', 'too_large'],
    [{ prompt: 'x', tier: 'lite', photos: [JPEG, JPEG] }, 'tier', 'lite_photos'],
    [{ prompt: 'x', expectedCredits: -1 }, 'expectedCredits', 'invalid'],
    [{ prompt: 'x', speech: 'en' }, 'speech', 'invalid'],
  ];
  for (const [body, field, code] of bad) expect(parseDirectClipRequest(body)).toEqual({ ok: false, field, code });
});
