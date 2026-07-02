import {
  alignmentToWords,
  wordsToSegments,
  alignmentToCaptionSegments,
  enableBetween,
  type ElevenAlignment,
} from './word-synced-captions';

/** Build a fixture ElevenLabs alignment from a phrase: each character gets a 0.1s slot,
 *  spaces included (as the real with-timestamps response does). No live/paid TTS needed. */
function fixture(phrase: string, slot = 0.1): ElevenAlignment {
  const characters = [...phrase];
  const character_start_times_seconds: number[] = [];
  const character_end_times_seconds: number[] = [];
  characters.forEach((_, i) => {
    character_start_times_seconds.push(+(i * slot).toFixed(3));
    character_end_times_seconds.push(+((i + 1) * slot).toFixed(3));
  });
  return { characters, character_start_times_seconds, character_end_times_seconds };
}

describe('word-synced captions (Georgian fixture, no live TTS)', () => {
  // "ის დილა ყველაფერს ცვლის" — from the „ის დილა" dialogue.
  const KA = 'ის დილა ყველაფერს ცვლის';
  const align = fixture(KA);

  it('groups characters into words with real first-char/last-char timings', () => {
    const words = alignmentToWords(align);
    expect(words.map((w) => w.text)).toEqual(['ის', 'დილა', 'ყველაფერს', 'ცვლის']);
    // "ის" = chars 0,1 → start 0.0, end 0.2
    expect(words[0]!.startSec).toBeCloseTo(0.0, 3);
    expect(words[0]!.endSec).toBeCloseTo(0.2, 3);
    // "დილა" starts at char index 3 (after "ის "+space) → 0.3
    expect(words[1]!.startSec).toBeCloseTo(0.3, 3);
    // monotonic, non-overlapping-ish
    for (let i = 1; i < words.length; i++) expect(words[i]!.startSec).toBeGreaterThanOrEqual(words[i - 1]!.endSec - 1e-6);
  });

  it('packs words into ≤maxWords cards, each timed to its own words', () => {
    const segs = wordsToSegments(alignmentToWords(align), { maxWords: 2, maxChars: 100 });
    expect(segs.map((s) => s.text)).toEqual(['ის დილა', 'ყველაფერს ცვლის']);
    expect(segs[0]!.startSec).toBeCloseTo(0.0, 3);
    expect(segs[0]!.endSec).toBeCloseTo(words_end(align, 'დილა'), 3);
    // no gap/overlap contradiction: seg2 starts at/after seg1 end
    expect(segs[1]!.startSec).toBeGreaterThanOrEqual(segs[0]!.endSec - 1e-6);
  });

  it('breaks a card early on sentence punctuation', () => {
    const a = fixture('გამარჯობა. ეს ტესტია');
    const segs = alignmentToCaptionSegments(a, { maxWords: 5 });
    expect(segs[0]!.text).toBe('გამარჯობა.'); // flushed by the period despite maxWords=5
  });

  it('respects maxChars so a long Georgian word gets its own card', () => {
    const segs = alignmentToCaptionSegments(align, { maxWords: 3, maxChars: 10 });
    // "ყველაფერს" (9 chars) can't share with "დილა" under maxChars=10
    expect(segs.some((s) => s.text === 'ყველაფერს')).toBe(true);
  });

  it('enableBetween emits a clamped, compact ffmpeg expression', () => {
    expect(enableBetween({ startSec: 0, endSec: 0.2 })).toBe('between(t,0,0.2)');
    expect(enableBetween({ startSec: -1, endSec: 0.5 })).toBe('between(t,0,0.5)');
  });

  it('handles empty / malformed alignment without throwing', () => {
    expect(alignmentToCaptionSegments({ characters: [], character_start_times_seconds: [], character_end_times_seconds: [] })).toEqual([]);
    // mismatched lengths → clamp to the shortest
    expect(() => alignmentToWords({ characters: ['a', 'b'], character_start_times_seconds: [0], character_end_times_seconds: [] })).not.toThrow();
  });
});

function words_end(a: ElevenAlignment, word: string): number {
  const w = alignmentToWords(a).find((x) => x.text === word);
  return w ? w.endSec : 0;
}
