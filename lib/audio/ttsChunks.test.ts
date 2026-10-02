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
});
