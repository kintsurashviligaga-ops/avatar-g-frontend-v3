/** @jest-environment node */
import { avatarVoiceByTts, avatarVoicePath, avatarVoicedPath, buildVeoAvatarPrompt, parseVeoAvatarRequest, veoAvatarCredits, VEO_AVATAR_NEGATIVE, VEO_AVATAR_SPEECH_MAX } from './veoAvatar';
import { sceneCredits } from '../credits/priceBook';

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
  it('is priced as one 8 s Fast scene from the price book (its clip and spoken line, no film base): 71 credits', () => {
    expect(veoAvatarCredits()).toBe(sceneCredits('fast', false, 8));
    expect(veoAvatarCredits()).toBe(71);
  });
  it('parses strictly: words required, a too-long line refused, 9:16 by default', () => {
    expect(parseVeoAvatarRequest({ photo: 'omni-uploads/u/a.jpg', speech: 'hi' })).toEqual({ ok: true, value: { photo: 'omni-uploads/u/a.jpg', speech: 'hi', direction: '', aspect: '9:16', voiceGender: null, expectedCredits: null } });
    expect(parseVeoAvatarRequest({ photo: 'x', speech: '' })).toEqual({ ok: false, field: 'speech', code: 'required' });
    expect(parseVeoAvatarRequest({ speech: 'hi' })).toEqual({ ok: false, field: 'photo', code: 'required' });
    expect(parseVeoAvatarRequest({ photo: 'x', speech: 'a'.repeat(VEO_AVATAR_SPEECH_MAX + 1) })).toMatchObject({ ok: false, code: 'too_long' });
    expect(parseVeoAvatarRequest({ photo: 'x', speech: 'hi', aspect: '1:1' })).toMatchObject({ ok: false, field: 'aspect' });
    expect(parseVeoAvatarRequest({ photo: 'x', speech: 'hi', expectedCredits: 'free' })).toMatchObject({ ok: false, field: 'expectedCredits' });
    expect(parseVeoAvatarRequest({ photo: 'x', speech: 'hi', voiceGender: 'female' })).toMatchObject({ ok: true, value: { voiceGender: 'female' } });
    expect(parseVeoAvatarRequest({ photo: 'x', speech: 'hi', voiceGender: 'robot' })).toEqual({ ok: false, field: 'voiceGender', code: 'invalid' });
  });

  // GG's tap 2026-10-17 07:54Z „ElevenLabs ხმა" chose a separate Georgian voice; it is Cloud TTS since MASTER TASK v3.1 PR 5d.
  it('a Georgian line is the Cloud TTS voice; English and Russian stay Veo\'s', () => {
    expect(avatarVoiceByTts('გადადი მაი ავატარ ჯიზე და დაიწყე')).toBe(true);
    expect(avatarVoiceByTts('Welcome to MyAvatar.ge')).toBe(false);
    expect(avatarVoiceByTts('Добро пожаловать')).toBe(false);
  });
  // GG 10:15Z: "the lip sync does not match at all" — Veo had been told only how long to talk. Tap 10:22Z „Veo ლაპარაკობს".
  it('a voiced prompt has Veo SAY the line in Latin letters at the voice\'s length, never in Georgian script', () => {
    const p = buildVeoAvatarPrompt({ speech: 'გადადი მაი ავატარ ჯიზე და დაიწყე', direction: 'იღიმის', voicedSec: 2.7 });
    expect(p).not.toContain('გადადი');
    expect(p).toContain('"gadadi mai avatar jize da daitsqe"');
    expect(p).toMatch(/speak aloud .*lips moving in sync with the words/);
    expect(p).toMatch(/no music/);
    expect(p).toContain('about 2.5 seconds');
    expect(p).toContain('იღიმის.');
    expect(buildVeoAvatarPrompt({ speech: 'x', direction: '', voicedSec: 7.9 })).toMatch(/whole clip/);
  });
  it('the line and the voiced clip sit at fixed paths named by the job', () => {
    expect(avatarVoicePath('abc')).toBe('avatar-veo/abc/voice.mp3');
    expect(avatarVoicedPath('abc')).toBe('avatar-veo/abc/voiced.mp4');
  });

  it('the negative prompt asks away music under the words, in nouns only', () => {
    expect(VEO_AVATAR_NEGATIVE).toContain('background music');
    expect(VEO_AVATAR_NEGATIVE).not.toMatch(/\b(no|don't|without|never)\b/i);
  });
});
