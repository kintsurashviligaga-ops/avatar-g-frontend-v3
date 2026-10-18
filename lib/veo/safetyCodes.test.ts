/** @jest-environment node */
import { asVeoSafetyCategory, veoSafetyCategory } from './safetyCodes';

describe('veoSafetyCategory — Google support codes → its safety category', () => {
  it.each([
    [['15236754'], 'celebrity'], // the ad film's scene 2, 2026-10-15
    [['29310472'], 'celebrity'],
    [['58061214'], 'child'],
    [['17301594'], 'child'],
    [['64151117'], 'video_safety'],
    [['62263041'], 'dangerous'],
    [['35561575'], 'third_party'],
    [['32635315'], 'vulgar'],
  ])('%j → %s', (codes, category) => {
    expect(veoSafetyCategory(codes)).toBe(category);
  });

  it('takes the first code the table knows', () => {
    expect(veoSafetyCategory(['99999999', '15236754', '58061214'])).toBe('celebrity');
  });

  it('an unlisted code, no code, or junk is null (no guessed category)', () => {
    expect(veoSafetyCategory(['12345678'])).toBeNull();
    expect(veoSafetyCategory([])).toBeNull();
    expect(veoSafetyCategory(undefined)).toBeNull();
    expect(veoSafetyCategory([' 15236754 '])).toBe('celebrity');
  });

  it('reads a category back off the wire only when it is one of the table categories', () => {
    expect(asVeoSafetyCategory('celebrity')).toBe('celebrity');
    expect(asVeoSafetyCategory('nonsense')).toBeNull();
    expect(asVeoSafetyCategory(15236754)).toBeNull();
    expect(asVeoSafetyCategory(null)).toBeNull();
  });
});
