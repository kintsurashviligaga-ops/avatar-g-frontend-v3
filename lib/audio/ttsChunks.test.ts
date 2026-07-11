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
});
