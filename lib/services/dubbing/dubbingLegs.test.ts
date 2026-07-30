/** @jest-environment node */
import { groupWordsIntoSegments } from './elevenScribe';
import { parseNumberedLines, languageName } from './translateSegments';
import { assignVoices } from './voiceCast';

describe('Scribe word grouping (leg 2)', () => {
  const w = (text: string, start: number, end: number, speaker?: string) => ({
    text, start, end, ...(speaker ? { speaker_id: speaker } : {}),
  });

  it('joins consecutive words of one speaker into a single utterance', () => {
    const segs = groupWordsIntoSegments([w('გამარჯობა', 0, 0.6, 's0'), w('ძმაო', 0.65, 1.1, 's0')]);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ text: 'გამარჯობა ძმაო', startSec: 0, endSec: 1.1, speaker: 's0' });
  });

  it('breaks on a speaker change even with no pause — that is a new mouth, not a new sentence', () => {
    const segs = groupWordsIntoSegments([w('Hello', 0, 0.5, 's0'), w('Hi', 0.52, 0.9, 's1')]);
    expect(segs.map((s) => s.speaker)).toEqual(['s0', 's1']);
  });

  it('breaks on a long pause within one speaker', () => {
    const segs = groupWordsIntoSegments([w('One', 0, 0.4, 's0'), w('Two', 3.0, 3.4, 's0')]);
    expect(segs).toHaveLength(2);
  });

  it('caps a run at 12s so a monologue stays fittable onto the original timing', () => {
    // Words 0.5s apart for 30s: under the gap threshold throughout, so only the length cap can split it.
    const words = Array.from({ length: 40 }, (_, i) => w(`w${i}`, i * 0.75, i * 0.75 + 0.5, 's0'));
    const segs = groupWordsIntoSegments(words);
    expect(segs.length).toBeGreaterThan(1);
    for (const s of segs) expect(s.endSec - s.startSec).toBeLessThanOrEqual(13);
  });

  it('drops spacing entries and malformed words instead of emitting empty or reversed segments', () => {
    const segs = groupWordsIntoSegments([
      { text: ' ', start: 0, end: 0.1, type: 'spacing' },
      w('', 0.2, 0.4, 's0'),
      { text: 'bad', start: 2, end: 1 },          // end before start
      { text: 'nan', start: Number.NaN, end: 1 }, // unusable timing
      w('good', 1, 1.5, 's0'),
    ]);
    expect(segs).toEqual([{ startSec: 1, endSec: 1.5, text: 'good', speaker: 's0' }]);
  });

  it('omits speaker entirely when diarization returned none, rather than inventing one', () => {
    const segs = groupWordsIntoSegments([w('solo', 0, 1)]);
    expect(segs[0].speaker).toBeUndefined();
  });
});

describe('numbered-translation parsing (leg 3)', () => {
  it('parses a clean numbered block', () => {
    expect(parseNumberedLines('1. Hello\n2. World', 2)).toEqual(['Hello', 'World']);
  });

  it('accepts the ) and : delimiters models drift to', () => {
    expect(parseNumberedLines('1) Hello\n2: World', 2)).toEqual(['Hello', 'World']);
  });

  it('REJECTS a short answer — a partial parse would silently mute the missing lines', () => {
    expect(parseNumberedLines('1. Hello', 2)).toBeNull();
    expect(parseNumberedLines('1. Hello\n2.\n3. Third', 3)).toBeNull();
  });

  it('ignores preamble, out-of-range numbers and repeated numbers (first write wins)', () => {
    expect(parseNumberedLines('Sure! Here you go:\n1. Hello\n1. IGNORED\n2. World\n9. Stray', 2))
      .toEqual(['Hello', 'World']);
  });

  it('names languages for the model — a bare ISO code means nothing in a prompt', () => {
    expect(languageName('ka')).toBe('Georgian');
    expect(languageName('zh')).toBe('Mandarin Chinese');
    expect(languageName('xx')).toBe('xx');
  });
});

describe('voice assignment (leg 4)', () => {
  const seg = (speaker?: string) => ({ startSec: 0, endSec: 1, text: 't', ...(speaker ? { speaker } : {}) });
  const OLD = { ...process.env };
  beforeEach(() => {
    process.env.ELEVENLABS_VOICE_ID_FEMALE = 'vF';
    process.env.ELEVENLABS_VOICE_ID_MALE = 'vM';
  });
  afterEach(() => { process.env = { ...OLD }; });

  it('gives each diarized speaker a different voice', () => {
    const m = assignVoices([seg('s0'), seg('s1')]);
    expect(m.get('s0')).toBe('vF');
    expect(m.get('s1')).toBe('vM');
  });

  it('alternates beyond the two configured voices rather than dropping a speaker', () => {
    const m = assignVoices([seg('s0'), seg('s1'), seg('s2')]);
    expect(m.get('s2')).toBe('vF');
    expect([...m.values()].every(Boolean)).toBe(true);
  });

  it('an explicit voice override reads every part, including undiarized segments', () => {
    const m = assignVoices([seg('s0'), seg('s1'), seg()], 'chosen');
    expect([...new Set(m.values())]).toEqual(['chosen']);
    expect(m.get('_')).toBe('chosen');
  });

  it('falls back to the single generic voice when the gendered pair is unset', () => {
    delete process.env.ELEVENLABS_VOICE_ID_FEMALE;
    delete process.env.ELEVENLABS_VOICE_ID_MALE;
    process.env.ELEVENLABS_VOICE_ID = 'vOnly';
    expect(assignVoices([seg('s0')]).get('s0')).toBe('vOnly');
  });
});
