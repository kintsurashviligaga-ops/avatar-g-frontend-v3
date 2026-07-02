import {
  parseAdInputs,
  validateAdImageMeta,
  validateAdImageCount,
  isAdImageMime,
  base64ByteLength,
  AD_HOOK_MAX_CHARS,
  MAX_AD_IMAGES,
  AD_IMAGE_MAX_BYTES,
} from './adInputValidation';

describe('ad input validation (STEP 2.1)', () => {
  it('accepts a valid hook and trims; hook is required', () => {
    expect(parseAdInputs({ hook: '  Summer sale — 50% off  ' })).toEqual({
      ok: true,
      data: { brand: '', price: '', hook: 'Summer sale — 50% off' },
    });
    expect(parseAdInputs({ hook: '' }).ok).toBe(false);
    expect(parseAdInputs({}).ok).toBe(false);
  });

  it(`enforces the HARD ${AD_HOOK_MAX_CHARS}-char hook cap`, () => {
    const ok = 'x'.repeat(AD_HOOK_MAX_CHARS);
    const tooLong = 'x'.repeat(AD_HOOK_MAX_CHARS + 1);
    expect(parseAdInputs({ hook: ok }).ok).toBe(true);
    const bad = parseAdInputs({ hook: tooLong });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/≤ 60/);
  });

  it('accepts only jpeg/png/webp image mimes', () => {
    expect(isAdImageMime('image/jpeg')).toBe(true);
    expect(isAdImageMime('image/PNG')).toBe(true); // case-insensitive
    expect(isAdImageMime('image/gif')).toBe(false);
    expect(isAdImageMime('video/mp4')).toBe(false);
    expect(isAdImageMime(null)).toBe(false);
  });

  it('rejects oversized / empty images, accepts within 10MB', () => {
    expect(validateAdImageMeta({ contentType: 'image/png', sizeBytes: 5 * 1024 * 1024 }).ok).toBe(true);
    expect(validateAdImageMeta({ contentType: 'image/png', sizeBytes: AD_IMAGE_MAX_BYTES }).ok).toBe(true);
    expect(validateAdImageMeta({ contentType: 'image/png', sizeBytes: AD_IMAGE_MAX_BYTES + 1 }).ok).toBe(false);
    expect(validateAdImageMeta({ contentType: 'image/png', sizeBytes: 0 }).ok).toBe(false);
    expect(validateAdImageMeta({ contentType: 'image/gif', sizeBytes: 100 }).ok).toBe(false);
  });

  it(`caps image count at ${MAX_AD_IMAGES}`, () => {
    expect(validateAdImageCount(0).ok).toBe(true);
    expect(validateAdImageCount(MAX_AD_IMAGES).ok).toBe(true);
    expect(validateAdImageCount(MAX_AD_IMAGES + 1).ok).toBe(false);
  });

  it('computes base64 byte length for the server size-gate', () => {
    // "AAAA" (4 b64 chars, no padding) → 3 bytes
    expect(base64ByteLength('AAAA')).toBe(3);
    // 1MB of bytes → ceil base64; approximately equal
    const bytes = 1024 * 1024;
    const b64len = Math.ceil(bytes / 3) * 4;
    expect(Math.abs(base64ByteLength('A'.repeat(b64len)) - bytes)).toBeLessThan(4);
  });
});
