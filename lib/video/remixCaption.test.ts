/** @jest-environment node */
import { extractOverlayText, MAX_CAPTION_CHARS } from './remixCaption';

describe('THE BUG: a quick-action chip burned its own instruction onto the video', () => {
  it.each([
    'add a text overlay',
    'add subtitles',
    'добавь текст',
    'добавь субтитры',
    'ტექსტი დაამატე',
    'სუბტიტრები დაამატე',
  ])('refuses to caption a bare instruction: %s', (chip) => {
    expect(extractOverlayText(chip)).toBeNull();
  });
});

describe('quoted text wins outright', () => {
  it.each([
    ['add a caption "Hello world"', 'Hello world'],
    ['напиши «Привет»', 'Привет'],
    ['დაამატე „გამარჯობა“', 'გამარჯობა'],
    ["overlay 'Season 2'", 'Season 2'],
    ['put “Coming soon” on it', 'Coming soon'],
  ])('%s → %s', (msg, want) => {
    expect(extractOverlayText(msg)).toBe(want);
  });

  it('honours quotes even when the words themselves look like a command', () => {
    // The user explicitly asked for those letters — that is the whole point of quoting them.
    expect(extractOverlayText('burn in "add subtitles here"')).toBe('add subtitles here');
  });
});

describe('text after a colon', () => {
  it('takes what follows the colon', () => {
    expect(extractOverlayText('add a subtitle: welcome to Tbilisi')).toBe('welcome to Tbilisi');
    expect(extractOverlayText('текст: Привет мир')).toBe('Привет мир');
    expect(extractOverlayText('წარწერა: გამარჯობა')).toBe('გამარჯობა');
  });

  it('handles the full-width colon', () => {
    expect(extractOverlayText('text：hello')).toBe('hello');
  });

  it('does not treat a bare leading colon as a marker, and strips it off the caption', () => {
    expect(extractOverlayText(': orphaned')).toBe('orphaned');
  });

  it('collapses a multi-line tail to one line — the overlay draws a single line', () => {
    expect(extractOverlayText('caption:\n  first\n  second')).toBe('first second');
  });
});

describe('a message with no instruction word IS the caption', () => {
  it('accepts plain words', () => {
    expect(extractOverlayText('Summer 2026')).toBe('Summer 2026');
    expect(extractOverlayText('გამარჯობა საქართველო')).toBe('გამარჯობა საქართველო');
  });

  it('still refuses when an instruction word is present anywhere', () => {
    expect(extractOverlayText('make it nice and add a title')).toBeNull();
  });
});

describe('bounds and junk', () => {
  it('caps the caption length', () => {
    const long = 'a'.repeat(400);
    expect(extractOverlayText(long)?.length).toBe(MAX_CAPTION_CHARS);
  });

  it('is total on degenerate input', () => {
    expect(extractOverlayText('')).toBeNull();
    expect(extractOverlayText('   ')).toBeNull();
    expect(extractOverlayText(null)).toBeNull();
    expect(extractOverlayText(undefined)).toBeNull();
    expect(extractOverlayText(42)).toBeNull();
    expect(extractOverlayText('""')).toBeNull();
  });
});
