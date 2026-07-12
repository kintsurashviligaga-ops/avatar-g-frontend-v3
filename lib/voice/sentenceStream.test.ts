/** @jest-environment node */
import { createSentenceAccumulator } from './sentenceStream';

describe('createSentenceAccumulator', () => {
  test('emits a sentence as soon as it closes, buffers the rest', () => {
    const acc = createSentenceAccumulator();
    expect(acc.push('Hello there. How ')).toEqual(['Hello there.']);
    expect(acc.push('are you today?')).toEqual(['How are you today?']);
    expect(acc.flush()).toBeNull(); // nothing left
  });

  test('handles deltas that split a sentence mid-word', () => {
    const acc = createSentenceAccumulator();
    expect(acc.push('The quick brown fo')).toEqual([]);
    expect(acc.push('x jumps.')).toEqual(['The quick brown fox jumps.']);
  });

  test('does NOT split decimals or mid-number punctuation', () => {
    const acc = createSentenceAccumulator();
    // "3.5" — the '.' is followed by a digit, not whitespace → not a boundary
    expect(acc.push('It costs 3.5 dollars total')).toEqual([]);
    expect(acc.push(' now.')).toEqual(['It costs 3.5 dollars total now.']);
  });

  test('flushes the tail (no trailing punctuation) once the stream ends', () => {
    const acc = createSentenceAccumulator();
    expect(acc.push('A short reply with no period')).toEqual([]);
    expect(acc.flush()).toBe('A short reply with no period');
  });

  test('splits on ! and ? and newlines too', () => {
    const acc = createSentenceAccumulator();
    expect(acc.push('That is amazing! Do you like it? ')).toEqual(['That is amazing!', 'Do you like it?']);
    const acc2 = createSentenceAccumulator();
    // "Line one" (8 chars) closes on the newline; "Line two" has no terminal boundary → only via flush.
    expect(acc2.push('Line one\nLine two here.')).toEqual(['Line one', 'Line two here.']);
  });

  test('force-flushes a punctuation-less run-on past maxChars at a word boundary', () => {
    const acc = createSentenceAccumulator({ maxChars: 40 });
    const runOn = 'word '.repeat(20); // 100 chars, no sentence punctuation
    const out = acc.push(runOn);
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out.every((s) => s.length <= 45)).toBe(true); // chunked near maxChars, not one giant blob
    expect(out.every((s) => !s.endsWith(' '))).toBe(true); // trimmed at spaces
  });

  test('a very short first fragment (abbreviation) is carried into the next sentence, not spoken alone', () => {
    const acc = createSentenceAccumulator({ minChars: 8 });
    // "Hi." is < 8 chars → should not be emitted on its own; it rides along until a real sentence closes
    const out = acc.push('Hi. Welcome to the studio.');
    expect(out).toEqual(['Hi. Welcome to the studio.']);
  });

  test('the whole reply arriving in one delta still yields sentences (blocking-fallback path)', () => {
    const acc = createSentenceAccumulator();
    const out = acc.push('First sentence here. Second one follows. Third and last!');
    expect(out).toEqual(['First sentence here.', 'Second one follows.', 'Third and last!']);
    expect(acc.flush()).toBeNull();
  });
});
