/** @jest-environment node */
/**
 * A talking avatar ordered in words (GG, 2026-10-17 07:39Z) finds a face where the Veo avatar is open, and Agent G's card
 * says what it will make before anything is charged.
 */
import { AVATAR_TEMPLATES } from '@/lib/studio/templates';
import { avatarGenderFromText, avatarOfferText, stockAvatarFace } from './chatAvatar';

describe('stockAvatarFace', () => {
  it('picks a ready presenter of the voice’s gender in the frame asked for', () => {
    for (const gender of ['female', 'male'] as const) {
      for (const aspect of ['9:16', '16:9'] as const) {
        const face = stockAvatarFace(gender, aspect);
        const t = AVATAR_TEMPLATES.find((x) => x.values.preset === face)!;
        expect(t.values.gender).toBe(gender);
        expect(t.values.format).toBe(aspect);
        expect(face).toMatch(/^\/avatars\/preset-\d\.jpg$/);
      }
    }
  });
});

describe('avatarGenderFromText', () => {
  it('reads the voice from the words around the line, in ka · en · ru', () => {
    expect(avatarGenderFromText('შექმენი ქალი ავატარი, რომელიც ამბობს: გამარჯობა')).toBe('female');
    expect(avatarGenderFromText('შექმენი ავატარი კაცის ხმით, რომელიც ამბობს: გამარჯობა')).toBe('male');
    expect(avatarGenderFromText('Make a woman avatar that says: "Welcome aboard"')).toBe('female');
    expect(avatarGenderFromText('Создай аватар мужчины, который говорит: Добро пожаловать')).toBe('male');
  });

  it('never casts from the spoken line itself, and names none when the order names none', () => {
    expect(avatarGenderFromText('შექმენი ავატარი რომელიც ამბობს ქართულად: ქალბატონებო და ბატონებო, მოგესალმებით')).toBeNull();
    expect(avatarGenderFromText('შექმენი ავატარი რომელიც ამბობს ქართულად: გადადი მაი ავატარ ჯიზე და დაიწყე')).toBeNull();
    expect(avatarGenderFromText('Make an avatar that says: "Every woman and man is welcome"')).toBeNull();
    // „ქალაქი" (a city) is not „ქალი".
    expect(avatarGenderFromText('შექმენი ავატარი ქალაქის ფონზე, რომელიც ამბობს: გამარჯობა')).toBeNull();
  });
});

describe('avatarOfferText', () => {
  const base = { speech: 'გადადი მაი ავატარ ჯიზე და დაიწყე', direction: '', gender: 'female' as const, aspect: '9:16' as const, face: 'stock' as const, credits: 25, locale: 'ka' };

  it('GG’s order: the line, the ElevenLabs Georgian voice, a ready presenter, 8 s, the price, and a question', () => {
    const t = avatarOfferText(base);
    expect(t).toContain('„გადადი მაი ავატარ ჯიზე და დაიწყე“');
    expect(t).toContain('ElevenLabs');
    expect(t).toContain('ქალის ხმა');
    expect(t).toContain('ტუჩები მას ბგერა-ბგერა მიჰყვება'); // GG 12:29Z: sync.so draws the mouth to the voice
    expect(t).not.toContain('მიახლოებით');
    expect(t).toContain('მზა წამყვანი');
    expect(t).toContain('8 წამიან');
    expect(t).toContain('25 კრედიტი');
    expect(t.trim().endsWith('დავიწყო?')).toBe(true);
  });

  it('a line in English keeps the video engine’s own voice; the face and the direction are named', () => {
    const t = avatarOfferText({ ...base, speech: 'Welcome aboard', direction: 'smiling', face: 'photo', aspect: '16:9', credits: 25, locale: 'en' });
    expect(t).not.toContain('ElevenLabs');
    expect(t).toContain('engine’s own voice');
    expect(t).toContain('your photo');
    expect(t).toContain('smiling');
    expect(t).toContain('(16:9)');
    expect(t).toContain('25 credits');
  });

  it('Russian copy, and the preset picked in the panel', () => {
    const t = avatarOfferText({ ...base, gender: 'male', face: 'preset', locale: 'ru' });
    expect(t).toContain('мужской голос (ElevenLabs)');
    expect(t).toContain('панели');
    expect(t).toContain('Начать?');
  });
});
