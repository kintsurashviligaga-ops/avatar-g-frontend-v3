/** @jest-environment node */
import { deckFileName, slideEntryName } from './deckZip';

describe('slide order survives the file manager', () => {
  it('THE TRAP: unpadded, "10" sorts before "2" — padding is what keeps the deck in order', () => {
    const names = [2, 10].map(slideEntryName).sort();
    expect(names).toEqual(['02-slide.png', '10-slide.png']);
  });

  it('pads single digits and leaves wide indices alone', () => {
    expect(slideEntryName(1)).toBe('01-slide.png');
    expect(slideEntryName(100)).toBe('100-slide.png');
  });
});

describe('the filename keeps the user’s own words', () => {
  it('keeps Georgian as Georgian rather than a row of dashes', () => {
    expect(deckFileName('ხელოვნური ინტელექტი', 'zip')).toBe('ხელოვნური-ინტელექტი.zip');
  });

  it('collapses punctuation and never leaves a leading or trailing dash', () => {
    expect(deckFileName('  Q4 — Results!!  ', 'zip')).toBe('Q4-Results.zip');
  });

  it('falls back rather than producing a nameless file', () => {
    expect(deckFileName('', 'zip')).toBe('deck.zip');
    expect(deckFileName('!!!', 'zip')).toBe('deck.zip');
    expect(deckFileName(undefined, 'zip')).toBe('deck.zip');
  });

  it('bounds the length so a pasted essay cannot become a filename', () => {
    expect(deckFileName('x'.repeat(500), 'zip').length).toBeLessThanOrEqual(44);
  });
});
