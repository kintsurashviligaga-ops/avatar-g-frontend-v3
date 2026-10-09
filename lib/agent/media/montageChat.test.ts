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

  test('no beat is said, not hidden; an unused clip is named; a price shows when there is one', () => {
    const q = { ...Q, beatSynced: false, bpm: null, unusedFiles: [2], credits: 15 };
    const en = quoteText(q, ['a.mp4', 'b.mp4', 'tiny.mp4', 'song.mp3'], 'en');
    expect(en).toContain('could not find a steady beat');
    expect(en).toContain('“tiny.mp4” is too short for one shot');
    expect(en).toContain('Price: ✦ 15.');
    expect(quoteText(q, undefined, 'ka')).toContain('ფაილი 3 ერთ კადრზე მოკლეა');
    expect(priceLabel(0, 'ka')).toBe('უფასო');
    expect(priceLabel(15, 'en')).toBe('✦ 15');
  });

  test('stages, errors, and the codes a response carries', () => {
    expect(stageText('stitch', 'ka')).toBe('კადრებს ვაერთებ');
    expect(stageText(null, 'en')).toBe('Starting the edit');
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
