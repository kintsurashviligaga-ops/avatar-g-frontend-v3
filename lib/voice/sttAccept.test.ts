/** @jest-environment node */
import { acceptTranscript, hasGeorgianScript } from './sttAccept';

describe('THE BUG: a confident non-Georgian answer used to end the cascade', () => {
  it('rejects Latin transliteration of Georgian speech', () => {
    expect(acceptTranscript('gamarjoba rogor xar', 'ka-GE')).toBe(false);
  });

  it('rejects an English rendering of Georgian speech — the screenshot symptom', () => {
    expect(acceptTranscript("Dismiss Jimmy Carter don't give up but I gave her", 'ka-GE')).toBe(false);
  });

  it('rejects an LLM refusal, which is non-empty and would have been stored as the transcript', () => {
    expect(acceptTranscript("I'm sorry, I can't transcribe this audio.", 'ka-GE')).toBe(false);
  });

  it('accepts real Georgian so the correct engine still wins', () => {
    expect(acceptTranscript('გამარჯობა, როგორ ხარ?', 'ka-GE')).toBe(true);
  });

  it('accepts Georgian mixed with latin/numbers — real speech is not pure', () => {
    expect(acceptTranscript('გამარჯობა MyAvatar 2026', 'ka-GE')).toBe(true);
  });
});

describe('every other language is untouched', () => {
  it.each([['en-US'], ['ru-RU']])('%s accepts any non-empty string, exactly as before', (lang) => {
    expect(acceptTranscript('hello there', lang)).toBe(true);
    expect(acceptTranscript('привет', lang)).toBe(true);
  });

  it('empty is still a miss in every language', () => {
    for (const l of ['ka-GE', 'en-US', 'ru-RU']) {
      expect(acceptTranscript('', l)).toBe(false);
      expect(acceptTranscript('   ', l)).toBe(false);
      expect(acceptTranscript(null, l)).toBe(false);
      expect(acceptTranscript(undefined, l)).toBe(false);
    }
  });
});

describe('script detection covers the whole Georgian block', () => {
  it('Mkhedruli (everyday script)', () => expect(hasGeorgianScript('ქართული')).toBe(true));
  it('Asomtavruli (capitals)', () => expect(hasGeorgianScript('Ⴀ')).toBe(true));
  it('Mtavruli (modern caps block)', () => expect(hasGeorgianScript('Ა')).toBe(true));
  it('not fooled by Cyrillic or Latin', () => {
    expect(hasGeorgianScript('привет')).toBe(false);
    expect(hasGeorgianScript('hello')).toBe(false);
  });
});
