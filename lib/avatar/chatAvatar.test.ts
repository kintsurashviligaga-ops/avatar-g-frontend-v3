/** @jest-environment node */
/**
 * A talking avatar ordered in words (GG, 2026-10-17 07:39Z) finds a face where the Veo avatar is open, and Agent G's card
 * says what it will make before anything is charged.
 */
import { AVATAR_TEMPLATES } from '@/lib/studio/templates';
import { avatarAskLineText, avatarGenderFromText, avatarVoiceGender, avatarLineFit, avatarOfferText, avatarShortenText, avatarUnavailableText, stockAvatarFace } from './chatAvatar';

describe('Agent G in words, no card (GG 2026-10-18)', () => {
  it('asks for the line, says a closed door plainly, and asks to shorten — in ka · en · ru', () => {
    for (const l of ['ka', 'en', 'ru']) {
      expect(avatarAskLineText(l).length).toBeGreaterThan(10);
      expect(avatarUnavailableText(l).length).toBeGreaterThan(10);
      expect(avatarShortenText(12, l)).toContain('12');
    }
    expect(avatarAskLineText('en')).toContain('What should the avatar say?');
  });
  it('a short line fits; one past 200 characters or a Georgian line past ~8 s does not', () => {
    expect(avatarLineFit('გამარჯობა ყველას').fits).toBe(true);
    expect(avatarLineFit('Hello everyone').fits).toBe(true);
    expect(avatarLineFit('a'.repeat(201)).fits).toBe(false);
    const long = 'გამარჯობა ყველას, დღეს მოგიყვებით ჩვენს ახალ სერვისზე, რომელიც დაგეხმარებათ ვიდეოების შექმნაში და მათ გაზიარებაში მეგობრებთან ერთად';
    const fit = avatarLineFit(long);
    expect(fit.fits).toBe(false);
    expect(fit.seconds).toBeGreaterThan(8);
  });
});

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
    expect(t).toContain('ტუჩებს ფრაზა-ფრაზა მოერგება'); // GG 10:15Z: "approximately" was not true; 10:22Z tap
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

describe('one voice for the approval and every render path', () => {
  it.each([
    ['auto', 'Make a woman avatar that says: "Welcome aboard"', 'female'],
    ['auto', 'Создай аватар мужчины, который говорит: Добро пожаловать', 'male'],
    ['female', 'Make a man avatar that says: "Welcome aboard"', 'female'],
    ['male', 'Make a woman avatar that says: "Welcome aboard"', 'male'],
    ['auto', 'Make an avatar that says: "Every woman is welcome"', 'male'],
    ['auto', '', 'male'],
  ] as const)('selection %s resolves %s to a supported %s voice', (selection, text, expected) => {
    expect(avatarVoiceGender(selection, text)).toBe(expected);
  });
});
