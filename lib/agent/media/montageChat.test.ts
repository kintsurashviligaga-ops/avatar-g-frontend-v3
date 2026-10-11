/** The studio chat's side of Agent G's montage: which messages it claims, and what it says (ka · en · ru). */
import type { MontageQuote } from './montageExec';
import { beatMontageAsk, codeOf, errorText, orientationOf, priceLabel, quoteText, stageText, trackTooBigText, type AttachmentKind } from './montageChat';

const V: AttachmentKind = 'video';
const A: AttachmentKind = 'audio';

describe('beatMontageAsk', () => {
  test.each([
    ['cut these to the music', [V, V, V, A]],
    ['დაამონტაჟე ეს კლიპები მუსიკაზე', [V, V, A]],
    ['გააერთიანე ამ სიმღერის რიტმზე', [A, V, V]],
    ['смонтируй под музыку', [V, V, A]],
    ['make a reel', [V, V, A]],
    // two clips: a music word alone is enough (the remix could only ever take the first clip)
    ['add this song', [V, V, A]],
    // one clip: only cut / montage words
    ['cut it to the beat', [V, A]],
    ['დაამონტაჟე ბითზე', [V, A]],
  ])('claims %s', (text, kinds) => expect(beatMontageAsk(text, kinds as AttachmentKind[])).toBe(true));

  test.each([
    // one clip + "add music" is the remix's add_music (the whole clip under a song), not a chop into shots
    ['add background music', [V, A]],
    ['დაამატე მუსიკა', [V, A]],
    // a trim is a trim
    ['cut the first 10 seconds', [V, A]],
    // a question is a question
    ['what song is this?', [V, V, A]],
    ['რა მუსიკაა ამ ვიდეოში', [V, V, A]],
    // the files must be clips and ONE track, nothing else
    ['cut these to the music', [V, V]],
    ['cut these to the music', [V, A, A]],
    ['cut these to the music', [V, 'image', A]],
    ['cut these to the music', [A]],
    ['cut these to the music', [...Array(13).fill(V), A]],
    // words are required
    ['', [V, V, A]],
    // nothing about cutting or music
    ['add subtitles', [V, V, A]],
  ])('leaves %s alone', (text, kinds) => expect(beatMontageAsk(text, kinds as AttachmentKind[])).toBe(false));
});

const Q: MontageQuote = {
  jobId: 'j', credits: 0, totalSec: 29.97, shots: 10, clips: 3, aspect: '9:16', beatSynced: true, bpm: 119.96,
  musicStartSec: 0.23, unusedFiles: [], expiresAt: 0,
  manifest: [
    { index: 0, path: 'u/a', name: 'a.mp4', kind: 'video', durationSec: 12.4 },
    { index: 1, path: 'u/b', name: 'b.mp4', kind: 'video', durationSec: 7.9 },
    { index: 2, path: 'u/c', name: 'tiny.mp4', kind: 'video', durationSec: 2.1 },
    { index: 3, path: 'u/s', name: 'song.mp3', kind: 'audio', durationSec: 95 },
  ],
  clipOrder: [0, 1, 2],
  engine: { id: 'ffmpeg-montage', label: 'FFmpeg montage', free: true },
};

describe('what Agent G says', () => {
  test('the plan names the tempo, the shots, the length, the format, the price, and that nothing starts before Start', () => {
    const ka = quoteText(Q, undefined, 'ka');
    expect(ka).toContain('120 BPM');
    expect(ka).toContain('10 კადრი 3 კლიპიდან, 30 წმ, 9:16');
    expect(ka).toContain('უფასოა.');
    expect(ka).toContain('არაფერი დაიწყება');
    expect(quoteText(Q, undefined, 'en')).toContain('Plan: 10 shots from 3 clips, 30 s, 9:16');
    expect(quoteText(Q, undefined, 'ru')).toContain('Бесплатно.');
  });

  test('no beat is said, not hidden; every file is listed in the user order with its kind and length; the engine and price show', () => {
    const q = { ...Q, beatSynced: false, bpm: null, credits: 15 };
    const en = quoteText(q, ['a.mp4', 'b.mp4', 'tiny.mp4', 'song.mp3'], 'en');
    expect(en).toContain('could not find a steady beat');
    expect(en).toContain('Files (4, in your order): 1 “a.mp4” video 12.4 s · 2 “b.mp4” video 7.9 s · 3 “tiny.mp4” video 2.1 s · 4 “song.mp3” music 95 s. Every clip is used.');
    expect(en).toContain('Engine: FFmpeg montage. Price: ✦ 15.');
    const ka = quoteText(q, undefined, 'ka');
    expect(ka).toContain('ფაილები (4, შენი თანმიმდევრობით)');
    expect(ka).toContain('ყველა კლიპი შედის.');
    expect(ka).toContain('ძრავი: FFmpeg მონტაჟი.');
    expect(priceLabel(0, 'ka')).toBe('უფასო');
    expect(priceLabel(15, 'en')).toBe('✦ 15');
  });

  test('"not every clip fits" refusals say the cause and the way out in numbers, and never offer to drop a clip', () => {
    const names = ['a.mp4', 'b.mp4', 'tiny.mp4', 'song.mp3'];
    const short = errorText('clip_too_short', 'en', [2], names, { minShotSec: 1.1, durationsSec: [0.4] });
    expect(short).toContain('“tiny.mp4” (0.4 s) is shorter than the shortest shot this edit can cut (1.1 s)');
    expect(short).toContain('I will not leave a clip out');
    const music = errorText('music_too_short', 'ka', [3], names, { clips: 3, musicSec: 1.8, fromSec: 28.2, neededSec: 3 });
    expect(music).toContain('0:28-დან მხოლოდ 1.8 წმ გრძელდება');
    expect(music).toContain('3 კლიპს კი თითო კადრისთვის მინიმუმ 3 წმ სჭირდება');
    expect(errorText('target_too_short', 'ru', [0, 1, 2], names, { clips: 3, targetSec: 2, neededSec: 3 })).toContain('нужно минимум 3 с, а вы просили 2 с');
    // Without the numbers the words still name the file and the rule.
    expect(errorText('clip_too_short', 'en', [2], names)).toContain('“tiny.mp4” is too short for even one shot');
    expect(errorText('clip_missing', 'ka')).toContain('ყველა შენი კლიპი არ ჩანდა');
  });

  test('stages, errors, and the codes a response carries', () => {
    expect(stageText('stitch', 'ka')).toBe('კადრებს ვაერთებ');
    expect(stageText(null, 'en')).toBe('Starting the edit');
    // The queue's own stages: waiting for a worker, a worker starting, and the one retry after a worker died.
    expect(stageText('queued', 'ka')).toBe('რიგშია, მალე დავიწყებ');
    expect(stageText('starting', 'ru')).toBe('Запускаю монтаж');
    expect(stageText('retrying', 'en')).toBe('The server stalled, so I am starting the edit again');
    expect(errorText('media_not_yours', 'en', [1], ['a.mp4', 'b.mp4'])).toBe('“b.mp4” is not one of your uploads, so I cannot use it.');
    expect(errorText('render_failed', 'ka')).toContain('არაფერი ჩამოგეჭრა');
    expect(errorText('whatever', 'ru')).toContain('Ничего не списано');
    expect(codeOf(403, { error: 'media_not_yours' })).toBe('media_not_yours');
    expect(codeOf(404, { error: 'not_found' })).toBe('closed');
    expect(codeOf(404, { ok: false, error: 'not_found', message: 'No such edit.' })).toBe('not_found');
    expect(codeOf(401, {})).toBe('unauthenticated');
    expect(codeOf(429, null)).toBe('rate_limited');
    expect(codeOf(500, null)).toBe('render_failed');
    expect(orientationOf('9:16')).toBe('vertical');
    expect(orientationOf('1:1')).toBe('square');
    expect(orientationOf('16:9')).toBe('landscape');
    expect(trackTooBigText('ka')).toContain('დაამონტაჟე მუსიკაზე');
  });
});

describe('a music start the user asked for is on the card (Agent G PART 1)', () => {
  test('said in all three languages; the first beat a fraction in is not', () => {
    const q = { ...Q, musicStartSec: 5.2 };
    expect(quoteText(q, undefined, 'ka')).toContain('მუსიკა იწყება 0:05-დან.');
    expect(quoteText(q, undefined, 'en')).toContain('The track starts at 0:05.');
    expect(quoteText(q, undefined, 'ru')).toContain('Трек начинается с 0:05.');
    expect(quoteText(Q, undefined, 'en')).not.toContain('The track starts');
  });
});
