/**
 * The studio chat's side of Agent G's audio extraction (./audioChat): which messages it claims (and which it leaves to
 * the chat as before), and what Agent G says at each step, a platform refusal always with the upload offer.
 */
import {
  OFFER_UPLOAD, audioCodeOf, audioDoneText, audioErrorText, audioExtractAsk, audioQuoteText, audioStageText,
  formatBytes, formatDuration, rightsText, uploadPrefill, wantsAudioFile,
} from './audioChat';
import type { AudioQuote } from './audioExtract';

describe('audioExtractAsk: one source, and the audio wanted as a file', () => {
  test.each([
    ['ამ ვიდეოდან MP3 ამოიღე https://youtu.be/abc', 'https://youtu.be/abc'],
    ['https://example.com/a.mp4 ამოიღე აუდიო', 'https://example.com/a.mp4'],
    ['გადაიყვანე ეს სიმღერა mp3-ში: https://example.com/a.mov', 'https://example.com/a.mov'],
    ['Extract the audio from https://example.com/a.mp4', 'https://example.com/a.mp4'],
    ['can you rip the soundtrack from https://example.com/a.webm?', 'https://example.com/a.webm'],
    ['https://example.com/a.mp4 to mp3 please', 'https://example.com/a.mp4'],
    ['Извлеки звук из https://example.com/a.mp4', 'https://example.com/a.mp4'],
    ['скачай песню https://example.com/a.mp4', 'https://example.com/a.mp4'],
  ])('%s', (text, url) => {
    expect(audioExtractAsk(text, [])).toEqual({ source: 'link', url });
  });

  test('one attached video or audio file and no link', () => {
    expect(audioExtractAsk('ამ ფაილიდან MP3 ამოიღე', ['video'])).toEqual({ source: 'file' });
    expect(audioExtractAsk('convert this song to mp3', ['audio'])).toEqual({ source: 'file' });
  });

  test.each([
    ['ამ ვიდეოს მუსიკა დაადე', ['video']],
    ['add music to this video', ['video']],
    ['what song is this? https://example.com/a.mp4', []],
    ['make music like this https://example.com/a.mp4', []],
    ['download this video https://example.com/a.mp4', []],
    ['separate the vocals from the instrumental as mp3 https://example.com/a.mp4', []],
    ['MP3 https://example.com/a.mp4 https://example.com/b.mp4', []],
    ['MP3 from these', ['video', 'video']],
    ['MP3 from this https://example.com/a.mp4', ['video']],
    ['MP3 from this picture', ['image']],
    ['mp3', []],
    ['https://example.com/a.mp4', []],
  ] as Array<[string, Array<'video' | 'audio' | 'image'>]>)('not this: %s', (text, kinds) => {
    expect(audioExtractAsk(text, kinds)).toBeNull();
  });

  test('"mp3" said outright counts; mp3 inside a word does not', () => {
    expect(wantsAudioFile('MP3!')).toBe(true);
    expect(wantsAudioFile('მპ3 მინდა')).toBe(true);
    expect(wantsAudioFile('the mp3player app')).toBe(false);
  });
});

const QUOTE: AudioQuote = {
  jobId: 'j1', credits: 0, source: 'link', host: 'upload.wikimedia.org', name: 'Big Buck Bunny.mp3', bytes: 4_509_000,
  contentType: 'video/webm', rights: { status: 'licensed', license: 'CC BY 3.0', author: 'Blender Foundation', evidence: 'https://commons.wikimedia.org/wiki/File:x' },
  bitrateKbps: 192, maxSec: 3600, expiresAt: 0,
};

describe('what Agent G says', () => {
  test('formats', () => {
    expect(formatDuration(189)).toBe('3:09');
    expect(formatDuration(3723)).toBe('1:02:03');
    expect(formatDuration(5.06)).toBe('0:05');
    expect(formatBytes(4_509_000, 'en')).toBe('4.3 MB');
    expect(formatBytes(4_509_000, 'ka')).toBe('4.3 მბ');
    expect(formatBytes(120_000, 'ru')).toBe('117 КБ');
  });

  test('the plan names the source, the rights with the author, the MP3, that it is free, and that Start starts it', () => {
    const ka = audioQuoteText(QUOTE, 'ka');
    expect(ka).toContain('upload.wikimedia.org, 4.3 მბ');
    expect(ka).toContain('CC BY 3.0 ლიცენზიით');
    expect(ka).toContain('ავტორი: Blender Foundation');
    expect(ka).toContain('„Big Buck Bunny.mp3“ (MP3, 192 kbps)');
    expect(ka).toContain('უფასოა.');
    expect(ka).toContain('სანამ „დაწყებას“ არ დააჭერ');
    expect(audioQuoteText(QUOTE, 'en')).toContain('the source publishes it under CC BY 3.0, by Blender Foundation');
  });

  test('an unverified source asks for Start only for the user’s own or licensed file; an upload is theirs', () => {
    expect(rightsText({ status: 'unverified' }, 'en')).toMatch(/Press Start only if it is yours or you have a licence/);
    expect(rightsText({ status: 'unverified' }, 'ka')).toMatch(/მხოლოდ მაშინ, თუ ფაილი შენია ან მისი გამოყენების ლიცენზია გაქვს/);
    expect(rightsText({ status: 'own' }, 'ru')).toBe('Права: это ваш собственный файл.');
  });

  test('a platform refusal names the platform, says why, and offers the upload', () => {
    const ka = audioErrorText('platform', 'ka', 'YouTube');
    expect(ka).toMatch(/^YouTube-ის წესები/);
    expect(ka).toContain('ატვირთე ფაილი აქ');
    expect(audioErrorText('platform', 'ka')).toMatch(/^ამ პლატფორმის წესები/);
    expect(audioErrorText('platform', 'en')).toMatch(/^This platform does not allow/);
    expect(audioErrorText('platform', 'ru', 'TikTok')).toMatch(/^Правила TikTok/);
    for (const code of OFFER_UPLOAD) expect(audioErrorText(code, 'en')).toContain('upload the file here');
    expect(audioErrorText('no_audio', 'en')).not.toContain('upload');
    expect(audioErrorText('something-new', 'en')).toBe(audioErrorText('extract_failed', 'en'));
  });

  test('stages, the result line and the upload prefill', () => {
    expect(audioStageText('extract', 'ka')).toBe('ფაილს ვიღებ და ხმას MP3-ად ვაქცევ');
    expect(audioStageText('unknown', 'en')).toBe('Starting');
    expect(audioDoneText({ name: 'a.mp3', durationSec: 189, bytes: 4_509_000 }, 'en')).toBe(
      'Ready: “a.mp3”, 3:09 · 4.3 MB. Play it here, download it, or save it to your Library.',
    );
    expect(uploadPrefill('ka')).toBe('ამ ფაილიდან MP3 ამოიღე');
    expect(audioExtractAsk(uploadPrefill('ka'), ['video'])).toEqual({ source: 'file' });
    expect(audioExtractAsk(uploadPrefill('en'), ['video'])).toEqual({ source: 'file' });
    expect(audioExtractAsk(uploadPrefill('ru'), ['video'])).toEqual({ source: 'file' });
  });

  test('a response’s code, or what its status means', () => {
    expect(audioCodeOf(422, { error: 'platform' })).toBe('platform');
    expect(audioCodeOf(401, {})).toBe('unauthenticated');
    expect(audioCodeOf(429, null)).toBe('rate_limited');
    expect(audioCodeOf(404, { error: 'not_found', message: 'No such job.' })).toBe('not_found');
    expect(audioCodeOf(404, {})).toBe('closed');
    expect(audioCodeOf(500, {})).toBe('extract_failed');
  });
});
