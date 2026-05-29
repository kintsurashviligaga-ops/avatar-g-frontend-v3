import { sanitizeTitle, MAX_TITLE_WORDS, MAX_TITLE_CHARS } from './titleClient';

describe('sanitizeTitle', () => {
  it('returns empty string for junk / empty input', () => {
    expect(sanitizeTitle('')).toBe('');
    expect(sanitizeTitle('   ')).toBe('');
    // @ts-expect-error — exercising the runtime guard against non-strings
    expect(sanitizeTitle(null)).toBe('');
    expect(sanitizeTitle('"""')).toBe('');
  });

  it('strips surrounding quotes and a leading "Title:" prefix', () => {
    expect(sanitizeTitle('"Cinematic Avatar Reel"')).toBe('Cinematic Avatar Reel');
    expect(sanitizeTitle('Title: Studio Apartment Layout')).toBe('Studio Apartment Layout');
    expect(sanitizeTitle('“Smart Marketing Plan”')).toBe('Smart Marketing Plan');
  });

  it('clamps to at most MAX_TITLE_WORDS words', () => {
    const out = sanitizeTitle('one two three four five six');
    expect(out.split(' ')).toHaveLength(MAX_TITLE_WORDS);
    expect(out).toBe('one two three four');
  });

  it('drops trailing punctuation and markdown noise', () => {
    expect(sanitizeTitle('**Bold Title.**')).toBe('Bold Title');
    expect(sanitizeTitle('Quick Question?')).toBe('Quick Question');
    expect(sanitizeTitle('`code title`')).toBe('code title');
  });

  it('keeps only the first non-empty line', () => {
    expect(sanitizeTitle('\n\nFirst Line\nSecond line ignored')).toBe('First Line');
  });

  it('collapses internal whitespace', () => {
    expect(sanitizeTitle('Spaced    Out   Title')).toBe('Spaced Out Title');
  });

  it('enforces the hard character cap with an ellipsis', () => {
    const longWord = 'a'.repeat(80);
    const out = sanitizeTitle(longWord);
    expect(out.length).toBeLessThanOrEqual(MAX_TITLE_CHARS + 1); // +1 for the ellipsis
    expect(out.endsWith('…')).toBe(true);
  });

  it('preserves a clean short title unchanged', () => {
    expect(sanitizeTitle('Georgian Travel Guide')).toBe('Georgian Travel Guide');
  });
});
