import { parseMusicCommand } from './commands';

describe('create — a draft for the plan card, never a charge', () => {
  test.each([
    ['make me a calm instrumental piano track at 70 bpm', { mode: 'instrumental', bpm: 70 }],
    ['შემიქმენი მელანქოლიური ინსტრუმენტული მუსიკა წვიმაზე, ნელი', { mode: 'instrumental', tempo: 'slow' }],
    ['сделай энергичную инструментальную музыку для рекламы', { mode: 'instrumental', tempo: 'fast' }],
    ['write a song in Georgian with a female singer about Tbilisi', { mode: 'song', lyricsLanguage: 'ka', vocalGender: 'female' }],
    ['დამიწერე სიმღერა ქართულად, დუეტი', { mode: 'song', lyricsLanguage: 'ka', vocalGender: 'duet' }],
    ['напиши песню на русском, мужской вокал', { mode: 'song', lyricsLanguage: 'ru', vocalGender: 'male' }],
  ])('%s', (text, expected) => {
    const c = parseMusicCommand(text);
    expect(c?.kind).toBe('create');
    if (c?.kind === 'create') {
      expect(c.draft).toMatchObject(expected);
      expect(c.draft.prompt).toBe(text); // the user's words, verbatim
    }
  });

  test('not a music command → null', () => {
    expect(parseMusicCommand('what is the weather in Batumi?')).toBeNull();
    expect(parseMusicCommand('')).toBeNull();
  });
});

describe('edits', () => {
  test.each([
    ['trim from 5 to 20 seconds', [{ op: 'trim', startSec: 5, endSec: 20 }]],
    ['keep 0:10–0:40', [{ op: 'trim', startSec: 10, endSec: 40 }]],
    ['პირველი 15 წამი დატოვე', [{ op: 'trim', startSec: 0, endSec: 15 }]],
    ['оставь первые 20 секунд', [{ op: 'trim', startSec: 0, endSec: 20 }]],
    ['fade out 3s', [{ op: 'fade_out', sec: 3 }]],
    ['დაადუმე', [{ op: 'mute' }]],
    ['make it -6dB', [{ op: 'volume', db: -6 }]],
  ])('%s', (text, ops) => {
    const c = parseMusicCommand(text);
    expect(c).toMatchObject({ kind: 'edit', ops });
  });

  test('format conversion in three languages', () => {
    expect(parseMusicCommand('convert to wav')).toEqual({ kind: 'edit', ops: [], format: 'wav' });
    expect(parseMusicCommand('export as m4a')).toEqual({ kind: 'edit', ops: [], format: 'm4a' });
    expect(parseMusicCommand('сохрани в mp3')).toEqual({ kind: 'edit', ops: [], format: 'mp3' });
  });

  test('join, with and without a crossfade', () => {
    expect(parseMusicCommand('join these tracks')).toEqual({ kind: 'join', crossfadeSec: 0 });
    expect(parseMusicCommand('გააერთიანე კროსფეიდით 3')).toEqual({ kind: 'join', crossfadeSec: 3 });
    expect(parseMusicCommand('склей с кроссфейдом')).toEqual({ kind: 'join', crossfadeSec: 2 });
  });

  test('regenerate', () => {
    for (const t of ['again', 'ხელახლა', 'ещё раз', 'another version']) expect(parseMusicCommand(t)).toEqual({ kind: 'regenerate' });
  });
});

describe('unsupported AI capabilities are said plainly, never simulated', () => {
  test.each([
    ['remix this', 'remix'],
    ['გააგრძელე სიმღერა', 'extend'],
    ['split the stems', 'stem_separation'],
    ['remove the vocals', 'vocal_removal'],
    ['убери вокал', 'vocal_removal'],
    ['make a cover of this', 'cover'],
    ['sing it in my voice', 'voice_conversion'],
    ['make it faster', 'pitch_speed'],
  ])('%s → %s', (text, op) => {
    expect(parseMusicCommand(text)).toEqual({ kind: 'unsupported', op });
  });
});
