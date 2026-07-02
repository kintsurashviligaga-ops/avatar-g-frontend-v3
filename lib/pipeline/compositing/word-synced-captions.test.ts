import {
  alignmentToWords,
  wordsToSegments,
  alignmentToCaptionSegments,
  enableBetween,
  buildCaptionOverlayFilter,
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

  it('buildCaptionOverlayFilter chains one gated overlay per segment → [vout]', () => {
    const segs = [
      { startSec: 0, endSec: 1 },
      { startSec: 1, endSec: 2.5 },
    ];
    const f = buildCaptionOverlayFilter(segs);
    // input order: [0:v]=video, [1:v],[2:v]=strips; single visible caption at a time
    expect(f).toBe(
      "[0:v][1:v]overlay=0:H-h:enable='between(t,0,1)'[cap0];" +
        "[cap0][2:v]overlay=0:H-h:enable='between(t,1,2.5)'[vout]",
    );
    expect(buildCaptionOverlayFilter([])).toBe(''); // no captions → no-op
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

// End-to-end confidence for the 2.6 caption path, which has NEVER run against live TTS: drive a
// full realistic Georgian ad hook through the whole chain and assert temporal correctness.
describe('2.6 caption pipeline — full-hook integration (path never run live)', () => {
  const HOOK = 'ახალი დღე ახალი ფასდაკლება დღეს მხოლოდ';
  const a = fixture(HOOK);

  it('segments form a gap-free, ordered timeline that covers the whole audio and drops no word', () => {
    const words = alignmentToWords(a);
    const segs = alignmentToCaptionSegments(a, { maxWords: 3 });
    expect(segs.length).toBeGreaterThan(1);
    // spans first word start → last word end
    expect(segs[0]!.startSec).toBeCloseTo(words[0]!.startSec, 3);
    expect(segs.at(-1)!.endSec).toBeCloseTo(words.at(-1)!.endSec, 3);
    // ordered, non-overlapping (only one caption visible at a time)
    for (let i = 1; i < segs.length; i++) expect(segs[i]!.startSec).toBeGreaterThanOrEqual(segs[i - 1]!.endSec - 1e-6);
    // every word lands in exactly one segment — nothing dropped or duplicated
    expect(segs.flatMap((s) => s.text.split(' '))).toEqual(words.map((w) => w.text));
  });

  it('overlay filter emits one enable window per segment, matching the segment times, ending in [vout]', () => {
    const segs = alignmentToCaptionSegments(a, { maxWords: 3 });
    const f = buildCaptionOverlayFilter(segs);
    const windows = [...f.matchAll(/between\(t,([\d.]+),([\d.]+)\)/g)].map((m) => [Number(m[1]), Number(m[2])] as const);
    expect(windows.length).toBe(segs.length);
    windows.forEach(([s, e], i) => {
      expect(s).toBeCloseTo(Math.max(0, segs[i]!.startSec), 2);
      expect(e).toBeCloseTo(segs[i]!.endSec, 2);
    });
    expect(f.endsWith('[vout]')).toBe(true);
    // one caption strip input per segment, indexed sequentially [1:v]..[N:v]
    for (let i = 0; i < segs.length; i++) expect(f).toContain(`[${i + 1}:v]`);
  });
});
