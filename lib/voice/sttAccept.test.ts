/** @jest-environment node */
import { acceptTranscript, hasGeorgianScript, isNotATranscript } from './sttAccept';

describe('THE BUG: a confident non-Georgian answer used to end the cascade', () => {
  it('rejects Latin transliteration of Georgian speech', () => {
    expect(acceptTranscript('gamarjoba rogor xar', 'ka-GE')).toBe(false);
  });

  it('rejects Russian typed out in Latin letters, the same failure for a Russian speaker', () => {
    expect(acceptTranscript('privet kak dela', 'ka-GE')).toBe(false);
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

describe('a Georgian request keeps a RUSSIAN speaker’s words as spoken', () => {
  it('accepts Cyrillic (Russian speech in a Georgian session — never translated into Georgian)', () => {
    expect(acceptTranscript('привет, как дела?', 'ka-GE')).toBe(true);
  });
  it('a single stray Cyrillic letter does not make a transliteration Russian', () => {
    expect(acceptTranscript('gamarjoba rogor xar д', 'ka-GE')).toBe(false);
  });
  it("'auto' accepts any language", () => {
    expect(acceptTranscript('hello there', 'auto')).toBe(true);
    expect(acceptTranscript('გამარჯობა', 'auto')).toBe(true);
    expect(acceptTranscript('  ', 'auto')).toBe(false);
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

describe('English in a Georgian session is kept: Gemini is the whole engine (GG, production 2026-10-24)', () => {
  it('an English sentence is what an English speaker said, not a leg to skip', () => {
    expect(acceptTranscript('How do I get from Tbilisi to Batumi by train?', 'ka-GE')).toBe(true);
    expect(acceptTranscript('hello', 'ka-GE')).toBe(true);
  });
  it('names, products and numbers in Latin letters are kept', () => {
    expect(acceptTranscript('iPhone 15 Pro', 'ka-GE')).toBe(true);
    expect(acceptTranscript('OK', 'ka-GE')).toBe(true);
  });
  it('a transliteration in quotes is still a transliteration', () => {
    expect(acceptTranscript('"gamarjoba, rogor xar?"', 'ka-GE')).toBe(false);
  });
});

describe('the model talking about the audio is never a transcript, in any language', () => {
  it.each([['ka-GE'], ['en-US'], ['ru-RU'], ['auto']])('%s refuses refusals and silence labels', (lang) => {
    expect(acceptTranscript("I'm sorry, but I can't transcribe this audio.", lang)).toBe(false);
    expect(acceptTranscript('Unfortunately, the recording contains no speech.', lang)).toBe(false);
    expect(acceptTranscript('[silence]', lang)).toBe(false);
    expect(acceptTranscript('(inaudible)', lang)).toBe(false);
    expect(acceptTranscript('No speech detected.', lang)).toBe(false);
  });
  it('speech that only mentions audio is kept', () => {
    expect(isNotATranscript("I can't hear the audio on my laptop")).toBe(false);
    expect(isNotATranscript('Sorry, I am late, the train was slow')).toBe(false);
    expect(isNotATranscript('Turn the music up')).toBe(false);
    expect(acceptTranscript('Silence is golden', 'en-US')).toBe(true);
  });
});
