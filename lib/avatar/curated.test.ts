import { AVATAR_TEMPLATES } from '../studio/templates';
import { CURATED_AVATAR_FACES, CUSTOM_AVATAR_GAP, curatedAvatarFace, customAvatarBody, customAvatarText } from './curated';
import { stockAvatarFace } from './chatAvatar';

describe('built-in avatars only (GG, 2026-10-22; MASTER TASK v3.1 PR 9)', () => {
  it('the built-in faces are the Avatar panel\'s presets, and every ready presenter is one of them', () => {
    expect(CURATED_AVATAR_FACES).toEqual([...new Set(AVATAR_TEMPLATES.map((t) => t.values.preset))]);
    for (const gender of ['female', 'male'] as const) {
      for (const aspect of ['9:16', '16:9'] as const) expect(curatedAvatarFace(stockAvatarFace(gender, aspect))).not.toBeNull();
    }
  });

  it.each([
    'data:image/jpeg;base64,/9j/4AAQ',
    'https://x.supabase.co/storage/v1/object/sign/twin/u/front.jpg?token=t',
    'omni-uploads/u/face.jpg',
    '/avatars/preset-9.jpg',
    '/avatars/../og-image.png',
    ' /avatars/preset-2.jpg',
    '',
    null,
    42,
  ])('%p is not a built-in face', (face) => {
    expect(curatedAvatarFace(face)).toBeNull();
  });

  it('names the gap in each language, says nothing was charged, and that the draft is kept only when it is', () => {
    expect(customAvatarText('en')).toMatch(/Custom avatars are not available yet.*built-in avatars.*Nothing was charged\.$/);
    expect(customAvatarText('en', { kept: true })).toMatch(/Nothing was charged\. Your message is kept\.$/);
    expect(customAvatarText('ka')).toMatch(/მზა ავატარი/);
    expect(customAvatarText('ka', { kept: true })).toMatch(/შენი ტექსტი შენახულია\.$/);
    expect(customAvatarText('ru')).toMatch(/готовых аватаров/);
    expect(customAvatarText('de')).toBe(customAvatarText('ka'));
  });

  it('every entry point answers with the same body', () => {
    expect(customAvatarBody('en')).toEqual({
      success: false, error: 'capability_unavailable', code: 'capability_unavailable', gap: CUSTOM_AVATAR_GAP,
      message: customAvatarText('en'), refunded: false,
    });
  });
});
