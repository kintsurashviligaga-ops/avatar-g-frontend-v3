/**
 * Which chat messages become a two-step Agent G run, in ka · en · ru, and the run spec they make: every spec built here
 * is one the server's own check (validateRunSpec) accepts as it is, so the chat never sends a plan the route refuses.
 */
import { chainSpec, runChainAsk, runCodeOf, runErrorText, runPlanText, sourceLine, type RunChain } from './runChat';
import { validateRunSpec } from './runSpec';
import type { AttachmentKind } from '@/lib/agent/media/montageChat';

const V: AttachmentKind = 'video';
const A: AttachmentKind = 'audio';
const I: AttachmentKind = 'image';

describe('the sound of one source, the clips cut to it', () => {
  test.each([
    ['ka', 'პირველი ვიდეოს ხმა აიღე და დანარჩენი კლიპები ამ ხმაზე დაამონტაჟე', 0, [1, 2]],
    ['en', 'Use the audio from the first video and cut the other clips to it', 0, [1, 2]],
    ['en', 'Take the music of the last video and make a montage of the rest to it', 2, [0, 1]],
    ['ru', 'Возьми звук из первого видео и смонтируй остальные клипы под него', 0, [1, 2]],
    ['ru', 'Возьми звук из второго видео и смонтируй остальные клипы под него', 1, [0, 2]],
  ])('%s: %s', (_lang, text, src, clips) => {
    expect(runChainAsk(text, [V, V, V])).toEqual({ kind: 'sound-cut', source: { index: src }, clips });
  });

  test('„all of them": the source video is one of the clips too; „the others": it is not', () => {
    expect(runChainAsk('take the sound from video 2 and cut all of them to it', [V, V, V])).toEqual({ kind: 'sound-cut', source: { index: 1 }, clips: [0, 1, 2] });
    expect(runChainAsk('take the sound from video 2 and cut all the other clips to it', [V, V, V])).toEqual({ kind: 'sound-cut', source: { index: 1 }, clips: [0, 2] });
  });

  test('no ordinal: the first video is the source (the plan card names it before Start)', () => {
    expect(runChainAsk('use this sound and cut the clips to it', [V, V])).toEqual({ kind: 'sound-cut', source: { index: 0 }, clips: [1] });
  });

  test('a link is the source and every attached video is a clip (ka, en)', () => {
    expect(runChainAsk('Take the sound from https://example.com/song.mp4 and cut my clips to it', [V, V]))
      .toEqual({ kind: 'sound-cut', source: { url: 'https://example.com/song.mp4' }, clips: [0, 1] });
    expect(runChainAsk('ამ ბმულიდან ხმა ამოიღე https://example.com/a.mp4 და ჩემი კლიპი დაამონტაჟე მასზე', [V]))
      .toEqual({ kind: 'sound-cut', source: { url: 'https://example.com/a.mp4' }, clips: [0] });
  });

  test('not claimed: a question, vocals, a video that is not there, no take verb, a photo, two links, one video and no link', () => {
    expect(runChainAsk('what song is in the first video?', [V, V])).toBeNull();
    expect(runChainAsk('take the vocals from the first video and cut the rest to it', [V, V, V])).toBeNull();
    expect(runChainAsk('take the sound from the third video and cut the others to it', [V, V])).toBeNull();
    expect(runChainAsk('cut these clips to the music', [V, V, V])).toBeNull();
    expect(runChainAsk('take the sound of the first video and cut the rest to it', [V, V, I])).toBeNull();
    expect(runChainAsk('take the sound of https://a.example/x.mp4 and https://b.example/y.mp4 and cut to it', [V])).toBeNull();
    expect(runChainAsk('take the sound of this video and cut it to it', [V])).toBeNull();
    // The plain MP3 ask (one file, no clips) stays with the MP3 card.
    expect(runChainAsk('take the sound out of this video as MP3', [V])).toBeNull();
    // One clip with a link: a trim word stays a trim (the montage's own rule).
    expect(runChainAsk('take the sound from https://example.com/a.mp4 and cut the first 10 seconds', [V])).toBeNull();
  });
});

describe('the montage, then an edit of it', () => {
  test.each([
    ['en', 'cut these to the music, black and white, with the caption "Summer 2026"', [{ op: 'grade', style: 'noir' }, { op: 'caption', text: 'Summer 2026' }]],
    ['ka', 'დაამონტაჟე ეს კლიპები მუსიკაზე, შავ-თეთრი და ბოლოს ჩაქრეს', [{ op: 'grade', style: 'noir' }, { op: 'fade', inSec: 0, outSec: 1 }]],
    ['ru', 'смонтируй под музыку, чёрно-белый', [{ op: 'grade', style: 'noir' }]],
  ])('%s: %s', (_lang, text, edits) => {
    expect(runChainAsk(text, [V, V, A])).toEqual({ kind: 'cut-edit', edits });
  });

  test('only what a montage does not do itself, and nothing that would undo the cut', () => {
    // No edit words: the one-step montage card.
    expect(runChainAsk('cut these to the music', [V, V, A])).toBeNull();
    // Mute and speed would undo a cut to the beat; a frame is the montage's own.
    expect(runChainAsk('cut these to the music and mute it', [V, V, A])).toBeNull();
    expect(runChainAsk('cut these to the music, 2x faster', [V, V, A])).toBeNull();
    expect(runChainAsk('cut these to the music, vertical 9:16', [V, V, A])).toBeNull();
    // A fade between the clips is a transition, not a whole-video fade.
    expect(runChainAsk('cut these to the music with a fade between clips', [V, V, A])).toBeNull();
    // Two tracks, a photo: not a montage at all.
    expect(runChainAsk('cut these to the music, black and white', [V, A, A])).toBeNull();
    expect(runChainAsk('cut these to the music, black and white', [V, I, A])).toBeNull();
  });
});

describe('the spec', () => {
  const PATHS = ['u/a.mp4', 'u/b.mp4', 'u/c.mp4'];

  test('sound-cut from a file: extract, then the montage of the other clips with the extracted sound as its track', () => {
    const chain = runChainAsk('Use the audio from the first video and cut the other clips to it', [V, V, V])!;
    const spec = chainSpec(chain, 'Use the audio from the first video and cut the other clips to it', PATHS);
    expect(spec).toEqual({
      title: 'Use the audio from the first video and cut the other clips to it',
      steps: [
        { id: 'sound', tool: 'audio_extract', source: { file: 'u/a.mp4' } },
        { id: 'cut', tool: 'montage', files: ['u/b.mp4', 'u/c.mp4', { step: 'sound' }], prompt: 'Use the audio from the first video and cut the other clips to it' },
      ],
    });
    expect(validateRunSpec(spec)).toEqual({ ok: true, spec });
  });

  test('sound-cut from a link: the link is the source; the montage words carry no link', () => {
    const text = 'Take the sound from https://example.com/song.mp4 and cut my clips to it';
    const spec = chainSpec(runChainAsk(text, [V, V])!, text, ['u/a.mp4', 'u/b.mp4']);
    expect(spec.steps[0]).toEqual({ id: 'sound', tool: 'audio_extract', source: { url: 'https://example.com/song.mp4' } });
    expect(spec.steps[1]).toMatchObject({ files: ['u/a.mp4', 'u/b.mp4', { step: 'sound' }], prompt: 'Take the sound from and cut my clips to it' });
    expect(validateRunSpec(spec).ok).toBe(true);
  });

  test('cut-edit: the montage of every file, then the edit of its result', () => {
    const text = 'cut these to the music, black and white';
    const spec = chainSpec(runChainAsk(text, [V, V, A])!, text, ['u/a.mp4', 'u/b.mp4', 'u/s.mp3']);
    expect(spec.steps).toEqual([
      { id: 'cut', tool: 'montage', files: ['u/a.mp4', 'u/b.mp4', 'u/s.mp3'], prompt: text },
      { id: 'edit', tool: 'edit', file: { step: 'cut' }, edits: [{ op: 'grade', style: 'noir' }] },
    ]);
    expect(validateRunSpec(spec).ok).toBe(true);
  });

  test('a long message is cut to a title the spec takes', () => {
    const text = `${'cut these to the music, black and white '.repeat(8)}`;
    const spec = chainSpec(runChainAsk(text, [V, V, A])!, text, ['a', 'b', 's']);
    expect(spec.title!.length).toBeLessThanOrEqual(120);
    expect(validateRunSpec(spec).ok).toBe(true);
  });
});

describe('words', () => {
  const fileChain: RunChain = { kind: 'sound-cut', source: { index: 0 }, clips: [1, 2] };
  const linkChain: RunChain = { kind: 'sound-cut', source: { url: 'https://www.example.com/a.mp4' }, clips: [0] };

  test('the source is named by file name or by the link\'s host', () => {
    expect(sourceLine(fileChain, ['concert.mp4', 'b.mp4'], 'en')).toBe('the sound of “concert.mp4”');
    expect(sourceLine(fileChain, ['concert.mp4'], 'ka')).toBe('„concert.mp4“-ის ხმა');
    expect(sourceLine(linkChain, [], 'ru')).toBe('звук по ссылке (example.com)');
  });

  test.each(['ka', 'en', 'ru'])('the plan says both steps, the price and that nothing starts before Start (%s)', (locale) => {
    const t = runPlanText(fileChain, { names: ['a.mp4'], credits: 0 }, locale);
    expect(t.split('\n')).toHaveLength(2);
    expect(t).toMatch(/1\..*2\./);
    expect(t).toMatch(locale === 'en' ? /Free\. Nothing starts/ : locale === 'ru' ? /Бесплатно\. Ничего/ : /უფასოა\. არაფერი/);
    expect(runPlanText({ kind: 'cut-edit', edits: [] }, { credits: 7, editsText: 'x' }, locale)).toMatch(/✦ 7/);
  });

  test('every code has words in each language; files that did not upload are named', () => {
    expect(runErrorText('upload_failed', 'en', [1], ['a.mp4', 'b.mp4'])).toBe('I could not upload “b.mp4” (up to 50 MB, video or audio).');
    expect(runErrorText('closed', 'ka')).toMatch(/Agent G/);
    expect(runErrorText('nonsense', 'ru')).toBe(runErrorText('network', 'ru'));
  });

  test('a route answer becomes a chat code', () => {
    expect(runCodeOf(401, {})).toBe('unauthenticated');
    expect(runCodeOf(403, { error: 'not_enabled' })).toBe('closed');
    expect(runCodeOf(429, {})).toBe('rate_limited');
    expect(runCodeOf(409, { error: 'quote_expired' })).toBe('quote_expired');
    expect(runCodeOf(400, { error: 'bad_spec' })).toBe('bad_spec');
    expect(runCodeOf(404, { error: 'not_found' })).toBe('not_found');
    expect(runCodeOf(502, null)).toBe('network');
  });
});
