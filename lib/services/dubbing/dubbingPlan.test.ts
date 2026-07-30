/** @jest-environment node */
/** Master Task §4.1 — the DubbingService suite, over the pure core. */
import {
  DUBBING_LANGUAGES,
  isDubbingLanguage,
  plannedSteps,
  normalizeSegments,
  speakerCount,
  srtTimestamp,
  toSrt,
  fitSpeed,
  overflowsSlot,
  dubbingMinutes,
  validateDubbingRequest,
  type DubbingSegment,
} from './dubbingPlan';

const SEGMENTS: DubbingSegment[] = [
  { startSec: 0, endSec: 2.5, text: 'We are out of time.', translated: 'ჩვენ დრო აღარ გვაქვს.', speaker: 'Man' },
  { startSec: 3, endSec: 4.25, text: 'I know.', translated: 'მე ვიცი.', speaker: 'Woman' },
];

describe('languages', () => {
  it('offers the 12 §2.3.2 targets, Georgian included', () => {
    expect(DUBBING_LANGUAGES).toContain('ka');
    expect(DUBBING_LANGUAGES).toHaveLength(12);
    expect(isDubbingLanguage('ka')).toBe(true);
    expect(isDubbingLanguage('xx')).toBe(false);
    expect(isDubbingLanguage(null)).toBe(false);
  });
});

describe('pipeline steps', () => {
  it('runs six steps by default and adds lip-sync only when asked', () => {
    expect(plannedSteps({})).toEqual(['extract_audio', 'transcribe', 'translate', 'synthesize', 'sync', 'mix']);
    expect(plannedSteps({ lipSync: true })).toHaveLength(7);
    expect(plannedSteps({ lipSync: true })[6]).toBe('lipsync');
  });
});

describe('segments', () => {
  it('drops unusable rows and sorts by start time', () => {
    const out = normalizeSegments([
      { startSec: 5, endSec: 6, text: 'second' },
      { startSec: 0, endSec: 1, text: 'first' },
      { startSec: 2, endSec: 2, text: 'zero length' },   // end must exceed start
      { startSec: 3, endSec: 1, text: 'inverted' },
      { startSec: 1, endSec: 2, text: '   ' },            // empty after trim
      { startSec: Number.NaN, endSec: 4, text: 'nan' },
      'junk',
    ]);
    expect(out.map((s) => s.text)).toEqual(['first', 'second']);
  });

  it('is total for junk input', () => {
    expect(normalizeSegments(null)).toEqual([]);
    expect(normalizeSegments('nope')).toEqual([]);
  });

  it('counts distinct speakers (drives multi-voice casting)', () => {
    expect(speakerCount(SEGMENTS)).toBe(2);
    expect(speakerCount([{ startSec: 0, endSec: 1, text: 'x' }])).toBe(0);
  });
});

describe('subtitles (.srt)', () => {
  it('formats timestamps as HH:MM:SS,mmm — comma, not period', () => {
    expect(srtTimestamp(0)).toBe('00:00:00,000');
    expect(srtTimestamp(3.5)).toBe('00:00:03,500');
    expect(srtTimestamp(61.25)).toBe('00:01:01,250');
    expect(srtTimestamp(3661.001)).toBe('01:01:01,001');
    expect(srtTimestamp(-5)).toBe('00:00:00,000'); // never emits a negative timestamp
  });

  it('renders a valid cue block using the TRANSLATED text', () => {
    const srt = toSrt(SEGMENTS);
    expect(srt).toContain('1\n00:00:00,000 --> 00:00:02,500\nჩვენ დრო აღარ გვაქვს.');
    expect(srt).toContain('2\n00:00:03,000 --> 00:00:04,250\nმე ვიცი.');
    // The subtitle track belongs to the dubbed audience — the source text must not leak into it.
    expect(srt).not.toContain('We are out of time.');
  });

  it('falls back to the original text so a partial translation still yields a usable file', () => {
    expect(toSrt([{ startSec: 0, endSec: 1, text: 'untranslated' }])).toContain('untranslated');
  });

  it('flattens newlines so a cue can never be split into two blocks', () => {
    const srt = toSrt([{ startSec: 0, endSec: 1, text: 'line one\nline two' }]);
    expect(srt).toContain('line one line two');
  });
});

describe('timing — the thing that decides whether dubbed speech lands on the mouth', () => {
  it('speeds up or slows down a segment to fit its slot', () => {
    expect(fitSpeed(2, 2)).toBe(1);
    expect(fitSpeed(2.2, 2)).toBeCloseTo(1.1, 5);   // translation ran long → speak faster
    expect(fitSpeed(1.8, 2)).toBeCloseTo(0.9, 5);   // ran short → slow down
  });

  it('clamps to [0.75, 1.25] — past that the voice chipmunks', () => {
    expect(fitSpeed(10, 2)).toBe(1.25);
    expect(fitSpeed(1, 10)).toBe(0.75);
  });

  it('reports when a segment cannot fit even at the limit, so the caller widens the slot', () => {
    expect(overflowsSlot(2.4, 2)).toBe(false); // 1.2× — fits
    expect(overflowsSlot(3, 2)).toBe(true);    // 1.5× — cannot
  });

  it('never returns NaN for junk input (a NaN speed would break the ffmpeg filter)', () => {
    for (const [a, b] of [[0, 2], [2, 0], [Number.NaN, 2], [-1, 2]] as const) {
      expect(Number.isFinite(fitSpeed(a, b))).toBe(true);
    }
  });
});

describe('cost basis', () => {
  it('bills per started minute (§1.8 prices dubbing per minute)', () => {
    expect(dubbingMinutes(0)).toBe(0);
    expect(dubbingMinutes(1)).toBe(1);
    expect(dubbingMinutes(60)).toBe(1);
    expect(dubbingMinutes(61)).toBe(2);
    expect(dubbingMinutes(Number.NaN)).toBe(0);
  });
});

describe('request validation', () => {
  const base = { sourceVideoUrl: 'https://x/v.mp4', targetLanguage: 'ka' };

  it('accepts a minimal request and applies the §3.2.8 defaults', () => {
    const r = validateDubbingRequest(base);
    expect(r.ok).toBe(true);
    expect(r.request).toMatchObject({
      sourceLanguage: 'auto',      // auto-detect
      targetLanguage: 'ka',
      voiceClone: true,            // ON
      preserveBackgroundAudio: true, // ON
      subtitles: true,             // ON
      lipSync: false,              // OFF — experimental
    });
  });

  it('rejects what it cannot dub, with a reason', () => {
    expect(validateDubbingRequest(null).ok).toBe(false);
    expect(validateDubbingRequest({ ...base, sourceVideoUrl: 'not-a-url' }).error).toMatch(/http/);
    expect(validateDubbingRequest({ ...base, targetLanguage: 'xx' }).error).toMatch(/targetLanguage/);
    // Same language in and out is a no-op that would still cost a full render.
    expect(validateDubbingRequest({ ...base, sourceLanguage: 'ka' }).error).toMatch(/same/);
  });

  it('honours explicit opt-outs and bounds speakerCount', () => {
    const r = validateDubbingRequest({ ...base, voiceClone: false, subtitles: false, lipSync: true, speakerCount: 999 });
    expect(r.request).toMatchObject({ voiceClone: false, subtitles: false, lipSync: true, speakerCount: 16 });
  });
});
