/** The studio chat's side of Agent G's montage: which messages it claims, and what it says (ka · en · ru). */
import type { MontageQuote } from './montageExec';
import { beatMontageAsk, codeOf, errorText, montagePlanLine, montageWordsLine, orientationOf, priceLabel, quoteText, rampShort, rampText, stageText, trackTooBigText, transitionAskText, transitionsText, type AttachmentKind } from './montageChat';
import { MIXED_STYLES, type TransitionSummary } from '@/lib/services/montage/transitionPlan';

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
    // photos ride along as still shots (owner, 2026-10-11 11:37Z: 4 clips + a photo + an MP3 got a refusal)
    ['cut these to the music', [V, 'image', A]],
    ['დაამონტაჟე ვიდეო და მუსიკა დაადე ზუსტად 0.55 წამიდან რომ დაიწყოს', [A, V, V, V, V, 'image']],
    ['add this song', [V, 'image', A]],
    // „make me a clip" with clips and a track (Media Studio v2.0: GG's own wording)
    ['ამ ვიდეოებით კლიპი გამიკეთე, მარტო ბოლო ხუთი გამოიყენე', [V, V, V, V, V, V, V, A]],
    ['გამიკეთე კლიპი ამ ვიდეოებით', [V, V, A]],
    ['make me a clip from these', [V, V, A]],
    ['сделай клип из этих видео', [V, V, A]],
    // GG 2026-10-11 17:38Z: no music sent is still a montage (the clips' own sound); photos alone are one too; a track
    // and the user's own narration together; the clips' own sound kept under the track; a narration over one clip.
    ['დაამონტაჟე ეს ვიდეოები', [V, V]],
    ['გააერთიანე ეს კლიპები მუსიკის გარეშე', [V, V, V]],
    ['join these clips', [V, 'image', V]],
    ['смонтируй эти видео без музыки', [V, V]],
    ['make a slideshow', ['image', 'image', 'image']],
    ['ამ ფოტოებით სლაიდშოუ გამიკეთე', ['image', 'image']],
    ['cut these to the music', ['image', 'image', A]],
    ['cut these to the music', [V, A, A]],
    ['დაამონტაჟე და ზემოდან ჩემი ნარაცია დაადე', [V, V, A, A]],
    ['ჩემი ნარაცია დაადე ამ ვიდეოს', [V, A]],
    ['add my voice-over to this video', [V, A]],
    ['დაამონტაჟე, თავისი ხმაც დარჩეს და მუსიკა ზემოდან დაადე', [V, V, A]],
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
    // the files must be pictures and at most two sound files (a track and a narration), nothing else
    ['cut these to the music', [V, A, A, A]],
    ['cut these to the music', [V, 'other', A]],
    ['cut these to the music', [A]],
    // no sound file: music named as the point (the chat asks for the track), a narration with no recording (the chat
    // asks for the file), one clip alone, or dubbing („озвучь" is not a montage)
    ['cut these to the music', [V, V]],
    ['make a music video from these', [V, V]],
    ['დაამონტაჟე და ჩემი ნარაცია დაადე', [V, V]],
    ['დაამონტაჟე', [V]],
    ['Озвучь это видео на русском', [V]],
    ['add background music', [V, V]],
    ['cut these to the music', [...Array(13).fill(V), A]],
    ['cut these to the music', [...Array(6).fill(V), ...Array(7).fill('image'), A]],
    // words are required
    ['', [V, V, A]],
    // nothing about cutting or music
    ['add subtitles', [V, V, A]],
    ['ამ კლიპებს სუბტიტრები დაადე', [V, V, A]],
    ['რა კლიპია ეს?', [V, V, A]],
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

describe('speed ramps in words (owner 2026-10-11: „ააჩქარე … შეანელე")', () => {
  const R = { mode: 'mixed' as const, slow: 3, fast: 3, byEnergy: true, keptForFootage: 0 };
  test('the quote says how many shots slow down and speed up, and that every cut stays on its beat', () => {
    const ka = quoteText({ ...Q, musicStartSec: 59, ramp: R }, undefined, 'ka');
    expect(ka).toContain('მუსიკა იწყება 0:59-დან.');
    expect(ka).toContain('სიჩქარე მუსიკის მიხედვით: 3 კადრი შენელებულია 0.5×-მდე, სადაც მუსიკა მშვიდია; 3 აჩქარებულია 1.5×-მდე, სადაც ყველაზე ძლიერია; ყოველი ჭრა ისევ ბითზე რჩება.');
    expect(quoteText({ ...Q, ramp: R }, undefined, 'en')).toContain('Speed by the music: 3 shots slowed to 0.5× where the music is calm; 3 sped up to 1.5× where it is strongest; every cut stays on its beat.');
    expect(quoteText(Q, undefined, 'en')).not.toContain('Speed');
  });

  test('none could change: the reason is said (music unread, too few shots, no footage), never a ramp that is not there', () => {
    expect(rampText({ ...R, slow: 0, fast: 0, byEnergy: false }, 'en')).toMatch(/could not be read/);
    expect(rampText({ ...R, slow: 0, fast: 0 }, 'en')).toMatch(/too few shots/);
    expect(rampText({ ...R, mode: 'fast', slow: 0, fast: 0, keptForFootage: 2 }, 'en')).toMatch(/almost all of its clip/);
    expect(rampText({ ...R, fast: 1, keptForFootage: 2 }, 'ka')).toContain('2 კადრი ჩვეულებრივი სიჩქარით დარჩა');
  });

  test('short forms for the cards', () => {
    expect(rampShort(R, 'ka')).toBe('3 შენელ. 0.5× · 3 აჩქ. 1.5×');
    expect(rampShort({ ...R, slow: 0, fast: 0 }, 'en')).toBe('speed unchanged');
    expect(montageWordsLine({ musicStartSec: 59, ramp: 'mixed', durationSec: 20, aspect: '9:16' }, 'ka')).toBe('მუსიკა 0:59-დან · სიჩქარე მუსიკის მიხედვით: შენელება და აჩქარება · 20 წმ · 9:16');
    expect(montageWordsLine({ ramp: 'slow' }, 'en')).toBe('slower shots where the music is calm');
    expect(montageWordsLine(undefined, 'en')).toBe('');
    expect(montagePlanLine({ shots: 12, totalSec: 29.7, aspect: '9:16', bpm: null, musicStartSec: 0.2 }, 'ru')).toBe('кадров: 12 · 29.7 с · 9:16');
  });
});

describe('transitions on the card, in ka · en · ru', () => {
  const T: TransitionSummary = { styles: ['zoom'], mixed: false, sec: 0.5, boundaries: 9, applied: 9, tooShort: 0, noFootage: 0, shortenedSec: 0 };

  test('the styles, the length and how many boundaries got one', () => {
    expect(transitionsText(T, 'ka')).toBe('გადასვლები: ზუმი, 0.5 წმ, 9 ჭრიდან 9-ზე.');
    expect(transitionsText(T, 'en')).toBe('Transitions: zoom, 0.5 s, at 9 of 9 cuts.');
    expect(transitionsText(T, 'ru')).toBe('Переходы: зум, 0.5 с, на 9 из 9 склеек.');
    const q = quoteText({ ...Q, transitions: T }, undefined, 'ka');
    expect(q).toContain('გადასვლები: ზუმი, 0.5 წმ, 9 ჭრიდან 9-ზე.');
    expect(quoteText(Q, undefined, 'ka')).not.toContain('გადასვლები');
  });

  test('every boundary that stays a cut is said, with why, and an edit that got shorter says by how much', () => {
    const t: TransitionSummary = { ...T, styles: [...MIXED_STYLES], mixed: true, applied: 6, tooShort: 2, noFootage: 1, minSec: 0.3, shortenedSec: 0 };
    const ka = transitionsText(t, 'ka');
    expect(ka).toContain('ყოველ ჯერზე სხვა (მდოვრე გადადნობა, გასრიალება (slide), ზუმი, გადაწმენდა (wipe), თეთრი ციმციმი, წრე)');
    expect(ka).toContain('0.3–0.5 წმ, 9 ჭრიდან 6-ზე');
    expect(ka).toContain('2 პირდაპირ ჭრად რჩება: იქ კადრები ძალიან მოკლეა');
    expect(ka).toContain('1 პირდაპირ ჭრად რჩება: იქ კლიპებს ზედმეტი კადრები არ აქვს');
    const en = transitionsText({ ...T, shortenedSec: 1 }, 'en');
    expect(en).toBe('Transitions: zoom, 0.5 s, at 9 of 9 cuts; the shots overlap there, so the edit is 1 s shorter.');
    expect(transitionsText({ ...T, boundaries: 0, applied: 0 }, 'ru')).toContain('один непрерывный кадр');
  });

  test('before the quote: the words as the montage step will read them; after it: the counts', () => {
    expect(transitionAskText({ styles: ['flash', 'slide'], sec: 0.3 }, 'ka')).toBe('გადასვლები: თეთრი ციმციმი, გასრიალება (slide), 0.3 წმ');
    expect(montageWordsLine({ transitions: { styles: [...MIXED_STYLES], mixed: true } }, 'en')).toBe('transitions: different each time');
    expect(montagePlanLine({ shots: 10, totalSec: 30, transitions: { ...T, applied: 8 } }, 'en')).toBe('10 shots · 30 s · transitions zoom 8/9');
  });
});
