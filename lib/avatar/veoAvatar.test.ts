/** @jest-environment node */
import { buildVeoAvatarPrompt, parseVeoAvatarRequest, veoAvatarCredits, VEO_AVATAR_SPEECH_MAX } from './veoAvatar';
import { videoCredits } from '../credits/videoPricing';

describe('Veo avatar (GG 2026-10-16: Google-only talking avatar)', () => {
  it('the prompt keeps the Georgian words verbatim, names the language, and puts the direction apart from them', () => {
    const p = buildVeoAvatarPrompt({ speech: 'გადადი მაიავატარ.ჯიზე და შექმენი შენი ავატარი', direction: 'ემოციურად, ჟესტებით' });
    expect(p).toContain('"გადადი მაიავატარ.ჯიზე და შექმენი შენი ავატარი"');
    expect(p).toMatch(/in Georgian/);
    expect(p).toContain('ემოციურად, ჟესტებით.');
    expect(p).not.toMatch(/"[^"]*ემოციურად/);
    expect(p).toMatch(/first frame/);
  });
  it('with no direction a calm default is used', () => {
    expect(buildVeoAvatarPrompt({ speech: 'Hello there', direction: '' })).toMatch(/Natural, warm expression/);
  });
  it('is priced as one Veo Fast clip of 8 s from the video SSoT', () => {
    expect(veoAvatarCredits()).toBe(videoCredits({ seconds: 8, quality: 'fast' }));
  });
  it('parses strictly: words required, a too-long line refused, 9:16 by default', () => {
    expect(parseVeoAvatarRequest({ photo: 'omni-uploads/u/a.jpg', speech: 'hi' })).toEqual({ ok: true, value: { photo: 'omni-uploads/u/a.jpg', speech: 'hi', direction: '', aspect: '9:16', expectedCredits: null } });
    expect(parseVeoAvatarRequest({ photo: 'x', speech: '' })).toEqual({ ok: false, field: 'speech', code: 'required' });
    expect(parseVeoAvatarRequest({ speech: 'hi' })).toEqual({ ok: false, field: 'photo', code: 'required' });
    expect(parseVeoAvatarRequest({ photo: 'x', speech: 'a'.repeat(VEO_AVATAR_SPEECH_MAX + 1) })).toMatchObject({ ok: false, code: 'too_long' });
    expect(parseVeoAvatarRequest({ photo: 'x', speech: 'hi', aspect: '1:1' })).toMatchObject({ ok: false, field: 'aspect' });
    expect(parseVeoAvatarRequest({ photo: 'x', speech: 'hi', expectedCredits: 'free' })).toMatchObject({ ok: false, field: 'expectedCredits' });
  });
});
