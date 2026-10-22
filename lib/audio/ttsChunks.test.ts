import { chunkForTts } from './ttsChunks';

describe('chunkForTts', () => {
  test('empty / whitespace → []', () => {
    expect(chunkForTts('')).toEqual([]);
    expect(chunkForTts('   ')).toEqual([]);
  });

  test('short text → one chunk', () => {
    expect(chunkForTts('გამარჯობა, როგორ ხარ?')).toEqual(['გამარჯობა, როგორ ხარ?']);
  });

  test('merges sentences up to the max, splits beyond it', () => {
    const s = 'A. B. C.';
    expect(chunkForTts(s, 6)).toEqual(['A. B.', 'C.']); // "A. B." = 5 ≤ 6; +" C." would be 8 > 6
  });

  test('hard-splits a runaway sentence with no terminator', () => {
    const long = 'x'.repeat(1300);
    const chunks = chunkForTts(long, 600);
    expect(chunks).toEqual([long.slice(0, 600), long.slice(600, 1200), long.slice(1200)]);
  });

  test('Georgian sentence terminators split correctly', () => {
    expect(chunkForTts('ერთი. ორი. სამი.', 11)).toEqual(['ერთი. ორი.', 'სამი.']);
  });

  test('leadSentence: the first sentence is a chunk of its own, the rest merge as before', () => {
    expect(chunkForTts('გამარჯობა! ამინდი თბილისში თბილია. ხვალ წვიმაა.', 600, { leadSentence: true }))
      .toEqual(['გამარჯობა!', 'ამინდი თბილისში თბილია. ხვალ წვიმაა.']);
    // A first sentence longer than leadMax is not split out; nothing changes without the option.
    expect(chunkForTts('A long first one. B.', 600, { leadSentence: true, leadMax: 5 })).toEqual(['A long first one. B.']);
    expect(chunkForTts('Hi. There.', 600)).toEqual(['Hi. There.']);
  });

  test('leadSentence: the first chunk of a growing text is final once the second sentence starts', () => {
    expect(chunkForTts('Sure, here', 600, { leadSentence: true })).toEqual(['Sure, here']);
    expect(chunkForTts('Sure, here it is. The', 600, { leadSentence: true })).toEqual(['Sure, here it is.', 'The']);
    expect(chunkForTts('Sure, here it is. The answer is 4.', 600, { leadSentence: true })[0]).toBe('Sure, here it is.');
  });

  test.each([
    'natural speech needs whole words at every boundary',
    'გამართული მეტყველება სიტყვების საზღვრებს უნდა ინარჩუნებდეს',
    'Ровная речь сохраняет слова целиком на границах',
  ])('a long sentence breaks at words instead of splitting their pronunciation: %s', (text) => {
    const chunks = chunkForTts(text, 18);
    expect(chunks.join(' ')).toBe(text);
    expect(chunks.every(c => c.length <= 18 && c === c.trim())).toBe(true);
  });

  test('an isolated lead sentence still obeys the request size bound', () => {
    const chunks = chunkForTts('This is a complete first sentence. The rest.', 18, { leadSentence: true });
    expect(chunks.every(c => c.length <= 18)).toBe(true);
    expect(chunks.join(' ')).toBe('This is a complete first sentence. The rest.');
  });

  test('hard splits retain every Unicode character without broken surrogate pairs', () => {
    const text = 'a😀😀😀😀😀😀';
    const chunks = chunkForTts(text, 4);
    expect(chunks.join('')).toBe(text);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(4);
      expect(chunk).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);
    }
  });

  test('leading punctuation is retained rather than silently dropped', () => {
    expect(chunkForTts('?! Keep all words.', 600)).toEqual(['?! Keep all words.']);
    expect(chunkForTts('?! Keep all words.', 600, { leadSentence: true })).toEqual(['?! Keep all words.']);
  });

  test.each([0, 1, -2, NaN, Infinity, 2.5])('an invalid size %s is refused instead of looping or splitting a Unicode pair', (size) => {
    expect(() => chunkForTts('a long enough sentence', size)).toThrow(RangeError);
  });

  test('all normalized text survives a realistic multilingual read within the existing 180-unit limit', () => {
    const text = 'Hello 😀. გამართული ტექსტი სიტყვებს სრულად ინარჩუნებს და დასასრულამდე იკითხება. Ровная речь сохраняет каждое слово. '.repeat(30).trim();
    const chunks = chunkForTts(text, 180, { leadSentence: true });
    expect(chunks.join(' ')).toBe(text);
    expect(chunks.every(c => c.length <= 180)).toBe(true);
  });
});
