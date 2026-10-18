/** @jest-environment node */
/**
 * The film voice check (the owner's audit, 2026-10-17, item 3): what ElevenLabs read is compared with what Scribe heard,
 * a read that lost words is read once more, and the narration's own words are timed for the subtitles a user may ask for.
 * Pure: the reads and the listening are stubs here, no network, no spend.
 */
import {
  VOICE_PASS,
  VOICE_REFUSE,
  normalizeSpoken,
  spokenSimilarity,
  voiceVerdict,
  timeScriptWords,
  checkFilmVoice,
  wantsSubtitles,
  type Heard,
  type HeardWord,
} from './filmVoiceCheck';
import { alignmentToWords, wordsToAlignment, alignmentToCaptionSegments } from '@/lib/pipeline/compositing/word-synced-captions';

const KA = 'წარმოგიდგენთ ახალ ქართულ სტუდიას. ერთი ფანჯრიდან ქმნით ვიდეოს, ხმას და მუსიკას.';

/** Scribe's words for a text, one word per 0.5 s (a stand-in for a clean read). */
const heardEvenly = (text: string, step = 0.5): HeardWord[] =>
  normalizeSpoken(text).split(' ').filter(Boolean).map((w, i) => ({ text: w, startSec: i * step, endSec: i * step + step * 0.8 }));

describe('spokenSimilarity', () => {
  test('the same words score 1 whatever the punctuation, case or spacing', () => {
    expect(spokenSimilarity(KA, KA)).toBe(1);
    expect(spokenSimilarity('Meet the new studio.', 'meet  the NEW studio')).toBe(1);
    // A word Scribe split in two, or two it joined, costs nothing.
    expect(spokenSimilarity('ერთი ფანჯრიდან', 'ერთიფანჯრიდან')).toBe(1);
  });

  test('a misheard letter or two keeps a clean read well above the pass mark', () => {
    const misheard = KA.replace('სტუდიას', 'სტუდიის').replace('ქმნით', 'ქმნი');
    expect(spokenSimilarity(KA, misheard)).toBeGreaterThan(0.95);
  });

  test('a read that skipped a sentence falls below the pass mark; one that lost most of it, below the refusal mark', () => {
    const halfSaid = 'წარმოგიდგენთ ახალ ქართულ სტუდიას.';
    const s = spokenSimilarity(KA, halfSaid);
    expect(s).toBeLessThan(VOICE_PASS);
    expect(spokenSimilarity(KA, 'ახალ')).toBeLessThan(VOICE_REFUSE);
  });

  test('nothing heard scores 0; nothing expected and nothing heard scores 1', () => {
    expect(spokenSimilarity(KA, '')).toBe(0);
    expect(spokenSimilarity('', '')).toBe(1);
  });
});

describe('voiceVerdict', () => {
  test('pass at or above the pass mark, weak between, fail below the refusal mark', () => {
    expect(voiceVerdict(VOICE_PASS)).toBe('pass');
    expect(voiceVerdict(0.99)).toBe('pass');
    expect(voiceVerdict(VOICE_PASS - 0.01)).toBe('weak');
    expect(voiceVerdict(VOICE_REFUSE)).toBe('weak');
    expect(voiceVerdict(VOICE_REFUSE - 0.01)).toBe('fail');
    expect(voiceVerdict(0)).toBe('fail');
  });
});

describe('timeScriptWords', () => {
  test('every word of the script, as written, takes the time Scribe heard it at', () => {
    const heard = heardEvenly(KA);
    const words = timeScriptWords(KA, heard)!;
    expect(words.map((w) => w.text)).toEqual(KA.split(' '));
    words.forEach((w, i) => {
      expect(w.startSec).toBeCloseTo(heard[i]!.startSec, 3);
      expect(w.endSec).toBeCloseTo(heard[i]!.endSec, 3);
    });
  });

  test('the subtitles show the user’s spelling, never Scribe’s', () => {
    const heard = heardEvenly(KA.replace('სტუდიას', 'სტუდიის'));
    const words = timeScriptWords(KA, heard)!;
    expect(words.map((w) => w.text)).toContain('სტუდიას.');
    expect(words.map((w) => w.text)).not.toContain('სტუდიის');
  });

  test('a word Scribe missed is placed between its neighbours, in order', () => {
    const script = 'ერთი ორი სამი ოთხი';
    const heard: HeardWord[] = [
      { text: 'ერთი', startSec: 0, endSec: 0.4 },
      { text: 'სამი', startSec: 1.2, endSec: 1.6 },
      { text: 'ოთხი', startSec: 1.8, endSec: 2.2 },
    ];
    const words = timeScriptWords(script, heard)!;
    expect(words).toHaveLength(4);
    const missed = words[1]!;
    expect(missed.text).toBe('ორი');
    expect(missed.startSec).toBeGreaterThanOrEqual(0.4);
    expect(missed.endSec).toBeLessThanOrEqual(1.2);
    for (let i = 1; i < words.length; i++) expect(words[i]!.startSec).toBeGreaterThanOrEqual(words[i - 1]!.startSec);
  });

  test('a punctuation-only token rides on the word before it', () => {
    const words = timeScriptWords('სცადეთ დღესვე !', heardEvenly('სცადეთ დღესვე'))!;
    expect(words.map((w) => w.text)).toEqual(['სცადეთ', 'დღესვე!']);
  });

  test('trailing words Scribe never heard run on to the end of the audio, not past it', () => {
    const heard: HeardWord[] = [{ text: 'ერთი', startSec: 0, endSec: 0.5 }];
    const words = timeScriptWords('ერთი ორი სამი', heard, 3)!;
    expect(words[2]!.endSec).toBeCloseTo(3, 3);
    expect(words[1]!.startSec).toBeGreaterThanOrEqual(0.5);
  });

  test('nothing matched, nothing timed: null (no subtitles beat subtitles at guessed times)', () => {
    expect(timeScriptWords(KA, [{ text: 'hello', startSec: 0, endSec: 1 }])).toBeNull();
    expect(timeScriptWords(KA, [])).toBeNull();
    expect(timeScriptWords('', heardEvenly(KA))).toBeNull();
  });

  test('the timed words reach the existing caption burn unchanged (wordsToAlignment round trip)', () => {
    const words = timeScriptWords(KA, heardEvenly(KA))!;
    const back = alignmentToWords(wordsToAlignment(words));
    expect(back.map((w) => w.text)).toEqual(words.map((w) => w.text));
    back.forEach((w, i) => {
      expect(w.startSec).toBeCloseTo(words[i]!.startSec, 6);
      expect(w.endSec).toBeCloseTo(words[i]!.endSec, 6);
    });
    const cards = alignmentToCaptionSegments(wordsToAlignment(words));
    expect(cards.length).toBeGreaterThan(1);
    expect(cards[0]!.startSec).toBeCloseTo(words[0]!.startSec, 6);
  });
});

describe('checkFilmVoice', () => {
  const read = (audio: string, seconds: number | null = 6) => async () => ({ audio, seconds });

  test('a clean first read is used as it is, read once', async () => {
    const reads = jest.fn(read('first'));
    const listen = jest.fn(async (): Promise<Heard> => ({ text: KA, words: heardEvenly(KA) }));
    const out = (await checkFilmVoice({ script: KA, read: reads, listen }))!;
    expect(out.read.audio).toBe('first');
    expect(out.reads).toBe(1);
    expect(out.verdict).toBe('pass');
    expect(out.score).toBe(1);
    expect(out.words).toHaveLength(KA.split(' ').length);
    expect(reads).toHaveBeenCalledTimes(1);
  });

  test('a first read that lost words is read once more, and the better read is kept', async () => {
    let n = 0;
    const reads = jest.fn(async () => ({ audio: ++n === 1 ? 'first' : 'second', seconds: 6 }));
    const listen = jest.fn(async (audio: string): Promise<Heard> => (audio === 'first'
      ? { text: 'წარმოგიდგენთ ახალ', words: heardEvenly('წარმოგიდგენთ ახალ') }
      : { text: KA, words: heardEvenly(KA) }));
    const out = (await checkFilmVoice({ script: KA, read: reads, listen }))!;
    expect(reads).toHaveBeenCalledTimes(2);
    expect(out.reads).toBe(2);
    expect(out.read.audio).toBe('second');
    expect(out.verdict).toBe('pass');
  });

  test('a worse second read never replaces the first', async () => {
    let n = 0;
    const reads = async () => ({ audio: ++n === 1 ? 'first' : 'second', seconds: 6 });
    const half = 'წარმოგიდგენთ ახალ ქართულ სტუდიას. ერთი ფანჯრიდან';
    const listen = async (audio: string): Promise<Heard> => (audio === 'first' ? { text: half, words: heardEvenly(half) } : { text: 'ახალ', words: heardEvenly('ახალ') });
    const out = (await checkFilmVoice({ script: KA, read: reads, listen }))!;
    expect(out.reads).toBe(2);
    expect(out.read.audio).toBe('first');
  });

  test('both reads lost most of the words: verdict fail (the caller refuses before any charge)', async () => {
    const out = (await checkFilmVoice({ script: KA, read: read('x'), listen: async () => ({ text: 'ახალ', words: heardEvenly('ახალ') }) }))!;
    expect(out.reads).toBe(2);
    expect(out.verdict).toBe('fail');
    expect(out.score).toBeLessThan(VOICE_REFUSE);
  });

  test('Scribe does not answer (no key, an outage, a throw): the voice goes ahead unverified, read once', async () => {
    const reads = jest.fn(read('first'));
    const outA = (await checkFilmVoice({ script: KA, read: reads, listen: async () => null }))!;
    expect(outA).toEqual({ read: { audio: 'first', seconds: 6 }, score: null, verdict: null, reads: 1, words: null });
    const outB = (await checkFilmVoice({ script: KA, read: read('first'), listen: async () => { throw new Error('scribe down'); } }))!;
    expect(outB.verdict).toBeNull();
    expect(reads).toHaveBeenCalledTimes(1);
  });

  test('a second read that fails to come back keeps the first one', async () => {
    let n = 0;
    const reads = async () => { if (++n === 2) throw new Error('tts refused'); return { audio: 'first', seconds: 6 }; };
    const out = (await checkFilmVoice({ script: KA, read: reads, listen: async () => ({ text: 'წარმოგიდგენთ ახალ ქართულ', words: heardEvenly('წარმოგიდგენთ ახალ ქართულ') }) }))!;
    expect(out.read.audio).toBe('first');
    expect(out.reads).toBe(1);
  });

  test('no read at all: null (the caller’s existing "no voice" path)', async () => {
    const listen = jest.fn();
    expect(await checkFilmVoice({ script: KA, read: async () => null, listen })).toBeNull();
    expect(listen).not.toHaveBeenCalled();
  });
});

describe('wantsSubtitles: subtitles are the user’s choice, never on by default', () => {
  test.each([
    'გააკეთე 30 წამიანი რეკლამა სუბტიტრებით',
    'დაამატე სუბტიტრი',
    'ფილმი ქართული ტიტრებით',
    'Make an ad with subtitles',
    'add closed captions please',
    'Сделай ролик с субтитрами',
  ])('asked for: %s', (m) => expect(wantsSubtitles(m)).toBe(true));

  test.each([
    'გააკეთე 30 წამიანი რეკლამა',
    'სუბტიტრების გარეშე',
    'სუბტიტრი არა',
    'სუბტიტრები არ',
    'no subtitles',
    'without subtitles, please',
    'без субтитров',
    'write an Instagram caption for it',
    '',
  ])('not asked for: %s', (m) => expect(wantsSubtitles(m)).toBe(false));

  test('no message, no subtitles', () => {
    expect(wantsSubtitles(null)).toBe(false);
    expect(wantsSubtitles(undefined)).toBe(false);
  });
});
