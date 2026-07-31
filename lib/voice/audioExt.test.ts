/** @jest-environment node */
import { audioExtFor, audioFileName } from './audioExt';

describe('the extensions browsers actually produce', () => {
  it('THE BUG: a Chrome recording used to be uploaded as .wav and rejected', () => {
    expect(audioExtFor('audio/webm;codecs=opus')).toBe('webm');
    expect(audioFileName('audio/webm;codecs=opus')).toBe('chunk.webm');
  });

  it('iOS Safari records mp4 — and must not be mistaken for mp3', () => {
    expect(audioExtFor('audio/mp4')).toBe('mp4');
    expect(audioExtFor('audio/mp4;codecs=mp4a.40.2')).toBe('mp4');
  });

  it.each([
    ['audio/webm', 'webm'],
    ['audio/ogg;codecs=opus', 'ogg'],
    ['audio/mpeg', 'mp3'],
    ['audio/mp3', 'mp3'],
    ['audio/wav', 'wav'],
    ['audio/x-wav', 'wav'],
    ['audio/flac', 'flac'],
    ['audio/aac', 'm4a'],
    ['audio/x-m4a', 'm4a'],
  ])('%s → %s', (mime, want) => {
    expect(audioExtFor(mime)).toBe(want);
  });
});

describe('the default is the one a browser is most likely to send', () => {
  it.each([[''], [null], [undefined], ['application/octet-stream'], ['garbage']])(
    'falls back to webm for %p — never wav, which was the old wrong guess', (m) => {
      expect(audioExtFor(m as string | null | undefined)).toBe('webm');
    });
});

describe('filename', () => {
  it('accepts a custom base', () => {
    expect(audioFileName('audio/mp4', 'final')).toBe('final.mp4');
  });

  it('is case-insensitive about the mime', () => {
    expect(audioExtFor('AUDIO/WEBM;CODECS=OPUS')).toBe('webm');
  });
});
